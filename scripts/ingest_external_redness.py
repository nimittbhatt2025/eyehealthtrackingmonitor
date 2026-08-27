#!/usr/bin/env python3
"""
Stage public ocular/redness datasets for EyeVio validation export.

Copy conjunctivitis / normal eye crops into data/external_redness/ with folder
names the export script recognizes for stratification.

Recommended public sources (download manually — no API keys required in-repo):
  1. Kaggle: "Eye Diseases Classification" (conjunctivitis + normal classes)
  2. Mendeley: "Eye Conjunctiva Segmentation Dataset" (547 ocular crops)
  3. MOBIUS / sclera segmentation benchmarks (vessel-visible sclera crops)

Usage (from repo root):
  # After unzipping Kaggle dataset:
  ./eyevio/venv/bin/python3.12 scripts/ingest_external_redness.py import \\
    --from ~/Downloads/eye_diseases/Conjunctivitis \\
    --label conjunctivitis --limit 60

  ./eyevio/venv/bin/python3.12 scripts/ingest_external_redness.py import \\
    --from ~/Downloads/eye_diseases/Normal \\
    --label normal --limit 30

  ./eyevio/venv/bin/python3.12 scripts/ingest_external_redness.py status

  # Hybrid stratified export (webcam + external):
  ./eyevio/venv/bin/python3.12 scripts/export_photo_analysis.py export \\
    --input data/lighting_validation/validation/images data/external_redness \\
    --output data/redness_validation/export_20260826_v2 \\
    --stratified --target 150 --pool-limit 400
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / 'data' / 'external_redness'
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}


def _iter_images(directory: Path) -> list[Path]:
    return sorted(
        p for p in directory.rglob('*')
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def cmd_import(args: argparse.Namespace) -> int:
    src = Path(args.from_dir).expanduser().resolve()
    out_root = Path(args.output).resolve()
    label = args.label.strip().lower()
    if label not in ('conjunctivitis', 'normal', 'other'):
        print('--label must be conjunctivitis | normal | other')
        return 1
    if not src.is_dir():
        print(f'Source not found: {src}')
        return 1

    dest_dir = out_root / label
    dest_dir.mkdir(parents=True, exist_ok=True)

    files = _iter_images(src)
    if args.limit and args.limit > 0:
        files = files[: args.limit]

    copied = 0
    for src_file in files:
        digest = hashlib.md5(src_file.read_bytes()).hexdigest()[:10]
        dest = dest_dir / f'EXT-{label[:4]}-{digest}{src_file.suffix.lower()}'
        if not dest.exists():
            shutil.copy2(src_file, dest)
        copied += 1

    print(f'Copied {copied} image(s) → {dest_dir}')
    print('\nNext:')
    print('  ./eyevio/venv/bin/python3.12 scripts/export_photo_analysis.py export \\')
    print('    --input data/lighting_validation/validation/images data/external_redness \\')
    print('    --output data/redness_validation/export_20260826_v2 \\')
    print('    --stratified --target 150 --pool-limit 400')
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    out_root = Path(args.output).resolve()
    if not out_root.exists():
        print(f'No staging folder yet: {out_root}')
        return 1
    for sub in sorted(out_root.iterdir()):
        if sub.is_dir():
            n = sum(1 for p in sub.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS)
            print(f'  {sub.name}: {n} images')
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Stage external redness datasets.')
    sub = parser.add_subparsers(dest='command', required=True)

    imp = sub.add_parser('import', help='Copy external eye images into data/external_redness/')
    imp.add_argument('--from', dest='from_dir', required=True, help='Downloaded dataset folder')
    imp.add_argument('--output', default=str(DEFAULT_OUTPUT))
    imp.add_argument('--label', required=True, choices=['conjunctivitis', 'normal', 'other'])
    imp.add_argument('--limit', type=int, default=0)
    imp.set_defaults(func=cmd_import)

    st = sub.add_parser('status', help='Count staged external images')
    st.add_argument('--output', default=str(DEFAULT_OUTPUT))
    st.set_defaults(func=cmd_status)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    raise SystemExit(args.func(args))


if __name__ == '__main__':
    main()
