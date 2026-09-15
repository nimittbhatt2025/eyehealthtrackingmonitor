#!/usr/bin/env python3
"""
Build train.csv / val.csv / test.csv for sclera ordinal training.

Sources (any mix):
  1. Graded annotation CSV from export_photo_analysis (column sclera_redness_grade_0_to_4)
  2. Weak labels from data/external_redness/{normal,conjunctivitis,other}/

Grade mapping for weak labels (wellness proxy — re-label clinically when possible):
  normal          → 0
  other           → 1
  conjunctivitis  → 3

Usage (repo root):
  ./eyevio/venv/bin/python scripts/build_sclera_train_split.py \\
    --graded data/redness_validation/export_*/annotations.csv \\
    --external data/external_redness \\
    --images-root data \\
    --out-dir .

Writes train.csv val.csv test.csv with columns: image_id, sclera_redness_grade_0_to_4
Images stay where they are; dataset_loader indexes under --images-root recursively.
"""

from __future__ import annotations

import argparse
import csv
import random
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
WEAK_GRADE = {
    'normal': 0,
    'other': 1,
    'conjunctivitis': 3,
}


def _rows_from_graded(csv_path: Path) -> list[dict]:
    rows: list[dict] = []
    with csv_path.open(newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            grade_raw = (row.get('sclera_redness_grade_0_to_4') or '').strip()
            if grade_raw == '' or grade_raw == '4':
                # 4 = cannot grade
                continue
            try:
                grade = int(float(grade_raw))
            except ValueError:
                continue
            if grade < 0 or grade > 3:
                continue
            image_id = (
                row.get('image_id')
                or row.get('filename')
                or row.get('file')
                or row.get('path')
                or ''
            ).strip()
            if not image_id:
                continue
            rows.append({
                'image_id': Path(image_id).name,
                'sclera_redness_grade_0_to_4': grade,
                'source': 'graded',
            })
    return rows


def _rows_from_external(root: Path) -> list[dict]:
    rows: list[dict] = []
    if not root.is_dir():
        return rows
    for label, grade in WEAK_GRADE.items():
        folder = root / label
        if not folder.is_dir():
            continue
        for path in sorted(folder.rglob('*')):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                rows.append({
                    'image_id': path.name,
                    'sclera_redness_grade_0_to_4': grade,
                    'source': f'weak:{label}',
                })
    return rows


def _split(rows: list[dict], seed: int, ratios: tuple[float, float, float]) -> dict[str, list[dict]]:
    rng = random.Random(seed)
    by_grade: dict[int, list[dict]] = {}
    for r in rows:
        by_grade.setdefault(int(r['sclera_redness_grade_0_to_4']), []).append(r)

    train, val, test = [], [], []
    for grade, group in sorted(by_grade.items()):
        rng.shuffle(group)
        n = len(group)
        n_train = max(1, int(n * ratios[0])) if n >= 3 else n
        n_val = max(1, int(n * ratios[1])) if n >= 3 else 0
        if n_train + n_val >= n and n >= 3:
            n_val = max(0, n - n_train - 1)
        n_test = n - n_train - n_val
        train.extend(group[:n_train])
        val.extend(group[n_train:n_train + n_val])
        test.extend(group[n_train + n_val:])
        print(f'  grade {grade}: {n} → train {n_train} / val {n_val} / test {n_test}')

    rng.shuffle(train)
    rng.shuffle(val)
    rng.shuffle(test)
    return {'train': train, 'val': val, 'test': test}


def _write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['image_id', 'sclera_redness_grade_0_to_4'])
        writer.writeheader()
        for r in rows:
            writer.writerow({
                'image_id': r['image_id'],
                'sclera_redness_grade_0_to_4': r['sclera_redness_grade_0_to_4'],
            })


def main() -> int:
    parser = argparse.ArgumentParser(description='Build sclera ordinal train/val/test CSVs')
    parser.add_argument('--graded', nargs='*', default=[], help='Graded annotation CSV path(s)')
    parser.add_argument('--external', type=Path, default=None, help='external_redness root')
    parser.add_argument('--images-root', type=Path, default=REPO_ROOT / 'data')
    parser.add_argument('--out-dir', type=Path, default=REPO_ROOT)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--ratios', type=float, nargs=3, default=(0.7, 0.15, 0.15))
    args = parser.parse_args()

    rows: list[dict] = []
    for g in args.graded:
        path = Path(g).expanduser().resolve()
        if not path.is_file():
            print(f'Skip missing graded CSV: {path}')
            continue
        part = _rows_from_graded(path)
        print(f'Graded {path.name}: {len(part)} usable rows')
        rows.extend(part)

    if args.external:
        ext = args.external.expanduser().resolve()
        part = _rows_from_external(ext)
        print(f'External weak labels ({ext}): {len(part)} rows')
        rows.extend(part)

    # Dedupe by image_id (prefer graded over weak)
    preferred: dict[str, dict] = {}
    for r in rows:
        key = r['image_id']
        if key not in preferred or r['source'] == 'graded':
            preferred[key] = r
    unique = list(preferred.values())
    print(f'Total unique labeled images: {len(unique)}')
    if len(unique) < 6:
        print('Need at least ~6 labeled images to split. Ingest/export first.', file=sys.stderr)
        return 1

    print('Stratified split by grade:')
    splits = _split(unique, args.seed, tuple(args.ratios))
    out_dir = args.out_dir.resolve()
    for name, part in splits.items():
        out = out_dir / f'{name}.csv'
        _write_csv(out, part)
        print(f'Wrote {out} ({len(part)} rows)')

    print('\nNext:')
    print(f'  Ensure images are under {args.images_root.resolve()} (dataset_loader BASE_DIR=./data)')
    print('  ./eyevio/venv/bin/python train_bounded_ordinal.py')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
