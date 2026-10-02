"""
Validation study: which app metric is compared with which clinical reference,
how app sessions are exported, and how the analysis is assembled.
Protocol: docs/validation/PROTOCOL.md.

Data files (long format, one value per row unless noted):
  app results   participant_id, measure, eye, session, test_id, taken_at, value, flags
  reference     participant_id, measure, eye, value, measured_at, examiner, correction, notes
  participants  one row per participant (age group, consent/assent, test order, withdrawal)
  sessions      one row per attempted app test per study visit (completion, failure reason,
                correction worn, device, browser, OS, camera, ambient light)
`eye` is right / left for monocular measures and both for binocular ones.

Comparison types:
  agreement   same quantity on both methods → Bland–Altman + ICC(A,1)
  convergent  related but different quantities (qCSF grating vs Pelli–Robson letters)
              → correlation only; Bland–Altman between different quantities is meaningless
  none        no reference; repeatability only
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

from app.utils.agreement import (
    bland_altman,
    cluster_bootstrap_ci,
    correlation,
    icc,
    icc_band,
    repeatability,
    wilson_ci,
)
from app.utils.change_detection import METRICS

EYES = ('right', 'left')
APP_COLUMNS = ['participant_id', 'measure', 'eye', 'session', 'test_id', 'taken_at', 'value', 'flags']
REFERENCE_COLUMNS = ['participant_id', 'measure', 'eye', 'value', 'measured_at', 'examiner', 'correction', 'notes']
PARTICIPANT_COLUMNS = [
    'participant_id', 'email', 'enrolled_at', 'age_years', 'age_group', 'consent_type', 'consent_version',
    'consent_date', 'assent_obtained', 'test_order', 'device_stratum', 'habitual_correction', 'ocular_history',
    'withdrawn_at', 'withdrawal_reason', 'retain_until',
]
SESSION_COLUMNS = [
    'participant_id', 'visit', 'test_type', 'started_at', 'status', 'failure_reason', 'correction',
    'device_class', 'device_model', 'screen_diagonal_in', 'pixel_density_ppi', 'browser', 'os', 'camera',
    'ambient_lux', 'notes',
]

SESSION_STATUSES = ('completed', 'calibration_failed', 'unreliable', 'abandoned', 'technical_failure', 'not_attempted')
DEVICE_CLASSES = ('phone', 'tablet', 'computer')
AGE_GROUPS = ('adult', 'paediatric')
CORRECTIONS = ('unaided', 'glasses', 'contacts')

# Pre-specified protocol rules (change only before unblinding; record changes in the protocol).
MAX_REFERENCE_GAP_HOURS = 24
RETEST_MIN_DAYS, RETEST_MAX_DAYS = 1, 7
SUBGROUP_MIN_N = 10
BOOTSTRAP_N = 2000


def _num(x: Any) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _when(value: Any) -> Tuple[Optional[datetime], bool]:
    """(datetime, has_time). Date-only strings compare by calendar day."""
    if isinstance(value, datetime):
        return value.replace(tzinfo=None), True
    s = str(value or '').strip()
    if not s:
        return None, False
    try:
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
    except ValueError:
        return None, False
    return dt.replace(tzinfo=None), ('T' in s or ' ' in s)


def _clean(value: Any) -> str:
    return str(value or '').strip().lower()


Extracted = Dict[str, Tuple[Optional[float], List[str]]]


def _acuity(details: Dict[str, Any]) -> Extracted:
    out: Extracted = {}
    for eye in EYES:
        r = details.get(f'{eye}_eye') or {}
        out[eye] = (_num(r.get('logMAR')), ['at_chart_floor'] if r.get('at_chart_floor') else [])
    return out


def _contrast_at(cpd: str) -> Callable[[Dict[str, Any]], Extracted]:
    def extract(details):
        eyes = details.get('eyes') or {}
        return {eye: (_num(((eyes.get(eye) or {}).get('log_cs_at_cpd') or {}).get(cpd)), []) for eye in EYES if eye in eyes}
    return extract


def _aulcsf(details: Dict[str, Any]) -> Extracted:
    eyes = details.get('eyes') or {}
    return {eye: (_num((eyes.get(eye) or {}).get('aulcsf')), []) for eye in EYES if eye in eyes}


def _glare(details: Dict[str, Any]) -> Extracted:
    flags = [f for f in ('ceiling_no_glare', 'ceiling_glare', 'low_confidence') if details.get(f)]
    return {'both': (_num(details.get('delta_logcs')), flags)}


def _npc(details: Dict[str, Any]) -> Extracted:
    flags = [f for f in ('low_confidence', 'receded_on_repeat') if details.get(f)]
    if details.get('break_detected') is False:
        flags.append('no_break')
    if details.get('compared_approaches') and details.get('agreeing_approaches', 0) < details['compared_approaches']:
        flags.append('reported_camera_disagree')
    return {'both': (_num(details.get('npc_cm')), flags)}


def _colour_axis(axis: str) -> Callable[[Dict[str, Any]], Extracted]:
    def extract(details):
        out: Extracted = {}
        for eye, r in (details.get('eyes') or {}).items():
            a = ((r or {}).get('axes') or {}).get(axis) or {}
            units = _num(a.get('threshold_units'))
            if units and units > 0:
                out[eye] = (math.log10(units), ['beyond_screen_gamut'] if a.get('beyond_screen_gamut') else [])
        return out
    return extract


@dataclass(frozen=True)
class Measure:
    name: str
    test_type: str
    method_version: int
    unit: str
    extract: Callable[[Dict[str, Any]], Extracted]
    reference: Optional[str] = None
    comparison: Optional[str] = None  # 'agreement' | 'convergent' | None (repeatability only)
    # Pre-specified acceptance targets (see protocol); None = reported without a target.
    bias_target: Optional[float] = None
    loa_target: Optional[float] = None
    icc_target: Optional[float] = None
    r_target: Optional[float] = None
    cor_target: Optional[float] = None
    # Flags that exclude a session from the analysis (e.g. results pinned at a test limit).
    exclude_flags: Tuple[str, ...] = ()

    @property
    def prior_sw(self) -> Optional[float]:
        spec = METRICS.get(self.test_type)
        return spec.prior_sw if spec else None


MEASURES: Dict[str, Measure] = {m.name: m for m in [
    Measure(
        'acuity_logmar', 'visual_acuity', 2, 'logMAR', _acuity,
        reference='ETDRS chart at 4 m, letter-by-letter logMAR, habitual correction',
        comparison='agreement',
        bias_target=0.05, loa_target=0.15, icc_target=0.75, cor_target=0.15,
        exclude_flags=('at_chart_floor',),
    ),
    Measure(
        'contrast_logcs_1cpd', 'contrast_sensitivity', 2, 'logCS', _contrast_at('1'),
        reference='Pelli–Robson letter chart at 1 m (letters, not a 1 c/deg grating)',
        comparison='convergent',
        r_target=0.50, cor_target=0.30,
    ),
    Measure('contrast_aulcsf', 'contrast_sensitivity', 2, 'AULCSF', _aulcsf, cor_target=0.20),
    Measure(
        'npc_break_cm', 'near_point_convergence', 2, 'cm', _npc,
        reference='RAF rule push-up, break point, mean of 3 trials',
        comparison='agreement',
        loa_target=4.0, icc_target=0.75, cor_target=4.0,
        exclude_flags=('no_break',),
    ),
    Measure('glare_delta_logcs', 'cataract_glare', 2, 'Δ logCS', _glare, exclude_flags=('ceiling_no_glare',)),
    Measure('colour_protan_log10', 'color_vision', 2, 'log₁₀ threshold', _colour_axis('protan'), exclude_flags=('beyond_screen_gamut',)),
    Measure('colour_deutan_log10', 'color_vision', 2, 'log₁₀ threshold', _colour_axis('deutan'), exclude_flags=('beyond_screen_gamut',)),
    Measure('colour_tritan_log10', 'color_vision', 2, 'log₁₀ threshold', _colour_axis('tritan'), exclude_flags=('beyond_screen_gamut',)),
]}


def app_rows(participant_id: str, tests: Iterable[Any]) -> List[Dict[str, Any]]:
    """
    One participant's app sessions → long-format rows. `tests` need .id, .test_type,
    .test_details, .created_at and .data_quality_flag. Sessions are numbered per
    measure and eye in time order, counting only values that were produced.
    """
    rows: List[Dict[str, Any]] = []
    counters: Dict[Tuple[str, str], int] = {}
    for t in sorted(tests, key=lambda t: t.created_at):
        if getattr(t, 'data_quality_flag', None):
            continue
        details = t.test_details or {}
        for m in MEASURES.values():
            if m.test_type != t.test_type or details.get('method_version') != m.method_version:
                continue
            for eye, (value, flags) in m.extract(details).items():
                if value is None:
                    continue
                key = (m.name, eye)
                counters[key] = counters.get(key, 0) + 1
                rows.append({
                    'participant_id': participant_id,
                    'measure': m.name,
                    'eye': eye,
                    'session': counters[key],
                    'test_id': t.id,
                    'taken_at': t.created_at.isoformat(timespec='seconds'),
                    'value': round(value, 4),
                    'flags': ';'.join(flags),
                })
    return rows


def session_draft_rows(participant_id: str, tests: Iterable[Any]) -> List[Dict[str, Any]]:
    """
    Draft sessions.csv rows from stored app tests, including rows flagged unreliable, so they
    are recorded rather than silently dropped. Study staff fill in visit, correction, browser,
    OS, camera, lux, and add attempts that never reached the server (calibration failures, abandons).
    """
    device = {'desktop': 'computer', 'laptop': 'computer'}
    test_types = {m.test_type for m in MEASURES.values()}
    rows = []
    for t in sorted(tests, key=lambda t: t.created_at):
        if t.test_type not in test_types:
            continue
        flag = getattr(t, 'data_quality_flag', None)
        dev = _clean(getattr(t, 'device_type', None))
        rows.append({
            **{c: '' for c in SESSION_COLUMNS},
            'participant_id': participant_id,
            'test_type': t.test_type,
            'started_at': t.created_at.isoformat(timespec='seconds'),
            'status': 'unreliable' if flag else 'completed',
            'failure_reason': flag or '',
            'device_class': device.get(dev, dev),
        })
    return rows


def _flags(row: Dict[str, Any]) -> set:
    return set(filter(None, str(row.get('flags') or '').split(';')))


def _usable(row: Dict[str, Any], measure: Measure) -> bool:
    return _num(row.get('value')) is not None and not _flags(row) & set(measure.exclude_flags)


def _pick_eye(eyes: Sequence[str], policy: str) -> List[str]:
    """One eye per participant keeps observations independent (right eye unless missing)."""
    if 'both' in eyes:
        return ['both']
    if policy == 'all':
        return [e for e in EYES if e in eyes]
    return ['right'] if 'right' in eyes else [e for e in EYES if e in eyes][:1]


def _bump(counter: Optional[Dict[str, int]], key: str) -> None:
    if counter is not None:
        counter[key] = counter.get(key, 0) + 1


def _gap_ok(app_at: Any, ref_at: Any) -> Optional[bool]:
    a, a_time = _when(app_at)
    r, r_time = _when(ref_at)
    if a is None or r is None:
        return None
    if a_time and r_time:
        return abs((a - r).total_seconds()) <= MAX_REFERENCE_GAP_HOURS * 3600
    return abs((a.date() - r.date()).days) <= MAX_REFERENCE_GAP_HOURS // 24


SessionIndex = Dict[Tuple[str, int, str], Dict[str, Any]]


def index_sessions(sessions: Optional[Sequence[Dict[str, Any]]]) -> SessionIndex:
    out: SessionIndex = {}
    for s in sessions or []:
        try:
            visit = int(s.get('visit') or 0)
        except ValueError:
            continue
        out[(str(s.get('participant_id') or '').strip(), visit, _clean(s.get('test_type')))] = s
    return out


def pair_with_reference(
    app: Sequence[Dict[str, Any]],
    reference: Sequence[Dict[str, Any]],
    measure: Measure,
    eye_policy: str = 'one',
    sessions: Optional[SessionIndex] = None,
    exclusions: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    App session 1 (first usable session) against the reference value, per participant.
    Pre-specified exclusions, counted in `exclusions`:
      time_gap             app and reference more than MAX_REFERENCE_GAP_HOURS apart
      correction_mismatch  different correction (unaided / glasses / contacts) for the two methods
    """
    first: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in sorted(app, key=lambda r: int(r['session'])):
        if r['measure'] == measure.name and _usable(r, measure):
            first.setdefault((r['participant_id'], r['eye']), r)
    ref = {
        (r['participant_id'], r['eye']): r
        for r in reference
        if r['measure'] == measure.name and _num(r.get('value')) is not None
    }
    pairs = []
    for pid in sorted({p for p, _ in first} & {p for p, _ in ref}):
        eyes = [e for (p, e) in first if p == pid and (p, e) in ref]
        for eye in _pick_eye(eyes, eye_policy):
            a, r = first[(pid, eye)], ref[(pid, eye)]
            gap = _gap_ok(a.get('taken_at'), r.get('measured_at'))
            if gap is False:
                _bump(exclusions, 'time_gap')
                continue
            if gap is None:
                _bump(exclusions, 'time_gap_unknown')
            session = (sessions or {}).get((pid, 1, measure.test_type)) or {}
            app_corr, ref_corr = _clean(session.get('correction')), _clean(r.get('correction'))
            if app_corr and ref_corr and app_corr != ref_corr:
                _bump(exclusions, 'correction_mismatch')
                continue
            if not (app_corr and ref_corr):
                _bump(exclusions, 'correction_unknown')
            pairs.append({
                'participant_id': pid, 'eye': eye, 'app': _num(a['value']), 'reference': _num(r['value']),
                'device_class': _clean(session.get('device_class')) or None,
            })
    return pairs


def pair_test_retest(
    app: Sequence[Dict[str, Any]],
    measure: Measure,
    eye_policy: str = 'one',
    sessions: Optional[SessionIndex] = None,
    exclusions: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """First two usable app sessions per participant and eye, RETEST_MIN_DAYS–RETEST_MAX_DAYS apart."""
    by_key: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for r in sorted(app, key=lambda r: int(r['session'])):
        if r['measure'] == measure.name and _usable(r, measure):
            by_key.setdefault((r['participant_id'], r['eye']), []).append(r)
    pairs = []
    for pid in sorted({p for p, _ in by_key}):
        eyes = [e for (p, e) in by_key if p == pid and len(by_key[(p, e)]) >= 2]
        for eye in _pick_eye(eyes, eye_policy):
            s1, s2 = by_key[(pid, eye)][:2]
            t1, _ = _when(s1.get('taken_at'))
            t2, _ = _when(s2.get('taken_at'))
            if t1 and t2:
                days = (t2 - t1).total_seconds() / 86400
                if not (RETEST_MIN_DAYS - 0.5 <= days <= RETEST_MAX_DAYS + 0.5):
                    _bump(exclusions, 'retest_window')
                    continue
            session = (sessions or {}).get((pid, 1, measure.test_type)) or {}
            pairs.append({
                'participant_id': pid, 'eye': eye, 'first': _num(s1['value']), 'second': _num(s2['value']),
                'device_class': _clean(session.get('device_class')) or None,
            })
    return pairs


def _check(value: Optional[float], target: Optional[float], higher_is_better: bool = False) -> Optional[bool]:
    if value is None or target is None:
        return None
    return value >= target if higher_is_better else value <= target


def _clusters(pairs: Sequence[Dict[str, Any]]) -> Dict[str, list]:
    out: Dict[str, list] = {}
    for p in pairs:
        out.setdefault(p['participant_id'], []).append(p)
    return out


def _agreement(m: Measure, pairs: List[Dict[str, Any]], eye_policy: str) -> Dict[str, Any]:
    ba = bland_altman([p['app'] for p in pairs], [p['reference'] for p in pairs]) if len(pairs) >= 3 else {'n': len(pairs)}
    ic = icc([[p['app'], p['reference']] for p in pairs]) if len(pairs) >= 3 else {'n': len(pairs)}
    icc_a = ic.get('icc_a_1') or {}
    out = {
        'n': len(pairs),
        'bland_altman': ba,
        'icc': ic,
        'icc_band_lower_ci': icc_band((icc_a.get('ci') or [None])[0]),
        'targets': {'bias': m.bias_target, 'loa_half_width': m.loa_target, 'icc_a_1_lower_ci': m.icc_target},
        'pass': {
            'bias': _check(abs(ba['bias']) if 'bias' in ba else None, m.bias_target),
            'loa_half_width': _check(ba.get('loa_half_width'), m.loa_target),
            'icc_a_1_lower_ci': _check((icc_a.get('ci') or [None])[0], m.icc_target, higher_is_better=True),
        },
        'pairs': pairs,
    }
    if eye_policy == 'all' and len(pairs) >= 3:
        def loa(sign):
            def stat(obs):
                d = np.array([o['app'] - o['reference'] for o in obs])
                if sign == 0:
                    return float(d.mean())
                return float(d.mean() + sign * 1.96 * d.std(ddof=1)) if len(d) > 2 else None
            return stat

        clusters = _clusters(pairs)
        out['cluster_bootstrap'] = {
            'bias_ci': cluster_bootstrap_ci(clusters, loa(0), BOOTSTRAP_N),
            'loa_lower_ci': cluster_bootstrap_ci(clusters, loa(-1), BOOTSTRAP_N),
            'loa_upper_ci': cluster_bootstrap_ci(clusters, loa(1), BOOTSTRAP_N),
        }
    return out


def _convergent(m: Measure, pairs: List[Dict[str, Any]], eye_policy: str) -> Dict[str, Any]:
    corr = correlation([p['app'] for p in pairs], [p['reference'] for p in pairs])
    out = {
        'n': len(pairs),
        'correlation': corr,
        'targets': {'pearson_r_lower_ci': m.r_target},
        'pass': {'pearson_r_lower_ci': _check((corr.get('pearson_ci') or [None])[0], m.r_target, higher_is_better=True)},
        'pairs': pairs,
    }
    if eye_policy == 'all' and len(pairs) >= 4:
        def r_of(obs):
            x, y = [o['app'] for o in obs], [o['reference'] for o in obs]
            return float(np.corrcoef(x, y)[0, 1]) if len(obs) > 3 and np.ptp(x) > 0 and np.ptp(y) > 0 else None
        out['cluster_bootstrap'] = {'pearson_ci': cluster_bootstrap_ci(_clusters(pairs), r_of, BOOTSTRAP_N)}
    return out


def _subgroups(m: Measure, ref_pairs: List[Dict[str, Any]], rt_pairs: List[Dict[str, Any]]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for cls in DEVICE_CLASSES:
        rp = [p for p in ref_pairs if p.get('device_class') == cls]
        tp = [p for p in rt_pairs if p.get('device_class') == cls]
        if len(rp) < SUBGROUP_MIN_N and len(tp) < SUBGROUP_MIN_N:
            continue
        entry: Dict[str, Any] = {'n_reference': len(rp), 'n_retest': len(tp)}
        if m.comparison == 'agreement' and len(rp) >= SUBGROUP_MIN_N:
            ba = bland_altman([p['app'] for p in rp], [p['reference'] for p in rp])
            entry.update({'bias': ba.get('bias'), 'loa': ba.get('loa')})
        if m.comparison == 'convergent' and len(rp) >= SUBGROUP_MIN_N:
            entry['pearson_r'] = correlation([p['app'] for p in rp], [p['reference'] for p in rp]).get('pearson_r')
        if len(tp) >= SUBGROUP_MIN_N:
            rep = repeatability([p['first'] for p in tp], [p['second'] for p in tp])
            entry.update({'sw': rep.get('sw'), 'cor': rep.get('cor')})
        out[cls] = entry
    return out


def _analyse_population(
    app, reference, eye_policy: str, sessions: Optional[SessionIndex], selected: Sequence[Measure],
) -> Dict[str, Any]:
    measures: Dict[str, Any] = {}
    for m in selected:
        produced = [r for r in app if r['measure'] == m.name]
        at_limit = sum(1 for r in produced if _flags(r) & set(m.exclude_flags))
        exclusions: Dict[str, int] = {'at_test_limit': at_limit} if at_limit else {}
        entry: Dict[str, Any] = {
            'unit': m.unit, 'reference': m.reference, 'test_type': m.test_type, 'comparison': m.comparison,
        }
        ref_pairs: List[Dict[str, Any]] = []
        if m.comparison:
            ref_pairs = pair_with_reference(app, reference, m, eye_policy, sessions, exclusions)
            entry['agreement' if m.comparison == 'agreement' else 'convergent'] = (
                _agreement(m, ref_pairs, eye_policy) if m.comparison == 'agreement' else _convergent(m, ref_pairs, eye_policy)
            )

        rt = pair_test_retest(app, m, eye_policy, sessions, exclusions)
        rep = repeatability([p['first'] for p in rt], [p['second'] for p in rt]) if rt else {'n': 0}
        entry['repeatability'] = {
            **rep,
            'cor_target': m.cor_target,
            'pass_cor': _check(rep.get('cor'), m.cor_target),
            'prior_sw_in_change_detection': m.prior_sw,
            'pairs': rt,
        }
        entry['exclusions'] = exclusions
        if sessions:
            entry['device_subgroups'] = _subgroups(m, ref_pairs, rt)
        measures[m.name] = entry
    return measures


def completion_summary(sessions: Sequence[Dict[str, Any]], participant_ids: Optional[set] = None) -> Dict[str, Any]:
    """
    Testability endpoint: share of attempted app tests that produced a usable result.
    Calibration failures, unreliable runs and abandoned sessions count as attempts that failed.
    """
    by_type: Dict[str, Dict[str, Any]] = {}
    for s in sessions:
        pid = str(s.get('participant_id') or '').strip()
        if participant_ids is not None and pid not in participant_ids:
            continue
        status = _clean(s.get('status')) or 'unknown'
        if status == 'not_attempted':
            continue
        t = by_type.setdefault(_clean(s.get('test_type')), {'attempted': 0, 'completed': 0, 'failures': {}, 'by_device': {}})
        t['attempted'] += 1
        dev = t['by_device'].setdefault(_clean(s.get('device_class')) or 'unknown', {'attempted': 0, 'completed': 0})
        dev['attempted'] += 1
        if status == 'completed':
            t['completed'] += 1
            dev['completed'] += 1
        else:
            reason = status if not s.get('failure_reason') else f'{status}: {_clean(s.get("failure_reason"))}'
            t['failures'][reason] = t['failures'].get(reason, 0) + 1
    for t in by_type.values():
        t['rate'] = t['completed'] / t['attempted'] if t['attempted'] else None
        t['rate_ci'] = wilson_ci(t['completed'], t['attempted'])
    return by_type


def analyse(
    app: Sequence[Dict[str, Any]],
    reference: Sequence[Dict[str, Any]],
    eye_policy: str = 'one',
    sessions: Optional[Sequence[Dict[str, Any]]] = None,
    participants: Optional[Sequence[Dict[str, Any]]] = None,
    measures: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """
    Primary population: adults. Paediatric participants are analysed separately and never
    pooled with adults. Withdrawn participants are removed from every analysis and counted.
    Without a participants file, everyone is analysed as one population.

    `measures` restricts the analysis (and the testability table) to those measure names,
    for a staged study such as acuity first. Default: every measure in MEASURES.
    """
    if measures:
        unknown = sorted(set(measures) - set(MEASURES))
        if unknown:
            raise ValueError(f'Unknown measures: {", ".join(unknown)}')
        selected = [MEASURES[name] for name in measures]
    else:
        selected = list(MEASURES.values())
    test_types = {m.test_type for m in selected}
    if sessions:
        sessions = [s for s in sessions if _clean(s.get('test_type')) in test_types]
    s_index = index_sessions(sessions) if sessions else None
    results: Dict[str, Any] = {'eye_policy': eye_policy, 'measures_selected': [m.name for m in selected], 'rules': {
        'max_reference_gap_hours': MAX_REFERENCE_GAP_HOURS,
        'retest_window_days': [RETEST_MIN_DAYS, RETEST_MAX_DAYS],
        'subgroup_min_n': SUBGROUP_MIN_N,
    }}

    groups: Dict[str, Optional[set]] = {'adult': None}
    if participants:
        withdrawn = {p['participant_id'] for p in participants if str(p.get('withdrawn_at') or '').strip()}
        by_group: Dict[str, set] = {g: set() for g in AGE_GROUPS}
        unassigned = set()
        for p in participants:
            pid = p['participant_id']
            if pid in withdrawn:
                continue
            g = _clean(p.get('age_group'))
            (by_group[g] if g in by_group else unassigned).add(pid)
        groups = {g: ids for g, ids in by_group.items() if ids}
        results['population'] = {
            'enrolled': len(participants),
            'withdrawn': len(withdrawn),
            **{g: len(ids) for g, ids in by_group.items()},
            'age_group_missing': len(unassigned),
        }
    else:
        results['population'] = {'note': 'No participants file: analysed as a single population.'}

    for group, ids in groups.items():
        keep = (lambda r: True) if ids is None else (lambda r, ids=ids: r['participant_id'] in ids)
        measures = _analyse_population(
            [r for r in app if keep(r)], [r for r in reference if keep(r)], eye_policy, s_index, selected,
        )
        completion = completion_summary(sessions, ids) if sessions else None
        if group == 'adult':
            results['measures'] = measures
            results['completion'] = completion
        else:
            results[group] = {'measures': measures, 'completion': completion}
    results.setdefault('measures', {})
    return results


def _fmt(v: Optional[float], d: int = 2) -> str:
    return '—' if v is None else f'{v:.{d}f}'


def _ci(ci: Optional[Sequence[float]], d: int = 2) -> str:
    return '—' if not ci else f'[{ci[0]:.{d}f}, {ci[1]:.{d}f}]'


def _mark(ok: Optional[bool]) -> str:
    return '' if ok is None else (' ✓' if ok else ' ✗')


def _measure_tables(measures: Dict[str, Any], eye_policy: str) -> List[str]:
    has_agreement = any(e.get('agreement') for e in measures.values())
    has_convergent = any(e.get('convergent') for e in measures.values())
    lines = [] if not has_agreement else [
        '### Agreement with the clinical reference (same quantity)',
        '',
        'Differences are app − reference. LoA = bias ± 1.96·SD of differences. ICC(A,1) = two-way random, '
        'absolute agreement; bands (Koo & Li 2016) are applied to the lower 95% CI bound. ✓ / ✗ = pre-specified target met / missed.',
        '',
        '| Measure | Reference | n | Bias [95% CI] | 95% LoA | LoA half-width '
        '| Proportional bias (slope, p) | ICC(A,1) [95% CI] | ICC(C,1) |',
        '|---|---|---|---|---|---|---|---|---|',
    ]
    for name, e in measures.items():
        a = e.get('agreement')
        if not a:
            continue
        ba, ic = a['bland_altman'], a['icc']
        prop = ba.get('proportional_bias') or {}
        icc_a, icc_c = ic.get('icc_a_1') or {}, ic.get('icc_c_1') or {}
        lines.append(
            f'| {name} ({e["unit"]}) | {e["reference"]} | {a["n"]} '
            f'| {_fmt(ba.get("bias"))} {_ci(ba.get("bias_ci"))}{_mark(a["pass"]["bias"])} '
            f'| {_ci(ba.get("loa"))} '
            f'| {_fmt(ba.get("loa_half_width"))}{_mark(a["pass"]["loa_half_width"])} '
            f'| {_fmt(prop.get("slope"))}, p={_fmt(prop.get("p_value"), 3)} '
            f'| {_fmt(icc_a.get("value"))} {_ci(icc_a.get("ci"))}{_mark(a["pass"]["icc_a_1_lower_ci"])} '
            f'| {_fmt(icc_c.get("value"))} |'
        )
        cb = a.get('cluster_bootstrap')
        if cb:
            lines.append(
                f'| ↳ participant-cluster bootstrap | | | {_ci(cb.get("bias_ci"))} '
                f'| lower {_ci(cb.get("loa_lower_ci"))}, upper {_ci(cb.get("loa_upper_ci"))} | | | | |'
            )
    lines += [] if not has_convergent else [
        '',
        '### Convergent validity (related but different quantities)',
        '',
        'The qCSF value at 1 c/deg is a sine-wave grating threshold; Pelli–Robson is a letter-chart threshold. '
        'They measure related but different things, so no Bland–Altman, LoA or ICC is computed: those would '
        'mix a real difference in the quantities with measurement error. Only the strength of association is reported.',
        '',
        '| Measure | Reference | n | Pearson r [95% CI] | Spearman ρ [95% CI] |',
        '|---|---|---|---|---|',
    ]
    for name, e in measures.items():
        c = e.get('convergent')
        if not c:
            continue
        corr = c['correlation']
        cb = (c.get('cluster_bootstrap') or {}).get('pearson_ci')
        lines.append(
            f'| {name} ({e["unit"]}) | {e["reference"]} | {c["n"]} '
            f'| {_fmt(corr.get("pearson_r"))} {_ci(corr.get("pearson_ci"))}{_mark(c["pass"]["pearson_r_lower_ci"])}'
            f'{f" (cluster bootstrap {_ci(cb)})" if cb else ""} '
            f'| {_fmt(corr.get("spearman_rho"))} {_ci(corr.get("spearman_ci"))} |'
        )
    lines += [
        '',
        '### Test–retest repeatability of the app',
        '',
        's_w = within-subject SD = √(Σd²/2n); CoR = 1.96·√2·s_w (95% of retest differences fall within ±CoR). '
        'For qCSF (contrast_logcs_1cpd, contrast_aulcsf) repeatability is the primary evaluation. '
        'The last column is the s_w prior used by reliable-change detection; if the measured s_w is larger, '
        'update `METRICS` in `app/utils/change_detection.py`.',
        '',
        '| Measure | n | Mean change [95% CI] | s_w | CoR | ICC(A,1) [95% CI] | Prior s_w |',
        '|---|---|---|---|---|---|---|',
    ]
    for name, e in measures.items():
        r = e['repeatability']
        icc_a = (r.get('icc') or {}).get('icc_a_1') or {}
        lines.append(
            f'| {name} ({e["unit"]}) | {r.get("n", 0)} | {_fmt(r.get("mean_change"))} {_ci(r.get("mean_change_ci"))} '
            f'| {_fmt(r.get("sw"), 3)} | {_fmt(r.get("cor"))}{_mark(r.get("pass_cor"))} '
            f'| {_fmt(icc_a.get("value"))} {_ci(icc_a.get("ci"))} | {_fmt(r.get("prior_sw_in_change_detection"), 3)} |'
        )
    lines += ['', '### Exclusions (pre-specified, counted rather than silently dropped)', '',
              '| Measure | At test limit | Time gap | Gap unknown | Correction mismatch | Correction unknown | Retest window |',
              '|---|---|---|---|---|---|---|']
    for name, e in measures.items():
        x = e.get('exclusions') or {}
        lines.append(
            f'| {name} | {x.get("at_test_limit", 0)} | {x.get("time_gap", 0)} | {x.get("time_gap_unknown", 0)} '
            f'| {x.get("correction_mismatch", 0)} | {x.get("correction_unknown", 0)} | {x.get("retest_window", 0)} |'
        )
    subgroup_rows = [
        (name, cls, s) for name, e in measures.items() for cls, s in (e.get('device_subgroups') or {}).items()
    ]
    if subgroup_rows:
        lines += ['', f'### Device classes (shown when a class has ≥ {SUBGROUP_MIN_N} pairs)', '',
                  '| Measure | Device class | n (reference) | Bias | LoA | Pearson r | n (retest) | s_w | CoR |',
                  '|---|---|---|---|---|---|---|---|---|']
        for name, cls, s in subgroup_rows:
            lines.append(
                f'| {name} | {cls} | {s["n_reference"]} | {_fmt(s.get("bias"))} | {_ci(s.get("loa"))} '
                f'| {_fmt(s.get("pearson_r"))} | {s["n_retest"]} | {_fmt(s.get("sw"), 3)} | {_fmt(s.get("cor"))} |'
            )
    if eye_policy == 'all':
        lines += ['', 'Both eyes included: CIs marked “participant-cluster bootstrap” resample participants, '
                  'because two eyes of one person are correlated. Treat the unadjusted CIs as too narrow.']
    return lines


def _completion_table(completion: Optional[Dict[str, Any]]) -> List[str]:
    if not completion:
        return ['No sessions file supplied: completion rate not computed.']
    lines = ['| App test | Attempted | Completed | Completion rate [95% CI] | Failures |', '|---|---|---|---|---|']
    for test_type, t in sorted(completion.items()):
        failures = ', '.join(f'{k} ({v})' for k, v in sorted(t['failures'].items())) or '—'
        lines.append(
            f'| {test_type} | {t["attempted"]} | {t["completed"]} | {_fmt(t["rate"])} {_ci(t["rate_ci"])} | {failures} |'
        )
    return lines


def report_markdown(results: Dict[str, Any], generated_at: str, plots: Dict[str, str]) -> str:
    rules = results.get('rules') or {}
    pop = results.get('population') or {}
    lines = [
        '# Validation study results',
        '',
        f'Generated {generated_at}. Eye policy: `{results["eye_policy"]}` '
        '(`one` = right eye per participant unless missing; binocular tests use both eyes together).',
        '',
        f'Rules: reference and app session 1 within {rules.get("max_reference_gap_hours", "—")} h; same correction for both '
        f'methods; retest {"–".join(str(d) for d in rules.get("retest_window_days", []))} days after session 1.',
        '',
    ]
    selected = results.get('measures_selected') or []
    if selected and len(selected) < len(MEASURES):
        lines += [f'Measures analysed (staged study): {", ".join(f"`{m}`" for m in selected)}. '
                  'Other measures were not part of this analysis.', '']
    lines += [
        '## Population',
        '',
    ]
    if 'note' in pop:
        lines.append(pop['note'])
    else:
        lines.append(
            f'Enrolled {pop.get("enrolled", 0)}; withdrawn {pop.get("withdrawn", 0)} (removed from all analyses); '
            f'adult {pop.get("adult", 0)}; paediatric {pop.get("paediatric", 0)}; '
            f'age group missing {pop.get("age_group_missing", 0)}.'
        )
    lines += ['', '## Testability (completion rate), adults', '']
    lines += _completion_table(results.get('completion'))
    lines += ['', '## Adults (primary)', '']
    lines += _measure_tables(results['measures'], results['eye_policy'])
    paed = results.get('paediatric')
    if paed:
        lines += ['', '## Paediatric (analysed separately, never pooled with adults)', '', '### Testability', '']
        lines += _completion_table(paed.get('completion'))
        lines += ['']
        lines += _measure_tables(paed['measures'], results['eye_policy'])
    if plots:
        lines += ['', '## Plots', '']
        for title, path in plots.items():
            lines += [f'### {title}', '', f'![{title}]({path})', '']
    lines += [
        '',
        '## Notes',
        '',
        '- Check the normality p-value of the differences in `results.json`; if differences are clearly non-normal '
        'or widen with the mean (proportional bias), report LoA on a transformed scale or as a regression-based LoA.',
        '- Sessions at a test limit (chart floor, glare ceiling, beyond screen gamut, no NPC break) are excluded per protocol '
        'and counted in the exclusions table. Failed and unreliable sessions are counted in the testability table.',
    ]
    return '\n'.join(lines) + '\n'


def plot_bland_altman(x_mean, diffs, ba: Dict[str, Any], title: str, unit: str, path: str) -> None:
    import matplotlib

    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6, 4.2), dpi=130)
    ax.scatter(x_mean, diffs, s=18, color='#1f4e79', alpha=0.75, edgecolors='none')
    lo, hi = ba['loa']
    for y, ci, label, style in (
        (ba['bias'], ba['bias_ci'], f'bias {ba["bias"]:.2f}', '-'),
        (lo, ba['loa_lower_ci'], f'−1.96 SD {lo:.2f}', '--'),
        (hi, ba['loa_upper_ci'], f'+1.96 SD {hi:.2f}', '--'),
    ):
        colour = '#b22222' if style == '--' else '#333'
        ax.axhline(y, color=colour, linestyle=style, linewidth=1)
        ax.axhspan(ci[0], ci[1], color=colour, alpha=0.08)
        ax.text(1.01, y, label, transform=ax.get_yaxis_transform(), va='center', fontsize=8, color=colour)
    ax.axhline(0, color='#999', linewidth=0.6)
    ax.set_xlabel(f'Mean of the two measurements ({unit})')
    ax.set_ylabel(f'Difference ({unit})')
    ax.set_title(f'{title} (n = {ba["n"]})', fontsize=10)
    fig.savefig(path, bbox_inches='tight')
    plt.close(fig)


def plot_scatter(x, y, corr: Dict[str, Any], title: str, x_label: str, y_label: str, path: str) -> None:
    """Convergent validity: app vs reference with no identity line, since the quantities differ."""
    import matplotlib

    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(5.2, 4.4), dpi=130)
    ax.scatter(x, y, s=18, color='#1f4e79', alpha=0.75, edgecolors='none')
    if len(x) >= 2 and np.ptp(x) > 0:
        slope, intercept = np.polyfit(x, y, 1)
        xs = np.linspace(min(x), max(x), 50)
        ax.plot(xs, slope * xs + intercept, color='#b22222', linewidth=1)
    ax.set_xlabel(x_label)
    ax.set_ylabel(y_label)
    r = corr.get('pearson_r')
    ax.set_title(f'{title} (n = {corr.get("n", len(x))}, r = {_fmt(r)})', fontsize=10)
    fig.savefig(path, bbox_inches='tight')
    plt.close(fig)
