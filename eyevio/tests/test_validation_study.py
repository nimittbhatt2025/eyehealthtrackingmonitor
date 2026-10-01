"""Validation-study statistics and data handling. Run: ./venv/bin/python -m pytest tests/test_validation_study.py"""

import importlib.util
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.utils.agreement import bland_altman, icc, icc_band, repeatability
from app.utils.validation_study import MEASURES, analyse, app_rows, pair_test_retest, pair_with_reference

REPO = Path(__file__).resolve().parents[2]

# Shrout & Fleiss (1979), Table 2: 6 targets rated by 4 judges.
SHROUT_FLEISS = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]]


def test_icc_matches_shrout_fleiss_and_mcgraw_wong():
    r = icc(SHROUT_FLEISS)
    assert r['icc_1_1']['value'] == pytest.approx(0.166, abs=0.001)
    assert r['icc_a_1']['value'] == pytest.approx(0.290, abs=0.001)
    assert r['icc_c_1']['value'] == pytest.approx(0.715, abs=0.001)
    assert r['icc_a_1']['ci'] == pytest.approx([0.019, 0.761], abs=0.002)
    assert r['icc_c_1']['ci'] == pytest.approx([0.342, 0.946], abs=0.002)
    assert r['icc_1_1']['ci'] == pytest.approx([-0.133, 0.723], abs=0.002)


def test_icc_absolute_agreement_penalises_a_constant_offset():
    truth = [0.0, 0.1, 0.3, 0.5, 0.2, 0.4]
    shifted = [[t, t + 0.2] for t in truth]
    r = icc(shifted)
    assert r['icc_c_1']['value'] == pytest.approx(1.0)
    assert r['icc_a_1']['value'] < 0.8


def test_bland_altman_hand_computed():
    ba = bland_altman([1, 2, 3, 4, 5], [1.1, 1.9, 3.2, 3.8, 5.0])
    sd = math.sqrt(0.025)
    assert ba['n'] == 5
    assert ba['bias'] == pytest.approx(0.0, abs=1e-12)
    assert ba['sd_diff'] == pytest.approx(sd)
    assert ba['loa'] == pytest.approx([-1.959964 * sd, 1.959964 * sd])
    assert ba['loa_lower_ci'][0] < ba['loa'][0] < ba['loa_lower_ci'][1]
    assert ba['proportional_bias']['slope'] == pytest.approx(0.0, abs=0.05)


def test_bland_altman_needs_three_pairs_and_drops_missing():
    assert bland_altman([1, 2], [1, 2]) == {'n': 2}
    assert bland_altman([1, 2, float('nan'), 4], [1, 2, 3, 4.1])['n'] == 3


def test_repeatability_sw_and_cor():
    r = repeatability([1, 2, 3, 4, 5], [1.1, 1.9, 3.2, 3.8, 5.0])
    assert r['sw'] == pytest.approx(math.sqrt(0.1 / 10))
    assert r['cor'] == pytest.approx(1.959964 * math.sqrt(2) * r['sw'])


def test_icc_band():
    assert [icc_band(v) for v in (0.3, 0.6, 0.8, 0.95, None)] == ['poor', 'moderate', 'good', 'excellent', None]


def _test(test_id, test_type, details, when, flag=None):
    return SimpleNamespace(id=test_id, test_type=test_type, test_details=details, created_at=when, data_quality_flag=flag)


def test_app_rows_extracts_measures_numbers_sessions_and_skips_bad_records():
    t0 = datetime(2026, 10, 1, 9)

    def acuity(right, left, floor=False):
        return {
            'method_version': 2,
            'right_eye': {'logMAR': right, 'at_chart_floor': floor},
            'left_eye': {'logMAR': left},
        }

    tests = [
        _test(3, 'visual_acuity', acuity(0.1, 0.2), t0 + timedelta(days=2)),
        _test(1, 'visual_acuity', acuity(0.0, 0.1, floor=True), t0),
        _test(2, 'visual_acuity', acuity(0.5, 0.5), t0 + timedelta(days=1), flag='legacy'),
        _test(4, 'visual_acuity', {**acuity(0.3, 0.3), 'method_version': 1}, t0 + timedelta(days=3)),
        _test(5, 'near_point_convergence', {'method_version': 1, 'npc_cm': 7.5, 'break_detected': True}, t0),
        _test(6, 'contrast_sensitivity', {'method_version': 2, 'eyes': {'right': {'aulcsf': 1.3, 'log_cs_at_cpd': {'1': 1.6}}}}, t0),
    ]
    rows = app_rows('P001', tests)
    right = [r for r in rows if r['measure'] == 'acuity_logmar' and r['eye'] == 'right']
    assert [(r['session'], r['test_id'], r['value'], r['flags']) for r in right] == [(1, 1, 0.0, 'at_chart_floor'), (2, 3, 0.1, '')]
    assert {r['measure'] for r in rows} == {'acuity_logmar', 'npc_break_cm', 'contrast_logcs_1cpd', 'contrast_aulcsf'}
    assert all(r['participant_id'] == 'P001' and 'email' not in r for r in rows)


def _rows(measure, pid, eye, values, flags=None):
    return [
        {'participant_id': pid, 'measure': measure, 'eye': eye, 'session': i + 1, 'value': v, 'flags': (flags or {}).get(i + 1, '')}
        for i, v in enumerate(values)
    ]


def test_pairing_uses_first_usable_session_and_one_eye_per_participant():
    m = MEASURES['acuity_logmar']
    app = (
        _rows('acuity_logmar', 'P1', 'right', [0.0, 0.1, 0.2], flags={1: 'at_chart_floor'})
        + _rows('acuity_logmar', 'P1', 'left', [0.3, 0.3])
        + _rows('acuity_logmar', 'P2', 'left', [0.4, 0.5])
    )
    ref = [
        {'participant_id': 'P1', 'measure': 'acuity_logmar', 'eye': 'right', 'value': '0.12'},
        {'participant_id': 'P1', 'measure': 'acuity_logmar', 'eye': 'left', 'value': '0.28'},
        {'participant_id': 'P2', 'measure': 'acuity_logmar', 'eye': 'left', 'value': '0.42'},
    ]
    pairs = pair_with_reference(app, ref, m)
    assert pairs == [
        {'participant_id': 'P1', 'eye': 'right', 'app': 0.1, 'reference': 0.12},
        {'participant_id': 'P2', 'eye': 'left', 'app': 0.4, 'reference': 0.42},
    ]
    assert len(pair_with_reference(app, ref, m, eye_policy='all')) == 3
    retest = pair_test_retest(app, m)
    assert [(p['participant_id'], p['eye'], p['first'], p['second']) for p in retest] == [
        ('P1', 'right', 0.1, 0.2),
        ('P2', 'left', 0.4, 0.5),
    ]


def test_analyse_flags_targets():
    app, ref = [], []
    for i in range(30):
        truth = (i % 10) * 0.05
        jitter = ((i * 7) % 5 - 2) * 0.01
        app += _rows('acuity_logmar', f'P{i}', 'right', [truth + 0.01 + jitter, truth + 0.02 - jitter])
        ref.append({'participant_id': f'P{i}', 'measure': 'acuity_logmar', 'eye': 'right', 'value': truth})
    res = analyse(app, ref)['measures']['acuity_logmar']
    assert res['agreement']['n'] == 30
    assert res['agreement']['pass'] == {'bias': True, 'loa_half_width': True, 'icc_a_1_lower_ci': True}
    assert res['repeatability']['n'] == 30 and res['repeatability']['pass_cor'] is True
    assert res['repeatability']['prior_sw_in_change_detection'] == pytest.approx(0.07)


def test_analyze_script_simulated_end_to_end(tmp_path):
    spec = importlib.util.spec_from_file_location('validation_analyze', REPO / 'scripts' / 'validation_analyze.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.main(['--simulate', '40', '--out', str(tmp_path), '--no-plots']) == 0
    report = (tmp_path / 'report.md').read_text(encoding='utf-8')
    assert 'SIMULATED' in report and 'acuity_logmar' in report
    results = json.loads((tmp_path / 'results.json').read_text(encoding='utf-8'))
    acuity = results['measures']['acuity_logmar']
    assert results['simulated'] is True
    assert acuity['agreement']['n'] == 40 and acuity['repeatability']['n'] == 40
    assert 0.0 < acuity['agreement']['bland_altman']['bias'] < 0.07
