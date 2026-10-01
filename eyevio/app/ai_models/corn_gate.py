"""
Release gate for the ordinal CORN cataract grader.

Weights on disk are never enough to switch the grader on. It loads only when
every check below passes, and each failure is reported by name:

  feature_toggle   CATARACT_CORN_ENABLED=1 is set explicitly.
  approval         docs/model_cards/approvals.json has cataract_corn.approved = true.
  version          meta version == approved model_version == CORN_METHOD.
  levels           meta levels == the approved grade levels.
  dataset          meta dataset {name, version} == the approved dataset.
  weights_hash     SHA-256 of the weights file == the approved hash.
  validation       held-out test metrics meet CORN_VALIDATION_THRESHOLDS.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

CORN_METHOD = 'corn_v1'
APPROVAL_KEY = 'cataract_corn'
REPO_ROOT = Path(__file__).resolve().parents[3]
APPROVALS_PATH = REPO_ROOT / 'docs' / 'model_cards' / 'approvals.json'

CORN_VALIDATION_THRESHOLDS = {
    'min_test_n': 150,
    'min_qwk': 0.70,
    'min_qwk_ci_lower': 0.60,
    'max_mae': 0.35,
    'max_threshold_ece': 0.05,
}


def feature_enabled() -> bool:
    return os.environ.get('CATARACT_CORN_ENABLED', '').strip() == '1'


def load_approval(path: Path = APPROVALS_PATH) -> Optional[Dict[str, Any]]:
    try:
        return (json.loads(path.read_text(encoding='utf-8')) or {}).get(APPROVAL_KEY)
    except (OSError, ValueError):
        return None


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def _validation_failures(meta: Dict[str, Any]) -> List[str]:
    t = CORN_VALIDATION_THRESHOLDS
    test = meta.get('test') or {}
    counts = ((meta.get('data') or {}).get('counts') or {}).get('test') or {}
    out = []
    if sum(int(v) for v in counts.values()) < t['min_test_n']:
        out.append('test_n')
    qwk = test.get('qwk')
    if not isinstance(qwk, (int, float)) or qwk < t['min_qwk']:
        out.append('qwk')
    ci = (test.get('ci95') or {}).get('qwk') or []
    if len(ci) != 2 or ci[0] < t['min_qwk_ci_lower']:
        out.append('qwk_ci_lower')
    mae = test.get('mae')
    if not isinstance(mae, (int, float)) or mae > t['max_mae']:
        out.append('mae')
    ece = test.get('threshold_ece') or {}
    if not ece or max(ece.values()) > t['max_threshold_ece']:
        out.append('threshold_ece')
    return out


def evaluate_corn_gate(
    meta: Optional[Dict[str, Any]],
    approval: Optional[Dict[str, Any]],
    weights_sha256: Optional[str],
    enabled: bool,
) -> Dict[str, Any]:
    """{'enabled': bool, 'failed': [check names], 'validation_failures': [...]}"""
    failed: List[str] = []
    meta, approval = meta or {}, approval or {}
    if not enabled:
        failed.append('feature_toggle')
    if approval.get('approved') is not True:
        failed.append('approval')
    if not (meta.get('version') == approval.get('model_version') == CORN_METHOD):
        failed.append('version')
    if not meta.get('levels') or meta.get('levels') != approval.get('levels'):
        failed.append('levels')
    dataset = meta.get('dataset') or {}
    if not (dataset.get('name') and dataset.get('version')) or dataset != approval.get('dataset'):
        failed.append('dataset')
    if not weights_sha256 or weights_sha256 != approval.get('weights_sha256'):
        failed.append('weights_hash')
    validation = _validation_failures(meta)
    if validation:
        failed.append('validation')
    return {'enabled': not failed, 'failed': failed, 'validation_failures': validation}


__all__ = [
    'APPROVALS_PATH', 'CORN_METHOD', 'CORN_VALIDATION_THRESHOLDS',
    'evaluate_corn_gate', 'feature_enabled', 'load_approval', 'sha256_file',
]
