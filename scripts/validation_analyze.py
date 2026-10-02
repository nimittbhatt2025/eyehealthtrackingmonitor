#!/usr/bin/env python3
"""
Validation study analysis: agreement (Bland–Altman + ICC) where app and reference
measure the same quantity, correlation for convergent validity where they do not,
test–retest repeatability, testability (completion rate), device-class subgroups,
and adult / paediatric populations reported separately.

  cd eyevio && MPLCONFIGDIR=/tmp/mpl ./venv/bin/python ../scripts/validation_analyze.py \
      --app ../data/validation/app_results.csv \
      --reference ../data/validation/reference_measurements.csv \
      --participants ../data/validation/participants.csv \
      --sessions ../data/validation/sessions.csv \
      --out ../docs/validation/results

Staged study (acuity first): add --measures acuity_logmar.

Dry run on synthetic data (output is labelled SIMULATED):
  ... validation_analyze.py --simulate 60 --out /tmp/validation_demo

Writes report.md, results.json and plots/*.png. See docs/validation/PROTOCOL.md.
"""

import argparse
import csv
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / 'eyevio'))

from app.utils.validation_study import (  # noqa: E402
    APP_COLUMNS,
    MEASURES,
    PARTICIPANT_COLUMNS,
    REFERENCE_COLUMNS,
    SESSION_COLUMNS,
    analyse,
    plot_bland_altman,
    plot_scatter,
    report_markdown,
)

# Synthetic participants: true value mean, spread, app bias, app noise, reference noise (per measure).
SIMULATION = {
    'acuity_logmar': (0.10, 0.20, 0.03, 0.06, 0.04, 'eyes'),
    'contrast_logcs_1cpd': (1.55, 0.20, -0.10, 0.10, 0.07, 'eyes'),
    'contrast_aulcsf': (1.30, 0.25, 0.0, 0.08, None, 'eyes'),
    'npc_break_cm': (7.0, 3.0, 0.8, 1.6, 1.2, 'both'),
    'glare_delta_logcs': (0.10, 0.08, 0.0, 0.08, None, 'both'),
    'colour_protan_log10': (1.6, 0.25, 0.0, 0.10, None, 'eyes'),
    'colour_deutan_log10': (1.6, 0.25, 0.0, 0.10, None, 'eyes'),
    'colour_tritan_log10': (1.8, 0.25, 0.0, 0.12, None, 'eyes'),
}
SIM_DEVICES = [('phone', 'iPhone 14', 6.1, 460), ('tablet', 'iPad 10', 10.9, 264), ('computer', 'MacBook Air', 13.6, 224)]
SIM_FAILURES = [('calibration_failed', 'card not detected'), ('unreliable', 'catch trials failed'), ('abandoned', '')]


def simulate(n: int, seed: int = 7):
    rng = random.Random(seed)
    app, ref, participants, sessions = [], [], [], []
    t0 = datetime(2026, 10, 1, 9, tzinfo=timezone.utc)
    test_types = sorted({MEASURES[name].test_type for name in SIMULATION})
    for i in range(1, n + 1):
        pid = f'P{i:03d}'
        paediatric = i % 5 == 0
        correction = rng.choice(['unaided', 'glasses', 'contacts'])
        device = SIM_DEVICES[i % len(SIM_DEVICES)]
        order = test_types[:]
        rng.shuffle(order)
        participants.append({
            'participant_id': pid, 'email': '', 'enrolled_at': (t0 + timedelta(days=i)).date().isoformat(),
            'age_years': rng.randint(8, 15) if paediatric else rng.randint(18, 75),
            'age_group': 'paediatric' if paediatric else 'adult',
            'consent_type': 'parental_permission' if paediatric else 'adult_consent', 'consent_version': 'SIM',
            'consent_date': (t0 + timedelta(days=i)).date().isoformat(), 'assent_obtained': 'yes' if paediatric else '',
            'test_order': ';'.join(order), 'device_stratum': 'phone' if device[0] == 'phone' else 'computer',
            'habitual_correction': correction, 'ocular_history': '',
            'withdrawn_at': (t0 + timedelta(days=i + 2)).date().isoformat() if i % 29 == 0 else '',
            'withdrawal_reason': 'SIM' if i % 29 == 0 else '', 'retain_until': '',
        })
        failed = {}
        for visit in (1, 2):
            for test_type in order:
                status, reason = 'completed', ''
                if rng.random() < 0.06:
                    status, reason = rng.choice(SIM_FAILURES)
                    failed[(visit, test_type)] = True
                sessions.append({
                    'participant_id': pid, 'visit': visit, 'test_type': test_type,
                    'started_at': (t0 + timedelta(days=i + (visit - 1) * 3, hours=1)).isoformat(timespec='seconds'),
                    'status': status, 'failure_reason': reason,
                    'correction': correction, 'device_class': device[0], 'device_model': device[1],
                    'screen_diagonal_in': device[2], 'pixel_density_ppi': device[3], 'browser': 'Safari 19',
                    'os': 'SIM', 'camera': 'front', 'ambient_lux': rng.randint(150, 600), 'notes': '',
                })
        for name, (mu, spread, bias, app_sd, ref_sd, kind) in SIMULATION.items():
            test_type = MEASURES[name].test_type
            for eye in (('right', 'left') if kind == 'eyes' else ('both',)):
                truth = rng.gauss(mu, spread)
                session = 0
                for visit in (1, 2):
                    if failed.get((visit, test_type)):
                        continue
                    session += 1
                    app.append({
                        'participant_id': pid, 'measure': name, 'eye': eye, 'session': session, 'test_id': '',
                        'taken_at': (t0 + timedelta(days=i + (visit - 1) * 3, hours=1)).isoformat(timespec='seconds'),
                        'value': round(truth + bias + rng.gauss(0, app_sd), 3), 'flags': '',
                    })
                if ref_sd is not None:
                    ref.append({
                        'participant_id': pid, 'measure': name, 'eye': eye,
                        'value': round(truth + rng.gauss(0, ref_sd), 3),
                        'measured_at': (t0 + timedelta(days=i)).date().isoformat(), 'examiner': 'SIM',
                        'correction': 'glasses' if i % 23 == 0 and correction != 'glasses' else correction, 'notes': '',
                    })
    return app, ref, participants, sessions


def read_csv(path):
    with open(path, newline='', encoding='utf-8') as f:
        return [r for r in csv.DictReader(f) if (r.get('participant_id') or '').strip()]


def write_csv(path, rows, columns):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        w.writerows(rows)


def _population_plots(measures, plot_dir: Path, prefix: str, label: str):
    plots = {}
    for name, e in measures.items():
        a = e.get('agreement')
        if a and a['n'] >= 3:
            pairs = a['pairs']
            path = plot_dir / f'{prefix}{name}_vs_reference.png'
            plot_bland_altman(
                [(p['app'] + p['reference']) / 2 for p in pairs], [p['app'] - p['reference'] for p in pairs],
                a['bland_altman'], f'{label}{name}: app − reference', e['unit'], str(path),
            )
            plots[f'{label}{name} — agreement with reference (Bland–Altman)'] = f'plots/{path.name}'
        c = e.get('convergent')
        if c and c['n'] >= 4:
            pairs = c['pairs']
            path = plot_dir / f'{prefix}{name}_convergent.png'
            plot_scatter(
                [p['reference'] for p in pairs], [p['app'] for p in pairs], c['correlation'],
                f'{label}{name} vs reference', f'Reference: {e["reference"]}', f'App ({e["unit"]})', str(path),
            )
            plots[f'{label}{name} — convergent validity (scatter, no Bland–Altman)'] = f'plots/{path.name}'
        r = e['repeatability']
        if r.get('n', 0) >= 3:
            pairs = r['pairs']
            path = plot_dir / f'{prefix}{name}_retest.png'
            plot_bland_altman(
                [(p['first'] + p['second']) / 2 for p in pairs], [p['second'] - p['first'] for p in pairs],
                r['bland_altman'], f'{label}{name}: retest − test', e['unit'], str(path),
            )
            plots[f'{label}{name} — test–retest'] = f'plots/{path.name}'
    return plots


def make_plots(results, out: Path):
    plot_dir = out / 'plots'
    plot_dir.mkdir(parents=True, exist_ok=True)
    plots = _population_plots(results['measures'], plot_dir, '', '')
    if results.get('paediatric'):
        plots.update(_population_plots(results['paediatric']['measures'], plot_dir, 'paed_', 'Paediatric: '))
    return plots


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--app', help='app results CSV from validation_export.py')
    p.add_argument('--reference', help='reference measurements CSV')
    p.add_argument('--participants', help='participants CSV (age group, consent, withdrawal); enables adult/paediatric split')
    p.add_argument('--sessions',
                   help='sessions CSV (completion, failures, correction, device); enables testability and device subgroups')
    p.add_argument('--out', required=True, help='output directory')
    p.add_argument('--eye-policy', choices=('one', 'all'), default='one',
                   help='one: right eye per participant (independent observations, primary); '
                        'all: both eyes with participant-cluster bootstrap CIs (sensitivity analysis)')
    p.add_argument('--measures', nargs='+', metavar='MEASURE', choices=sorted(MEASURES),
                   help='analyse only these measures (staged study, e.g. --measures acuity_logmar); default: all')
    p.add_argument('--simulate', type=int, metavar='N', help='ignore input files and use N synthetic participants')
    p.add_argument('--no-plots', action='store_true')
    args = p.parse_args(argv)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.simulate:
        app, ref, participants, sessions = simulate(args.simulate)
        write_csv(out / 'simulated_app_results.csv', app, APP_COLUMNS)
        write_csv(out / 'simulated_reference.csv', ref, REFERENCE_COLUMNS)
        write_csv(out / 'simulated_participants.csv', participants, PARTICIPANT_COLUMNS)
        write_csv(out / 'simulated_sessions.csv', sessions, SESSION_COLUMNS)
    else:
        if not args.app or not args.reference:
            p.error('--app and --reference are required unless --simulate is used')
        app, ref = read_csv(args.app), read_csv(args.reference)
        participants = read_csv(args.participants) if args.participants else None
        sessions = read_csv(args.sessions) if args.sessions else None
        if participants is None:
            print('No --participants: adults and children cannot be separated; analysing one population.', file=sys.stderr)
        if sessions is None:
            print('No --sessions: completion rate, correction check and device subgroups are skipped.', file=sys.stderr)

    unknown = sorted({r['measure'] for r in ref} - set(MEASURES))
    if unknown:
        print(f'Ignoring unknown reference measures: {", ".join(unknown)}', file=sys.stderr)

    results = analyse(app, ref, eye_policy=args.eye_policy, sessions=sessions, participants=participants,
                      measures=args.measures)
    results['simulated'] = bool(args.simulate)
    plots = {} if args.no_plots else make_plots(results, out)
    generated = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    report = report_markdown(results, generated, plots)
    if args.simulate:
        report = report.replace(
            '# Validation study results\n',
            f'# Validation study results — SIMULATED ({args.simulate} synthetic participants)\n\n'
            '> Synthetic data for checking the pipeline only. These numbers say nothing about the app.\n',
            1,
        )
    (out / 'report.md').write_text(report, encoding='utf-8')
    (out / 'results.json').write_text(json.dumps(results, indent=2, default=float), encoding='utf-8')
    print(f'Wrote {out / "report.md"}, {out / "results.json"} and {len(plots)} plots')
    return 0


if __name__ == '__main__':
    sys.exit(main())
