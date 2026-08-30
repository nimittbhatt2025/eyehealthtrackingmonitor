#!/usr/bin/env python3
"""Batch-score external eye photos for cross-person validation (no browser)."""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'eyevio'))

import cv2

from app.ai_models.capture_quality import assess_anatomical_lighting, build_capture_quality_summary
from app.ai_models.dry_eye_analysis import analyze_dry_eye_frame


def load_image(path: Path) -> 'cv2.Mat':
    img = cv2.imread(str(path))
    if img is None:
        raise ValueError(f'Could not read image: {path}')
    return img


def analyze_file(path: Path, condition: str) -> dict:
    frame = load_image(path)
    lighting = assess_anatomical_lighting(frame, None)
    capture_quality = build_capture_quality_summary(lighting)
    dry = analyze_dry_eye_frame(frame, condition_type=condition)

    ml = dry.get('ml_redness') or {}
    return {
        'file': path.name,
        'path': str(path),
        'condition_type': condition,
        'face_detected': bool(dry.get('face_detected')),
        'health_score': dry.get('score'),
        'sclera_redness': dry.get('sclera_redness'),
        'tear_film_quality': dry.get('tear_film_quality'),
        'surface_irregularity': dry.get('surface_irregularity'),
        'lighting_status': lighting.get('status'),
        'capture_quality_grade': capture_quality.get('grade'),
        'capture_quality_score': capture_quality.get('score'),
        'ml_available': bool(ml.get('available')),
        'ml_redness_score': ml.get('score'),
        'ml_grade': ml.get('discretized_grade'),
        'risk_level': dry.get('risk_level'),
        'findings': '; '.join(dry.get('findings') or []),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Batch validate eye photos from a folder.')
    parser.add_argument('folder', type=Path, help='Directory of JPG/PNG eye selfies')
    parser.add_argument('--condition', default='general', help='Condition type for analysis context')
    parser.add_argument('--output', type=Path, default=None, help='CSV output path (default: folder/results.csv)')
    args = parser.parse_args()

    folder = args.folder.expanduser().resolve()
    if not folder.is_dir():
        raise SystemExit(f'Not a directory: {folder}')

    patterns = ('*.jpg', '*.jpeg', '*.png', '*.webp')
    files = sorted({p for pat in patterns for p in folder.glob(pat)})
    if not files:
        raise SystemExit(f'No images found in {folder}')

    out_path = args.output or (folder / 'eye_photo_batch_results.csv')
    rows = []
    for path in files:
        try:
            rows.append(analyze_file(path, args.condition))
            print(f'OK  {path.name}')
        except Exception as exc:
            rows.append({
                'file': path.name,
                'path': str(path),
                'error': str(exc),
            })
            print(f'ERR {path.name}: {exc}')

    fieldnames = sorted({k for row in rows for k in row.keys()})
    with out_path.open('w', newline='', encoding='utf-8') as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'\nWrote {len(rows)} rows to {out_path}')


if __name__ == '__main__':
    main()
