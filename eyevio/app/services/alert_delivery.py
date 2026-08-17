"""Create alerts and deliver them via email / Web Push."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.models import Alert, User, db
from app.services.email_service import send_alert_email
from app.services.push_service import send_alert_push

logger = logging.getLogger(__name__)

DEFAULT_NOTIFICATION_PREFERENCES = {
    'emailNotifications': True,
    'pushNotifications': True,
    'testReminders': True,
    'weeklyReport': True,
    'achievementAlerts': True,
    'lensReminders': True,
    'myopiaAlerts': True,
    'familyAlerts': True,
}

# Map alert_type -> preference key that can mute that category
ALERT_TYPE_PREF_KEYS = {
    'lens_replacement': 'lensReminders',
    'achievement': 'achievementAlerts',
    'test_reminder': 'testReminders',
    'weekly_report': 'weeklyReport',
    'myopia_progression': 'myopiaAlerts',
    'family_child_alert': 'familyAlerts',
}


def get_notification_preferences(user: User) -> Dict[str, Any]:
    prefs = dict(DEFAULT_NOTIFICATION_PREFERENCES)
    stored = user.notification_preferences if isinstance(user.notification_preferences, dict) else {}
    prefs.update({k: bool(v) for k, v in stored.items()})
    # Keep channel flags aligned with dedicated columns when present
    if user.email_alerts_enabled is not None:
        prefs['emailNotifications'] = bool(user.email_alerts_enabled)
    if user.push_alerts_enabled is not None:
        prefs['pushNotifications'] = bool(user.push_alerts_enabled)
    return prefs


def category_allowed(user: User, alert_type: str) -> bool:
    prefs = get_notification_preferences(user)
    pref_key = ALERT_TYPE_PREF_KEYS.get(alert_type)
    if pref_key and not prefs.get(pref_key, True):
        return False
    return True


def deliver_alert(alert: Alert, user: Optional[User] = None) -> Dict[str, bool]:
    """
    Attempt email + push delivery for an existing alert.
    Updates alert.email_sent / alert.push_sent in-session (caller commits).
    """
    result = {'email_sent': False, 'push_sent': False}

    if user is None:
        user = User.query.get(alert.user_id)
    if not user:
        return result

    master_on = True if user.notifications_enabled is None else bool(user.notifications_enabled)
    if not master_on:
        logger.info('Notifications disabled for user %s; skipping delivery', user.id)
        return result

    if not category_allowed(user, alert.alert_type):
        logger.info('Alert category %s muted for user %s', alert.alert_type, user.id)
        return result

    prefs = get_notification_preferences(user)

    if prefs.get('emailNotifications', True) and not alert.email_sent:
        try:
            if send_alert_email(user, alert):
                alert.email_sent = True
                result['email_sent'] = True
        except Exception:
            logger.exception('Email delivery error for alert %s', alert.id)

    if prefs.get('pushNotifications', True) and not alert.push_sent:
        try:
            if send_alert_push(user, alert):
                alert.push_sent = True
                result['push_sent'] = True
        except Exception:
            logger.exception('Push delivery error for alert %s', alert.id)

    return result


def create_and_deliver_alert(
    user_id: int,
    alert_type: str,
    severity: str,
    title: str,
    message: str,
    alert_data: Optional[Dict[str, Any]] = None,
    is_actionable: bool = True,
    commit: bool = True,
) -> Alert:
    """Persist an alert and immediately deliver email/push notifications."""
    alert = Alert(
        user_id=user_id,
        alert_type=alert_type,
        severity=severity,
        title=title,
        message=message,
        alert_data=alert_data,
        is_actionable=is_actionable,
    )
    db.session.add(alert)
    db.session.flush()

    deliver_alert(alert)

    if alert_type != 'family_child_alert':
        _notify_caregivers(user_id, alert)

    if commit:
        db.session.commit()

    return alert


def _notify_caregivers(child_user_id: int, original: Alert) -> None:
    """Mirror high-signal child alerts to caregiver inboxes + email/push."""
    if original.severity not in ('medium', 'high', 'critical'):
        return
    try:
        from app.services.family import caregivers_for_child
    except Exception:
        return

    caregivers = caregivers_for_child(child_user_id)
    if not caregivers:
        return

    child = User.query.get(child_user_id)
    child_name = (child.full_name if child else None) or 'Your child'

    for caregiver in caregivers:
        copy = Alert(
            user_id=caregiver.id,
            alert_type='family_child_alert',
            severity=original.severity,
            title=f'{child_name}: {original.title}',
            message=original.message,
            alert_data={
                'child_user_id': child_user_id,
                'source_alert_id': original.id,
                'source_alert_type': original.alert_type,
                **(original.alert_data or {}),
            },
            is_actionable=True,
        )
        db.session.add(copy)
        db.session.flush()
        deliver_alert(copy, caregiver)
