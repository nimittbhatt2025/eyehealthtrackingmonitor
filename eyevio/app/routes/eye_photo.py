"""Eye photo capture, storage, and month-over-month comparison routes."""

from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.ai_models.dry_eye_analysis import (
    analyze_dry_eye_from_base64,
    check_photo_lighting_from_base64,
    decode_base64_image,
)
from app.models import Alert, EyePhoto, db
from app.utils.eye_photo_comparison import (
    build_monthly_timeline,
    compare_photos,
    compare_to_historical,
    find_baseline_photo,
    monitoring_status,
)

import base64
import cv2

eye_photo_bp = Blueprint('eye_photo', __name__)

VALID_CONDITIONS = {'dry_eye', 'cornea_scar', 'glaucoma', 'general'}


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


def _serialize_photo(photo: EyePhoto, include_thumbnail: bool = True):
    return photo.to_dict(include_thumbnail=include_thumbnail)


@eye_photo_bp.route('/', methods=['POST'])
@jwt_required()
def capture_eye_photo():
    """
    Capture and analyze an eye photo, store it, compare to history, and alert if worsening.

    Body: {
      "image": "<base64 data URL>",
      "condition_type": "dry_eye" | "cornea_scar" | "glaucoma" | "general",
      "doctor_visit_interval_months": 6
    }
    """
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json() or {}
        image_data = data.get('image')
        condition_type = data.get('condition_type', 'general')

        if not image_data:
            return jsonify({'error': 'image is required (base64 data URL)'}), 400

        if condition_type not in VALID_CONDITIONS:
            return jsonify({'error': f'condition_type must be one of: {sorted(VALID_CONDITIONS)}'}), 400

        analysis = analyze_dry_eye_from_base64(image_data)
        if analysis.get('error'):
            return jsonify(analysis), 400

        lighting = analysis.get('lighting') or {}
        acknowledge_poor_lighting = bool(data.get('acknowledge_poor_lighting'))

        if lighting and not lighting.get('acceptable') and not acknowledge_poor_lighting:
            return jsonify({
                'error': 'poor_lighting',
                'lighting': lighting,
                'message': lighting.get('message', 'Lighting is not suitable. Please retake in better conditions.'),
            }), 422

        metrics = analysis.get('metrics') or {}
        left = analysis.get('left_eye') or {}
        right = analysis.get('right_eye') or {}

        photo = EyePhoto(
            user_id=user_id,
            condition_type=condition_type,
            image_thumbnail=_create_thumbnail_data_url(image_data),
            health_score=float(analysis.get('score', 0)),
            sclera_redness=float(metrics.get('avg_sclera_redness', 0)),
            tear_film_quality=float(metrics.get('avg_tear_film_quality', 0)),
            surface_irregularity=float(metrics.get('avg_surface_irregularity', 0)),
            left_eye_score=float(left.get('health_score', 0)),
            right_eye_score=float(right.get('health_score', 0)),
            analysis_details=analysis,
            captured_at=datetime.utcnow(),
        )

        db.session.add(photo)
        db.session.flush()

        comparison = compare_to_historical(user_id, photo)
        alert_created = None

        if comparison.get('deteriorated'):
            severity = comparison.get('severity', 'medium')
            alert_severity = 'critical' if severity in ('high', 'critical') else 'high'

            doctor_months = int(data.get('doctor_visit_interval_months', 6))
            alert = Alert(
                user_id=user_id,
                alert_type='eye_health_deterioration',
                severity=alert_severity,
                title=f'{comparison.get("condition_label", "Eye health")} change detected',
                message=comparison.get('message', 'Your eye photo metrics have worsened since last month.'),
                alert_data={
                    'comparison': {
                        k: v for k, v in comparison.items() if k != 'baseline_thumbnail'
                    },
                    'current_photo_id': photo.id,
                    'condition_type': condition_type,
                    'doctor_visit_interval_months': doctor_months,
                    'recommend_early_visit': comparison.get('recommend_doctor_visit', False),
                },
                is_actionable=True,
            )
            db.session.add(alert)
            alert_created = {
                'id': None,
                'severity': alert_severity,
                'title': alert.title,
                'message': alert.message,
            }

        db.session.commit()

        if alert_created:
            alert_row = (
                Alert.query.filter_by(user_id=user_id, alert_type='eye_health_deterioration')
                .order_by(Alert.created_at.desc())
                .first()
            )
            if alert_row:
                alert_created['id'] = alert_row.id

        return jsonify({
            'message': 'Eye photo saved and analyzed',
            'photo': _serialize_photo(photo),
            'analysis': analysis,
            'comparison': comparison,
            'alert': alert_created,
            'lighting': lighting,
            'lighting_warning': lighting.get('quality') == 'fair',
        }), 201

    except Exception as exc:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(exc)}), 500


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

        since = datetime.utcnow() - timedelta(days=months * 31)
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
        data = request.get_json() or {}
        image_data = data.get('image')
        if not image_data:
            return jsonify({'error': 'image is required (base64 data URL)'}), 400

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

        baseline = find_baseline_photo(user_id, photo.condition_type, photo.captured_at or datetime.utcnow())
        comparison = compare_to_historical(user_id, photo) if baseline and baseline.id != photo.id else None

        return jsonify({
            'photo': _serialize_photo(photo),
            'comparison': comparison,
        }), 200

    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 500
