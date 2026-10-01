"""CORN ordinal head maths. Run: ./venv/bin/python -m pytest tests/test_corn.py"""

import torch

from app.ai_models.corn import corn_loss, cumulative_probs, level_probs, predict_level
from app.ai_models.corn_gate import CORN_METHOD, CORN_VALIDATION_THRESHOLDS, evaluate_corn_gate, load_approval


def test_cumulative_probs_never_cross():
    logits = torch.randn(64, 4) * 3
    cum = cumulative_probs(logits)
    assert torch.all(cum[:, 1:] <= cum[:, :-1] + 1e-7)


def test_level_probs_sum_to_one():
    probs = level_probs(torch.randn(32, 2) * 2)
    assert torch.allclose(probs.sum(1), torch.ones(32), atol=1e-6)
    assert torch.all(probs >= 0)


def test_predict_level_from_confident_logits():
    big = 10.0
    logits = torch.tensor([[-big, -big], [big, -big], [big, big]])
    assert predict_level(logits).tolist() == [0, 1, 2]


def test_loss_decreases_when_logits_match_labels():
    y = torch.tensor([0, 1, 2, 2])
    good = torch.tensor([[-5.0, 0.0], [5.0, -5.0], [5.0, 5.0], [5.0, 5.0]])
    bad = -good
    assert corn_loss(good, y) < corn_loss(bad, y)


def test_task_two_ignores_level_zero_samples():
    y = torch.tensor([0, 0])
    a = torch.tensor([[-5.0, 100.0], [-5.0, -100.0]])
    b = torch.tensor([[-5.0, -100.0], [-5.0, 100.0]])
    assert torch.isclose(corn_loss(a, y), corn_loss(b, y))


LEVELS = ['normal', 'immature', 'mature']
DATASET = {'name': 'graded_phone_eyes', 'version': '2026-09'}


def _meta(**over):
    meta = {
        'version': CORN_METHOD, 'levels': LEVELS, 'dataset': dict(DATASET),
        'data': {'counts': {'test': {'normal': 80, 'immature': 60, 'mature': 40}}},
        'test': {'qwk': 0.82, 'mae': 0.2, 'ci95': {'qwk': [0.74, 0.88]},
                 'threshold_ece': {'P(grade > normal)': 0.03, 'P(grade > immature)': 0.04}},
    }
    meta.update(over)
    return meta


def _approval(**over):
    a = {'approved': True, 'model_version': CORN_METHOD, 'levels': LEVELS, 'dataset': dict(DATASET), 'weights_sha256': 'abc'}
    a.update(over)
    return a


def test_corn_gate_passes_only_with_every_check():
    assert evaluate_corn_gate(_meta(), _approval(), 'abc', True) == {'enabled': True, 'failed': [], 'validation_failures': []}


def test_corn_gate_weights_alone_do_not_enable():
    gate = evaluate_corn_gate(_meta(), None, 'abc', False)
    assert not gate['enabled']
    assert {'feature_toggle', 'approval', 'version', 'levels', 'dataset', 'weights_hash'} <= set(gate['failed'])


def test_corn_gate_reports_each_mismatch():
    assert evaluate_corn_gate(_meta(), _approval(approved=False), 'abc', True)['failed'] == ['approval']
    assert evaluate_corn_gate(_meta(), _approval(), 'other', True)['failed'] == ['weights_hash']
    assert evaluate_corn_gate(_meta(dataset={'name': 'graded_phone_eyes', 'version': '2026-10'}), _approval(), 'abc', True)['failed'] == ['dataset']
    assert evaluate_corn_gate(_meta(version='corn_v0'), _approval(), 'abc', True)['failed'] == ['version']


def test_corn_gate_validation_thresholds():
    weak = _meta(test={'qwk': 0.65, 'mae': 0.5, 'ci95': {'qwk': [0.5, 0.75]}, 'threshold_ece': {'a': 0.09}},
                 data={'counts': {'test': {'normal': 50}}})
    gate = evaluate_corn_gate(weak, _approval(), 'abc', True)
    assert gate['failed'] == ['validation']
    assert set(gate['validation_failures']) == {'test_n', 'qwk', 'qwk_ci_lower', 'mae', 'threshold_ece'}
    assert CORN_VALIDATION_THRESHOLDS['min_qwk'] == 0.70


def test_shipped_approval_is_not_approved():
    approval = load_approval()
    assert approval is not None and approval['approved'] is False
