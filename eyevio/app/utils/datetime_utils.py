"""UTC datetime helpers — all naive datetimes in the DB are stored as UTC."""

from datetime import datetime, timezone
from typing import Optional


def utc_now() -> datetime:
    """Return current UTC time as a naive datetime (SQLAlchemy-compatible)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def serialize_utc_datetime(value: Optional[datetime]) -> Optional[str]:
    """
    Serialize a UTC naive datetime for JSON/API responses.

    Appends 'Z' so browsers parse the value as UTC and convert to local time
    for display (avoids off-by-one-day errors in US timezones).
    """
    if value is None:
        return None

    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)

    iso = value.isoformat()
    if iso.endswith('Z') or '+' in iso[10:] or '-' in iso[10:]:
        return iso
    return f'{iso}Z'
