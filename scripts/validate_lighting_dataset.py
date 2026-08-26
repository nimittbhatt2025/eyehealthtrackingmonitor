#!/usr/bin/env python3
"""
Milestone 5 — evaluate lighting algorithm vs human_decision labels.

Primary framing (matches M5 doc): positive class = human not_usable.
  TP = algo extreme  & human not_usable  (correct block)
  FN = algo normal   & human not_usable  (missed bad image — must sum to n_not_usable)
  FP = algo extreme  & human usable      (wrong block — false rejection)
  TN = algo normal   & human usable

Sanity: TP + FN == n_not_usable,  FP + TN == n_usable,  all cells sum to n.

Usage:
  ./eyevio/venv/bin/python3.12 scripts/validate_lighting_dataset.py --split validation
  ./eyevio/venv/bin/python3.12 scripts/validate_lighting_dataset.py --split validation --rescore-v2

Re-scoring with --rescore-v2 is EXPLORATORY on frozen metrics — not official v2 validation.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Callable, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO_ROOT / 'data' / 'lighting_validation'
EYEVIO_ROOT = REPO_ROOT / 'eyevio'


def load_rows(csv_path: Path) -> List[dict]:
    with csv_path.open('r', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def human_usable(row: dict) -> bool:
    return row.get('human_decision') == 'usable'


def human_not_usable(row: dict) -> bool:
    return row.get('human_decision') == 'not_usable'


def algo_extreme_from_row(row: dict) -> bool:
    return row.get('lighting_status') == 'extreme_problem'


def algo_extreme_v2_from_metrics(row: dict) -> bool:
    """Recompute v2 decision from stored ROI metrics (exploratory only)."""
    if str(EYEVIO_ROOT) not in sys.path:
        sys.path.insert(0, str(EYEVIO_ROOT))
    from app.ai_models.capture_quality import evaluate_lighting_v2

    left = {
        'mean': float(row['left_eye_mean']),
        'under_ratio': float(row.get('eye_under_ratio_max') or row['under_ratio'] or 0),
        'over_ratio': float(row['over_ratio'] or 0),
    }
    right = {
        'mean': float(row['right_eye_mean']),
        'under_ratio': float(row.get('eye_under_ratio_max') or row['under_ratio'] or 0),
        'over_ratio': float(row['over_ratio'] or 0),
    }
    forehead = {
        'mean': float(row['forehead_mean']),
        'under_ratio': float(row.get('forehead_under_ratio') or row['under_ratio'] or 0),
        'over_ratio': float(row['over_ratio'] or 0),
    }
    issues, _ = evaluate_lighting_v2(left, right, forehead)
    return len(issues) > 0


def confusion_gate(
    labeled: List[dict],
    algo_extreme_fn: Callable[[dict], bool],
) -> Dict[str, int]:
    """
    Gate framing: positive = human not_usable (algo should block).
    """
    tp = fp = fn = tn = 0
    for r in labeled:
        algo_block = algo_extreme_fn(r)
        if algo_block and human_not_usable(r):
            tp += 1
        elif algo_block and human_usable(r):
            fp += 1
        elif not algo_block and human_not_usable(r):
            fn += 1
        else:
            tn += 1
    return {'tp': tp, 'fp': fp, 'fn': fn, 'tn': tn}


def verify_confusion(cm: Dict[str, int], n_usable: int, n_not_usable: int) -> None:
    total = cm['tp'] + cm['fp'] + cm['fn'] + cm['tn']
    n = n_usable + n_not_usable
    if total != n:
        raise ValueError(f'Cell sum {total} != labeled n {n}')
    if cm['tp'] + cm['fn'] != n_not_usable:
        raise ValueError(
            f'TP+FN={cm["tp"] + cm["fn"]} != n_not_usable={n_not_usable} '
            f'(FN must be missed not_usable rows only)'
        )
    if cm['fp'] + cm['tn'] != n_usable:
        raise ValueError(
            f'FP+TN={cm["fp"] + cm["tn"]} != n_usable={n_usable} '
            f'(FP must be wrongly-blocked usable rows only)'
        )


def metrics_gate(cm: Dict[str, int]) -> Dict[str, Optional[float]]:
    tp, fp, fn, tn = cm['tp'], cm['fp'], cm['fn'], cm['tn']
    total = tp + fp + fn + tn
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    specificity = tn / (tn + fp) if (tn + fp) else None
    fpr = fp / (fp + tn) if (fp + tn) else None
    fnr = fn / (fn + tp) if (fn + tp) else None
    accuracy = (tp + tn) / total if total else None
    f1 = (2 * precision * recall / (precision + recall)) if precision and recall and (precision + recall) else None
    return {
        'accuracy': accuracy,
        'precision': precision,
        'recall': recall,
        'specificity': specificity,
        'fpr': fpr,
        'fnr': fnr,
        'f1': f1,
    }


def print_confusion_gate(cm: Dict[str, int]) -> None:
    print('\nConfusion matrix — gate framing (positive = human not_usable):')
    print('                         HUMAN')
    print('                    usable   not_usable')
    print(f'  ALGO normal (pass)   {cm["tn"]:4d}       {cm["fn"]:4d}   <- FN = missed bad')
    print(f'  ALGO extreme (block) {cm["fp"]:4d}       {cm["tp"]:4d}   <- FP = wrong block')
    print(f'  Check: TP+FN={cm["tp"] + cm["fn"]} (not_usable)  FP+TN={cm["fp"] + cm["tn"]} (usable)')


def print_metrics(title: str, m: Dict[str, Optional[float]]) -> None:
    print(f'\n{title}')
    for key in ('accuracy', 'precision', 'recall', 'specificity', 'fpr', 'fnr', 'f1'):
        val = m[key]
        print(f'  {key:12s}: {val:.3f}' if val is not None else f'  {key:12s}: n/a')


def algo_issues_v2(row: dict) -> str:
    if str(EYEVIO_ROOT) not in sys.path:
        sys.path.insert(0, str(EYEVIO_ROOT))
    from app.ai_models.capture_quality import evaluate_lighting_v2

    left = {
        'mean': float(row['left_eye_mean']),
        'under_ratio': float(row.get('eye_under_ratio_max') or row['under_ratio'] or 0),
        'over_ratio': float(row['over_ratio'] or 0),
    }
    right = {
        'mean': float(row['right_eye_mean']),
        'under_ratio': float(row.get('eye_under_ratio_max') or row['under_ratio'] or 0),
        'over_ratio': float(row['over_ratio'] or 0),
    }
    forehead = {
        'mean': float(row['forehead_mean']),
        'under_ratio': float(row.get('forehead_under_ratio') or row['under_ratio'] or 0),
        'over_ratio': float(row['over_ratio'] or 0),
    }
    issues, _ = evaluate_lighting_v2(left, right, forehead)
    return '; '.join(issues)


def failure_breakdown_gate(
    labeled: List[dict],
    algo_extreme_fn: Callable[[dict], bool],
    issue_fn: Optional[Callable[[dict], str]] = None,
) -> None:
    fps = [r for r in labeled if algo_extreme_fn(r) and human_usable(r)]
    fns = [r for r in labeled if not algo_extreme_fn(r) and human_not_usable(r)]

    print(f'\nFalse positives (algo blocked, human usable): {len(fps)}')
    fp_issues: Dict[str, int] = defaultdict(int)
    for r in fps:
        raw = issue_fn(r) if issue_fn else (r.get('algorithm_issues') or '')
        for iss in raw.split('; '):
            if iss:
                fp_issues[iss] += 1
    for k, v in sorted(fp_issues.items(), key=lambda x: -x[1]):
        print(f'  {v:3d}  {k}')

    print(f'\nFalse negatives (algo passed, human not_usable): {len(fns)}')
    fn_reasons: Dict[str, int] = defaultdict(int)
    for r in fns:
        fn_reasons[r.get('reason') or '(none)'] += 1
    for k, v in sorted(fn_reasons.items(), key=lambda x: -x[1]):
        print(f'  {v:3d}  {k}')


def by_condition_gate(labeled: List[dict], algo_extreme_fn: Callable[[dict], bool]) -> None:
    groups: Dict[str, List[dict]] = defaultdict(list)
    for r in labeled:
        groups[r.get('condition_category') or '(none)'].append(r)
    print('\nBy condition_category (gate metrics):')
    for cat in sorted(groups):
        sub = groups[cat]
        n_nu = sum(1 for r in sub if human_not_usable(r))
        cm = confusion_gate(sub, algo_extreme_fn)
        m = metrics_gate(cm)
        prec = f'{m["precision"]:.3f}' if m['precision'] is not None else 'n/a'
        rec = f'{m["recall"]:.3f}' if m['recall'] is not None else 'n/a'
        print(f'  {cat}: n={len(sub)} not_usable={n_nu}  precision={prec}  recall={rec}')


def run_evaluation(
    labeled: List[dict],
    algo_extreme_fn: Callable[[dict], bool],
    title: str,
    issue_fn: Optional[Callable[[dict], str]] = None,
) -> None:
    n_usable = sum(1 for r in labeled if human_usable(r))
    n_not_usable = len(labeled) - n_usable
    cm = confusion_gate(labeled, algo_extreme_fn)
    verify_confusion(cm, n_usable, n_not_usable)
    print_confusion_gate(cm)
    print_metrics(title, metrics_gate(cm))
    by_condition_gate(labeled, algo_extreme_fn)
    failure_breakdown_gate(labeled, algo_extreme_fn, issue_fn=issue_fn)


def main() -> int:
    parser = argparse.ArgumentParser(description='Milestone 5 lighting validation metrics')
    parser.add_argument('--split', choices=('dev', 'validation'))
    parser.add_argument('--csv', type=str, default='')
    parser.add_argument(
        '--rescore-v2',
        action='store_true',
        help='Exploratory: recompute algo decision with v2 logic from stored metrics',
    )
    args = parser.parse_args()

    if args.csv:
        csv_path = Path(args.csv).expanduser()
    elif args.split:
        csv_path = DATA_ROOT / args.split / 'lighting_dataset.csv'
    else:
        parser.error('Provide --split or --csv')
        return 1

    if not csv_path.exists():
        print(f'Not found: {csv_path}')
        return 1

    rows = load_rows(csv_path)
    labeled = [r for r in rows if r.get('human_decision') in ('usable', 'not_usable')]
    if not labeled:
        print('No labeled rows.')
        return 1

    snap_versions = {
        json.loads(r['threshold_snapshot']).get('algorithm_version', 1)
        for r in labeled if r.get('threshold_snapshot')
    }
    n_usable = sum(1 for r in labeled if human_usable(r))
    n_not_usable = len(labeled) - n_usable

    print(f'Dataset: {csv_path}')
    print(f'Labeled n={len(labeled)}  usable={n_usable}  not_usable={n_not_usable}')
    print(f'Frozen snapshot algorithm_version(s): {sorted(snap_versions)}')

    if args.rescore_v2:
        print('\n*** EXPLORATORY v2 re-score on frozen metrics — NOT official validation ***')
        run_evaluation(
            labeled,
            algo_extreme_v2_from_metrics,
            'V2 exploratory metrics (gate framing)',
            issue_fn=algo_issues_v2,
        )
    else:
        run_evaluation(labeled, algo_extreme_from_row, 'Frozen CSV metrics (gate framing)')

    print('\nNote: precision/recall here measure detecting human not_usable (capture block).')
    print('FN = missed bad images (max n_not_usable). FP = usable images wrongly blocked.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
