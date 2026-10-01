"""Eye photo capture, storage, and month-over-month comparison routes."""

from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.ai_models.cataract_opacity_analysis import analyze_cataract_from_base64
from app.ai_models.dry_eye_analysis import (
    analyze_dry_eye_from_base64,
    check_photo_lighting_from_base64,
    decode_base64_image,
)
from app.ai_models.experimental_models import withhold_model_outputs
from app.ai_models.on_device import OnDeviceValidationError, build_on_device_analysis, strip_images
from app.models import EyePhoto, db
from app.services import analysis_jobs
from app.services.analysis_jobs import wants_async
from app.utils.datetime_utils import utc_now
from app.utils.image_upload import (
    ImageUploadError,
    client_frame_white_balance,
    read_image_request,
    upload_summary,
)
from app.utils.eye_photo_comparison import (
    build_monthly_timeline,
    compare_photos,
    compare_to_historical,
    comparison_snapshot_from_result,
    find_baseline_photo,
    monitoring_status,
)

import base64
from typing import Optional, Tuple

import cv2
import numpy as np

eye_photo_bp = Blueprint('eye_photo', __name__)

VALID_CONDITIONS = {'dry_eye', 'cornea_scar', 'glaucoma', 'general', 'cataract'}


def _create_thumbnail_data_url(image_data: str, max_width: int = 360) -> str:
    frame = decode_base64_image(image_data)
    if frame is None:
        return image_data

    height, width = frame.shape[:2]
    if width > max_width:
        scale = max_width / width
        frame = cv2.resize(frame, (max_width, int(height * scale)))

    success, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 72])
    if not success:
        return image_data

    encoded = base64.b64encode(buffer).decode('ascii')
    return f'data:image/jpeg;base64,{encoded}'


def _decode_data_url_bgr(data_url: Optional[str]):
    if not data_url or ',' not in str(data_url):
        return None
    try:
        raw = base64.b64decode(str(data_url).split(',', 1)[1])
        arr = np.frombuffer(raw, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _create_eye_pair_thumbnail(left_data_url, right_data_url, tile: int = 320, gap: int = 8) -> Optional[str]:
    """Side-by-side left/right pupil close-ups for cataract timeline thumbnails."""
    left = _decode_data_url_bgr(left_data_url)
    right = _decode_data_url_bgr(right_data_url)
    tiles = []
    labels = []

    def _fit(img):
        h, w = img.shape[:2]
        if h == tile and w == tile:
            return img
        interp = cv2.INTER_AREA if min(h, w) > tile else cv2.INTER_CUBIC
        return cv2.resize(img, (tile, tile), interpolation=interp)

    if left is not None:
        tiles.append(_fit(left))
        labels.append('Left')
    if right is not None:
        tiles.append(_fit(right))
        labels.append('Right')
    if not tiles:
        return None

    label_h = 28
    width = tile * len(tiles) + gap * (len(tiles) - 1)
    height = tile + label_h
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    canvas[:] = (17, 24, 39)

    x = 0
    for img, label in zip(tiles, labels):
        canvas[0:tile, x : x + tile] = img
        cv2.rectangle(canvas, (x, tile), (x + tile, height), (0, 0, 0), thickness=-1)
        cv2.putText(
            canvas,
            f'{label} eye',
            (x + 12, tile + 20),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (249, 250, 251),
            1,
            cv2.LINE_AA,
        )
        x += tile + gap

    ok, buffer = cv2.imencode('.jpg', canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        return None
    return f'data:image/jpeg;base64,{base64.b64encode(buffer).decode("ascii")}'


def _serialize_photo(photo: EyePhoto, include_thumbnail: bool = True):
    return photo.to_dict(include_thumbnail=include_thumbnail)


@eye_photo_bp.route('/', methods=['POST'])
@jwt_required()
def capture_eye_photo():
    """
    Capture and analyze an eye photo, store it, compare to history, and alert if worsening.

    multipart/form-data: "image" file part + "meta" JSON part with the fields below,
    or JSON Body: {
      "image": "<base64 data URL>",            # server analysis (legacy transport), or
      "on_device": { ...per-eye results },     # analysed in the browser; no image sent
      "store_image": true,                     # false: analyse but never persist the photo
      "lighting": {...}, "eyewear": {...},     # client capture checks (on_device only)
      "condition_type": "dry_eye" | "cornea_scar" | "glaucoma" | "general" | "cataract",
      "doctor_visit_interval_months": 6
    }
    """
    try:
        user_id = int(get_jwt_identity())
        try:
            data, image_data = read_image_request()
            frame_wb = client_frame_white_balance(data)
        except ImageUploadError as exc:
            return jsonify({'error': 'invalid_image', 'message': str(exc)}), 400
        condition_type = data.get('condition_type', 'general')

        if not image_data and not data.get('on_device'):
            return jsonify({'error': 'image (base64 data URL) or on_device results are required'}), 400

        if condition_type not in VALID_CONDITIONS:
            return jsonify({'error': f'condition_type must be one of: {sorted(VALID_CONDITIONS)}'}), 400

        if image_data and not data.get('on_device') and wants_async():
            job = analysis_jobs.submit('eye_photo', user_id, _process_capture, user_id, data, image_data, frame_wb)
            return jsonify({'job_id': job.id, 'status': job.status, 'poll_url': f'/api/jobs/{job.id}'}), 202

        body, status = _process_capture(user_id, data, image_data, frame_wb)
        return jsonify(body), status

    except Exception as exc:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(exc)}), 500


def _process_capture(user_id: int, data: dict, image_data, frame_wb) -> Tuple[dict, int]:
    """Analyse, gate, persist, compare and alert. Returns (response body, HTTP status)."""
    on_device = data.get('on_device')
    condition_type = data.get('condition_type', 'general')

    if on_device:
        image_data = None
        try:
            analysis = build_on_device_analysis(
                condition_type, on_device, lighting=data.get('lighting'), eyewear=data.get('eyewear'),
            )
        except OnDeviceValidationError as exc:
            return {'error': 'invalid_on_device_result', 'message': str(exc)}, 400
    elif condition_type == 'cataract':
        analysis = analyze_cataract_from_base64(image_data)
    else:
        analysis = analyze_dry_eye_from_base64(
            image_data,
            capture_mode=data.get('capture_mode', 'camera'),
            white_balance=frame_wb,
        )
    if analysis.get('error'):
        return analysis, 400
    analysis = withhold_model_outputs(analysis)
    store_image = bool(image_data) and data.get('store_image', True) is not False
    if upload_summary(data):
        analysis = {**analysis, 'upload': upload_summary(data)}

    client_local_date = data.get('client_local_date')
    if isinstance(client_local_date, str) and len(client_local_date) >= 10:
        analysis = {**analysis, 'client_local_date': client_local_date[:10]}

    lighting = analysis.get('lighting') or {}
    eyewear = analysis.get('eyewear') or {}
    acknowledge_poor_lighting = bool(data.get('acknowledge_poor_lighting'))
    eyewear_warning = None

    # Glasses heuristics are unreliable — warn only, never hard-block capture.
    if eyewear.get('detected') and eyewear.get('confidence', 0) >= 55:
        eyewear_warning = {
            'message': eyewear.get(
                'message',
                'Possible eyeglass frames detected. Results may be less reliable if glasses were worn.',
            ),
            'eyewear': eyewear,
        }

    # Framing and extreme lighting both hard-block capture (different user-facing reasons).
    if lighting.get('status') == 'framing_problem':
        return {
            'error': 'face_framing',
            'lighting': lighting,
            'message': lighting.get(
                'message',
                'Keep both eyes fully in view — move closer if the banner says so.',
            ),
        }, 422

    if lighting.get('status') == 'extreme_problem' and not acknowledge_poor_lighting:
        return {
            'error': 'poor_lighting',
            'lighting': lighting,
            'message': lighting.get('message', 'Extreme lighting — improve conditions before capture.'),
        }, 422

    if acknowledge_poor_lighting:
        lighting = {**lighting, 'acknowledged': True}
        analysis = {**analysis, 'lighting': lighting}

    metrics = analysis.get('metrics') or {}
    left = analysis.get('left_eye') or {}
    right = analysis.get('right_eye') or {}

    # Prefer tight pupil close-ups for cataract timeline thumbnails
    thumbnail = _create_thumbnail_data_url(image_data) if store_image else None
    if condition_type == 'cataract' and store_image:
        client_crops = data.get('eye_crops') if isinstance(data.get('eye_crops'), dict) else {}
        pupil_crops = analysis.get('pupil_crops') if isinstance(analysis.get('pupil_crops'), dict) else {}
        aligned = analysis.get('aligned_crops') if isinstance(analysis.get('aligned_crops'), dict) else {}
        left_crop = (
            client_crops.get('left')
            or pupil_crops.get('left')
            or aligned.get('left')
        )
        right_crop = (
            client_crops.get('right')
            or pupil_crops.get('right')
            or aligned.get('right')
        )
        pair = _create_eye_pair_thumbnail(left_crop, right_crop)
        if pair:
            thumbnail = pair
        # Prefer client iris-centered zooms in analysis_details for the UI
        if client_crops.get('left') or client_crops.get('right'):
            analysis = {
                **analysis,
                'pupil_crops': {
                    'left': client_crops.get('left') or pupil_crops.get('left'),
                    'right': client_crops.get('right') or pupil_crops.get('right'),
                    'size': client_crops.get('size') or [256, 256],
                    'source': 'client_iris_zoom',
                    'version': 1,
                },
            }

    if condition_type == 'cataract':
        scores = dict(health_score=None, sclera_redness=None, tear_film_quality=None,
                      surface_irregularity=None, left_eye_score=None, right_eye_score=None)
    else:
        score = analysis.get('score')
        scores = dict(
            health_score=float(score) if score is not None else None,
            sclera_redness=float(metrics.get('avg_sclera_redness') or 0),
            tear_film_quality=float(metrics.get('avg_tear_film_quality', 0)),
            surface_irregularity=float(metrics.get('avg_surface_irregularity', 0)),
            left_eye_score=float(left.get('health_score', 0)),
            right_eye_score=float(right.get('health_score', 0)),
        )
    photo = EyePhoto(
        user_id=user_id,
        condition_type=condition_type,
        image_thumbnail=thumbnail,
        analysis_details=analysis if store_image else strip_images(analysis),
        captured_at=utc_now(),
        **scores,
    )

    db.session.add(photo)
    db.session.flush()

    comparison = compare_to_historical(user_id, photo)

    # Persist comparison snapshot on the photo for confirmation-retake logic.
    details = dict(photo.analysis_details or {})
    if comparison.get('has_baseline'):
        details['comparison_snapshot'] = comparison_snapshot_from_result(comparison)
    photo.analysis_details = details

    # Photo comparisons rest on unvalidated 0–100 appearance indices, so they are shown on the
    # page but never raise an alert.
    db.session.commit()

    return {
        'message': 'Eye photo saved and analyzed',
        'photo': _serialize_photo(photo),
        'analysis': analysis,
        'comparison': comparison,
        'alert': None,
        'lighting': lighting,
        'eyewear_warning': eyewear_warning,
    }, 201


@eye_photo_bp.route('/', methods=['GET'])
@jwt_required()
def list_eye_photos():
    """List stored eye photos for the current user."""
    try:
        user_id = int(get_jwt_identity())
        condition_type = request.args.get('condition_type')
        limit = request.args.get('limit', type=int, default=24)
        offset = request.args.get('offset', type=int, default=0)

        query = EyePhoto.query.filter_by(user_id=user_id)
        if condition_type:
            query = query.filter_by(condition_type=condition_type)

        total = query.count()
        photos = (
            query.order_by(EyePhoto.captured_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

        return jsonify({
            'total': total,
            'limit': limit,
            'offset': offset,
            'photos': [_serialize_photo(p) for p in photos],
        }), 200

    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@eye_photo_bp.route('/status', methods=['GET'])
@jwt_required()
def get_monitoring_status():
    """Whether a monthly photo check is due."""
    try:
        user_id = int(get_jwt_identity())
        condition_type = request.args.get('condition_type', 'all')
        doctor_visit_months = request.args.get('doctor_visit_interval_months', type=int, default=6)

        query = EyePhoto.query.filter_by(user_id=user_id)
        if condition_type and condition_type != 'all':
            query = query.filter_by(condition_type=condition_type)

        last_photo = query.order_by(EyePhoto.captured_at.desc()).first()

        status = monitoring_status(last_photo, doctor_visit_months)
        status['condition_type'] = condition_type
        if last_photo:
            status['last_condition_type'] = last_photo.condition_type
        return jsonify(status), 200

    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@eye_photo_bp.route('/timeline', methods=['GET'])
@jwt_required()
def get_timeline():
    """Monthly aggregated timeline for charts and history."""
    try:
        user_id = int(get_jwt_identity())
        condition_type = request.args.get('condition_type', 'general')
        months = request.args.get('months', type=int, default=6)

        since = utc_now() - timedelta(days=months * 31)
        photos = (
            EyePhoto.query.filter(
                EyePhoto.user_id == user_id,
                EyePhoto.condition_type == condition_type,
                EyePhoto.captured_at >= since,
            )
            .order_by(EyePhoto.captured_at.asc())
            .all()
        )

        return jsonify({
            'condition_type': condition_type,
            'months': months,
            'timeline': build_monthly_timeline(photos),
            'photo_count': len(photos),
        }), 200

    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@eye_photo_bp.route('/compare', methods=['GET'])
@jwt_required()
def compare_eye_photos():
    """
    Compare two stored photos or current vs auto-selected baseline.

    Query: current_id, baseline_id (optional — auto-picks ~30d baseline if omitted)
    """
    try:
        user_id = int(get_jwt_identity())
        current_id = request.args.get('current_id', type=int)
        baseline_id = request.args.get('baseline_id', type=int)

        if not current_id:
            return jsonify({'error': 'current_id is required'}), 400

        current = EyePhoto.query.filter_by(id=current_id, user_id=user_id).first()
        if not current:
            return jsonify({'error': 'Current photo not found'}), 404

        if baseline_id:
            baseline = EyePhoto.query.filter_by(id=baseline_id, user_id=user_id).first()
            if not baseline:
                return jsonify({'error': 'Baseline photo not found'}), 404
            comparison = compare_photos(current, baseline)
            comparison['has_baseline'] = True
            comparison['baseline_thumbnail'] = baseline.image_thumbnail
        else:
            comparison = compare_to_historical(user_id, current)

        return jsonify({
            'current': _serialize_photo(current),
            'comparison': comparison,
        }), 200

    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@eye_photo_bp.route('/check-lighting', methods=['POST'])
@jwt_required()
def check_eye_photo_lighting():
    """Validate lighting before or after capture without saving."""
    try:
        try:
            _, image_data = read_image_request()
        except ImageUploadError as exc:
            return jsonify({'error': 'invalid_image', 'message': str(exc)}), 400
        if not image_data:
            return jsonify({'error': 'image is required (multipart file or base64 data URL)'}), 400

        result = check_photo_lighting_from_base64(image_data)
        if result.get('error'):
            return jsonify(result), 400
        return jsonify(result), 200
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


@eye_photo_bp.route('/<int:photo_id>', methods=['GET', 'DELETE'])
@jwt_required()
def get_or_delete_eye_photo(photo_id):
    """Get or delete a single stored eye photo."""
    try:
        user_id = int(get_jwt_identity())
        photo = EyePhoto.query.filter_by(id=photo_id, user_id=user_id).first()
        if not photo:
            return jsonify({'error': 'Photo not found'}), 404

        if request.method == 'DELETE':
            db.session.delete(photo)
            db.session.commit()
            return jsonify({'message': 'Photo deleted', 'id': photo_id}), 200

        baseline = find_baseline_photo(user_id, photo.condition_type, photo.captured_at or utc_now())
        comparison = compare_to_historical(user_id, photo) if baseline and baseline.id != photo.id else None

        return jsonify({
            'photo': _serialize_photo(photo),
            'comparison': comparison,
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 500
