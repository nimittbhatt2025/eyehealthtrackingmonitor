"""
Results computed in the browser (eyevio-frontend/src/ml) instead of on the server.

The browser runs the ONNX exports of the redness and cataract models and sends
per-eye measurements only — no image. This module validates those numbers,
checks the browser ran the exact model file in onnx_models/manifest.json, and
rebuilds every derived field (grades, bands, findings, risk text) with the same
functions the server pipeline uses, so on-device and server results read the
same and a client cannot supply its own findings.
"""

from __future__ import annotations

import json
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.ai_models.capture_quality import build_capture_quality_summary
from app.ai_models.cataract_opacity_analysis import assemble_cataract_result
from app.ai_models.cataract_resnet import MODEL_CARD, OOD_REASON_TEXT, _band
from app.ai_models.dry_eye_analysis import (
    assemble_dry_eye_result,
    efron_style_grade,
    eye_result_from_measurements,
)
from app.ai_models.ocular_ml_preprocess import calibrate_webcam_ml_score
from app.ai_models.sclera_redness_model import _grade_label, aggregate_eye_predictions

PAYLOAD_VERSION = 1
REPO_ROOT = Path(__file__).resolve().parents[3]
LIGHTING_STATUSES = {'normal', 'checking', 'framing_problem', 'extreme_problem'}


class OnDeviceValidationError(ValueError):
    pass


@lru_cache(maxsize=1)
def load_manifest() -> Dict[str, Any]:
    env = os.environ.get('ONNX_MANIFEST_PATH', '').strip()
    candidates = [Path(env)] if env else []
    candidates += [REPO_ROOT / 'onnx_models' / 'manifest.json', REPO_ROOT / 'eyevio-frontend' / 'public' / 'models' / 'manifest.json']
    for path in candidates:
        if path.is_file():
            return json.loads(path.read_text(encoding='utf-8'))
    return {}


def _num(obj: Dict[str, Any], key: str, lo: float, hi: float, *, nullable: bool = False) -> Optional[float]:
    value = obj.get(key)
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise OnDeviceValidationError(f'{key} must be a number')
    if not lo <= value <= hi:
        raise OnDeviceValidationError(f'{key} out of range [{lo}, {hi}]')
    return float(value)


def _dict(obj: Any, key: str) -> Dict[str, Any]:
    value = obj.get(key) if isinstance(obj, dict) else None
    if not isinstance(value, dict):
        raise OnDeviceValidationError(f'{key} is required')
    return value


def _verify_model(runtime: Dict[str, Any], name: str) -> Dict[str, Any]:
    """Which manifest variant the browser ran; rejects unknown model files."""
    entry = load_manifest().get(name)
    claimed = ((runtime.get('models') or {}).get(name) or {})
    sha = claimed.get('sha256')
    if not entry:
        return {'verified': False, 'variant': claimed.get('variant'), 'reason': 'server_manifest_missing'}
    for variant, info in (entry.get('files') or {}).items():
        if info.get('sha256') == sha:
            return {'verified': True, 'variant': variant, 'entry': entry}
    raise OnDeviceValidationError(f'{name} model hash does not match any published model')


def _runtime_summary(runtime: Dict[str, Any], verification: Dict[str, Any]) -> Dict[str, Any]:
    threads = runtime.get('wasm_threads')
    return {
        'engine': 'onnxruntime-web',
        'ort_version': str(runtime.get('ort_version') or '')[:32] or None,
        'webgpu': bool(runtime.get('webgpu')),
        'wasm_threads': threads if isinstance(threads, int) and not isinstance(threads, bool) and 0 < threads <= 64 else 1,
        'model_variant': verification.get('variant'),
        'model_verified': verification.get('verified', False),
        'payload_version': PAYLOAD_VERSION,
    }


def sanitize_lighting(raw: Any) -> Dict[str, Any]:
    """Client-side lighting gate state (StableLightingPreview); same status vocabulary as the server."""
    if not isinstance(raw, dict):
        return {'status': 'unknown', 'acceptable': True, 'source': 'client', 'issues': [], 'message': None}
    status = raw.get('status') if raw.get('status') in LIGHTING_STATUSES else 'unknown'
    issues = [str(i)[:160] for i in (raw.get('issues') or []) if isinstance(i, str)][:8]
    metrics = {
        k: v for k, v in (raw.get('metrics') or {}).items()
        if isinstance(k, str) and isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    } if isinstance(raw.get('metrics'), dict) else {}
    return {
        'status': status,
        'acceptable': bool(raw.get('acceptable', status not in ('framing_problem', 'extreme_problem'))),
        'issues': issues,
        'metrics': dict(list(metrics.items())[:24]),
        'message': str(raw.get('message') or '')[:300] or None,
        'source': 'client',
    }


def sanitize_eyewear(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {'detected': False, 'confidence': 0.0, 'source': 'client'}
    confidence = raw.get('confidence', 0)
    confidence = float(confidence) if isinstance(confidence, (int, float)) and math.isfinite(confidence) else 0.0
    return {
        'detected': bool(raw.get('detected')),
        'confidence': max(0.0, min(100.0, confidence)),
        'message': str(raw.get('message') or '')[:300] or None,
        'source': 'client',
    }


def sanitize_white_balance(raw: Any, source: str = 'on_device') -> Dict[str, Any]:
    if not isinstance(raw, dict) or not raw.get('available'):
        return {'available': False}
    gains = raw.get('gains_bgr')
    chroma = raw.get('frame_chroma_bgr')
    if not (isinstance(gains, list) and len(gains) == 3 and isinstance(chroma, list) and len(chroma) == 3):
        raise OnDeviceValidationError('white_balance gains/chroma must have 3 values')
    return {
        'available': True,
        'frame_chroma_bgr': [_num({'v': v}, 'v', 0, 1) for v in chroma],
        'gains_bgr': [_num({'v': v}, 'v', 0.7, 1.4) for v in gains],
        'cast_ratio': _num(raw, 'cast_ratio', 1, 1e3),
        'strong_cast': bool(raw.get('strong_cast')),
        'source': source,
    }


def _redness_measurements(raw: Dict[str, Any]) -> Dict[str, Any]:
    reliable = bool(raw.get('redness_reliable'))
    coverage = _num(raw, 'mask_coverage', 0, 1)
    if not reliable:
        return {
            'sclera_redness': None,
            'redness_rg': None,
            'red_pixel_fraction': None,
            'mask_coverage': coverage,
            'redness_reliable': False,
            'efron_style_grade': None,
            'efron_style_label': None,
        }
    redness = _num(raw, 'sclera_redness', 0, 100)
    grade = efron_style_grade(redness)
    return {
        'sclera_redness': round(redness, 1),
        'sclera_redness_raw': round(_num(raw, 'sclera_redness_raw', 0, 100), 1),
        'white_balance_applied': bool(raw.get('white_balance_applied')),
        'efron_style_grade': grade['grade'],
        'efron_style_label': grade['label'],
        'redness_rg': round(_num(raw, 'redness_rg', -255, 255), 2),
        'redness_normalized': round(_num(raw, 'redness_normalized', -1, 1), 4),
        'red_pixel_fraction': round(_num(raw, 'red_pixel_fraction', 0, 1), 3),
        'mask_coverage': round(coverage, 4),
        'redness_reliable': True,
    }


def build_redness_analysis(payload: Dict[str, Any], *, lighting: Any = None, eyewear: Any = None) -> Dict[str, Any]:
    """Dry eye / eye-photo analysis from on-device redness + surface measurements."""
    if not isinstance(payload, dict) or payload.get('kind') != 'redness':
        raise OnDeviceValidationError('on_device.kind must be "redness"')
    runtime = payload.get('runtime') if isinstance(payload.get('runtime'), dict) else {}
    verification = _verify_model(runtime, 'sclera_redness')
    variant = verification.get('variant') or 'unknown'
    base_version = (verification.get('entry') or {}).get('method', 'bounded_ordinal_resnet18_v1')
    model_version = f'{base_version}+onnx_{variant}'

    eyes = _dict(payload, 'eyes')
    per_eye: Dict[str, Dict[str, Any]] = {}
    ml_eyes: Dict[str, Dict[str, Any]] = {}
    for side in ('left', 'right'):
        eye = _dict(eyes, side)
        surface_raw = _dict(eye, 'surface')
        surface = {
            'experimental_tear_proxy': round(_num(surface_raw, 'experimental_tear_proxy', 0, 100), 1),
            'experimental_texture_proxy': round(_num(surface_raw, 'experimental_texture_proxy', 0, 100), 1),
        }
        per_eye[side] = eye_result_from_measurements(_redness_measurements(_dict(eye, 'redness')), surface)
        ml_raw = eye.get('ml') if isinstance(eye.get('ml'), dict) else {}
        if ml_raw.get('available'):
            score = round(_num(ml_raw, 'score', 0, 4), 2)
            grade = max(0, min(4, int(round(score))))
            ml_eyes[side] = {
                'available': True,
                'score': score,
                'uncertainty_std': None,
                'discretized_grade': grade,
                'grade_label': _grade_label(grade),
                'model_version': model_version,
                'model_architecture': 'bounded_clamp',
            }
        else:
            ml_eyes[side] = {'available': False, 'score': None, 'error': 'not_run_on_device'}

    ml_redness = aggregate_eye_predictions(ml_eyes['left'], ml_eyes['right'], model_version=model_version)
    ml_redness = calibrate_webcam_ml_score(ml_redness, apply=False, architecture='bounded_clamp')
    lighting_s = sanitize_lighting(lighting)
    eyewear_s = sanitize_eyewear(eyewear)
    result = assemble_dry_eye_result(
        per_eye['left'],
        per_eye['right'],
        ml_redness,
        lighting=lighting_s,
        eyewear=eyewear_s,
        capture_quality=build_capture_quality_summary(lighting_s, eyewear_s),
        white_balance=sanitize_white_balance(payload.get('white_balance')),
        aligned_crops=None,
        crop_source='on_device_face_mesh',
        landmarks_present=True,
    )
    result['on_device'] = _runtime_summary(runtime, verification)
    result['pathology_triage'] = {'available': False, 'reason': 'on_device_analysis'}
    return result


def build_cataract_analysis(payload: Dict[str, Any], *, lighting: Any = None, eyewear: Any = None) -> Dict[str, Any]:
    """Cataract screening from on-device calibrated probability + OOD score per eye."""
    if not isinstance(payload, dict) or payload.get('kind') != 'cataract':
        raise OnDeviceValidationError('on_device.kind must be "cataract"')
    runtime = payload.get('runtime') if isinstance(payload.get('runtime'), dict) else {}
    verification = _verify_model(runtime, 'cataract_screen')
    entry = verification.get('entry')
    if not entry:
        raise OnDeviceValidationError('Server has no cataract model manifest to check the result against')
    thresholds = {k: float(entry['thresholds'][k]) for k in ('rule_out', 'rule_in')}
    ood_thr = float(entry['ood_threshold'])
    method = f"{entry.get('method', 'resnet_v2_calibrated')}+onnx_{verification['variant']}"

    eyes = _dict(payload, 'eyes')
    per_eye: Dict[str, Dict[str, Any]] = {}
    for side in ('left', 'right'):
        eye = _dict(eyes, side)
        s = _dict(eye, 'screening')
        prob = _num(s, 'prob', 0, 1)
        ood = _num(s, 'ood_score', 0, 1e6)
        base = {'method': method, 'model_card': MODEL_CARD, 'ood_score': round(ood, 3), 'ood_threshold': round(ood_thr, 3)}
        if ood > ood_thr:
            screening = {**base, 'status': 'cannot_assess', 'reason': 'out_of_distribution', 'reason_text': OOD_REASON_TEXT}
        else:
            screening = {
                **base,
                'status': 'assessed',
                'likelihood': round(prob, 4),
                'band': _band(prob, thresholds),
                'thresholds': thresholds,
                'temperature': round(float(entry.get('temperature', 1.0)), 3),
                'gradcam': None,
                'gradcam_on_device': True,
            }
            mass = _num(s, 'cam_central_mass', 0, 1, nullable=True)
            if mass is not None:
                screening['gradcam_central_mass'] = round(mass, 3)
        metrics_raw = eye.get('image_metrics') if isinstance(eye.get('image_metrics'), dict) else {}
        image_metrics = {
            'mean_brightness': _num(metrics_raw, 'mean_brightness', 0, 255, nullable=True),
            'texture_energy': _num(metrics_raw, 'texture_energy', 0, 1, nullable=True),
            'dark_pupil_ratio': _num(metrics_raw, 'dark_pupil_ratio', 0, 1, nullable=True),
            'red_minus_blue': _num(metrics_raw, 'red_minus_blue', -255, 255, nullable=True),
        }
        per_eye[side] = {'screening': screening, 'image_metrics': image_metrics}

    result = assemble_cataract_result(
        per_eye['left'],
        per_eye['right'],
        lighting=sanitize_lighting(lighting),
        eyewear=sanitize_eyewear(eyewear),
        aligned_crops=None,
        pupil_crops=None,
        model_status={
            'available': True,
            'calibrated': True,
            'method': method,
            'thresholds': thresholds,
            'ood_threshold': ood_thr,
            'model_card': MODEL_CARD,
            'runtime': 'onnxruntime-web',
        },
        photo_saved=False,
    )
    result['on_device'] = _runtime_summary(runtime, verification)
    result['pathology_triage'] = {'available': False, 'reason': 'on_device_analysis'}
    return result


def build_on_device_analysis(condition_type: str, payload: Any, *, lighting: Any = None, eyewear: Any = None) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise OnDeviceValidationError('on_device must be an object')
    if payload.get('version') != PAYLOAD_VERSION:
        raise OnDeviceValidationError(f'Unsupported on_device payload version {payload.get("version")!r}')
    if condition_type == 'cataract':
        return build_cataract_analysis(payload, lighting=lighting, eyewear=eyewear)
    return build_redness_analysis(payload, lighting=lighting, eyewear=eyewear)


def strip_images(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Drop every image-bearing field (used when the user has not opted in to storing photos)."""
    out = dict(analysis)
    for key in ('aligned_crops', 'pupil_crops'):
        out.pop(key, None)
    for side in ('left_eye', 'right_eye'):
        eye = out.get(side)
        if isinstance(eye, dict) and isinstance(eye.get('screening'), dict) and eye['screening'].get('gradcam'):
            out[side] = {**eye, 'screening': {**eye['screening'], 'gradcam': None}}
    return out


__all__: List[str] = [
    'OnDeviceValidationError',
    'build_on_device_analysis',
    'load_manifest',
    'sanitize_eyewear',
    'sanitize_lighting',
    'strip_images',
]
