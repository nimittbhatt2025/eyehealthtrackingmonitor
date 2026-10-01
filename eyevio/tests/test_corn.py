"""CORN ordinal head maths. Run: ./venv/bin/python -m pytest tests/test_corn.py"""

import torch

from app.ai_models.corn import corn_loss, cumulative_probs, level_probs, predict_level


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
