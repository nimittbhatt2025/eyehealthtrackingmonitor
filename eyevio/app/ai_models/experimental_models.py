"""
Research-only gate for the three image classifiers.

The cataract, sclera-redness and pathology ResNets all score almost as well
with the eye masked out of the photo (cataract AUC 0.998, redness AUC 0.993,
pathology macro-F1 0.68 against 0.25 chance), so what they learned is largely
a property of the dataset, not of the eye. Their outputs are therefore never
returned to users or stored with a user's photo: a response only says that an
experimental analysis ran. The models' behaviour is presented as an experiment
in the Research Lab (/research-lab) from the model-card evaluation files.

Capture checks (framing, lighting, eyewear), pixel measurements and the photo
itself are unaffected. EXPERIMENTAL_IMAGE_MODELS_USER_FACING=1 restores the raw
outputs for research builds only.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Iterable, Optional

MESSAGES = (
    'Experimental analysis completed',
    'Result is not clinically interpretable',
    'This model is currently being evaluated for dataset shortcuts',
)
NOT_RUN_MESSAGE = 'Experimental model did not run on this photo'
RESEARCH_LAB_PATH = '/research-lab'

_CATARACT_METRICS = ('screening_status', 'cataract_likelihood', 'screening_band')
_REDNESS_METRICS = (
    'ml_sclera_score', 'ml_sclera_grade', 'ml_sclera_grade_label', 'ml_sclera_uncertainty_std',
    'ml_sclera_available', 'ml_model_version', 'avg_efron_style_grade', 'avg_efron_style_label',
    'efron_style_note',
)
_EYE_GRADE_KEYS = ('ml_redness', 'efron_style_grade', 'efron_style_label')


def user_facing() -> bool:
    return os.environ.get('EXPERIMENTAL_IMAGE_MODELS_USER_FACING', '').strip() == '1'


def notice(ran: Iterable[str], skipped: Iterable[str] = ()) -> Dict[str, Any]:
    ran, skipped = sorted(set(ran)), sorted(set(skipped) - set(ran))
    return {
        'status': 'withheld',
        'models_run': ran,
        'models_not_run': skipped,
        'messages': list(MESSAGES) if ran else [NOT_RUN_MESSAGE],
        'research_lab': RESEARCH_LAB_PATH,
    }


def _strip_eye(eye: Any) -> Any:
    if not isinstance(eye, dict):
        return eye
    out = {k: v for k, v in eye.items() if k not in _EYE_GRADE_KEYS}
    if isinstance(out.get('screening'), dict):
        out['screening'] = {'status': 'withheld'}
    if isinstance(out.get('redness_details'), dict):
        out['redness_details'] = {
            k: v for k, v in out['redness_details'].items() if k not in ('efron_style_grade', 'efron_style_label')
        }
    return out


def withhold_model_outputs(analysis: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Copy of an eye-photo analysis with every classifier output replaced by the research notice."""
    if not isinstance(analysis, dict) or analysis.get('error') or user_facing():
        return analysis
    if (analysis.get('experimental_models') or {}).get('status') == 'withheld':
        return analysis

    out = dict(analysis)
    ran, skipped = set(), set()

    screening = out.get('screening')
    if out.get('analysis_type') == 'cataract_screening' or isinstance(screening, dict):
        status = (screening or {}).get('status')
        (skipped if status == 'model_unavailable' else ran).add('cataract')
        out['screening'] = {'status': 'withheld'}
        out['eye_asymmetry'] = None
        out['risk_level'] = 'not_interpretable'
        out['risk_message'] = ' · '.join(MESSAGES if 'cataract' in ran else (NOT_RUN_MESSAGE,))
        out['findings'] = []
        out['model_status'] = {'available': bool((out.get('model_status') or {}).get('available'))}
        out['disclaimer'] = (
            'Photo saved for side-by-side comparison only. The cataract model is a research experiment: '
            'it is not clinically interpretable and its result is not shown.'
        )

    ml = out.get('ml_redness')
    metrics = out.get('metrics') if isinstance(out.get('metrics'), dict) else {}
    if isinstance(ml, dict) or 'ml_sclera_available' in metrics:
        available = (ml or {}).get('available') if isinstance(ml, dict) else metrics.get('ml_sclera_available')
        (ran if available else skipped).add('sclera_redness')
        out['ml_redness'] = {'status': 'withheld'}
        out.pop('production_sclera', None)
        if out.get('production_fallback'):
            out.update(score=None, appearance_score=None, risk_level='not_interpretable', risk_message=None)
        out['findings'] = list(out.get('heuristic_findings') or [])

    triage = out.get('pathology_triage')
    if isinstance(triage, dict):
        if triage.get('available'):
            ran.add('pathology')
        out['pathology_triage'] = {'available': False, 'status': 'withheld'}

    if isinstance(out.get('metrics'), dict):
        drop = set(_CATARACT_METRICS) | set(_REDNESS_METRICS)
        out['metrics'] = {k: v for k, v in out['metrics'].items() if k not in drop}
    for side in ('left_eye', 'right_eye'):
        if side in out:
            out[side] = _strip_eye(out[side])

    out['experimental_models'] = notice(ran, skipped)
    return out


__all__ = ['MESSAGES', 'RESEARCH_LAB_PATH', 'notice', 'user_facing', 'withhold_model_outputs']
