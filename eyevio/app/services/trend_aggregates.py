"""
Precomputed per-user trend aggregates.

/trend/prediction and /trend/summary need every usable session a user has
ever recorded (Theil–Sen is O(n²) in sessions per series). Neither result
depends on the wall clock, only on the rows, so it is cached in
``trend_snapshots`` and reused until the rows change:

* any ORM insert/update/delete on ``vision_tests`` marks the user's snapshot
  stale inside the same transaction;
* reads also compare a cheap (count, max id) signature of the usable rows,
  which catches writes that bypass the ORM;
* ``flask aggregate-trends`` (nightly cron) rebuilds stale or missing
  snapshots ahead of time so the first read of the day is a cache hit.
"""
import math
import time
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

import click
from sqlalchemy import event, func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models import TrendSnapshot, VisionTest, db
from app.utils.change_detection import assess_tests
from app.utils.datetime_utils import serialize_utc_datetime
from app.utils.trend_forecast import TEST_LABELS, build_per_test_trends

# Bump when trend_forecast / change_detection output changes; old snapshots are then recomputed.
ALGO_VERSION = 2


def _json_safe(obj: Any) -> Any:
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj


def _signature(user_id: int) -> Tuple[int, Optional[int]]:
    count, max_id = (
        db.session.query(func.count(VisionTest.id), func.max(VisionTest.id))
        .filter(VisionTest.user_id == user_id, VisionTest.data_quality_flag.is_(None))
        .one()
    )
    return int(count), max_id


def compute_payload(user_id: int) -> Dict[str, Any]:
    tests = VisionTest.usable().filter_by(user_id=user_id).order_by(VisionTest.created_at).all()

    by_type = defaultdict(list)
    for t in tests:
        by_type[t.test_type].append(t)
    change_status = []
    for test_type, rows in by_type.items():
        version = (rows[-1].test_details or {}).get('method_version')
        same = [r for r in rows if (r.test_details or {}).get('method_version') == version]
        change_status.append({
            'test_type': test_type,
            'label': TEST_LABELS.get(test_type, test_type.replace('_', ' ').title()),
            'status': assess_tests(same, test_type, version)['status'],
            'sessions': len(same),
            'last_tested': rows[-1].created_at.isoformat(),
        })

    return _json_safe({
        'prediction': build_per_test_trends(tests, with_forecast=True),
        'change_status': change_status,
    })


def _is_fresh(snap: Optional[TrendSnapshot], signature: Tuple[int, Optional[int]]) -> bool:
    return (
        snap is not None
        and not snap.stale
        and snap.algo_version == ALGO_VERSION
        and (snap.source_count, snap.source_max_id) == signature
    )


def refresh(user_id: int, *, force: bool = False) -> Tuple[Dict[str, Any], str, datetime]:
    """Return (payload, 'cached'|'refreshed', computed_at), recomputing only when needed."""
    signature = _signature(user_id)
    snap = db.session.get(TrendSnapshot, user_id)
    if not force and _is_fresh(snap, signature):
        return snap.payload, 'cached', snap.computed_at

    payload = compute_payload(user_id)
    now = datetime.utcnow()
    values = dict(
        algo_version=ALGO_VERSION,
        source_count=signature[0],
        source_max_id=signature[1],
        stale=False,
        payload=payload,
        computed_at=now,
    )
    stmt = pg_insert(TrendSnapshot.__table__).values(user_id=user_id, **values)
    db.session.execute(stmt.on_conflict_do_update(index_elements=['user_id'], set_=values))
    db.session.commit()
    if snap is not None:
        db.session.expire(snap)
    return payload, 'refreshed', now


def snapshot_meta(source: str, computed_at: datetime) -> Dict[str, Any]:
    return {'source': source, 'computed_at': serialize_utc_datetime(computed_at), 'algo_version': ALGO_VERSION}


def _mark_stale(mapper, connection, target):
    table = TrendSnapshot.__table__
    connection.execute(table.update().where(table.c.user_id == target.user_id).values(stale=True))


for _evt in ('after_insert', 'after_update', 'after_delete'):
    event.listen(VisionTest, _evt, _mark_stale)


def register_cli(app):
    @app.cli.command('aggregate-trends')
    @click.option('--user-id', type=int, help='Only this user.')
    @click.option('--force', is_flag=True, help='Recompute even snapshots that are still fresh.')
    def aggregate_trends(user_id, force):
        """Rebuild stale or missing trend snapshots (run nightly from cron)."""
        if user_id is not None:
            user_ids = [user_id]
        else:
            user_ids = [uid for (uid,) in db.session.query(VisionTest.user_id).distinct().order_by(VisionTest.user_id)]
        t0 = time.perf_counter()
        counts = defaultdict(int)
        for uid in user_ids:
            try:
                _, source, _ = refresh(uid, force=force)
                counts[source] += 1
            except Exception as exc:
                db.session.rollback()
                counts['failed'] += 1
                click.echo(f'user {uid}: {exc}', err=True)
        click.echo(
            f"aggregate-trends: {len(user_ids)} users, {counts['refreshed']} refreshed, "
            f"{counts['cached']} already fresh, {counts['failed']} failed in {time.perf_counter() - t0:.2f}s"
        )
