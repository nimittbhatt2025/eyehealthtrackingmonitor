"""
Validation study: which app metric is compared with which clinical reference,
how app sessions are exported, and how the agreement / repeatability analysis
is assembled. Protocol: docs/validation/PROTOCOL.md.

Data files (long format, one value per row):
  app results  participant_id, measure, eye, session, test_id, taken_at, value, flags
  reference    participant_id, measure, eye, value, measured_at, examiner, notes
`eye` is right / left for monocular measures and both for binocular ones.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from app.utils.agreement import bland_altman, icc, icc_band, repeatability
from app.utils.change_detection import METRICS

EYES = ('right', 'left')
APP_COLUMNS = ['participant_id', 'measure', 'eye', 'session', 'test_id', 'taken_at', 'value', 'flags']
REFERENCE_COLUMNS = ['participant_id', 'measure', 'eye', 'value', 'measured_at', 'examiner', 'notes']


def _num(x: Any) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


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
    # Pre-specified acceptance targets (see protocol); None = reported without a target.
    bias_target: Optional[float] = None
    loa_target: Optional[float] = None
    icc_target: Optional[float] = None
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
        bias_target=0.05, loa_target=0.15, icc_target=0.75, cor_target=0.15,
        exclude_flags=('at_chart_floor',),
    ),
    Measure(
        'contrast_logcs_1cpd', 'contrast_sensitivity', 2, 'logCS', _contrast_at('1'),
        reference='Pelli–Robson chart at 1 m, letter-by-letter (0.05 logCS per letter)',
        loa_target=0.30, icc_target=0.75, cor_target=0.30,
    ),
    Measure('contrast_aulcsf', 'contrast_sensitivity', 2, 'AULCSF', _aulcsf),
    Measure(
        'npc_break_cm', 'near_point_convergence', 1, 'cm', _npc,
        reference='RAF rule push-up, break point, mean of 3 trials',
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
    measure and eye in time order, counting only usable values.
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


def _usable(row: Dict[str, Any], measure: Measure) -> bool:
    flags = set(filter(None, str(row.get('flags') or '').split(';')))
    return _num(row.get('value')) is not None and not flags & set(measure.exclude_flags)


def _pick_eye(eyes: Sequence[str], policy: str) -> List[str]:
    """One eye per participant keeps observations independent (right eye unless missing)."""
    if 'both' in eyes:
        return ['both']
    if policy == 'all':
        return [e for e in EYES if e in eyes]
    return ['right'] if 'right' in eyes else [e for e in EYES if e in eyes][:1]


def pair_with_reference(
    app: Sequence[Dict[str, Any]], reference: Sequence[Dict[str, Any]], measure: Measure, eye_policy: str = 'one'
) -> List[Dict[str, Any]]:
    """App session 1 (first usable session) against the reference value, per participant."""
    first: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in sorted(app, key=lambda r: int(r['session'])):
        if r['measure'] == measure.name and _usable(r, measure):
            first.setdefault((r['participant_id'], r['eye']), r)
    ref = {
        (r['participant_id'], r['eye']): _num(r['value'])
        for r in reference
        if r['measure'] == measure.name and _num(r.get('value')) is not None
    }
    pairs = []
    for pid in sorted({p for p, _ in first} & {p for p, _ in ref}):
        eyes = [e for (p, e) in first if p == pid and (p, e) in ref]
        for eye in _pick_eye(eyes, eye_policy):
            pairs.append({'participant_id': pid, 'eye': eye, 'app': _num(first[(pid, eye)]['value']), 'reference': ref[(pid, eye)]})
    return pairs


def pair_test_retest(app: Sequence[Dict[str, Any]], measure: Measure, eye_policy: str = 'one') -> List[Dict[str, Any]]:
    """First two usable app sessions per participant and eye."""
    sessions: Dict[Tuple[str, str], List[float]] = {}
    for r in sorted(app, key=lambda r: int(r['session'])):
        if r['measure'] == measure.name and _usable(r, measure):
            sessions.setdefault((r['participant_id'], r['eye']), []).append(_num(r['value']))
    pairs = []
    for pid in sorted({p for p, _ in sessions}):
        eyes = [e for (p, e) in sessions if p == pid and len(sessions[(p, e)]) >= 2]
        for eye in _pick_eye(eyes, eye_policy):
            s = sessions[(pid, eye)]
            pairs.append({'participant_id': pid, 'eye': eye, 'first': s[0], 'second': s[1]})
    return pairs


def _check(value: Optional[float], target: Optional[float], higher_is_better: bool = False) -> Optional[bool]:
    if value is None or target is None:
        return None
    return value >= target if higher_is_better else value <= target


def analyse(
    app: Sequence[Dict[str, Any]], reference: Sequence[Dict[str, Any]], eye_policy: str = 'one'
) -> Dict[str, Any]:
    results: Dict[str, Any] = {'eye_policy': eye_policy, 'measures': {}}
    for m in MEASURES.values():
        entry: Dict[str, Any] = {'unit': m.unit, 'reference': m.reference, 'test_type': m.test_type}

        if m.reference:
            pairs = pair_with_reference(app, reference, m, eye_policy)
            ba = _bland_altman_or_n([p['app'] for p in pairs], [p['reference'] for p in pairs])
            ic = icc([[p['app'], p['reference']] for p in pairs]) if len(pairs) >= 3 else {'n': len(pairs)}
            icc_a = ic.get('icc_a_1') or {}
            entry['agreement'] = {
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

        rt = pair_test_retest(app, m, eye_policy)
        rep = repeatability([p['first'] for p in rt], [p['second'] for p in rt]) if rt else {'n': 0}
        entry['repeatability'] = {
            **rep,
            'cor_target': m.cor_target,
            'pass_cor': _check(rep.get('cor'), m.cor_target),
            'prior_sw_in_change_detection': m.prior_sw,
            'pairs': rt,
        }
        results['measures'][m.name] = entry
    return results


def _bland_altman_or_n(method: Sequence[float], reference: Sequence[float]) -> Dict[str, Any]:
    return bland_altman(method, reference) if len(method) >= 3 else {'n': len(method)}


def _fmt(v: Optional[float], d: int = 2) -> str:
    return '—' if v is None else f'{v:.{d}f}'


def _ci(ci: Optional[Sequence[float]], d: int = 2) -> str:
    return '—' if not ci else f'[{ci[0]:.{d}f}, {ci[1]:.{d}f}]'


def _mark(ok: Optional[bool]) -> str:
    return '' if ok is None else (' ✓' if ok else ' ✗')


def report_markdown(results: Dict[str, Any], generated_at: str, plots: Dict[str, str]) -> str:
    lines = [
        '# Validation study results',
        '',
        f'Generated {generated_at}. Eye policy: `{results["eye_policy"]}` '
        '(`one` = right eye per participant unless missing; binocular tests use both eyes together).',
        '',
        'Differences are app − reference. LoA = bias ± 1.96·SD of differences. ICC(A,1) = two-way random, '
        'absolute agreement; bands (Koo & Li 2016) are applied to the lower 95% CI bound. ✓ / ✗ = pre-specified target met / missed.',
        '',
        '## Agreement with the clinical reference',
        '',
        '| Measure | Reference | n | Bias [95% CI] | 95% LoA | LoA half-width '
        '| Proportional bias (slope, p) | ICC(A,1) [95% CI] | ICC(C,1) |',
        '|---|---|---|---|---|---|---|---|---|',
    ]
    for name, e in results['measures'].items():
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
    lines += [
        '',
        '## Test–retest repeatability of the app',
        '',
        's_w = within-subject SD = √(Σd²/2n); CoR = 1.96·√2·s_w (95% of retest differences fall within ±CoR). '
        'The last column is the s_w prior currently used by reliable-change decline detection; '
        'if the measured s_w is larger, update `METRICS` in `app/utils/change_detection.py`.',
        '',
        '| Measure | n | Mean change [95% CI] | s_w | CoR | ICC(A,1) [95% CI] | Prior s_w |',
        '|---|---|---|---|---|---|---|',
    ]
    for name, e in results['measures'].items():
        r = e['repeatability']
        icc_a = (r.get('icc') or {}).get('icc_a_1') or {}
        lines.append(
            f'| {name} ({e["unit"]}) | {r.get("n", 0)} | {_fmt(r.get("mean_change"))} {_ci(r.get("mean_change_ci"))} '
            f'| {_fmt(r.get("sw"), 3)} | {_fmt(r.get("cor"))}{_mark(r.get("pass_cor"))} '
            f'| {_fmt(icc_a.get("value"))} {_ci(icc_a.get("ci"))} | {_fmt(r.get("prior_sw_in_change_detection"), 3)} |'
        )
    if plots:
        lines += ['', '## Bland–Altman plots', '']
        for title, path in plots.items():
            lines += [f'### {title}', '', f'![{title}]({path})', '']
    lines += [
        '',
        '## Notes',
        '',
        '- Check the normality p-value of the differences in `results.json`; if differences are clearly non-normal '
        'or widen with the mean (proportional bias), report LoA on a transformed scale or as a regression-based LoA.',
        '- Sessions flagged at a test limit (chart floor, glare ceiling, beyond screen gamut, no NPC break) are excluded per protocol.',
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
