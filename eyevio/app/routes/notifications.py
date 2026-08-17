"""Notification preferences and Web Push subscription endpoints."""

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models import PushSubscription, User, db
from app.services.alert_delivery import (
    DEFAULT_NOTIFICATION_PREFERENCES,
    deliver_alert,
    get_notification_preferences,
)
from app.services.push_service import vapid_configured
from app.models import Alert

notifications_bp = Blueprint('notifications', __name__)


def _serialize_prefs(user: User):
    prefs = get_notification_preferences(user)
    return {
        'notifications_enabled': True if user.notifications_enabled is None else bool(user.notifications_enabled),
        'email_alerts_enabled': prefs.get('emailNotifications', True),
        'push_alerts_enabled': prefs.get('pushNotifications', True),
        'preferences': prefs,
        'push_configured': vapid_configured(),
        'push_subscription_count': PushSubscription.query.filter_by(user_id=user.id).count(),
    }


@notifications_bp.route('/vapid-public-key', methods=['GET'])
def get_vapid_public_key():
    """Public VAPID key for browser push subscription (no auth required)."""
    public_key = current_app.config.get('VAPID_PUBLIC_KEY')
    if not public_key:
        return jsonify({'error': 'Push notifications are not configured on this server'}), 503
    return jsonify({'publicKey': public_key}), 200


@notifications_bp.route('/preferences', methods=['GET'])
@jwt_required()
def get_preferences():
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify(_serialize_prefs(user)), 200


@notifications_bp.route('/preferences', methods=['PUT'])
@jwt_required()
def update_preferences():
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json() or {}
    prefs = get_notification_preferences(user)

    if 'notifications_enabled' in data:
        user.notifications_enabled = bool(data['notifications_enabled'])

    if 'preferences' in data and isinstance(data['preferences'], dict):
        for key in DEFAULT_NOTIFICATION_PREFERENCES:
            if key in data['preferences']:
                prefs[key] = bool(data['preferences'][key])

    # Flat channel overrides from Settings / onboarding
    if 'emailNotifications' in data:
        prefs['emailNotifications'] = bool(data['emailNotifications'])
    if 'pushNotifications' in data:
        prefs['pushNotifications'] = bool(data['pushNotifications'])
    if 'email_alerts_enabled' in data:
        prefs['emailNotifications'] = bool(data['email_alerts_enabled'])
    if 'push_alerts_enabled' in data:
        prefs['pushNotifications'] = bool(data['push_alerts_enabled'])

    for key in ('testReminders', 'weeklyReport', 'achievementAlerts', 'lensReminders', 'myopiaAlerts', 'familyAlerts'):
        if key in data:
            prefs[key] = bool(data[key])

    user.email_alerts_enabled = bool(prefs.get('emailNotifications', True))
    user.push_alerts_enabled = bool(prefs.get('pushNotifications', True))
    user.notification_preferences = prefs
    # Master switch: on if either channel is enabled
    if 'notifications_enabled' not in data:
        user.notifications_enabled = user.email_alerts_enabled or user.push_alerts_enabled

    db.session.commit()
    return jsonify({'message': 'Notification preferences updated', **_serialize_prefs(user)}), 200


@notifications_bp.route('/push-subscribe', methods=['POST'])
@jwt_required()
def push_subscribe():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not vapid_configured():
        return jsonify({'error': 'Push notifications are not configured on this server'}), 503

    data = request.get_json() or {}
    endpoint = data.get('endpoint')
    keys = data.get('keys') or {}
    p256dh = keys.get('p256dh')
    auth = keys.get('auth')

    if not endpoint or not p256dh or not auth:
        return jsonify({'error': 'endpoint and keys.p256dh / keys.auth are required'}), 400

    subscription = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if subscription:
        subscription.user_id = user_id
        subscription.p256dh = p256dh
        subscription.auth = auth
        subscription.user_agent = (request.headers.get('User-Agent') or '')[:512]
    else:
        subscription = PushSubscription(
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=(request.headers.get('User-Agent') or '')[:512],
        )
        db.session.add(subscription)

    user.push_alerts_enabled = True
    prefs = get_notification_preferences(user)
    prefs['pushNotifications'] = True
    user.notification_preferences = prefs
    if user.notifications_enabled is False:
        user.notifications_enabled = True

    db.session.commit()
    return jsonify({'message': 'Push subscription saved', 'id': subscription.id}), 201


@notifications_bp.route('/push-subscribe', methods=['DELETE'])
@jwt_required()
def push_unsubscribe():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    endpoint = data.get('endpoint')

    query = PushSubscription.query.filter_by(user_id=user_id)
    if endpoint:
        query = query.filter_by(endpoint=endpoint)
        deleted = query.delete(synchronize_session=False)
    else:
        deleted = query.delete(synchronize_session=False)

    db.session.commit()
    return jsonify({'message': 'Push subscription removed', 'deleted': deleted}), 200


@notifications_bp.route('/test', methods=['POST'])
@jwt_required()
def send_test_notification():
    """Send a test alert via configured channels (for Settings verification)."""
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json(silent=True) or {}
    channel = data.get('channel', 'both')  # email | push | both

    alert = Alert(
        user_id=user.id,
        alert_type='system_test',
        severity='low',
        title='EyeVio test notification',
        message='If you received this, alert delivery is working.',
        alert_data={'source': 'settings_test'},
        is_actionable=False,
    )
    db.session.add(alert)
    db.session.flush()

    # Temporarily respect only requested channel for the test
    original_email = user.email_alerts_enabled
    original_push = user.push_alerts_enabled
    try:
        if channel == 'email':
            user.push_alerts_enabled = False
            user.email_alerts_enabled = True
        elif channel == 'push':
            user.email_alerts_enabled = False
            user.push_alerts_enabled = True
        result = deliver_alert(alert, user)
    finally:
        user.email_alerts_enabled = original_email
        user.push_alerts_enabled = original_push

    db.session.commit()
    return jsonify({
        'message': 'Test notification attempted',
        'alert_id': alert.id,
        'email_sent': result['email_sent'],
        'push_sent': result['push_sent'],
    }), 200
