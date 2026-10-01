"""
Per-test trend estimation and short-horizon forecasts with prediction intervals.

* One series per test type, method version and eye/axis, in the test's native
  unit (series definitions shared with change_detection).
* Theil–Sen slope (median of pairwise slopes) with its rank-based 95% CI
  (Sen 1968), so one bad session cannot swing the line.
* Residual scale from the MAD; the prediction interval is the usual linear-model
  interval with that robust scale and a Student-t quantile.
* Needs ≥ MIN_SESSIONS sessions over ≥ MIN_SPAN_DAYS; the forecast horizon is
  capped at half the observed span (and MAX_HORIZON_DAYS), never beyond.
* A trend is only called worsening/improving when the slope CI excludes 0 and
  the projected change over the horizon reaches the test's MCID.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.utils.change_detection import metric_for

MIN_SESSIONS = 6
MIN_SPAN_DAYS = 28
MAX_HORIZON_DAYS = 90

TEST_LABELS = {
    'visual_acuity': 'Clear Vision (acuity)',
    'contrast_sensitivity': 'Faint Shapes (contrast)',
    'cataract_glare': 'Glare Sensitivity',
    'color_vision': 'Colour Thresholds',
    'amsler_grid': 'Straight-Line (Amsler)',
    'peripheral_awareness': 'Side Vision Game',
    'side_vision': 'Side Vision Test',
    'dry_eye': 'Dry Eye Check',
    'red_reflex': 'Eye Glow',
    'accommodative_lag': 'Near Blur Tolerance',
    'ocular_ergonomics': 'Posture & Lighting',
    'eye_tracking': 'Eye Tracking',
}

# Two-sided 95% Student-t quantiles for small df.
_T95 = {1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23,
        12: 2.18, 15: 2.13, 20: 2.09, 30: 2.04}


def _t95(df: int) -> float:
    if df <= 0:
        return float('inf')
    for k in sorted(_T95):
        if df <= k:
            return _T95[k]
    return 1.96


def _median(xs: Sequence[float]) -> float:
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else 0.5 * (s[n // 2 - 1] + s[n // 2])


def theil_sen(x: Sequence[float], y: Sequence[float]) -> Dict[str, float]:
    n = len(x)
    slopes = sorted(
        (y[j] - y[i]) / (x[j] - x[i])
        for i in range(n) for j in range(i + 1, n) if x[j] != x[i]
    )
    if not slopes:
        raise ValueError('need distinct x values')
    slope = _median(slopes)
    intercept = _median([yi - slope * xi for xi, yi in zip(x, y)])

    # Sen's rank-based CI (normal approximation to Kendall's S, ties ignored).
    N = len(slopes)
    c = 1.96 * math.sqrt(n * (n - 1) * (2 * n + 5) / 18.0)
    lo_idx = max(0, int(math.floor((N - c) / 2.0)))
    hi_idx = min(N - 1, int(math.ceil((N + c) / 2.0)))
    return {'slope': slope, 'intercept': intercept, 'slope_lo': slopes[lo_idx], 'slope_hi': slopes[hi_idx]}


def forecast_series(
    days: Sequence[float],
    values: Sequence[float],
    spec,
    today_day: Optional[float] = None,
) -> Dict[str, Any]:
    n = len(values)
    span = (max(days) - min(days)) if n else 0
    if n < MIN_SESSIONS or span < MIN_SPAN_DAYS:
        return {
            'status': 'insufficient_data',
            'n_sessions': n,
            'span_days': round(span, 1),
            'required_sessions': MIN_SESSIONS,
            'required_span_days': MIN_SPAN_DAYS,
        }

    fit = theil_sen(days, values)
    resid = [v - (fit['intercept'] + fit['slope'] * d) for d, v in zip(days, values)]
    scale = 1.4826 * _median([abs(r - _median(resid)) for r in resid])
    scale = max(scale, spec.prior_sw)  # never tighter than the test's own retest noise
    xbar = sum(days) / n
    sxx = sum((d - xbar) ** 2 for d in days) or 1e-9
    t = _t95(n - 2)

    last = max(days)
    horizon = int(min(MAX_HORIZON_DAYS, span / 2))
    steps = sorted({h for h in (0, horizon // 3, 2 * horizon // 3, horizon) if h >= 0})

    def interval(x: float) -> Tuple[float, float, float]:
        yhat = fit['intercept'] + fit['slope'] * x
        half = t * scale * math.sqrt(1 + 1 / n + (x - xbar) ** 2 / sxx)
        return yhat, yhat - half, yhat + half

    band = []
    for h in steps:
        yhat, lo, hi = interval(last + h)
        band.append({'day': last + h, 'days_ahead': h, 'fit': yhat, 'lower': lo, 'upper': hi})

    sign = 1.0 if spec.worse == 'up' else -1.0
    projected = fit['slope'] * horizon
    ci_excludes_zero = fit['slope_lo'] > 0 or fit['slope_hi'] < 0
    if ci_excludes_zero and abs(projected) >= spec.mcid:
        verdict = 'worsening' if sign * fit['slope'] > 0 else 'improving'
    else:
        verdict = 'no_reliable_trend'

    per30 = lambda s: s * 30.0
    return {
        'status': 'ok',
        'n_sessions': n,
        'span_days': round(span, 1),
        'horizon_days': horizon,
        'slope_per_30d': per30(fit['slope']),
        'slope_per_30d_ci95': [per30(fit['slope_lo']), per30(fit['slope_hi'])],
        'residual_scale': scale,
        'verdict': verdict,
        'fitted': [{'day': d, 'fit': fit['intercept'] + fit['slope'] * d} for d in (min(days), last)],
        'forecast': band,
    }


def _rounded(obj: Any, k: int = 4) -> Any:
    if isinstance(obj, float):
        return round(obj, k)
    if isinstance(obj, list):
        return [_rounded(x, k) for x in obj]
    if isinstance(obj, dict):
        return {a: _rounded(b, k) for a, b in obj.items()}
    return obj


def build_per_test_trends(tests: Sequence[Any], with_forecast: bool = True) -> List[Dict[str, Any]]:
    """
    Group tests by type; use each type's latest method version only (older
    versions are on a different scale). Returns one entry per test type.
    """
    by_type: Dict[str, List[Any]] = defaultdict(list)
    for t in tests:
        by_type[t.test_type].append(t)

    out = []
    for test_type, rows in by_type.items():
        rows.sort(key=lambda r: r.created_at)
        latest_version = (rows[-1].test_details or {}).get('method_version')
        rows = [r for r in rows if (r.test_details or {}).get('method_version') == latest_version]
        spec = metric_for(test_type, latest_version)
        t0 = rows[0].created_at
        series_pts: Dict[str, List[Tuple[float, float, datetime]]] = defaultdict(list)
        for r in rows:
            for name, value in spec.series(r.test_details or {}, r).items():
                if value is not None:
                    series_pts[name].append(((r.created_at - t0).total_seconds() / 86400.0, value, r.created_at))

        series_out = []
        for name, pts in series_pts.items():
            entry: Dict[str, Any] = {
                'name': name,
                'points': [{'day': d, 'date': ts.isoformat(), 'value': v} for d, v, ts in pts],
            }
            if with_forecast:
                fc = forecast_series([p[0] for p in pts], [p[1] for p in pts], spec)
                if fc.get('status') == 'ok':
                    for key in ('fitted', 'forecast'):
                        for p in fc[key]:
                            p['date'] = (t0 + timedelta(days=p['day'])).isoformat()
                entry['forecast'] = fc
            series_out.append(entry)

        out.append(_rounded({
            'test_type': test_type,
            'label': TEST_LABELS.get(test_type, test_type.replace('_', ' ').title()),
            'method_version': latest_version,
            'unit': spec.unit,
            'worse_direction': spec.worse,
            'mcid': spec.mcid,
            'provisional_repeatability': spec.provisional,
            'n_sessions': len(rows),
            'series': series_out,
        }))
    out.sort(key=lambda e: -e['n_sessions'])
    return out
