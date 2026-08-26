#!/usr/bin/env python3
"""
Audit lighting_dataset.csv: verify each row's lighting_status matches its frozen
metrics + threshold_snapshot (v1 or v2 logic, no app import required).

Usage:
  ./eyevio/venv/bin/python3.12 audit_lighting_consistency.py \\
      data/lighting_validation/validation/lighting_dataset.csv
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


def _f(row: dict, key: str):
    val = row.get(key, '')
    return float(val) if val not in ('', None) else None


def row_should_be_extreme_v1(row: dict, snap: dict) -> tuple[bool, list[str]]:
    left = _f(row, 'left_eye_mean')
    right = _f(row, 'right_eye_mean')
    eye_mean = (left + right) / 2 if left is not None and right is not None else None
    lr_delta = _f(row, 'left_right_delta')
    under_ratio = _f(row, 'under_ratio')
    over_ratio = _f(row, 'over_ratio')

    issues = []
    if eye_mean is not None and eye_mean < snap.get('extreme_eye_mean_low', 40):
        issues.append('too_dark')
    if eye_mean is not None and eye_mean > snap.get('extreme_eye_mean_high', 230):
        issues.append('too_bright')
    if lr_delta is not None and lr_delta > snap.get('extreme_lr_delta', 55):
        issues.append('lr_delta')
    if under_ratio is not None and under_ratio > snap.get('extreme_under_ratio', 0.35):
        issues.append('under_ratio')
    if over_ratio is not None and over_ratio > snap.get('extreme_over_ratio', 0.15):
        issues.append('over_ratio')
    return len(issues) > 0, issues


def row_should_be_extreme_v2(row: dict, snap: dict) -> tuple[bool, list[str]]:
    left = _f(row, 'left_eye_mean')
    right = _f(row, 'right_eye_mean')
    forehead = _f(row, 'forehead_mean')
    if left is None or right is None:
        return False, []

    eye_mean = (left + right) / 2
    lr_delta = _f(row, 'left_right_delta') or abs(left - right)
    over_ratio = _f(row, 'over_ratio') or 0.0
    eye_under = _f(row, 'eye_under_ratio_max')
    if eye_under is None:
        under_ratio = _f(row, 'under_ratio')
        eye_under = under_ratio if under_ratio is not None else 0.0
    forehead_under = _f(row, 'forehead_under_ratio')
    if forehead_under is None:
        forehead_under = under_ratio if (under_ratio := _f(row, 'under_ratio')) is not None else 0.0

    dim_eye = min(left, right)
    bright_eye = max(left, right)
    eye_ratio = bright_eye / max(dim_eye, 1.0)

    issues = []
    if eye_mean < snap.get('extreme_eye_mean_low', 40):
        issues.append('too_dark')
    if eye_mean > snap.get('extreme_eye_mean_high', 230):
        issues.append('too_bright_extreme')
    if (
        eye_mean > snap.get('moderate_eye_mean_high', 115)
        and eye_mean <= snap.get('extreme_eye_mean_high', 230)
        and lr_delta <= snap.get('moderate_even_lr_delta', 22)
    ):
        issues.append('even_washout')
    if lr_delta > snap.get('extreme_lr_delta', 55):
        issues.append('lr_delta_strong')
    elif lr_delta > snap.get('glare_lr_delta', 45) and eye_ratio > snap.get('glare_eye_ratio', 1.45):
        issues.append('glare_asymmetry')
    if (
        forehead_under > snap.get('forehead_shadow_under', 0.40)
        and forehead is not None
        and forehead < snap.get('forehead_shadow_mean_max', 50)
    ):
        issues.append('forehead_shadow')
    if eye_mean < snap.get('eye_dark_mean_max', 42) and eye_under > snap.get('eye_dark_under', 0.55):
        issues.append('eye_dark_shadow')
    if over_ratio > snap.get('extreme_over_ratio', 0.15):
        issues.append('over_ratio')
    return len(issues) > 0, issues


def row_should_be_extreme(row: dict) -> tuple[bool | None, list[str]]:
    try:
        snap = json.loads(row.get('threshold_snapshot') or '{}')
    except json.JSONDecodeError:
        return None, ['<bad threshold_snapshot json>']

    version = snap.get('algorithm_version', 1)
    if version == 1 or 'extreme_under_ratio' in snap:
        return row_should_be_extreme_v1(row, snap)
    return row_should_be_extreme_v2(row, snap)


def main():
    if len(sys.argv) != 2:
        print('Usage: audit_lighting_consistency.py <path-to-lighting_dataset.csv>')
        return 1

    csv_path = Path(sys.argv[1])
    if not csv_path.exists():
        print(f'Not found: {csv_path}')
        return 1

    with csv_path.open('r', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    mismatches = []
    for row in rows:
        expected_extreme, tripped = row_should_be_extreme(row)
        if expected_extreme is None:
            mismatches.append((row, 'unparseable threshold_snapshot', tripped))
            continue
        actual_extreme = row.get('lighting_status') == 'extreme_problem'
        if expected_extreme != actual_extreme:
            mismatches.append((
                row,
                f'expected_extreme={expected_extreme} actual_status={row.get("lighting_status")}',
                tripped,
            ))

    print(f'Checked {len(rows)} rows in {csv_path}\n')
    if not mismatches:
        print('No inconsistencies found.')
        return 0

    print(f'Found {len(mismatches)} inconsistent row(s):\n')
    for row, note, tripped in mismatches:
        print(f"  sample_id: {row.get('sample_id')}  {note}  tripped={tripped}")
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
