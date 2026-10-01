"""
Agreement and repeatability statistics for the validation study.

- Bland–Altman (Bland & Altman 1986, 1999): bias, 95% limits of agreement (LoA),
  confidence intervals for both, and a regression check for proportional bias.
- ICC from a two-way ANOVA (Shrout & Fleiss 1979; McGraw & Wong 1996):
  ICC(A,1) two-way random, absolute agreement — the primary index, since a constant
  offset between app and chart is a real disagreement — and ICC(C,1) consistency,
  each with the F-based 95% CI.
- Repeatability from test–retest pairs: within-subject SD s_w = sqrt(Σd² / 2n) and
  coefficient of repeatability CoR = 1.96·√2·s_w (British Standards Institution 1979).
"""

from __future__ import annotations

import math
from typing import Any, Dict, Optional, Sequence

import numpy as np
from scipy import stats

Z95 = 1.959964


def _clean_pairs(a: Sequence[float], b: Sequence[float]):
    x = np.asarray(a, dtype=float)
    y = np.asarray(b, dtype=float)
    if x.shape != y.shape:
        raise ValueError('paired inputs must have the same length')
    keep = np.isfinite(x) & np.isfinite(y)
    return x[keep], y[keep]


def bland_altman(method: Sequence[float], reference: Sequence[float], alpha: float = 0.05) -> Dict[str, Any]:
    """Differences are method − reference; 'mean' is the average of the two."""
    x, y = _clean_pairs(method, reference)
    n = len(x)
    if n < 3:
        return {'n': n}
    d = x - y
    m = (x + y) / 2
    bias = float(d.mean())
    sd = float(d.std(ddof=1))
    t = float(stats.t.ppf(1 - alpha / 2, n - 1))
    se_bias = sd / math.sqrt(n)
    # Bland & Altman 1999, eq. for the SE of a limit: sd·sqrt(1/n + z²/(2(n−1)))
    se_loa = sd * math.sqrt(1 / n + Z95 ** 2 / (2 * (n - 1)))
    lower, upper = bias - Z95 * sd, bias + Z95 * sd

    reg = stats.linregress(m, d) if np.ptp(m) > 0 else None
    shapiro_p = float(stats.shapiro(d).pvalue) if n >= 3 and np.ptp(d) > 0 else None

    return {
        'n': n,
        'bias': bias,
        'bias_ci': [bias - t * se_bias, bias + t * se_bias],
        'sd_diff': sd,
        'loa': [lower, upper],
        'loa_lower_ci': [lower - t * se_loa, lower + t * se_loa],
        'loa_upper_ci': [upper - t * se_loa, upper + t * se_loa],
        'loa_half_width': Z95 * sd,
        'proportional_bias': None if reg is None else {
            'slope': float(reg.slope),
            'intercept': float(reg.intercept),
            'p_value': float(reg.pvalue),
        },
        'differences_normal_p': shapiro_p,
        'mean_range': [float(m.min()), float(m.max())],
    }


def _anova_two_way(data: np.ndarray):
    n, k = data.shape
    grand = data.mean()
    ss_rows = k * ((data.mean(axis=1) - grand) ** 2).sum()
    ss_cols = n * ((data.mean(axis=0) - grand) ** 2).sum()
    ss_total = ((data - grand) ** 2).sum()
    ss_err = ss_total - ss_rows - ss_cols
    msr = ss_rows / (n - 1)
    msc = ss_cols / (k - 1)
    mse = ss_err / ((n - 1) * (k - 1))
    msw = (ss_cols + ss_err) / (n * (k - 1))
    return msr, msc, mse, msw


def icc(ratings: Sequence[Sequence[float]], alpha: float = 0.05) -> Dict[str, Any]:
    """
    ratings: n subjects × k measurements (methods, sessions or raters).
    Rows with any missing value are dropped.
    """
    data = np.asarray(ratings, dtype=float)
    if data.ndim != 2 or data.shape[1] < 2:
        raise ValueError('ratings must be n × k with k ≥ 2')
    data = data[np.isfinite(data).all(axis=1)]
    n, k = data.shape
    if n < 3:
        return {'n': n, 'k': k}

    msr, msc, mse, msw = _anova_two_way(data)
    q = 1 - alpha / 2
    df_r, df_e = n - 1, (n - 1) * (k - 1)

    out: Dict[str, Any] = {'n': n, 'k': k}

    # ICC(1,1): one-way random (Shrout & Fleiss case 1); reported for completeness.
    icc1 = (msr - msw) / (msr + (k - 1) * msw)
    f1 = msr / msw
    fl = f1 / stats.f.ppf(q, df_r, n * (k - 1))
    fu = f1 * stats.f.ppf(q, n * (k - 1), df_r)
    out['icc_1_1'] = {'value': float(icc1), 'ci': [float((fl - 1) / (fl + k - 1)), float((fu - 1) / (fu + k - 1))]}

    # ICC(C,1) = Shrout & Fleiss ICC(3,1): consistency.
    if mse > 0:
        icc_c = (msr - mse) / (msr + (k - 1) * mse)
        f3 = msr / mse
        fl = f3 / stats.f.ppf(q, df_r, df_e)
        fu = f3 * stats.f.ppf(q, df_e, df_r)
        out['icc_c_1'] = {'value': float(icc_c), 'ci': [float((fl - 1) / (fl + k - 1)), float((fu - 1) / (fu + k - 1))]}

        # ICC(A,1) = Shrout & Fleiss ICC(2,1): absolute agreement; CI from McGraw & Wong 1996 (case 2A).
        icc_a = (msr - mse) / (msr + (k - 1) * mse + k * (msc - mse) / n)
        a = k * icc_a / (n * (1 - icc_a))
        b = 1 + k * icc_a * (n - 1) / (n * (1 - icc_a))
        v = (a * msc + b * mse) ** 2 / ((a * msc) ** 2 / (k - 1) + (b * mse) ** 2 / df_e)
        f_star = stats.f.ppf(q, df_r, v)
        f_star2 = stats.f.ppf(q, v, df_r)
        lower = n * (msr - f_star * mse) / (f_star * (k * msc + (k * n - k - n) * mse) + n * msr)
        upper = n * (f_star2 * msr - mse) / (k * msc + (k * n - k - n) * mse + n * f_star2 * msr)
        out['icc_a_1'] = {'value': float(icc_a), 'ci': [float(lower), float(upper)]}
    else:
        # No residual variance: measurements differ by at most a constant per column.
        out['icc_c_1'] = {'value': 1.0, 'ci': None}
        denom = msr + k * msc / n
        out['icc_a_1'] = {'value': float(msr / denom) if denom > 0 else 1.0, 'ci': None}

    return out


def icc_band(value: Optional[float]) -> Optional[str]:
    """Koo & Li (2016) bands; apply them to the CI's lower bound for a conservative read."""
    if value is None or not math.isfinite(value):
        return None
    if value < 0.5:
        return 'poor'
    if value < 0.75:
        return 'moderate'
    if value < 0.9:
        return 'good'
    return 'excellent'


def repeatability(first: Sequence[float], second: Sequence[float]) -> Dict[str, Any]:
    """Test–retest pairs from the same participant, same method."""
    x, y = _clean_pairs(first, second)
    n = len(x)
    if n < 3:
        return {'n': n}
    d = y - x
    sw = math.sqrt(float((d ** 2).sum()) / (2 * n))
    t = float(stats.t.ppf(0.975, n - 1))
    mean_diff = float(d.mean())
    sd_diff = float(d.std(ddof=1))
    return {
        'n': n,
        'mean_change': mean_diff,
        'mean_change_ci': [mean_diff - t * sd_diff / math.sqrt(n), mean_diff + t * sd_diff / math.sqrt(n)],
        'sw': sw,
        'cor': Z95 * math.sqrt(2) * sw,
        'icc': icc(np.column_stack([x, y])),
        'bland_altman': bland_altman(y, x),
    }
