"""Web Push delivery for EyeVio alerts."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from flask import current_app

from app.models import PushSubscription, db

logger = logging.getLogger(__name__)


def vapid_configured() -> bool:
    return bool(
        current_app.config.get('VAPID_PRIVATE_KEY')
        and current_app.config.get('VAPID_PUBLIC_KEY')
    )


def send_web_push(subscription: PushSubscription, payload: Dict[str, Any]) -> bool:
    """Send a Web Push message to one subscription. Removes stale endpoints."""
    if not vapid_configured():
        logger.warning('VAPID keys not configured; skipping push')
        return False

    try:
        from pywebpush import webpush
    except ImportError:
        logger.error('pywebpush is not installed; cannot send push notifications')
        return False

    try:
        webpush(
            subscription_info=subscription.to_subscription_info(),
            data=json.dumps(payload),
            vapid_private_key=current_app.config['VAPID_PRIVATE_KEY'],
            vapid_claims={
                'sub': current_app.config.get('VAPID_CLAIM_EMAIL', 'mailto:noreply@eyevio.app'),
            },
            ttl=int(current_app.config.get('PUSH_TTL_SECONDS', 86400)),
        )
        return True
    except Exception as exc:
        status_code = getattr(getattr(exc, 'response', None), 'status_code', None)
        if status_code in (404, 410):
            logger.info('Removing expired push subscription %s', subscription.id)
            db.session.delete(subscription)
            return False
        logger.exception('Push failed for subscription %s', subscription.id)
        return False


def send_alert_push(user, alert) -> bool:
    """Send push notifications for an alert to all of the user's subscriptions."""
    if not user:
        return False

    subscriptions = PushSubscription.query.filter_by(user_id=user.id).all()
    if not subscriptions:
        logger.info('No push subscriptions for user %s', user.id)
        return False

    frontend = current_app.config.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    payload = {
        'title': alert.title,
        'body': alert.message,
        'severity': alert.severity,
        'alert_type': alert.alert_type,
        'alert_id': alert.id,
        'url': f'{frontend}/alerts',
    }

    any_sent = False
    for subscription in subscriptions:
        if send_web_push(subscription, payload):
            any_sent = True
    return any_sent
