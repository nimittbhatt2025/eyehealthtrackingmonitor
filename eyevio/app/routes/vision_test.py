from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, VisionTest, User, Alert
from app.utils.analytics import detect_vision_decline
from app.utils.change_detection import RETIRED_INDEX_TESTS
from app.services import analysis_jobs
from app.services.alert_delivery import create_and_deliver_alert
from app.services.analysis_jobs import wants_async
from app.utils.image_upload import (
    ImageUploadError,
    client_frame_white_balance,
    read_image_request,
    upload_summary,
)
from datetime import datetime, timedelta

vision_test_bp = Blueprint('vision_test', __name__)

DECLINE_ALERT_COOLDOWN_DAYS = 14
# The earlier side-vision exercise used a disease name as its type id; it was never that test.
LEGACY_TEST_TYPES = {'glaucoma_neural': 'side_vision_legacy'}
# The display index is withheld when a session is unreliable or cannot be measured.
OPTIONAL_INDEX_TESTS = frozenset({'accommodative_lag', 'near_point_convergence'})


def _recent_decline_alert(user_id, test_type, method_version):
    since = datetime.utcnow() - timedelta(days=DECLINE_ALERT_COOLDOWN_DAYS)
    recent = Alert.query.filter(
        Alert.user_id == user_id,
        Alert.alert_type == 'vision_decline',
        Alert.created_at >= since,
    ).all()
    return any(
        (a.alert_data or {}).get('test_type') == test_type
        and (a.alert_data or {}).get('method_version') == method_version
        for a in recent
    )


@vision_test_bp.route('/', methods=['POST'])
@jwt_required()
def submit_vision_test():
    """
    Submit a new vision test result
    
    Supported home-check types (unvalidated research and educational prototype; not clinically validated):
    - visual_acuity: Letter-chart home check (not a refraction)
    - color_vision: Confusion-axis colour thresholds, u'v' x 1e-4 (not occupational certification)
    - contrast_sensitivity: qCSF grating curve at 1 m (not a clinical CSF / Pelli-Robson exam)
    - side_vision: Relative four-quadrant asymmetry with perimetry-style reliability
      indices (not a visual-field test; cannot detect or rule out eye disease).
      side_vision_legacy is the earlier exercise; its old type id is mapped on submit.
    - cataract_glare: Contrast loss under glare, Δ logCS (not cataract diagnosis / not LOCS)
    - red_reflex: Phone rear camera + torch, inter-ocular glow symmetry only (not a clinical red-reflex exam)
    - accommodative_lag: Near Blur Tolerance, blur detection threshold in arcmin (v2; not accommodation)
    - peripheral_awareness: Side-awareness game (not a visual-field test)
    - ocular_ergonomics: Posture and lighting comfort
    - dry_eye: Symptom + photo home check (not dry-eye disease diagnosis)
    """
    try:
        user_id = int(get_jwt_identity())  # Convert from string to int
        data = request.get_json()
        
        print(f"Received test submission: {data}")  # Debug log
        
        if not data.get('test_type'):
            return jsonify({'error': 'test_type is required'}), 400
        data['test_type'] = LEGACY_TEST_TYPES.get(data['test_type'], data['test_type'])
        retired_index = data['test_type'] in RETIRED_INDEX_TESTS
        if data.get('score') is None and not retired_index and data['test_type'] not in OPTIONAL_INDEX_TESTS:
            return jsonify({'error': 'score is required for this test type'}), 400
        score = None if retired_index else data['score']
        
        method_version = (data.get('test_details') or {}).get('method_version')
        quality_flag, quality_note = None, None
        if data['test_type'] == 'cataract_glare' and method_version != 2:
            quality_flag = 'legacy_glare_method'
            quality_note = 'Excluded: submitted by the retired glare test, which had a stripe-orientation bug.'

        # Create vision test record
        vision_test = VisionTest(
            data_quality_flag=quality_flag,
            data_quality_note=quality_note,
            user_id=user_id,
            test_type=data['test_type'],
            score=score,
            response_time_ms=data.get('response_time_ms'),
            errors=data.get('errors', 0),
            test_details=data.get('test_details'),
            left_eye_score=None if retired_index else data.get('left_eye_score'),
            right_eye_score=None if retired_index else data.get('right_eye_score'),
            lighting_condition=data.get('lighting_condition'),
            device_type=data.get('device_type'),
            notes=data.get('notes')
        )
        
        db.session.add(vision_test)
        db.session.commit()
        
        print(f"Test saved successfully with ID: {vision_test.id}")  # Debug log
        
        change_check = None
        if not quality_flag:
            # Scores from different test methods are on different scales.
            all_tests = [
                t for t in VisionTest.usable().filter_by(user_id=user_id, test_type=data['test_type'])
                .order_by(VisionTest.created_at).all()
                if (t.test_details or {}).get('method_version') == method_version
            ]
            decline_info = detect_vision_decline(all_tests, data['test_type'], method_version)
            change_check = {
                'status': decline_info['status'],
                'message': decline_info['message'],
                'sessions': len(all_tests),
            }
            if decline_info['declined'] and not _recent_decline_alert(user_id, data['test_type'], method_version):
                assessment = decline_info['assessment']
                create_and_deliver_alert(
                    user_id=user_id,
                    alert_type='vision_decline',
                    severity='medium',
                    title='Repeated change in a home vision check',
                    message=(
                        f'{decline_info["message"]} This is a home check, not a diagnosis. '
                        'If you have noticed a change in your vision, see an eye care professional.'
                    ),
                    alert_data={
                        'test_type': data['test_type'],
                        'method_version': method_version,
                        'baseline_score': decline_info['baseline_score'],
                        'current_score': decline_info['current_score'],
                        'tests_analyzed': decline_info['tests_analyzed'],
                        'assessment': assessment,
                    },
                )

        return jsonify({
            'message': 'Vision test submitted successfully',
            'test_id': vision_test.id,
            'score': vision_test.score,
            'created_at': vision_test.created_at.isoformat(),
            'change_check': change_check,
            'data_quality_flag': quality_flag,
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"Error submitting vision test: {str(e)}")  # Debug log
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@vision_test_bp.route('/check-photo-lighting', methods=['POST'])
@jwt_required()
def check_photo_lighting():
    """Validate lighting for eye photo capture (dry eye / monitor flows)."""
    try:
        try:
            _, image_data = read_image_request()
        except ImageUploadError as exc:
            return jsonify({'error': 'invalid_image', 'message': str(exc)}), 400
        if not image_data:
            return jsonify({'error': 'image is required (multipart file or base64 data URL)'}), 400

        from app.ai_models.dry_eye_analysis import check_photo_lighting_from_base64
        result = check_photo_lighting_from_base64(image_data)
        if result.get('error'):
            return jsonify(result), 400
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@vision_test_bp.route('/analyze-dry-eye', methods=['POST'])
@jwt_required()
def analyze_dry_eye():
    """
    Analyze a face/eye photo for dry-eye screening signals.
    multipart: "image" file part + optional "meta" JSON part ({"capture_mode": ...})
    or JSON: { "image": "<base64 or data-URL>" }
       or { "on_device": {...per-eye results}, "lighting": {...}, "eyewear": {...} }  (no image)
    """
    try:
        try:
            data, image_data = read_image_request()
            frame_wb = client_frame_white_balance(data)
        except ImageUploadError as exc:
            return jsonify({'error': 'invalid_image', 'message': str(exc)}), 400
        on_device = data.get('on_device')
        if not image_data and not on_device:
            return jsonify({'error': 'image (base64 data URL) or on_device results are required'}), 400

        if image_data and not on_device and wants_async():
            job = analysis_jobs.submit('dry_eye', int(get_jwt_identity()), _analyze_dry_eye, data, image_data, frame_wb)
            return jsonify({'job_id': job.id, 'status': job.status, 'poll_url': f'/api/jobs/{job.id}'}), 202

        body, status = _analyze_dry_eye(data, image_data, frame_wb)
        return jsonify(body), status
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def _analyze_dry_eye(data, image_data, frame_wb):
    """Returns (response body, HTTP status)."""
    on_device = data.get('on_device')
    if on_device:
        from app.ai_models.on_device import OnDeviceValidationError, build_on_device_analysis
        try:
            results = build_on_device_analysis(
                'dry_eye', on_device, lighting=data.get('lighting'), eyewear=data.get('eyewear'),
            )
        except OnDeviceValidationError as exc:
            return {'error': 'invalid_on_device_result', 'message': str(exc)}, 400
    else:
        from app.ai_models.dry_eye_analysis import analyze_dry_eye_from_base64
        results = analyze_dry_eye_from_base64(
            image_data,
            capture_mode=data.get('capture_mode', 'camera'),
            white_balance=frame_wb,
        )
    if results.get('error'):
        return results, 400
    from app.ai_models.experimental_models import withhold_model_outputs
    results = withhold_model_outputs(results)
    if upload_summary(data):
        results['upload'] = upload_summary(data)

    lighting = results.get('lighting') or {}
    if lighting and not lighting.get('acceptable') and not data.get('acknowledge_poor_lighting'):
        return {
            'error': 'poor_lighting',
            'lighting': lighting,
            'message': lighting.get('message', 'Lighting is not suitable. Please retake in better conditions.'),
        }, 422

    return results, 200


@vision_test_bp.route('/', methods=['GET'])
@jwt_required()
def get_vision_tests():
    """Get user's vision test history"""
    try:
        user_id = int(get_jwt_identity())
        
        # Query parameters
        test_type = request.args.get('test_type')
        limit = request.args.get('limit', type=int, default=50)
        offset = request.args.get('offset', type=int, default=0)
        
        # Build query
        query = VisionTest.query.filter_by(user_id=user_id)
        
        if test_type:
            query = query.filter_by(test_type=test_type)
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        tests = query.order_by(VisionTest.created_at.desc()).limit(limit).offset(offset).all()
        
        return jsonify({
            'total': total,
            'limit': limit,
            'offset': offset,
            'tests': [{
                'id': test.id,
                'test_type': test.test_type,
                'score': test.score,
                'response_time_ms': test.response_time_ms,
                'errors': test.errors,
                'left_eye_score': test.left_eye_score,
                'right_eye_score': test.right_eye_score,
                'lighting_condition': test.lighting_condition,
                'device_type': test.device_type,
                'created_at': test.created_at.isoformat(),
                'notes': test.notes,
                'data_quality_flag': test.data_quality_flag,
                'data_quality_note': test.data_quality_note,
            } for test in tests]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@vision_test_bp.route('/<int:test_id>', methods=['GET'])
@jwt_required()
def get_vision_test(test_id):
    """Get a specific vision test"""
    try:
        user_id = int(get_jwt_identity())
        test = VisionTest.query.filter_by(id=test_id, user_id=user_id).first()
        
        if not test:
            return jsonify({'error': 'Test not found'}), 404

        from app.ai_models.experimental_models import withhold_model_outputs
        details = withhold_model_outputs(test.test_details) if test.test_type == 'dry_eye' else test.test_details

        return jsonify({
            'id': test.id,
            'test_type': test.test_type,
            'score': test.score,
            'response_time_ms': test.response_time_ms,
            'errors': test.errors,
            'test_details': details,
            'left_eye_score': test.left_eye_score,
            'right_eye_score': test.right_eye_score,
            'lighting_condition': test.lighting_condition,
            'device_type': test.device_type,
            'created_at': test.created_at.isoformat(),
            'notes': test.notes,
            'data_quality_flag': test.data_quality_flag,
            'data_quality_note': test.data_quality_note,
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@vision_test_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_vision_stats():
    """Get vision test statistics"""
    try:
        user_id = int(get_jwt_identity())
        test_type = request.args.get('test_type')
        
        query = VisionTest.usable().filter_by(user_id=user_id)
        if test_type:
            query = query.filter_by(test_type=test_type)
        
        tests = query.order_by(VisionTest.created_at).all()
        
        if not tests:
            # Return empty stats instead of 404
            return jsonify({
                'total_tests': 0,
                'average_score': 0,
                'min_score': 0,
                'max_score': 0,
                'std_dev': 0,
                'latest_score': None,
                'first_test_date': None,
                'last_test_date': None
            }), 200
        
        scores = [t.score for t in tests if t.score is not None]

        import numpy as np

        stats = {
            'total_tests': len(tests),
            'average_score': float(np.mean(scores)) if scores else None,
            'min_score': float(np.min(scores)) if scores else None,
            'max_score': float(np.max(scores)) if scores else None,
            'std_dev': float(np.std(scores)) if scores else None,
            'latest_score': tests[-1].score if tests else None,
            'first_test_date': tests[0].created_at.isoformat() if tests else None,
            'last_test_date': tests[-1].created_at.isoformat() if tests else None
        }
        
        return jsonify(stats), 200
        
    except Exception as e:
        print(f"Error in get_vision_stats: {str(e)}")
        return jsonify({'error': str(e)}), 500
