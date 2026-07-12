from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, VisionTest, User, Alert
from app.utils.analytics import detect_vision_decline
from datetime import datetime

vision_test_bp = Blueprint('vision_test', __name__)


@vision_test_bp.route('/', methods=['POST'])
@jwt_required()
def submit_vision_test():
    """
    Submit a new vision test result
    
    Supported test types:
    - acuity: Visual acuity (Snellen-like)
    - color: Color blindness (Ishihara)
    - contrast: Amsler grid (macular health)
    - contrast_sensitivity: Pelli-Robson style (functional vision, early glaucoma/cataract detection)
    - glaucoma_neural: Paracentral neural loss detection (early glaucoma screening)
    - cataract_glare: Lens clarity with glare simulation (cataract detection)
    - red_reflex: Digital Bruckner test (retinal health, leukocoria, opacity detection)
    - accommodative_lag: Ciliary muscle fatigue / near-work stress tracker (pupillary miosis)
    - peripheral_awareness: Visual field / peripheral vision deficit detection (gamified)
    - ocular_ergonomics: Real-time posture & lighting monitoring (glare, distance, ergonomics)
    - dry_eye: Photo-based dry eye screening (sclera redness + tear film surface analysis)
    """
    try:
        user_id = int(get_jwt_identity())  # Convert from string to int
        data = request.get_json()
        
        print(f"Received test submission: {data}")  # Debug log
        
        # Validate required fields
        if not data.get('test_type') or data.get('score') is None:
            print(f"Missing required fields. test_type: {data.get('test_type')}, score: {data.get('score')}")
            return jsonify({'error': 'test_type and score are required'}), 400
        
        # Create vision test record
        vision_test = VisionTest(
            user_id=user_id,
            test_type=data['test_type'],
            score=data['score'],
            response_time_ms=data.get('response_time_ms'),
            errors=data.get('errors', 0),
            test_details=data.get('test_details'),
            left_eye_score=data.get('left_eye_score'),
            right_eye_score=data.get('right_eye_score'),
            lighting_condition=data.get('lighting_condition'),
            device_type=data.get('device_type'),
            notes=data.get('notes')
        )
        
        db.session.add(vision_test)
        db.session.commit()
        
        print(f"Test saved successfully with ID: {vision_test.id}")  # Debug log
        
        # Check for vision decline
        all_tests = VisionTest.query.filter_by(
            user_id=user_id,
            test_type=data['test_type']
        ).order_by(VisionTest.created_at).all()
        
        if len(all_tests) >= 5:
            decline_info = detect_vision_decline(all_tests)
            
            if decline_info.get('declined'):
                # Convert NumPy types to Python types for JSON serialization
                clean_decline_info = {
                    'declined': bool(decline_info.get('declined', False)),
                    'decline_percent': float(decline_info.get('decline_percent', 0)),
                    'avg_recent_score': float(decline_info.get('avg_recent_score', 0)),
                    'avg_previous_score': float(decline_info.get('avg_previous_score', 0)),
                    'tests_analyzed': int(decline_info.get('tests_analyzed', 0))
                }
                
                # Create alert
                alert = Alert(
                    user_id=user_id,
                    alert_type='vision_decline',
                    severity='high',
                    title='Vision Decline Detected',
                    message=f'Your vision has declined by {clean_decline_info["decline_percent"]:.1f}% based on recent tests.',
                    alert_data=clean_decline_info
                )
                db.session.add(alert)
                db.session.commit()
        
        return jsonify({
            'message': 'Vision test submitted successfully',
            'test_id': vision_test.id,
            'score': vision_test.score,
            'created_at': vision_test.created_at.isoformat()
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
        data = request.get_json() or {}
        image_data = data.get('image')
        if not image_data:
            return jsonify({'error': 'image is required (base64 data URL)'}), 400

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
    Body: { "image": "<base64 or data-URL>" }
    """
    try:
        data = request.get_json() or {}
        image_data = data.get('image')
        if not image_data:
            return jsonify({'error': 'image is required (base64 data URL)'}), 400

        from app.ai_models.dry_eye_analysis import analyze_dry_eye_from_base64
        results = analyze_dry_eye_from_base64(image_data)
        if results.get('error'):
            return jsonify(results), 400

        lighting = results.get('lighting') or {}
        if lighting and not lighting.get('acceptable') and not data.get('acknowledge_poor_lighting'):
            return jsonify({
                'error': 'poor_lighting',
                'lighting': lighting,
                'message': lighting.get('message', 'Lighting is not suitable. Please retake in better conditions.'),
            }), 422

        return jsonify(results), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


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
                'notes': test.notes
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
        
        return jsonify({
            'id': test.id,
            'test_type': test.test_type,
            'score': test.score,
            'response_time_ms': test.response_time_ms,
            'errors': test.errors,
            'test_details': test.test_details,
            'left_eye_score': test.left_eye_score,
            'right_eye_score': test.right_eye_score,
            'lighting_condition': test.lighting_condition,
            'device_type': test.device_type,
            'created_at': test.created_at.isoformat(),
            'notes': test.notes
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
        
        query = VisionTest.query.filter_by(user_id=user_id)
        if test_type:
            query = query.filter_by(test_type=test_type)
        
        tests = query.all()
        
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
        
        scores = [t.score for t in tests]
        
        import numpy as np
        
        stats = {
            'total_tests': len(tests),
            'average_score': float(np.mean(scores)),
            'min_score': float(np.min(scores)),
            'max_score': float(np.max(scores)),
            'std_dev': float(np.std(scores)),
            'latest_score': tests[-1].score if tests else None,
            'first_test_date': tests[0].created_at.isoformat() if tests else None,
            'last_test_date': tests[-1].created_at.isoformat() if tests else None
        }
        
        return jsonify(stats), 200
        
    except Exception as e:
        print(f"Error in get_vision_stats: {str(e)}")
        return jsonify({'error': str(e)}), 500
