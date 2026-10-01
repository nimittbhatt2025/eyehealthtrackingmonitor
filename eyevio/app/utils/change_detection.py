"""
Reliable-change decline detection for home vision checks.

Each test is tracked in its own native unit (logMAR, AULCSF, Δ logCS, …), one
series per eye/axis. A session counts as a reliable worsening when

    RCI = worsening / SE_diff > 1.96   and   worsening ≥ MCID

where worsening = (session − baseline mean), signed so that positive is worse,
and SE_diff = sqrt(s_session² + s_w² / n_baseline) (Jacobson & Truax 1991, with
the baseline mean in place of a single pre-test).

s_w (within-subject test–retest SD) is the larger of
  * a per-test prior (conservative; home acuity repeatability is roughly
    ±0.1–0.15 logMAR as a 95% coefficient of repeatability, i.e. s_w ≈ 0.05–0.07), and
  * the user's own s_w, estimated from baseline sessions with the mean squared
    successive difference (robust to slow drift), once ≥ 4 baseline sessions exist.
s_session additionally uses the session's own measurement SD when the test
reports one (QUEST / qCSF posterior SD).

A decline is *confirmed* only when the two most recent sessions both show a
reliable worsening; a single reliable worsening is reported as
"possible — retest to confirm" and never raises an alert on its own.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence

DISPLAY_INDEX_LABEL = 'Display index, not clinically validated'
# Composite 0–100 indices with no reference data behind them; these tests store no score.
RETIRED_INDEX_TESTS = frozenset({'color_vision', 'amsler_grid', 'dry_eye', 'red_reflex'})
# Never trended, alerted on, or ranked: a phone glow comparison is too setup-dependent.
NOT_TRACKED_TESTS = frozenset({'red_reflex'})

Z_RELIABLE = 1.96
BASELINE_MIN = 3
BASELINE_MAX = 5
CONFIRM_SESSIONS = 2


def _num(x: Any) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _eye_field(details: Dict[str, Any], key: str) -> Dict[str, Optional[float]]:
    eyes = details.get('eyes') or {}
    return {f'{eye} eye': _num((eyes.get(eye) or {}).get(key)) for eye in ('right', 'left', 'both') if eye in eyes}


def _acuity(details, test):
    return {f'{eye} eye': _num((details.get(f'{eye}_eye') or {}).get('logMAR')) for eye in ('right', 'left')}


def _contrast(details, test):
    return _eye_field(details, 'aulcsf')


def _contrast_sd(details, name):
    eye = name.split(' ')[0]
    return _num(((details.get('eyes') or {}).get(eye) or {}).get('aulcsf_sd'))


def _glare(details, test):
    # Screen ring and phone torch are different glare sources, so each is its own series.
    source = 'torch' if details.get('glare_mode') == 'torch' else 'screen ring'
    return {f'glare Δ logCS ({source})': _num(details.get('delta_logcs'))}


def _glare_sd(details, name):
    a, b = _num(details.get('sd_no_glare')), _num(details.get('sd_glare'))
    return math.hypot(a, b) if a is not None and b is not None else None


_EYE_ORDER = ('right', 'left', 'both')
_AXIS_ORDER = ('protan', 'deutan', 'tritan')


def _ordered(d: Dict[str, Any], canonical: Sequence[str]):
    """JSONB does not keep key order, so series order must not depend on it."""
    return sorted(d.items(), key=lambda kv: (canonical.index(kv[0]) if kv[0] in canonical else len(canonical), kv[0]))


def _colour(details, test):
    out: Dict[str, Optional[float]] = {}
    for eye, r in _ordered(details.get('eyes') or {}, _EYE_ORDER):
        if (r or {}).get('reliable') is False:
            continue
        for axis, a in _ordered((r or {}).get('axes') or {}, _AXIS_ORDER):
            a = a or {}
            units = _num(a.get('threshold_units'))
            usable = not a.get('beyond_screen_gamut') and a.get('gamut_adequate') is not False and not a.get('uncertain')
            if units and units > 0 and usable:
                out[f'{eye} {axis}'] = math.log10(units)
    return out


def _amsler(details, test):
    out: Dict[str, Optional[float]] = {}
    for eye, r in _ordered(details.get('eyes') or {}, _EYE_ORDER):
        areas = [_num((r or {}).get(k)) for k in ('standard_area_deg2', 'low_contrast_area_deg2')]
        areas = [a for a in areas if a is not None]
        out[f'{eye} eye'] = max(areas) if areas else None
    return out


def _npc(details, test):
    return {'break distance': _num(details.get('npc_cm'))}


def _near_blur(details, test):
    if details.get('status') != 'ok':
        return {}
    return {'blur threshold': _num(details.get('log10_blur_threshold'))}


def _near_blur_sd(details, name):
    sd, n = _num(details.get('within_session_log10_sd')), _num(details.get('measured_runs'))
    return sd / math.sqrt(n) if sd is not None and n else None


def _side_game(details, test):
    return {'50% hit eccentricity': _num((details.get('hit_rate_fit') or {}).get('e50Deg'))}


def _score(details, test):
    return {'display index': _num(getattr(test, 'score', None))}


@dataclass(frozen=True)
class MetricSpec:
    unit: str
    worse: str  # 'up' or 'down'
    prior_sw: float
    mcid: float
    series: Callable[[Dict[str, Any], Any], Dict[str, Optional[float]]]
    session_sd: Optional[Callable[[Dict[str, Any], str], Optional[float]]] = None
    provisional: bool = False
    source: str = ''
    version: Any = 2
    # Display indices are not clinically validated, so a change in one never raises an alert.
    alerts: bool = True
    # Only compare sessions taken on the same display as the latest one (display_id in test_details).
    same_display: bool = False


METRICS: Dict[str, MetricSpec] = {
    'visual_acuity': MetricSpec(
        'logMAR', 'up', 0.07, 0.10, _acuity,
        source='Home/digital acuity 95% CoR ≈ ±0.1–0.15 logMAR; MCID one chart line (0.1 logMAR).',
    ),
    'contrast_sensitivity': MetricSpec(
        'AULCSF', 'down', 0.10, 0.15, _contrast, _contrast_sd,
        source='qCSF posterior SD per session; prior s_w 0.10 until personal repeatability is known.',
    ),
    'cataract_glare': MetricSpec(
        'Δ logCS', 'up', 0.10, 0.15, _glare, _glare_sd,
        source='Difference of two QUEST thresholds; session SD from both staircases. Screen-ring and torch sessions are separate series.',
    ),
    'color_vision': MetricSpec(
        'log₁₀ threshold (u′v′)', 'up', 0.10, 0.15, _colour, provisional=True, same_display=True,
        source='Provisional prior (≈ ±26% threshold ratio) until personal repeatability is known; same display only.',
    ),
    'amsler_grid': MetricSpec(
        'marked area (deg²)', 'up', 3.0, 5.0, _amsler, provisional=True,
        source='Larger of the full-contrast and 5%-contrast marked areas per eye; provisional prior.',
    ),
    'near_point_convergence': MetricSpec(
        'cm', 'up', 2.0, 4.0, _npc, provisional=True,
        source='Break distance (first of reported doubling or a camera break that passed confidence checks); '
               'sessions without a break are not tracked; provisional prior (published NPC retest limits are roughly ±4 cm).',
    ),
    'accommodative_lag': MetricSpec(
        'log₁₀ blur threshold (arcmin)', 'up', 0.10, 0.15, _near_blur, _near_blur_sd, provisional=True,
        alerts=False,
        source='Within-session SD of ascending runs; provisional prior. Comfort measure, never alerted on.',
    ),
    'peripheral_awareness': MetricSpec(
        'degrees', 'down', 1.5, 3.0, _side_game, provisional=True,
        source='Provisional prior for the logistic 50%-hit eccentricity.',
    ),
}
DEFAULT_METRIC = MetricSpec(
    'display index (0–100), not clinically validated', 'down', 8.0, 15.0, _score, provisional=True,
    source='Display index; shown for orientation only and never used for alerts.',
    alerts=False,
)


def metric_for(test_type: str, method_version: Any) -> MetricSpec:
    spec = METRICS.get(test_type)
    if spec is None or method_version != spec.version:
        return DEFAULT_METRIC
    return spec


def personal_sw(values: Sequence[float]) -> Optional[float]:
    """Within-subject SD from the mean squared successive difference (von Neumann)."""
    if len(values) < 4:
        return None
    diffs = [b - a for a, b in zip(values, values[1:])]
    return math.sqrt(sum(d * d for d in diffs) / (2 * len(diffs)))


@dataclass
class SeriesResult:
    name: str
    status: str
    n_sessions: int
    baseline_mean: Optional[float] = None
    baseline_n: int = 0
    latest: Optional[float] = None
    change: Optional[float] = None
    rci: Optional[float] = None
    sw_used: Optional[float] = None
    sw_personal: Optional[float] = None
    recent_rci: List[float] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        r = lambda v, k=3: None if v is None else round(v, k)
        return {
            'series': self.name,
            'status': self.status,
            'n_sessions': self.n_sessions,
            'baseline_mean': r(self.baseline_mean),
            'baseline_n': self.baseline_n,
            'latest': r(self.latest),
            'change': r(self.change),
            'rci': r(self.rci, 2),
            'recent_rci': [round(x, 2) for x in self.recent_rci],
            'sw_used': r(self.sw_used, 4),
            'sw_personal': r(self.sw_personal, 4),
        }


def assess_series(
    name: str,
    points: Sequence[tuple],
    spec: MetricSpec,
) -> SeriesResult:
    """points: chronological (value, session_sd or None)."""
    n = len(points)
    if n < BASELINE_MIN + 1:
        return SeriesResult(name, 'insufficient_data', n)

    base_n = max(BASELINE_MIN, min(BASELINE_MAX, n - CONFIRM_SESSIONS))
    base_vals = [v for v, _ in points[:base_n]]
    base_mean = sum(base_vals) / base_n
    sw_p = personal_sw(base_vals)
    sw = max(spec.prior_sw, sw_p or 0.0)
    sign = 1.0 if spec.worse == 'up' else -1.0

    recent = list(points[base_n:])[-CONFIRM_SESSIONS:]
    rcis, flags = [], []
    for v, sd in recent:
        s_session = max(sw, sd or 0.0)
        se_diff = math.sqrt(s_session ** 2 + sw ** 2 / base_n)
        worsening = sign * (v - base_mean)
        rci = worsening / se_diff
        rcis.append(rci)
        flags.append(rci > Z_RELIABLE and worsening >= spec.mcid)

    latest = points[-1][0]
    latest_worsening = sign * (latest - base_mean)
    if len(flags) >= CONFIRM_SESSIONS and all(flags):
        status = 'confirmed_decline'
    elif flags and flags[-1]:
        status = 'possible_decline'
    elif rcis and rcis[-1] < -Z_RELIABLE and -latest_worsening >= spec.mcid:
        status = 'improved'
    else:
        status = 'stable'

    return SeriesResult(
        name, status, n,
        baseline_mean=base_mean, baseline_n=base_n, latest=latest,
        change=latest - base_mean, rci=rcis[-1] if rcis else None,
        sw_used=sw, sw_personal=sw_p, recent_rci=rcis,
    )


_STATUS_RANK = {'confirmed_decline': 3, 'possible_decline': 2, 'improved': 1, 'stable': 0, 'insufficient_data': -1}


def assess_tests(tests: Sequence[Any], test_type: Optional[str] = None, method_version: Any = None) -> Dict[str, Any]:
    """
    Assess chronological sessions of one test type and method version.
    Tests only need .score, .test_details and .created_at.
    """
    spec = metric_for(test_type or '', method_version)
    if test_type in NOT_TRACKED_TESTS:
        tests = []
    display_id = None
    if spec.same_display and tests:
        display_id = (getattr(tests[-1], 'test_details', None) or {}).get('display_id')
        tests = [t for t in tests if display_id and (getattr(t, 'test_details', None) or {}).get('display_id') == display_id]
    series: Dict[str, List[tuple]] = {}
    for t in tests:
        details = getattr(t, 'test_details', None) or {}
        for name, value in spec.series(details, t).items():
            if value is None:
                continue
            sd = spec.session_sd(details, name) if spec.session_sd else None
            series.setdefault(name, []).append((value, sd))

    results = [assess_series(name, pts, spec) for name, pts in series.items()]
    overall = max(results, key=lambda r: _STATUS_RANK[r.status]).status if results else 'insufficient_data'
    if not spec.alerts and results:
        overall = 'display_only'
    return {
        'status': overall,
        'test_type': test_type,
        'method_version': method_version,
        'unit': spec.unit,
        'worse_direction': spec.worse,
        'prior_sw': spec.prior_sw,
        'mcid': spec.mcid,
        'provisional_repeatability': spec.provisional,
        'repeatability_source': spec.source,
        'alerts_enabled': spec.alerts,
        'comparison_scope': 'same_display' if spec.same_display else 'all_devices',
        'display_id': display_id,
        'rule': 'RCI > 1.96 and change ≥ MCID on the 2 most recent sessions vs baseline mean',
        'series': [r.to_dict() for r in results],
    }


def summary_message(assessment: Dict[str, Any]) -> Optional[str]:
    status = assessment.get('status')
    flagged = [s for s in assessment.get('series', []) if s['status'] == status]
    names = ', '.join(s['series'] for s in flagged)
    unit = assessment.get('unit')
    if status == 'confirmed_decline':
        s = flagged[0]
        return (
            f'Two sessions in a row were reliably worse than your baseline ({names}: '
            f'{s["baseline_mean"]} → {s["latest"]} {unit}), beyond this test\'s normal retest variation.'
        )
    if status == 'possible_decline':
        return f'This result ({names}) is worse than your baseline beyond normal retest variation. Retest on another day to confirm.'
    return None
