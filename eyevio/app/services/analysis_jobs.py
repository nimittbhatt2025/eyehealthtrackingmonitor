"""
In-process analysis job pool.

Photo analysis (face landmarks + CNNs + OpenCV) takes ~0.5-2 s of CPU; running
it on the request thread ties up a Flask worker for that long. Endpoints that
accept ``Prefer: respond-async`` submit the work here and return 202 with a job
id; the client polls GET /api/jobs/<id>.

The job row holds status plus the response with image fields stripped. The full
response (heat maps, eye crops for display) stays in this process's memory and
is handed over on the first poll that reaches this process, then dropped; a
poll served by another process gets the stripped copy.
"""

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Optional, Tuple

from flask import current_app, request

from app.models import AnalysisJob, db

JOB_TTL = timedelta(hours=1)

_executor: Optional[ThreadPoolExecutor] = None
_executor_lock = threading.Lock()
_ephemeral: Dict[str, Dict[str, Any]] = {}
_ephemeral_lock = threading.Lock()


def wants_async() -> bool:
    return 'respond-async' in (request.headers.get('Prefer') or '')


def _get_executor(app) -> ThreadPoolExecutor:
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=max(1, int(app.config.get('ANALYSIS_WORKERS', 2))),
                thread_name_prefix='analysis',
            )
        return _executor


def _strip_images(body: Dict[str, Any]) -> Dict[str, Any]:
    from app.ai_models.on_device import strip_images

    out = strip_images(body)
    if isinstance(out.get('analysis'), dict):
        out['analysis'] = strip_images(out['analysis'])
    return out


def submit(kind: str, user_id: int, fn: Callable[..., Tuple[Dict[str, Any], int]], *args: Any) -> AnalysisJob:
    """Queue ``fn(*args) -> (body, http_status)``; it runs inside an app context."""
    _purge_expired()
    job = AnalysisJob(id=uuid.uuid4().hex, user_id=user_id, kind=kind, status='queued')
    db.session.add(job)
    db.session.commit()
    app = current_app._get_current_object()
    _get_executor(app).submit(_run, app, job.id, fn, args)
    return job


def _run(app, job_id: str, fn: Callable[..., Tuple[Dict[str, Any], int]], args: tuple) -> None:
    with app.app_context():
        try:
            job = db.session.get(AnalysisJob, job_id)
            job.status = 'running'
            job.started_at = datetime.utcnow()
            db.session.commit()
            try:
                body, status = fn(*args)
            except Exception as exc:
                db.session.rollback()
                app.logger.exception('analysis job %s failed', job_id)
                body, status = {'error': 'analysis_failed', 'message': str(exc)}, 500

            with _ephemeral_lock:
                _ephemeral[job_id] = body
            job = db.session.get(AnalysisJob, job_id)
            job.status = 'done' if status < 400 else 'failed'
            job.http_status = status
            job.result = _strip_images(body)
            job.finished_at = datetime.utcnow()
            db.session.commit()
        finally:
            db.session.remove()


def job_response(job: AnalysisJob) -> Dict[str, Any]:
    payload = job.to_dict()
    if job.status in ('done', 'failed'):
        with _ephemeral_lock:
            full = _ephemeral.pop(job.id, None)
        if full is not None:
            payload['result'] = full
    return payload


def _purge_expired() -> None:
    cutoff = datetime.utcnow() - JOB_TTL
    expired = [j.id for j in AnalysisJob.query.filter(AnalysisJob.created_at < cutoff).all()]
    if not expired:
        return
    AnalysisJob.query.filter(AnalysisJob.id.in_(expired)).delete(synchronize_session=False)
    db.session.commit()
    with _ephemeral_lock:
        for job_id in expired:
            _ephemeral.pop(job_id, None)
