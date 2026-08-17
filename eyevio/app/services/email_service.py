"""Email delivery for EyeVio alerts."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from flask import current_app

logger = logging.getLogger(__name__)


def send_email(to_address: str, subject: str, text_body: str, html_body: Optional[str] = None) -> bool:
    """
    Send an email via SMTP.

    Returns True if the message was accepted by the mail server (or logged in
    suppress/debug mode). Returns False on configuration or delivery failure.
    """
    if not to_address:
        return False

    sender = current_app.config.get('MAIL_DEFAULT_SENDER')
    server = current_app.config.get('MAIL_SERVER')
    suppress = current_app.config.get('MAIL_SUPPRESS_SEND', False)

    if suppress:
        logger.info(
            'Email suppressed (to=%s subject=%s). Body:\n%s',
            to_address,
            subject,
            text_body,
        )
        return True

    if not server:
        logger.warning('MAIL_SERVER is not configured; skipping email to %s', to_address)
        return False

    if not sender:
        logger.warning('MAIL_DEFAULT_SENDER is not configured; skipping email')
        return False

    message = MIMEMultipart('alternative')
    message['Subject'] = subject
    message['From'] = sender
    message['To'] = to_address
    message.attach(MIMEText(text_body, 'plain', 'utf-8'))
    if html_body:
        message.attach(MIMEText(html_body, 'html', 'utf-8'))

    port = int(current_app.config.get('MAIL_PORT', 587))
    use_tls = bool(current_app.config.get('MAIL_USE_TLS', True))
    use_ssl = bool(current_app.config.get('MAIL_USE_SSL', False))
    username = current_app.config.get('MAIL_USERNAME')
    password = current_app.config.get('MAIL_PASSWORD')

    try:
        if use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(server, port, context=context, timeout=20) as smtp:
                if username and password:
                    smtp.login(username, password)
                smtp.sendmail(sender, [to_address], message.as_string())
        else:
            with smtplib.SMTP(server, port, timeout=20) as smtp:
                smtp.ehlo()
                if use_tls:
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.ehlo()
                if username and password:
                    smtp.login(username, password)
                smtp.sendmail(sender, [to_address], message.as_string())
        logger.info('Alert email sent to %s (%s)', to_address, subject)
        return True
    except Exception:
        logger.exception('Failed to send email to %s', to_address)
        return False


def send_alert_email(user, alert) -> bool:
    """Compose and send an alert email for a user."""
    if not user or not getattr(user, 'email', None):
        return False

    frontend = current_app.config.get('FRONTEND_URL', 'http://localhost:3000').rstrip('/')
    alerts_url = f'{frontend}/alerts'
    severity = (alert.severity or 'medium').upper()

    subject = f'[EyeVio {severity}] {alert.title}'
    text_body = (
        f'Hi {user.full_name or "there"},\n\n'
        f'{alert.message}\n\n'
        f'Severity: {severity}\n'
        f'Type: {alert.alert_type}\n\n'
        f'View and manage this alert:\n{alerts_url}\n\n'
        f'— EyeVio Vision Health Monitor\n'
        f'You can change notification preferences in Settings.\n'
    )
    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; max-width: 560px; color: #111;">
      <h2 style="margin-bottom: 8px;">EyeVio Alert</h2>
      <p style="margin: 0 0 12px; display: inline-block; padding: 4px 10px; border-radius: 999px; background: #fef3c7; font-size: 12px; font-weight: 600;">{severity}</p>
      <h3 style="margin: 16px 0 8px;">{alert.title}</h3>
      <p style="line-height: 1.5; color: #374151;">{alert.message}</p>
      <p style="margin: 24px 0;">
        <a href="{alerts_url}" style="background: #0f766e; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 10px; display: inline-block;">
          Open alerts
        </a>
      </p>
      <p style="font-size: 12px; color: #6b7280;">Manage delivery preferences anytime in EyeVio Settings.</p>
    </div>
    """
    return send_email(user.email, subject, text_body, html_body)
