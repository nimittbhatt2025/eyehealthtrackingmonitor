"""Reliable-change decline detection. Run: ./venv/bin/python -m pytest tests/test_change_detection.py"""

import random
from types import SimpleNamespace

from app.utils.change_detection import assess_tests, personal_sw


def acuity_sessions(values):
    return [
        SimpleNamespace(score=0, test_details={'right_eye': {'logMAR': v}, 'left_eye': {'logMAR': 0.0}})
        for v in values
    ]


def score_sessions(values):
    return [SimpleNamespace(score=v, test_details={}) for v in values]


def status(values):
    return assess_tests(acuity_sessions(values), 'visual_acuity', 2)['status']


def test_insufficient_data():
    assert status([0.0, 0.1, 0.0]) == 'insufficient_data'


def test_confirmed_decline_needs_two_sessions():
    assert status([0.0, 0.02, -0.02, 0.0, 0.0, 0.3]) == 'possible_decline'
    assert status([0.0, 0.02, -0.02, 0.0, 0.3, 0.3]) == 'confirmed_decline'


def test_change_below_mcid_is_not_decline():
    assert status([0.0, 0.0, 0.0, 0.0, 0.08, 0.08]) == 'stable'


def test_noisy_user_needs_bigger_change():
    noisy = [0.0, 0.2, -0.1, 0.25, -0.05, 0.3, 0.3]
    result = assess_tests(acuity_sessions(noisy), 'visual_acuity', 2)
    right = next(s for s in result['series'] if s['series'] == 'right eye')
    assert right['sw_personal'] > 0.07
    assert result['status'] != 'confirmed_decline'


def test_improvement():
    assert status([0.3, 0.32, 0.28, 0.3, 0.1, 0.1]) == 'improved'


def test_session_sd_widens_interval():
    base = [{'eyes': {'right': {'aulcsf': 1.5, 'aulcsf_sd': 0.05}}} for _ in range(4)]
    precise = base + [{'eyes': {'right': {'aulcsf': 1.2, 'aulcsf_sd': 0.05}}}] * 2
    vague = base + [{'eyes': {'right': {'aulcsf': 1.2, 'aulcsf_sd': 0.3}}}] * 2
    mk = lambda ds: [SimpleNamespace(score=0, test_details=d) for d in ds]
    assert assess_tests(mk(precise), 'contrast_sensitivity', 2)['status'] == 'confirmed_decline'
    assert assess_tests(mk(vague), 'contrast_sensitivity', 2)['status'] != 'confirmed_decline'


def test_legacy_versions_use_generic_score():
    result = assess_tests(score_sessions([90, 88, 87, 86, 85, 60, 58]), 'visual_acuity', None)
    assert result['unit'].startswith('score')
    assert result['status'] == 'confirmed_decline'


def test_personal_sw_needs_four_points():
    assert personal_sw([0.0, 0.1, 0.0]) is None
    assert personal_sw([0.0, 0.1, 0.0, 0.1]) > 0


def _old_rule_fires(scores, threshold=10.0):
    base = sum(scores[:5]) / len(scores[:5])
    recent = sum(scores[-5:]) / len(scores[-5:])
    return (base - recent) / base * 100 >= threshold


def test_false_alarm_rate_on_stable_noisy_acuity():
    """Stable true acuity, home-level noise (s_w 0.06 logMAR, logged in 0.02 steps)."""
    rng = random.Random(7)
    n_users, n_sessions = 2000, 10
    new_alarms = old_alarms = 0
    for _ in range(n_users):
        true = rng.uniform(-0.1, 0.3)
        seq = [round((true + rng.gauss(0, 0.06)) / 0.02) * 0.02 for _ in range(n_sessions)]
        fired_new = any(status(seq[:k]) == 'confirmed_decline' for k in range(5, n_sessions + 1))
        new_alarms += fired_new
        scores = [max(0.0, min(100.0, 100 - 100 * v)) for v in seq]  # legacy-style 0–100 index
        old_alarms += any(_old_rule_fires(scores[:k]) for k in range(5, n_sessions + 1))
    assert new_alarms / n_users < 0.03
    assert old_alarms > new_alarms
