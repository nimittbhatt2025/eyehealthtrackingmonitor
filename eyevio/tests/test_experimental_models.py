"""Research-only gate for the image classifiers. Run: ./venv/bin/python -m pytest tests/test_experimental_models.py"""

import json

from app.ai_models.experimental_models import MESSAGES, NOT_RUN_MESSAGE, withhold_model_outputs


def cataract_analysis(status='assessed'):
    eye = {
        'screening': {'status': status, 'likelihood': 0.91, 'band': 'elevated', 'gradcam': 'data:image/png;base64,AA'},
        'image_metrics': {'mean_brightness': 120.0},
    }
    return {
        'analysis_type': 'cataract_screening',
        'score': None,
        'screening': {'status': status, 'likelihood': 0.91, 'band': 'elevated', 'band_level': 2},
        'risk_level': 'elevated',
        'risk_message': 'The model found features similar to the cataract photos…',
        'findings': ['Calibrated likelihood 91% (elevated) — left eye'],
        'left_eye': eye,
        'right_eye': dict(eye),
        'eye_asymmetry': {'likelihood_difference': 0.0},
        'metrics': {'screening_status': status, 'cataract_likelihood': 0.91, 'screening_band': 'elevated'},
        'model_status': {'available': status != 'model_unavailable', 'thresholds': {'rule_in': 0.8}},
        'lighting': {'status': 'normal'},
        'pathology_triage': {'available': True, 'predicted_label': 'cataract', 'confidence': 0.97},
    }


def test_cataract_result_is_never_returned():
    out = withhold_model_outputs(cataract_analysis())
    text = json.dumps(out)
    for banned in ('likelihood', 'elevated', 'gradcam', 'predicted_label', 'rule_in'):
        assert banned not in text
    assert out['experimental_models']['messages'] == list(MESSAGES)
    assert out['experimental_models']['models_run'] == ['cataract', 'pathology']
    assert out['left_eye']['image_metrics'] == {'mean_brightness': 120.0}
    assert out['lighting'] == {'status': 'normal'}


def test_unavailable_model_does_not_claim_an_analysis_ran():
    analysis = cataract_analysis('model_unavailable')
    analysis['pathology_triage'] = {'available': False, 'reason': 'weights_unavailable'}
    out = withhold_model_outputs(analysis)
    assert out['experimental_models']['messages'] == [NOT_RUN_MESSAGE]
    assert out['experimental_models']['models_not_run'] == ['cataract']


def test_redness_keeps_pixel_measurements_and_drops_grades():
    eye = {
        'sclera_redness': 31.0, 'efron_style_grade': 1, 'efron_style_label': 'Trace',
        'ml_redness': {'score': 2.4}, 'redness_details': {'mask_coverage': 0.2, 'efron_style_grade': 1},
    }
    out = withhold_model_outputs({
        'score': 72.0,
        'findings': ['Moderate redness (model grade 2)'],
        'heuristic_findings': ['No large visible differences detected in this photo'],
        'ml_redness': {'available': True, 'score': 2.4, 'discretized_grade': 2},
        'left_eye': eye, 'right_eye': dict(eye),
        'metrics': {'avg_sclera_redness': 31.0, 'ml_sclera_grade': 2, 'avg_efron_style_label': 'Trace'},
    })
    assert out['findings'] == ['No large visible differences detected in this photo']
    assert out['metrics'] == {'avg_sclera_redness': 31.0}
    assert out['left_eye'] == {'sclera_redness': 31.0, 'redness_details': {'mask_coverage': 0.2}}
    assert out['score'] == 72.0


def test_stored_dry_eye_details_drop_model_findings():
    out = withhold_model_outputs({
        'findings': ['Moderate redness (model grade 2)'],
        'metrics': {'ml_sclera_available': True, 'ml_sclera_grade': 2, 'avg_sclera_redness': 40.0},
    })
    assert out['findings'] == []
    assert out['experimental_models']['models_run'] == ['sclera_redness']


def test_model_only_fallback_has_no_placeholder_score():
    out = withhold_model_outputs({
        'score': 50.0, 'production_fallback': True,
        'ml_redness': {'available': True, 'score': 1.0}, 'production_sclera': {'grade': 1},
    })
    assert out['score'] is None and 'production_sclera' not in out


def test_idempotent_and_errors_pass_through(monkeypatch):
    once = withhold_model_outputs(cataract_analysis())
    assert withhold_model_outputs(once) == once
    assert withhold_model_outputs({'error': 'x'}) == {'error': 'x'}
    assert withhold_model_outputs(None) is None
    monkeypatch.setenv('EXPERIMENTAL_IMAGE_MODELS_USER_FACING', '1')
    assert withhold_model_outputs(cataract_analysis())['screening']['likelihood'] == 0.91
