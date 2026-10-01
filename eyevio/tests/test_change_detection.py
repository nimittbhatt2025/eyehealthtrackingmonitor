"""Reliable-change decline detection. Run: ./venv/bin/python -m pytest tests/test_change_detection.py"""

import random
from types import SimpleNamespace

from app.utils.change_detection import DEFAULT_METRIC, assess_tests, metric_for, personal_sw, summary_message


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


def test_display_index_never_reports_decline():
    result = assess_tests(score_sessions([90, 88, 87, 86, 85, 60, 58]), 'visual_acuity', None)
    assert result['unit'].startswith('display index')
    assert result['alerts_enabled'] is False
    assert result['status'] == 'display_only'
    assert summary_message(result) is None


def test_amsler_tracks_marked_area():
    def amsler(area):
        eye = {'standard_area_deg2': area, 'low_contrast_area_deg2': area / 2, 'score': 100}
        return SimpleNamespace(score=100, test_details={'method_version': 2, 'eyes': {'right': eye, 'left': eye}})

    result = assess_tests([amsler(a) for a in (0, 0, 0, 0, 12, 14)], 'amsler_grid', 2)
    assert result['unit'] == 'marked area (deg²)'
    assert result['status'] == 'confirmed_decline'
    assert assess_tests([amsler(a) for a in (0, 0, 0, 0, 3, 3)], 'amsler_grid', 2)['status'] == 'stable'


def test_npc_tracks_break_distance():
    npc = lambda cm: SimpleNamespace(score=50, test_details={'method_version': 2, 'npc_cm': cm})
    result = assess_tests([npc(c) for c in (6, 6.5, 5.5, 6, 13, 14)], 'near_point_convergence', 2)
    assert result['unit'] == 'cm'
    assert result['alerts_enabled'] is True
    assert result['status'] == 'confirmed_decline'
    # v1 mixed in camera breaks that had no confidence checks.
    assert metric_for('near_point_convergence', 1) is DEFAULT_METRIC


def test_colour_compares_same_display_only():
    def colour(units, display):
        axes = {'protan': {'threshold_units': units}}
        return SimpleNamespace(score=None, test_details={'method_version': 2, 'display_id': display,
                                                         'eyes': {'both': {'axes': axes}}})
    other_screen = [colour(400, 'bbbb') for _ in range(4)]
    this_screen = [colour(u, 'aaaa') for u in (60, 62, 58, 61)]
    result = assess_tests(other_screen + this_screen, 'color_vision', 2)
    assert result['comparison_scope'] == 'same_display'
    assert result['display_id'] == 'aaaa'
    assert result['series'][0]['n_sessions'] == 4
    assert result['status'] == 'stable'


def test_eye_glow_is_never_tracked():
    glow = [SimpleNamespace(score=None, test_details={'method_version': 3, 'outcome': 'asymmetry_observed'}) for _ in range(6)]
    result = assess_tests(glow, 'red_reflex', 3)
    assert result['status'] == 'insufficient_data'
    assert result['series'] == []


def test_glare_sources_are_separate_series():
    def glare(delta, mode):
        return SimpleNamespace(score=80, test_details={'method_version': 2, 'glare_mode': mode, 'delta_logcs': delta})
    result = assess_tests([glare(0.1, 'screen')] * 4 + [glare(0.4, 'torch')] * 2, 'cataract_glare', 2)
    names = {s['series'] for s in result['series']}
    assert names == {'glare Δ logCS (screen ring)', 'glare Δ logCS (torch)'}


def test_npc_without_break_is_not_tracked():
    npc = lambda cm: SimpleNamespace(score=None, test_details={'method_version': 2, 'npc_cm': cm, 'closest_no_break_cm': 7})
    result = assess_tests([npc(None) for _ in range(6)], 'near_point_convergence', 2)
    assert result['status'] == 'insufficient_data'


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
