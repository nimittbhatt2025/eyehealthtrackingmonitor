from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, Alert
from datetime import datetime

alert_bp = Blueprint('alert', __name__)


@alert_bp.route('/', methods=['GET'])
@jwt_required()
def get_alerts():
    """Get user's alerts"""
    try:
        user_id = int(get_jwt_identity())
        
        # Query parameters
        unread_only = request.args.get('unread_only', type=bool, default=False)
        alert_type = request.args.get('alert_type')
        severity = request.args.get('severity')
        limit = request.args.get('limit', type=int, default=50)
        offset = request.args.get('offset', type=int, default=0)
        
        # Build query
        query = Alert.query.filter_by(user_id=user_id, is_dismissed=False)
        
        if unread_only:
            query = query.filter_by(is_read=False)
        
        if alert_type:
            query = query.filter_by(alert_type=alert_type)
        
        if severity:
            query = query.filter_by(severity=severity)
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        alerts = query.order_by(Alert.created_at.desc()).limit(limit).offset(offset).all()
        
        return jsonify({
            'total': total,
            'unread_count': Alert.query.filter_by(user_id=user_id, is_read=False, is_dismissed=False).count(),
            'limit': limit,
            'offset': offset,
            'alerts': [{
                'id': alert.id,
                'alert_type': alert.alert_type,
                'severity': alert.severity,
                'title': alert.title,
                'message': alert.message,
                'alert_data': alert.alert_data,
                'is_read': alert.is_read,
                'is_actionable': alert.is_actionable,
                'action_taken': alert.action_taken,
                'created_at': alert.created_at.isoformat()
            } for alert in alerts]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@alert_bp.route('/<int:alert_id>/read', methods=['PUT'])
@jwt_required()
def mark_alert_read(alert_id):
    """Mark an alert as read"""
    try:
        user_id = int(get_jwt_identity())
        alert = Alert.query.filter_by(id=alert_id, user_id=user_id).first()
        
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404
        
        alert.is_read = True
        db.session.commit()
        
        return jsonify({'message': 'Alert marked as read'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@alert_bp.route('/<int:alert_id>/dismiss', methods=['PUT'])
@jwt_required()
def dismiss_alert(alert_id):
    """Dismiss an alert"""
    try:
        user_id = int(get_jwt_identity())
        alert = Alert.query.filter_by(id=alert_id, user_id=user_id).first()
        
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404
        
        alert.is_dismissed = True
        db.session.commit()
        
        return jsonify({'message': 'Alert dismissed'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@alert_bp.route('/<int:alert_id>/action', methods=['PUT'])
@jwt_required()
def mark_action_taken(alert_id):
    """Mark that action has been taken on an alert"""
    try:
        user_id = int(get_jwt_identity())
        alert = Alert.query.filter_by(id=alert_id, user_id=user_id).first()
        
        if not alert:
            return jsonify({'error': 'Alert not found'}), 404
        
        alert.action_taken = True
        alert.action_taken_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({'message': 'Action marked as taken'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@alert_bp.route('/mark-all-read', methods=['PUT'])
@jwt_required()
def mark_all_read():
    """Mark all alerts as read"""
    try:
        user_id = int(get_jwt_identity())
        Alert.query.filter_by(user_id=user_id, is_read=False).update({'is_read': True})
        db.session.commit()
        
        return jsonify({'message': 'All alerts marked as read'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
