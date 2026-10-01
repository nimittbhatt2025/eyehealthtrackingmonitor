"""
Load and exercise the server-side models at startup so the first analysis
request does not pay model load + first-inference cost (several seconds).

Runs in a daemon thread; requests that arrive before it finishes simply load
lazily as before (every loader is lock-protected and idempotent).
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict

import numpy as np

_state: Dict[str, Any] = {'status': 'not_started', 'models': {}}
_lock = threading.Lock()


def _timed(name: str, fn) -> None:
    start = time.perf_counter()
    try:
        ok = fn()
        _state['models'][name] = {'ok': bool(ok), 'ms': round((time.perf_counter() - start) * 1000)}
    except Exception as exc:  # noqa: BLE001
        _state['models'][name] = {'ok': False, 'error': exc.__class__.__name__}


def _warm_sclera() -> bool:
    from app.ai_models.sclera_redness_model import predict_eye_patch

    return predict_eye_patch(np.full((240, 320, 3), 180, np.uint8), prepared=True).get('available', False)


def _warm_cataract() -> bool:
    from app.ai_models.cataract_resnet import screen_cataract

    return screen_cataract(np.full((160, 200, 3), 120, np.uint8), with_cam=False).get('status') != 'model_unavailable'


def _warm_pathology() -> bool:
    from app.ai_models import pathology_classifier

    return pathology_classifier._get_bundle() is not None


def _warm_landmarker() -> bool:
    from app.ai_models.eye_analysis import get_face_landmarker

    return get_face_landmarker() is not None


def _warm_pipelines() -> bool:
    """
    One full request-path pass per analysis. Loading a model is not enough: the
    landmarker's first detect() builds its graph/GL context and the pipelines
    lazy-import modules, which otherwise cost the first user request seconds.
    A face-less frame also exercises the smart-crop fallback.
    """
    import cv2

    from app.ai_models.cataract_opacity_analysis import analyze_cataract_from_base64
    from app.ai_models.dry_eye_analysis import analyze_dry_eye_from_base64

    frame = np.full((360, 480, 3), 150, np.uint8)
    cv2.circle(frame, (240, 180), 90, (120, 140, 190), -1)
    jpeg = cv2.imencode('.jpg', frame)[1].tobytes()
    analyze_dry_eye_from_base64(jpeg)
    analyze_cataract_from_base64(jpeg)
    return True


def warm_models() -> Dict[str, Any]:
    with _lock:
        if _state['status'] in ('running', 'done'):
            return _state
        _state['status'] = 'running'
    start = time.perf_counter()
    for name, fn in (
        ('face_landmarker', _warm_landmarker),
        ('sclera_redness', _warm_sclera),
        ('cataract', _warm_cataract),
        ('pathology', _warm_pathology),
        ('pipelines', _warm_pipelines),
    ):
        _timed(name, fn)
    _state['total_ms'] = round((time.perf_counter() - start) * 1000)
    _state['status'] = 'done'
    return _state


def start_background_warmup() -> None:
    threading.Thread(target=warm_models, name='model-warmup', daemon=True).start()


def warmup_state() -> Dict[str, Any]:
    return dict(_state)
