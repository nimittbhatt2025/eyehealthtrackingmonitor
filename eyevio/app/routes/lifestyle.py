from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, LifestyleLog
from datetime import datetime

lifestyle_bp = Blueprint('lifestyle', __name__)


@lifestyle_bp.route('/log', methods=['POST'])
@jwt_required()
def submit_lifestyle_log():
    """Submit daily lifestyle data"""
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()
        
        # Validate required fields
        if not data.get('log_date'):
            return jsonify({'error': 'log_date is required'}), 400
        
        log_date = datetime.fromisoformat(data['log_date']).date()
        
        # Check if log already exists for this date
        existing_log = LifestyleLog.query.filter_by(
            user_id=user_id,
            log_date=log_date
        ).first()
        
        if existing_log:
            # Update existing log
            lifestyle_log = existing_log
        else:
            # Create new log
            lifestyle_log = LifestyleLog(user_id=user_id, log_date=log_date)
        
        # Update fields
        if 'screen_time_hours' in data:
            lifestyle_log.screen_time_hours = data['screen_time_hours']
        if 'screen_time_breakdown' in data:
            lifestyle_log.screen_time_breakdown = data['screen_time_breakdown']
        if 'sleep_hours' in data:
            lifestyle_log.sleep_hours = data['sleep_hours']
        if 'sleep_quality' in data:
            lifestyle_log.sleep_quality = data['sleep_quality']
        if 'lighting_condition' in data:
            lifestyle_log.lighting_condition = data['lighting_condition']
        if 'blue_light_exposure_hours' in data:
            lifestyle_log.blue_light_exposure_hours = data['blue_light_exposure_hours']
        if 'activity_level' in data:
            lifestyle_log.activity_level = data['activity_level']
        if 'outdoor_time_hours' in data:
            lifestyle_log.outdoor_time_hours = data['outdoor_time_hours']
        if 'exercise_minutes' in data:
            lifestyle_log.exercise_minutes = data['exercise_minutes']
        if 'breaks_taken' in data:
            lifestyle_log.breaks_taken = data['breaks_taken']
        if 'eye_drops_used' in data:
            lifestyle_log.eye_drops_used = data['eye_drops_used']
        if 'eye_strain_level' in data:
            lifestyle_log.eye_strain_level = data['eye_strain_level']
        if 'headache_level' in data:
            lifestyle_log.headache_level = data['headache_level']
        if 'dry_eyes' in data:
            lifestyle_log.dry_eyes = data['dry_eyes']
        if 'blurred_vision' in data:
            lifestyle_log.blurred_vision = data['blurred_vision']
        if 'notes' in data:
            lifestyle_log.notes = data['notes']
        
        if not existing_log:
            db.session.add(lifestyle_log)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Lifestyle log submitted successfully',
            'log_id': lifestyle_log.id,
            'log_date': lifestyle_log.log_date.isoformat()
        }), 201 if not existing_log else 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@lifestyle_bp.route('/logs', methods=['GET'])
@jwt_required()
def get_lifestyle_logs():
    """Get lifestyle logs"""
    try:
        user_id = int(get_jwt_identity())
        
        # Query parameters
        days = request.args.get('days', type=int, default=30)
        limit = request.args.get('limit', type=int, default=100)
        offset = request.args.get('offset', type=int, default=0)
        
        from datetime import timedelta
        cutoff_date = datetime.utcnow().date() - timedelta(days=days)
        
        query = LifestyleLog.query.filter(
            LifestyleLog.user_id == user_id,
            LifestyleLog.log_date >= cutoff_date
        )
        
        total = query.count()
        logs = query.order_by(LifestyleLog.log_date.desc()).limit(limit).offset(offset).all()
        
        return jsonify({
            'total': total,
            'limit': limit,
            'offset': offset,
            'logs': [{
                'id': log.id,
                'log_date': log.log_date.isoformat(),
                'screen_time_hours': log.screen_time_hours,
                'screen_time_breakdown': log.screen_time_breakdown,
                'sleep_hours': log.sleep_hours,
                'sleep_quality': log.sleep_quality,
                'lighting_condition': log.lighting_condition,
                'blue_light_exposure_hours': log.blue_light_exposure_hours,
                'activity_level': log.activity_level,
                'outdoor_time_hours': log.outdoor_time_hours,
                'exercise_minutes': log.exercise_minutes,
                'breaks_taken': log.breaks_taken,
                'eye_drops_used': log.eye_drops_used,
                'eye_strain_level': log.eye_strain_level,
                'headache_level': log.headache_level,
                'dry_eyes': log.dry_eyes,
                'blurred_vision': log.blurred_vision
            } for log in logs]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@lifestyle_bp.route('/trends', methods=['GET'])
@jwt_required()
def get_lifestyle_trends():
    """Get lifestyle data formatted for trends visualization"""
    try:
        user_id = int(get_jwt_identity())
        days = request.args.get('days', type=int, default=30)
        
        from datetime import timedelta
        cutoff_date = datetime.utcnow().date() - timedelta(days=days)
        
        logs = LifestyleLog.query.filter(
            LifestyleLog.user_id == user_id,
            LifestyleLog.log_date >= cutoff_date
        ).order_by(LifestyleLog.log_date).all()
        
        print(f' Lifestyle trends for user {user_id}: Found {len(logs)} logs')
        
        trends = [{
            'log_date': log.log_date.isoformat(),
            'screen_time': log.screen_time_hours,
            'sleep_hours': log.sleep_hours,
            'exercise_minutes': log.exercise_minutes,
            'breaks_taken': log.breaks_taken,
            'diet_quality': 0  # Placeholder, add to model if needed
        } for log in logs]
        
        if trends:
            print(f'   Sample: {trends[0]}')
        
        return jsonify({
            'trends': trends,
            'total': len(trends)
        }), 200
        
    except Exception as e:
        print(f' Lifestyle trends error: {str(e)}')
        return jsonify({'error': str(e)}), 500


@lifestyle_bp.route('/correlations', methods=['GET'])
@jwt_required()
def get_lifestyle_correlations():
    """Get lifestyle correlations with vision and fatigue"""
    try:
        user_id = int(get_jwt_identity())
        days = request.args.get('days', type=int, default=30)
        
        from datetime import timedelta
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Get data
        from app.models import VisionTest, WebcamMetric
        
        lifestyle_logs = LifestyleLog.query.filter(
            LifestyleLog.user_id == user_id,
            LifestyleLog.log_date >= cutoff_date.date()
        ).all()
        
        vision_tests = VisionTest.query.filter(
            VisionTest.user_id == user_id,
            VisionTest.created_at >= cutoff_date
        ).all()
        
        fatigue_metrics = WebcamMetric.query.filter(
            WebcamMetric.user_id == user_id,
            WebcamMetric.created_at >= cutoff_date
        ).all()
        
        # Calculate correlations
        from app.utils.analytics import correlate_lifestyle_with_vision
        
        correlations = correlate_lifestyle_with_vision(
            lifestyle_logs,
            vision_tests,
            fatigue_metrics
        )
        
        return jsonify(correlations), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
