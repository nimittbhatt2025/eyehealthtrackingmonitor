from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, WebcamMetric, Alert
from app.utils.analytics import calculate_fatigue_score
from datetime import datetime, timedelta

webcam_bp = Blueprint('webcam', __name__)


@webcam_bp.route('/analysis', methods=['POST'])
@jwt_required()
def submit_webcam_analysis():
    """Submit webcam-based eye analysis metrics"""
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()
        
        # Create webcam metric record
        metric = WebcamMetric(
            user_id=user_id,
            blink_rate=data.get('blink_rate'),
            incomplete_blinks=data.get('incomplete_blinks', 0),
            avg_blink_duration_ms=data.get('avg_blink_duration_ms'),
            squint_count=data.get('squint_count', 0),
            squint_duration_seconds=data.get('squint_duration_seconds'),
            sclera_redness_level=data.get('sclera_redness_level'),
            tear_film_quality=data.get('tear_film_quality'),
            pupil_size_variation=data.get('pupil_size_variation'),
            session_duration_minutes=data.get('session_duration_minutes'),
            analysis_frames=data.get('analysis_frames'),
            video_url=data.get('video_url'),
            notes=data.get('notes'),
            fatigue_score=0  # Will be calculated
        )
        
        # Calculate fatigue score
        metric.fatigue_score = calculate_fatigue_score(metric)
        
        db.session.add(metric)
        db.session.commit()
        
        # Check if fatigue is high and create alert
        from flask import current_app
        threshold = current_app.config.get('FATIGUE_THRESHOLD', 70)
        
        if metric.fatigue_score >= threshold:
            alert = Alert(
                user_id=user_id,
                alert_type='high_fatigue',
                severity='medium' if metric.fatigue_score < 85 else 'high',
                title='High Eye Fatigue Detected',
                message=f'Your eye fatigue score is {metric.fatigue_score:.1f}. Consider taking a break.',
                alert_data={'fatigue_score': metric.fatigue_score, 'metric_id': metric.id}
            )
            db.session.add(alert)
            db.session.commit()
        
        return jsonify({
            'message': 'Webcam analysis submitted successfully',
            'metric_id': metric.id,
            'fatigue_score': metric.fatigue_score,
            'created_at': metric.created_at.isoformat()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@webcam_bp.route('/metrics', methods=['GET'])
@jwt_required()
def get_webcam_metrics():
    """Get user's webcam metrics history"""
    try:
        user_id = int(get_jwt_identity())
        
        # Query parameters
        days = request.args.get('days', type=int, default=30)
        limit = request.args.get('limit', type=int, default=50)
        offset = request.args.get('offset', type=int, default=0)
        
        # Build query
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        query = WebcamMetric.query.filter(
            WebcamMetric.user_id == user_id,
            WebcamMetric.created_at >= cutoff_date
        )
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        metrics = query.order_by(WebcamMetric.created_at.desc()).limit(limit).offset(offset).all()
        
        return jsonify({
            'total': total,
            'limit': limit,
            'offset': offset,
            'metrics': [{
                'id': m.id,
                'blink_rate': m.blink_rate,
                'incomplete_blinks': m.incomplete_blinks,
                'squint_count': m.squint_count,
                'sclera_redness_level': m.sclera_redness_level,
                'tear_film_quality': m.tear_film_quality,
                'fatigue_score': m.fatigue_score,
                'session_duration_minutes': m.session_duration_minutes,
                'created_at': m.created_at.isoformat()
            } for m in metrics]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@webcam_bp.route('/fatigue-trend', methods=['GET'])
@jwt_required()
def get_fatigue_trend():
    """Get fatigue trend over time"""
    try:
        user_id = int(get_jwt_identity())
        days = request.args.get('days', type=int, default=7)
        
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        metrics = WebcamMetric.query.filter(
            WebcamMetric.user_id == user_id,
            WebcamMetric.created_at >= cutoff_date
        ).order_by(WebcamMetric.created_at).all()
        
        if not metrics:
            return jsonify({'error': 'No data available'}), 404
        
        # Group by date
        from collections import defaultdict
        import numpy as np
        
        daily_fatigue = defaultdict(list)
        for m in metrics:
            date_key = m.created_at.date().isoformat()
            daily_fatigue[date_key].append(m.fatigue_score)
        
        trend_data = [{
            'date': date,
            'avg_fatigue': float(np.mean(scores)),
            'max_fatigue': float(np.max(scores)),
            'min_fatigue': float(np.min(scores)),
            'count': len(scores)
        } for date, scores in sorted(daily_fatigue.items())]
        
        return jsonify({
            'days': days,
            'trend': trend_data,
            'overall_avg': float(np.mean([m.fatigue_score for m in metrics]))
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
