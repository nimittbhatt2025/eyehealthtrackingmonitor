"""Robust per-test trend forecasts. Run: ./venv/bin/python -m pytest tests/test_trend_forecast.py"""

import random
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.utils.change_detection import METRICS
from app.utils.trend_forecast import build_per_test_trends, forecast_series, theil_sen

ACUITY = METRICS['visual_acuity']


def test_needs_min_sessions_and_span():
    assert forecast_series([0, 7, 14, 21, 28], [0.1] * 5, ACUITY)['status'] == 'insufficient_data'
    assert forecast_series([0, 1, 2, 3, 4, 5], [0.1] * 6, ACUITY)['status'] == 'insufficient_data'
    assert forecast_series([0, 7, 14, 21, 28, 35], [0.1] * 6, ACUITY)['status'] == 'ok'


def test_horizon_capped_at_half_span():
    fc = forecast_series([0, 10, 20, 30, 40, 50], [0.1] * 6, ACUITY)
    assert fc['horizon_days'] == 25
    assert max(p['days_ahead'] for p in fc['forecast']) == 25
    long = forecast_series([0, 60, 120, 180, 240, 300], [0.1] * 6, ACUITY)
    assert long['horizon_days'] == 90


def test_one_outlier_does_not_swing_theil_sen():
    x = [0, 7, 14, 21, 28, 35, 42]
    y = [0.10, 0.10, 0.12, 0.10, 0.60, 0.10, 0.12]
    assert abs(theil_sen(x, y)['slope']) < 0.002


def test_interval_never_narrower_than_retest_noise():
    fc = forecast_series([0, 7, 14, 21, 28, 35], [0.1] * 6, ACUITY)
    p = fc['forecast'][0]
    assert p['upper'] - p['lower'] >= 2 * 1.96 * ACUITY.prior_sw


def test_noise_is_not_called_a_trend():
    rng = random.Random(11)
    called = 0
    for _ in range(300):
        x = sorted(rng.uniform(0, 120) for _ in range(8))
        y = [0.1 + rng.gauss(0, 0.06) for _ in x]
        called += forecast_series(x, y, ACUITY).get('verdict') not in (None, 'no_reliable_trend')
    assert called / 300 < 0.05


def test_real_worsening_is_detected():
    x = [0, 15, 30, 45, 60, 75, 90, 105]
    y = [0.0 + 0.004 * d for d in x]
    assert forecast_series(x, y, ACUITY)['verdict'] == 'worsening'


def test_per_test_grouping_uses_latest_method_only():
    t0 = datetime(2026, 1, 1)
    mk = lambda d, v, ver: SimpleNamespace(
        test_type='visual_acuity', score=50, created_at=t0 + timedelta(days=d),
        test_details={'method_version': ver, 'right_eye': {'logMAR': v}, 'left_eye': {'logMAR': v}},
    )
    rows = [mk(0, 0.5, None), mk(1, 0.5, None)] + [mk(10 + 7 * i, 0.1, 2) for i in range(6)]
    out = build_per_test_trends(rows)
    assert out[0]['method_version'] == 2 and out[0]['n_sessions'] == 6
    assert out[0]['unit'] == 'logMAR'
    assert out[0]['series'][0]['forecast']['status'] == 'ok'
