"""Reports show native units, never 0–100 display indices.

Run: ./venv/bin/python -m pytest tests/test_native_measures.py
"""

from datetime import datetime
from types import SimpleNamespace

from app.services.clinician_report import _flag_text, _reportable, render_clinician_pdf
from app.utils.native_measures import glare_multiplier, native_summary


def test_acuity_reports_logmar():
    s = native_summary('visual_acuity', {
        'method_version': 2, 'right_eye': {'logMAR': 0.1}, 'left_eye': {'logMAR': 0.2},
    })
    assert s == {'measure': '0.10 logMAR (better eye)', 'od': '0.10', 'os': '0.20'}


def test_glare_reports_delta_and_multiplier():
    s = native_summary('cataract_glare', {'method_version': 2, 'delta_logcs': 0.3})
    assert s['measure'] == 'Δ +0.30 logCS (×2.0 contrast)'
    assert round(glare_multiplier(0.3), 2) == 2.0


def test_npc_amsler_dry_eye_red_reflex():
    assert native_summary('near_point_convergence', {'npc_cm': 8.25})['measure'] == '8.2 cm break'
    assert native_summary('near_point_convergence', {
        'method_version': 2, 'npc_cm': 9.0, 'reported_diplopia_cm': 9.0, 'camera_break_cm': 7.5,
    })['measure'] == '9.0 cm break (reported 9.0, camera 7.5)'
    assert native_summary('near_point_convergence', {
        'method_version': 2, 'npc_cm': None, 'closest_no_break_cm': 7.0,
    })['measure'] == 'No break to 7.0 cm'
    amsler = native_summary('amsler_grid', {
        'method_version': 2,
        'eyes': {'right': {'standard_area_deg2': 4.0, 'low_contrast_area_deg2': 6.5}, 'left': {}},
        'vernier': {'right': {'flags': [{'kind': 'bias'}]}},
    })
    assert amsler['od'] == '6.5 deg², 1 vernier'
    assert amsler['os'] == '—'
    dry = native_summary('dry_eye', {'osdi_score': 18, 'blink_interval': {'blinkRatePerMin': 9}})
    assert dry['measure'] == 'OSDI 18 · 9 blinks/min'
    rr = native_summary('red_reflex', {'method_version': 3, 'outcome': 'no_repeated_asymmetry', 'usable_captures': 2})
    assert rr['measure'] == 'No repeated asymmetry (not an all-clear) (2 usable captures)'
    assert 'normal' not in rr['measure'].lower()
    old = native_summary('red_reflex', {'method_version': 2, 'brightness_asymmetry': 0.12})
    assert old['measure'] == 'Earlier method version (not comparable)'


def test_no_native_measure_never_falls_back_to_score():
    assert native_summary('blink_calibration', {})['measure'] == 'Completed (no native measure)'
    assert native_summary('ocular_ergonomics', {})['measure'] == '—'
    ergo = native_summary('ocular_ergonomics', {
        'blink_rate': {'mean_rate_per_min': 11.6}, 'avg_viewing_distance_cm': 58,
    })
    assert ergo['measure'] == '12 blinks/min · 58 cm viewing distance'
    assert 'not comparable' in native_summary('visual_acuity', {'method_version': 1})['measure']


def _alert(alert_type, unit=None):
    return SimpleNamespace(alert_type=alert_type, alert_data={'assessment': {'unit': unit}} if unit else {})


def test_display_index_alerts_are_not_reportable():
    assert not _reportable(_alert('high_fatigue'))
    assert not _reportable(_alert('lens_replacement'))
    assert not _reportable(_alert('eye_health_deterioration'))
    assert not _reportable(_alert('vision_decline', 'score (0–100)'))
    assert _reportable(_alert('vision_decline', 'logMAR'))
    assert _reportable(_alert('myopia_progression'))


def test_legacy_myopia_alert_is_reworded_from_rate():
    legacy = SimpleNamespace(
        alert_type='myopia_progression',
        title='Myopia progression alert — Tmp Kid',
        message='Discuss myopia control with an eye doctor.',
        alert_data={'rate_d_per_year': -0.99},
    )
    title, detail = _flag_text(legacy)
    assert title == 'Prescription change logged — Tmp Kid'
    assert detail == 'Estimated change from the logged prescriptions ≈ -0.99 D/year (fast).'
    assert 'myopia control' not in detail


def test_clinician_pdf_renders_one_page():
    payload = {
        'patient': {
            'name': 'Test', 'email': 't@x', 'age': 30, 'dob': None,
            'lens_type': None, 'rx_od': '—', 'rx_os': '—',
        },
        'generated_at': datetime.utcnow(),
        'days': 90,
        'latest_by_type': [
            {'type': 'visual_acuity', 'label': 'Distance acuity', 'measure': '0.10 logMAR (better eye)',
             'od': '0.10', 'os': '0.20', 'date': datetime.utcnow()},
        ],
        'trend': [],
        'tests_in_period': 1,
        'avg_blink_rate': 12.0,
        'webcam_sessions': 2,
        'lifestyle': {'screen': None, 'outdoor': None, 'breaks': None, 'sleep': None, 'days_logged': 0},
        'myopia': None,
        'flags': [{'severity': 'high', 'title': 'Confirmed change in a vision check', 'detail': 'logMAR'}],
    }
    pdf = render_clinician_pdf(payload).getvalue()
    assert pdf.startswith(b'%PDF')
    assert pdf.count(b'/Type /Page\n') + pdf.count(b'/Type /Page ') <= 2
