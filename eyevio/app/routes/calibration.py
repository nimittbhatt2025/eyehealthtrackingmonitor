"""
Blink Calibration API Routes

Endpoints for calibrating personalized blink detection
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.ai_models.blink_calibration import BlinkCalibrator, AdaptiveBlinkDetector
from app.ai_models.eye_analysis import detect_eyes
from app.models import User
import cv2
import numpy as np
import base64

bp = Blueprint('calibration', __name__, url_prefix='/api/calibration')

# Store active calibrators per user session
active_calibrators = {}


@bp.route('/start', methods=['POST'])
@jwt_required()
def start_calibration():
    """Start a new calibration session"""
    user_id = get_jwt_identity()
    
    print(f"[START] Creating session for user: {user_id}")
    
    # Clean up any old session first
    if user_id in active_calibrators:
        print(f"[START] Cleaning up old session for user {user_id}")
        del active_calibrators[user_id]
    
    # Create new calibrator
    calibrator = BlinkCalibrator()
    active_calibrators[user_id] = calibrator
    
    print(f"[START] Session created! Active sessions: {list(active_calibrators.keys())}")
    
    return jsonify({
        'message': 'Calibration started',
        'instructions': {
            'step1': 'Look at camera normally for 5 seconds (eyes open)',
            'step2': 'Perform 10 slow, deliberate blinks',
            'step3': 'Submit calibration'
        }
    }), 200


@bp.route('/baseline', methods=['POST'])
@jwt_required()
def add_baseline():
    """
    Add baseline (eyes open) samples
    
    Expects: { "frame": "base64_encoded_image" }
    """
    user_id = get_jwt_identity()
    print(f"[BASELINE] Request from user: {user_id}")
    
    if user_id not in active_calibrators:
        print(f"[BASELINE ERROR] No session for user {user_id}")
        return jsonify({'error': 'No active calibration session'}), 400
    
    try:
        data = request.get_json()
        frame_data = data.get('frame')
        
        if not frame_data:
            print("[BASELINE ERROR] No frame data")
            return jsonify({'error': 'No frame data provided'}), 400
        
        # Decode base64 image
        try:
            img_data = base64.b64decode(frame_data.split(',')[1] if ',' in frame_data else frame_data)
            nparr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                print("[BASELINE ERROR] Failed to decode image")
                return jsonify({'error': 'Invalid image format'}), 400
                
            print(f"[BASELINE] Frame decoded successfully: {frame.shape}")
        except Exception as decode_error:
            print(f"[BASELINE ERROR] Decode error: {str(decode_error)}")
            return jsonify({'error': f'Image decode error: {str(decode_error)}'}), 400
        
        # Detect eyes and get EAR
        eye_data = detect_eyes(frame)
        print(f"[BASELINE] Eye detection result: {eye_data.get('detected', False)}")
        
        if not eye_data.get('detected'):
            print(f"[BASELINE] No eyes detected")
            return jsonify({'error': 'Eyes not detected'}), 400
        
        ear = eye_data.get('avg_ear')
        active_calibrators[user_id].add_baseline_sample(ear)
        print(f"[BASELINE] Added sample! EAR={ear:.3f}, Total: {len(active_calibrators[user_id].baseline_ears)}")
        
        return jsonify({
            'samples_collected': len(active_calibrators[user_id].baseline_ears),
            'current_ear': round(ear, 3)
        }), 200
        
    except Exception as e:
        print(f"[BASELINE ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/blink', methods=['POST'])
@jwt_required()
def add_blink():
    """
    Add blink samples
    
    Expects: { "frame": "base64_encoded_image" }
    """
    user_id = get_jwt_identity()
    
    print(f"[BLINK] Request from user: {user_id}")
    print(f"[BLINK] Active sessions: {list(active_calibrators.keys())}")
    print(f"[BLINK] User in sessions: {user_id in active_calibrators}")
    
    if user_id not in active_calibrators:
        print(f"[BLINK ERROR] No session for user {user_id}")
        return jsonify({'error': 'No active calibration session'}), 400
    
    try:
        data = request.get_json()
        frame_data = data.get('frame')
        
        if not frame_data:
            print("[BLINK ERROR] No frame data")
            return jsonify({'error': 'No frame data provided'}), 400
        
        # Decode base64 image
        img_data = base64.b64decode(frame_data.split(',')[1] if ',' in frame_data else frame_data)
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Detect eyes and get EAR
        eye_data = detect_eyes(frame)
        
        if not eye_data.get('detected'):
            print("[BLINK] Eyes not detected in frame")
            return jsonify({'error': 'Eyes not detected'}), 400
        
        ear = eye_data.get('avg_ear')
        
        # Only add if EAR is low (indicating closed eyes)
        if ear < 0.20:  # Reasonable threshold for blink collection
            active_calibrators[user_id].add_blink_sample(ear)
            print(f"[BLINK] Added sample! EAR={ear:.3f}, Total: {len(active_calibrators[user_id].blink_ears)}")
        else:
            print(f"[BLINK] EAR too high ({ear:.3f}), skipping")
        
        return jsonify({
            'blink_samples_collected': len(active_calibrators[user_id].blink_ears),
            'avg_ear': round(ear, 3),
            'added': ear < 0.20
        }), 200
        
    except Exception as e:
        print(f"[BLINK ERROR] Exception: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/finalize', methods=['POST'])
@jwt_required()
def finalize_calibration():
    """Calculate personalized threshold from calibration data"""
    user_id = get_jwt_identity()
    
    print(f"[FINALIZE] Request from user: {user_id}")
    print(f"[FINALIZE] Active sessions: {list(active_calibrators.keys())}")
    
    if user_id not in active_calibrators:
        print(f"[FINALIZE ERROR] No session found for user {user_id}")
        return jsonify({'error': 'No active calibration session'}), 400
    
    calibrator = active_calibrators[user_id]
    result = calibrator.calculate_threshold()
    
    print(f"[FINALIZE] Threshold calculation result: {result.get('success')}")
    
    if result.get('success'):
        # Save to user settings
        save_result = calibrator.save_calibration(user_id)
        result['saved'] = save_result.get('success', False)
        print(f"[FINALIZE] Saved to database: {result.get('saved')}")
        
        # Don't delete immediately - keep session for a bit to handle late frames
        # We'll clean it up in a background task or on next calibration start
        print(f"[FINALIZE] Keeping session alive for cleanup")
    
    return jsonify(result), 200 if result.get('success') else 400


@bp.route('/status', methods=['GET'])
@jwt_required()
def get_calibration_status():
    """Get current calibration session status"""
    user_id = get_jwt_identity()
    
    # Check for active session
    if user_id in active_calibrators:
        calibrator = active_calibrators[user_id]
        return jsonify({
            'active': True,
            'baseline_samples': len(calibrator.baseline_ears),
            'blink_samples': len(calibrator.blink_ears),
            'ready_to_finalize': len(calibrator.baseline_ears) >= 30 and len(calibrator.blink_ears) >= 10,
            'calibrated': calibrator.calibrated,
            'threshold': float(calibrator.personalized_threshold) if calibrator.calibrated else None
        }), 200
    
    # Check database for saved calibration
    from app.models import User
    user = User.query.get(user_id)
    
    if user and user.blink_threshold:
        return jsonify({
            'active': False,
            'calibrated': True,
            'threshold': float(user.blink_threshold),
            'calibrated_at': user.blink_threshold_updated_at.isoformat() if user.blink_threshold_updated_at else None
        }), 200
    
    return jsonify({'active': False, 'calibrated': False}), 200


@bp.route('/test', methods=['POST'])
@jwt_required()
def test_blink():
    """Test blink detection using calibrated threshold"""
    user_id = get_jwt_identity()
    
    print(f"[TEST] Request from user: {user_id}")
    
    # Try to get threshold from active calibrator session first
    if user_id in active_calibrators:
        calibrator = active_calibrators[user_id]
        if calibrator.calibrated:
            threshold = calibrator.personalized_threshold
            print(f"[TEST] Using threshold from active session: {threshold:.3f}")
        else:
            # Check database for saved threshold
            from app.models import User
            user = User.query.get(user_id)
            if user and user.blink_threshold:
                threshold = user.blink_threshold
                print(f"[TEST] Using threshold from database: {threshold:.3f}")
            else:
                print(f"[TEST ERROR] No calibration found for user {user_id}")
                return jsonify({'error': 'No calibration found. Please calibrate first.'}), 400
    else:
        # No active session, check database
        from app.models import User
        user = User.query.get(user_id)
        if user and user.blink_threshold:
            threshold = user.blink_threshold
            print(f"[TEST] Using saved threshold from database: {threshold:.3f}")
        else:
            print(f"[TEST ERROR] No calibration session or saved threshold for user {user_id}")
            return jsonify({'error': 'No calibration found. Please calibrate first.'}), 400
    
    data = request.get_json()
    frame_data = data.get('frame')
    
    if not frame_data:
        return jsonify({'error': 'No frame provided'}), 400
    
    try:
        # Decode and process frame
        img_data = base64.b64decode(frame_data.split(',')[1])
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify({'error': 'Invalid frame data'}), 400
        
        # Detect eyes
        eye_data = detect_eyes(frame)
        
        if not eye_data or 'avg_ear' not in eye_data:
            return jsonify({'error': 'Could not detect eyes'}), 400
        
        ear = eye_data.get('avg_ear')
        # threshold variable already set above
        is_blink = ear < threshold
        
        print(f"[TEST] EAR={ear:.3f}, Threshold={threshold:.3f}, Blink={is_blink}")
        
        # Helper function to convert numpy types to Python types
        def convert_numpy(obj):
            if isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.integer):
                return int(obj)
            elif isinstance(obj, np.bool_):
                return bool(obj)
            elif isinstance(obj, dict):
                return {k: convert_numpy(v) for k, v in obj.items()}
            elif isinstance(obj, (list, tuple)):
                return [convert_numpy(x) for x in obj]
            return obj
        
        return jsonify({
            'success': True,
            'ear': float(ear),
            'threshold': float(threshold),
            'is_blink': bool(is_blink),
            'eye_data': convert_numpy(eye_data)
        }), 200
        
    except Exception as e:
        print(f"[TEST ERROR] Exception: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

