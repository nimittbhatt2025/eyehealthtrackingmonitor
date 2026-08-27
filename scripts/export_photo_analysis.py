#!/usr/bin/env python3
"""
Batch-export eye crops + algorithm metrics for human redness validation.

Creates a structured dataset directory for annotators:
  output/
    analysis_manifest.csv      — algorithm outputs (one row per image)
    ground_truth_template.csv  — pre-populated grading sheet (3 graders × image)
    samples/<image_id>/
      eye_left.png
      eye_right.png
      analysis.json            — lighting gate, ROI coverage, raw R-G deltas
      source.jpg               — optional copy of input frame

Usage (from repo root):
  # Hybrid stratified export (webcam + external conjunctivitis crops):
  ./eyevio/venv/bin/python3.12 scripts/export_photo_analysis.py export \\
    --input data/lighting_validation/validation/images data/external_redness \\
    --output data/redness_validation/export_20260826_v2 \\
    --stratified --target 150 --pool-limit 400

  # Simple sequential export
  ./eyevio/venv/bin/python3.12 scripts/export_photo_analysis.py export \\
    --input data/lighting_validation/dev/images \\
    --output data/redness_validation/export_20260826 \\
    --limit 200

  ./eyevio/venv/bin/python3.12 scripts/export_photo_analysis.py status \\
    --output data/redness_validation/export_20260826

  ./eyevio/venv/bin/python3.12 scripts/export_photo_analysis.py correlate \\
    --output data/redness_validation/export_20260826 \\
    --ground-truth data/redness_validation/export_20260826/ground_truth_filled.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

REPO_ROOT = Path(__file__).resolve().parents[1]
EYEVIO_ROOT = REPO_ROOT / 'eyevio'
sys.path.insert(0, str(EYEVIO_ROOT))

import cv2  # noqa: E402

from app.ai_models.dry_eye_analysis import (  # noqa: E402
    _analyze_cropped_eyes,
    _crop_eye_regions,
)

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
GRADER_IDS = ('1', '2', '3')
ALGORITHM_VERSION = 'dry_eye_v2.10_canthus_mask'

MANIFEST_COLUMNS = [
    'image_id',
    'source_filename',
    'export_path',
    'source_type',
    'external_eye_only',
    'stratum',
    'face_detected',
    'lighting_status',
    'capture_quality_grade',
    'capture_quality_usable',
    'left_redness_rg',
    'right_redness_rg',
    'avg_redness_rg',
    'left_redness_normalized',
    'right_redness_normalized',
    'left_sclera_redness_0_100',
    'right_sclera_redness_0_100',
    'avg_sclera_redness_0_100',
    'left_mask_coverage_pct',
    'right_mask_coverage_pct',
    'left_redness_reliable',
    'right_redness_reliable',
    'appearance_score',
    'findings',
    'export_error',
]

GROUND_TRUTH_COLUMNS = [
    'image_id',
    'grader_id',
    'sclera_redness_grade_0_to_4',
    'is_usable_quality_flag',
    'notes',
]

STRATUM_QUOTAS = {
    'normal_baseline': 0.40,
    'mild_elevated': 0.30,
    'lighting_artifacts': 0.20,
    'demographics': 0.10,
}


def _quota_targets(total: int) -> Dict[str, int]:
    """Largest-remainder allocation so quotas sum to total."""
    raw = {k: total * share for k, share in STRATUM_QUOTAS.items()}
    floors = {k: int(v) for k, v in raw.items()}
    remainder = total - sum(floors.values())
    for key, _ in sorted(raw.items(), key=lambda item: item[1] - floors[item[0]], reverse=True):
        if remainder <= 0:
            break
        floors[key] += 1
        remainder -= 1
    return floors


def _iter_images_from_inputs(inputs: Sequence[Path], recursive: bool) -> List[Path]:
    seen: set[str] = set()
    files: List[Path] = []
    for input_path in inputs:
        for path in _iter_images(input_path, recursive):
            key = str(path.resolve())
            if key not in seen:
                seen.add(key)
                files.append(path)
    return sorted(files)


def _infer_source_type(source_path: Path) -> str:
    parts = {p.lower() for p in source_path.parts}
    name = source_path.name.lower()
    if 'external_redness' in parts or 'external' in parts:
        if 'conjunctivitis' in parts or 'red' in parts or 'inflam' in name:
            return 'external_conjunctivitis'
        if 'normal' in parts:
            return 'external_normal'
        return 'external_eye_crop'
    if 'lighting_validation' in parts:
        return 'live_webcam'
    return 'unknown'


def _looks_like_eye_crop(frame) -> bool:
    h, w = frame.shape[:2]
    if min(h, w) < 64:
        return False
    aspect = max(h, w) / max(1, min(h, w))
    return aspect <= 3.5


def _external_eye_crop_meta(frame) -> Dict[str, Any]:
    crop = frame.copy()
    return {
        'crops': {'left': crop, 'right': crop.copy()},
        'face_detected': False,
        'landmarks': None,
        'external_eye_only': True,
    }


def _classify_stratum(record: Dict[str, Any], *, source_type: str = '') -> str:
    """Assign one validation stratum from algorithm metadata (pre-grader)."""
    if source_type == 'external_conjunctivitis':
        return 'mild_elevated'
    if source_type == 'external_normal':
        return 'normal_baseline'

    lighting = record.get('lighting_gate') or {}
    cq = record.get('capture_quality') or {}
    left = record.get('left_eye') or {}
    right = record.get('right_eye') or {}
    metrics = record.get('metrics') or {}

    lighting_status = str(lighting.get('status') or '')
    if lighting_status not in ('normal', '') and not record.get('external_eye_only'):
        return 'lighting_artifacts'
    if not cq.get('usable', True) and not record.get('external_eye_only'):
        return 'lighting_artifacts'

    left_cov = float(left.get('mask_coverage_pct') or 0)
    right_cov = float(right.get('mask_coverage_pct') or 0)
    left_rel = bool(left.get('redness_reliable'))
    right_rel = bool(right.get('redness_reliable'))
    if (
        left_rel != right_rel
        or min(left_cov, right_cov) < 4.0
        or abs(left_cov - right_cov) > 2.5
    ):
        return 'demographics'

    avg_rg = metrics.get('avg_redness_rg')
    if avg_rg is not None and float(avg_rg) >= 35:
        return 'mild_elevated'

    return 'normal_baseline'


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _sanitize_image_id(path: Path) -> str:
    stem = path.stem
    safe = ''.join(ch if ch.isalnum() or ch in '-_' else '_' for ch in stem)
    return safe[:80] or f'img_{uuid.uuid4().hex[:8]}'


def _iter_images(input_path: Path, recursive: bool) -> List[Path]:
    if input_path.is_file():
        return [input_path]
    if not input_path.is_dir():
        raise FileNotFoundError(f'Input not found: {input_path}')

    pattern = '**/*' if recursive else '*'
    files = [
        p for p in input_path.glob(pattern)
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    ]
    return sorted(files)


def _eye_export_details(eye: Dict[str, Any]) -> Dict[str, Any]:
    details = eye.get('redness_details') or {}
    coverage = details.get('mask_coverage')
    return {
        'sclera_redness_0_100': eye.get('sclera_redness'),
        'redness_rg': details.get('redness_rg'),
        'redness_normalized': details.get('redness_normalized'),
        'red_pixel_fraction': details.get('red_pixel_fraction'),
        'mask_coverage': coverage,
        'mask_coverage_pct': round(float(coverage or 0) * 100, 2),
        'redness_reliable': bool(eye.get('redness_reliable')),
        'appearance_score': eye.get('appearance_score'),
    }


def _build_analysis_record(
    frame,
    image_id: str,
    source_path: Path,
    analysis: Dict[str, Any],
    crop_meta: Dict[str, Any],
    lighting: Dict[str, Any],
    capture_quality: Dict[str, Any],
) -> Dict[str, Any]:
    left = analysis.get('left_eye') or {}
    right = analysis.get('right_eye') or {}
    left_details = _eye_export_details(left)
    right_details = _eye_export_details(right)

    avg_rg = None
    rg_vals = [v for v in (left_details['redness_rg'], right_details['redness_rg']) if v is not None]
    if rg_vals:
        avg_rg = round(sum(rg_vals) / len(rg_vals), 2)

    return {
        'schema_version': 1,
        'algorithm_version': ALGORITHM_VERSION,
        'exported_at': _utc_now_iso(),
        'image_id': image_id,
        'source_path': str(source_path),
        'source_filename': source_path.name,
        'frame_shape': {'height': int(frame.shape[0]), 'width': int(frame.shape[1])},
        'face_detected': bool(crop_meta.get('face_detected')),
        'lighting_gate': {
            'status': lighting.get('status'),
            'severity': lighting.get('severity'),
            'issues': lighting.get('issues', []),
            'metrics': lighting.get('metrics', {}),
            'algorithm_version': lighting.get('algorithm_version'),
        },
        'capture_quality': capture_quality,
        'left_eye': left_details,
        'right_eye': right_details,
        'metrics': {
            'avg_redness_rg': avg_rg,
            'avg_sclera_redness_0_100': analysis.get('metrics', {}).get('avg_sclera_redness'),
            'appearance_score': analysis.get('appearance_score'),
        },
        'findings': analysis.get('findings', []),
        'disclaimer': analysis.get('disclaimer'),
    }


def _manifest_row(image_id: str, source_path: Path, export_dir: Path, record: Dict[str, Any]) -> Dict[str, str]:
    left = record.get('left_eye') or {}
    right = record.get('right_eye') or {}
    lighting = record.get('lighting_gate') or {}
    cq = record.get('capture_quality') or {}
    metrics = record.get('metrics') or {}
    findings = record.get('findings') or []

    def _avg(a: Any, b: Any) -> str:
        vals = [v for v in (a, b) if v is not None and v != '']
        if not vals:
            return ''
        return str(round(sum(float(v) for v in vals) / len(vals), 2))

    return {
        'image_id': image_id,
        'source_filename': source_path.name,
        'export_path': f'samples/{image_id}',
        'source_type': str(record.get('source_type') or ''),
        'external_eye_only': str(bool(record.get('external_eye_only'))),
        'stratum': str(record.get('stratum') or ''),
        'face_detected': str(record.get('face_detected', False)),
        'lighting_status': str(lighting.get('status') or ''),
        'capture_quality_grade': str(cq.get('grade') or ''),
        'capture_quality_usable': str(cq.get('usable', '')),
        'left_redness_rg': str(left.get('redness_rg') or ''),
        'right_redness_rg': str(right.get('redness_rg') or ''),
        'avg_redness_rg': str(metrics.get('avg_redness_rg') or ''),
        'left_redness_normalized': str(left.get('redness_normalized') or ''),
        'right_redness_normalized': str(right.get('redness_normalized') or ''),
        'left_sclera_redness_0_100': str(left.get('sclera_redness_0_100') or ''),
        'right_sclera_redness_0_100': str(right.get('sclera_redness_0_100') or ''),
        'avg_sclera_redness_0_100': str(metrics.get('avg_sclera_redness_0_100') or ''),
        'left_mask_coverage_pct': str(left.get('mask_coverage_pct') or ''),
        'right_mask_coverage_pct': str(right.get('mask_coverage_pct') or ''),
        'left_redness_reliable': str(left.get('redness_reliable', '')),
        'right_redness_reliable': str(right.get('redness_reliable', '')),
        'appearance_score': str(metrics.get('appearance_score') or ''),
        'findings': '; '.join(findings),
        'export_error': '',
    }


def _error_manifest_row(image_id: str, source_path: Path, error: str) -> Dict[str, str]:
    row = {col: '' for col in MANIFEST_COLUMNS}
    row['image_id'] = image_id
    row['source_filename'] = source_path.name
    row['export_error'] = error
    return row


def _ground_truth_rows(image_id: str) -> List[Dict[str, str]]:
    return [
        {
            'image_id': image_id,
            'grader_id': grader_id,
            'sclera_redness_grade_0_to_4': '',
            'is_usable_quality_flag': '',
            'notes': '',
        }
        for grader_id in GRADER_IDS
    ]


def export_image(
    source_path: Path,
    samples_root: Path,
    *,
    copy_source: bool,
    stratum: str = '',
    allow_external_eye_fallback: bool = True,
) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, str]]]:
    """Export one image. Returns (analysis_record, manifest_row) or error manifest row."""
    image_id = _sanitize_image_id(source_path)
    export_dir = samples_root / image_id
    export_dir.mkdir(parents=True, exist_ok=True)

    frame = cv2.imread(str(source_path))
    if frame is None or frame.size == 0:
        return None, _error_manifest_row(image_id, source_path, 'Could not read image')

    source_type = _infer_source_type(source_path)
    crop_meta = _crop_eye_regions(frame)
    external_eye_only = False
    if crop_meta.get('error'):
        if allow_external_eye_fallback and _looks_like_eye_crop(frame):
            crop_meta = _external_eye_crop_meta(frame)
            external_eye_only = True
        else:
            return None, _error_manifest_row(image_id, source_path, crop_meta['error'])

    crops = crop_meta['crops']
    left_path = export_dir / 'eye_left.png'
    right_path = export_dir / 'eye_right.png'
    if not cv2.imwrite(str(left_path), crops['left']):
        return None, _error_manifest_row(image_id, source_path, 'Failed to write eye_left.png')
    if not cv2.imwrite(str(right_path), crops['right']):
        return None, _error_manifest_row(image_id, source_path, 'Failed to write eye_right.png')

    if copy_source:
        dest = export_dir / f'source{source_path.suffix.lower() or ".jpg"}'
        if source_path.resolve() != dest.resolve():
            shutil.copy2(source_path, dest)

    analysis = _analyze_cropped_eyes(
        frame,
        crops,
        landmarks=crop_meta.get('landmarks'),
        external_eye_only=external_eye_only,
    )
    if analysis.get('error'):
        return None, _error_manifest_row(image_id, source_path, analysis['error'])

    lighting = analysis.get('lighting') or {}
    capture_quality = analysis.get('capture_quality') or {}

    record = _build_analysis_record(
        frame,
        image_id,
        source_path,
        analysis,
        crop_meta,
        lighting,
        capture_quality,
    )
    record['source_type'] = source_type
    record['external_eye_only'] = external_eye_only
    record['stratum'] = stratum or _classify_stratum(record, source_type=source_type)

    json_path = export_dir / 'analysis.json'
    json_path.write_text(json.dumps(record, indent=2), encoding='utf-8')

    manifest_row = _manifest_row(image_id, source_path, export_dir, record)
    return record, manifest_row


def _write_csv(path: Path, columns: Sequence[str], rows: Iterable[Dict[str, str]]) -> None:
    with path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(columns))
        writer.writeheader()
        writer.writerows(rows)


def _finalize_export(
    output_root: Path,
    manifest_rows: List[Dict[str, str]],
    ground_truth_rows: List[Dict[str, str]],
    *,
    input_path: Path,
    attempted: int,
    ok_count: int,
    err_count: int,
    stratified: bool,
    target: int,
    stratum_counts: Optional[Dict[str, int]] = None,
) -> None:
    stratum_counts = stratum_counts or {}
    meta = {
        'exported_at': _utc_now_iso(),
        'algorithm_version': ALGORITHM_VERSION,
        'input_path': str(input_path),
        'attempted_count': attempted,
        'success_count': ok_count,
        'error_count': err_count,
        'stratified': stratified,
        'target_count': target if stratified else None,
        'stratum_counts': stratum_counts,
        'stratum_quotas': _quota_targets(target) if stratified and target else None,
        'grader_ids': list(GRADER_IDS),
        'grading_rubric': {
            'sclera_redness_grade_0_to_4': {
                '0': 'None — sclera white/clear; fine vessels OK',
                '1': 'Mild — subtle pink limited to periphery',
                '2': 'Moderate — red/pink across >30% visible sclera',
                '3': 'Severe — prominent vessel dilation over most sclera',
                '4': 'Reserved — unusable / cannot grade',
            },
            'is_usable_quality_flag': 'yes | no — sharp enough and lit enough to grade redness',
        },
        'validation_targets': {
            'spearman_rho_min': 0.75,
            'icc_min': 0.70,
            'fleiss_kappa_min': 0.60,
        },
    }
    (output_root / 'export_meta.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    _write_csv(output_root / 'analysis_manifest.csv', MANIFEST_COLUMNS, manifest_rows)
    _write_csv(output_root / 'ground_truth_template.csv', GROUND_TRUTH_COLUMNS, ground_truth_rows)

    grader_pack = output_root / 'grader_pack'
    grader_pack.mkdir(exist_ok=True)
    grader_readme = grader_pack / 'README.txt'
    grader_readme.write_text(
        '\n'.join([
            'Grader instructions (blind)',
            '=======================',
            '',
            'Open samples/<image_id>/eye_left.png and eye_right.png only.',
            'Do NOT read analysis.json — that would bias your grades.',
            '',
            'Record grades in ground_truth_template.csv:',
            '  sclera_redness_grade_0_to_4 : 0 (none) to 3 (severe); 4 = cannot grade',
            '  is_usable_quality_flag      : yes | no',
            '',
            'Each image has 3 rows (grader_id 1, 2, 3).',
        ]),
        encoding='utf-8',
    )

    readme = output_root / 'README.txt'
    readme.write_text(
        '\n'.join([
            'EyeVio redness validation export',
            '================================',
            '',
            f'Exported: {meta["exported_at"]}',
            f'Algorithm: {ALGORITHM_VERSION}',
            f'Stratified: {stratified}',
            '',
            'Per sample (samples/<image_id>/):',
            '  eye_left.png, eye_right.png — give ONLY these to human graders',
            '  analysis.json — algorithm audit trail (keep private until labeling done)',
            '',
            'Workflow:',
            '  1. Graders fill ground_truth_template.csv (see grader_pack/README.txt)',
            '  2. Run: export_photo_analysis.py correlate --output <this_dir>',
            '  3. Check IRR (ICC/Fleiss) before trusting Spearman rho',
            '  4. Re-run test_longitudinal_stability.py after any threshold change',
            '',
            'Targets: Spearman rho >= 0.75, ICC >= 0.70 between graders',
            '',
        ]),
        encoding='utf-8',
    )


def cmd_export(args: argparse.Namespace) -> int:
    input_paths = [Path(p).resolve() for p in args.input]
    output_root = Path(args.output).resolve()
    samples_root = output_root / 'samples'
    samples_root.mkdir(parents=True, exist_ok=True)

    images = _iter_images_from_inputs(input_paths, recursive=args.recursive)
    if args.stratified:
        import random
        random.seed(args.seed)
        random.shuffle(images)
        pool_limit = args.pool_limit if args.pool_limit > 0 else len(images)
        images = images[:pool_limit]
        target = args.target if args.target > 0 else 150
        quotas = _quota_targets(target)
        filled = {key: 0 for key in quotas}
    else:
        target = 0
        quotas = {}
        filled = {}
        if args.limit and args.limit > 0:
            images = images[: args.limit]

    if not images:
        print(f'No images found under {input_paths}')
        return 1

    manifest_rows: List[Dict[str, str]] = []
    ground_truth_rows: List[Dict[str, str]] = []
    ok_count = 0
    err_count = 0
    skipped_stratum = 0

    mode = f'stratified target={target}' if args.stratified else f'limit={args.limit or "all"}'
    print(f'Exporting ({mode}) from {len(images)} candidate(s) → {output_root}\n')
    if args.stratified:
        print('Stratum quotas:', quotas, '\n')

    for idx, source_path in enumerate(images, start=1):
        if args.stratified and ok_count >= target:
            break

        record, manifest_row = export_image(
            source_path,
            samples_root,
            copy_source=not args.no_source_copy,
            allow_external_eye_fallback=not args.no_external_fallback,
        )
        if manifest_row is None:
            err_count += 1
            continue

        if manifest_row.get('export_error'):
            manifest_rows.append(manifest_row)
            err_count += 1
            print(f'  [{idx}/{len(images)}] FAIL {source_path.name}: {manifest_row["export_error"]}')
            continue

        stratum = _classify_stratum(
            record or {},
            source_type=(record or {}).get('source_type', _infer_source_type(source_path)),
        )
        if args.stratified:
            if filled.get(stratum, 0) >= quotas.get(stratum, 0):
                skipped_stratum += 1
                shutil.rmtree(samples_root / manifest_row['image_id'], ignore_errors=True)
                continue
            filled[stratum] = filled.get(stratum, 0) + 1
            manifest_row['stratum'] = stratum
            if record is not None:
                record['stratum'] = stratum
                json_path = samples_root / manifest_row['image_id'] / 'analysis.json'
                json_path.write_text(json.dumps(record, indent=2), encoding='utf-8')

        manifest_rows.append(manifest_row)
        ok_count += 1
        ground_truth_rows.extend(_ground_truth_rows(manifest_row['image_id']))
        tag = f' [{stratum}]' if args.stratified else ''
        print(f'  [{idx}/{len(images)}] OK   {manifest_row["image_id"]}{tag} ({ok_count}/{target if args.stratified else "∞"})')

    _finalize_export(
        output_root,
        manifest_rows,
        ground_truth_rows,
        input_path=Path(';'.join(str(p) for p in input_paths)),
        attempted=len(images),
        ok_count=ok_count,
        err_count=err_count,
        stratified=args.stratified,
        target=target if args.stratified else ok_count,
        stratum_counts=filled if args.stratified else None,
    )

    print(f'\nDone: {ok_count} ok, {err_count} failed', end='')
    if args.stratified:
        print(f', {skipped_stratum} skipped (stratum full)', end='')
        print(f'\nStratum counts: {filled}')
        if ok_count < target:
            print(f'WARNING: only {ok_count}/{target} stratified samples collected — increase --pool-limit')
    print()
    print(f'  {output_root / "analysis_manifest.csv"}')
    print(f'  {output_root / "ground_truth_template.csv"}')
    print(f'  {output_root / "grader_pack" / "README.txt"}')
    return 0 if ok_count >= (target if args.stratified else 1) else 2


def _load_grader_matrix(
    gt_path: Path,
) -> tuple[Dict[str, Dict[str, float]], List[str]]:
    """Return image_id -> {grader_id: grade} for usable labeled rows."""
    matrix: Dict[str, Dict[str, float]] = {}
    with gt_path.open(newline='', encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            grade_raw = (row.get('sclera_redness_grade_0_to_4') or '').strip()
            usable = (row.get('is_usable_quality_flag') or '').strip().lower()
            grader_id = (row.get('grader_id') or '').strip()
            image_id = (row.get('image_id') or '').strip()
            if not image_id or not grader_id or not grade_raw:
                continue
            if usable == 'no':
                continue
            try:
                grade = float(grade_raw)
            except ValueError:
                continue
            if grade >= 4:
                continue
            matrix.setdefault(image_id, {})[grader_id] = grade
    return matrix, list(GRADER_IDS)


def _fleiss_kappa(subject_grades: List[List[float]], n_categories: int = 4) -> Optional[float]:
    """Fleiss' kappa for multiple raters (ordinal categories 0..n_categories-1)."""
    if not subject_grades:
        return None
    n_subjects = len(subject_grades)
    n_raters = len(subject_grades[0])
    if n_raters < 2 or any(len(row) != n_raters for row in subject_grades):
        return None

    counts = []
    for grades in subject_grades:
        hist = [0] * n_categories
        for g in grades:
            idx = int(round(g))
            idx = max(0, min(n_categories - 1, idx))
            hist[idx] += 1
        counts.append(hist)

    n = n_subjects
    N = n_raters
    k = n_categories
    p_j = [sum(counts[i][j] for i in range(n)) / (n * N) for j in range(k)]
    P_i = [
        (sum(counts[i][j] ** 2 for j in range(k)) - N) / (N * (N - 1))
        for i in range(n)
    ]
    P_bar = sum(P_i) / n
    P_e = sum(p ** 2 for p in p_j)
    if P_e >= 1.0:
        return 1.0
    return (P_bar - P_e) / (1.0 - P_e)


def _icc_21(subject_grades: List[List[float]]) -> Optional[float]:
    """ICC(2,1) two-way random, absolute agreement (mean of k raters)."""
    if not subject_grades:
        return None
    n = len(subject_grades)
    k = len(subject_grades[0])
    if n < 2 or k < 2:
        return None

    data = subject_grades
    grand = sum(sum(row) for row in data) / (n * k)
    row_means = [sum(row) / k for row in data]
    col_means = [sum(data[i][j] for i in range(n)) / n for j in range(k)]

    ss_rows = k * sum((m - grand) ** 2 for m in row_means)
    ss_cols = n * sum((m - grand) ** 2 for m in col_means)
    ss_total = sum((data[i][j] - grand) ** 2 for i in range(n) for j in range(k))
    ss_error = ss_total - ss_rows - ss_cols

    df_rows = n - 1
    df_cols = k - 1
    df_error = (n - 1) * (k - 1)
    if df_error <= 0:
        return None

    ms_rows = ss_rows / df_rows
    ms_cols = ss_cols / df_cols if df_cols else 0.0
    ms_error = ss_error / df_error if df_error else 0.0

    denom = ms_rows + (k - 1) * ms_error + (k * (ms_cols - ms_error) / n)
    if denom == 0:
        return None
    return (ms_rows - ms_error) / denom


def _spearman(x: List[float], y: List[float]) -> Optional[float]:
    if len(x) < 3 or len(x) != len(y):
        return None
    n = len(x)

    def ranks(values: List[float]) -> List[float]:
        order = sorted(range(n), key=lambda i: values[i])
        out = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and values[order[j + 1]] == values[order[i]]:
                j += 1
            avg_rank = (i + j) / 2.0 + 1.0
            for k in range(i, j + 1):
                out[order[k]] = avg_rank
            i = j + 1
        return out

    rx, ry = ranks(x), ranks(y)
    d2 = sum((a - b) ** 2 for a, b in zip(rx, ry))
    return 1.0 - (6.0 * d2) / (n * (n * n - 1))


def cmd_correlate(args: argparse.Namespace) -> int:
    output_root = Path(args.output).resolve()
    manifest_path = output_root / 'analysis_manifest.csv'
    gt_path = Path(args.ground_truth).resolve() if args.ground_truth else output_root / 'ground_truth_template.csv'

    if not manifest_path.exists() or not gt_path.exists():
        print('Missing analysis_manifest.csv or ground truth CSV')
        return 1

    with manifest_path.open(newline='', encoding='utf-8') as handle:
        manifest = {row['image_id']: row for row in csv.DictReader(handle) if not row.get('export_error')}

    grader_matrix, grader_ids = _load_grader_matrix(gt_path)

    # IRR — images with all 3 graders labeled
    complete_subjects: List[List[float]] = []
    for image_id in sorted(grader_matrix.keys()):
        grades_map = grader_matrix[image_id]
        if all(gid in grades_map for gid in grader_ids):
            complete_subjects.append([grades_map[gid] for gid in grader_ids])

    print('Inter-rater reliability (usable images, all 3 graders):')
    if len(complete_subjects) >= 5:
        kappa = _fleiss_kappa(complete_subjects, n_categories=4)
        icc = _icc_21(complete_subjects)
        if kappa is not None:
            print(f'  Fleiss kappa (grades 0-3): {kappa:.3f}  (target >= 0.60)')
        if icc is not None:
            print(f'  ICC(2,1):                {icc:.3f}  (target >= 0.70)')
        if icc is not None and icc < 0.70:
            print('  ⚠ Human agreement is weak — refine rubric before trusting algorithm correlation.')
    else:
        print(f'  Need >= 5 fully labeled images (have {len(complete_subjects)})')

    by_image: Dict[str, List[float]] = {
        image_id: list(grades.values()) for image_id, grades in grader_matrix.items()
    }

    pairs_x: List[float] = []
    pairs_y: List[float] = []
    for image_id, grades in sorted(by_image.items()):
        row = manifest.get(image_id)
        if not row:
            continue
        algo = row.get('avg_redness_rg') or row.get('avg_sclera_redness_0_100')
        if not algo:
            continue
        pairs_x.append(sum(grades) / len(grades))
        pairs_y.append(float(algo))

    print(f'\nAlgorithm correlation (usable labeled images): {len(pairs_x)}')
    if len(pairs_x) < 3:
        print('Need at least 3 labeled usable images for Spearman correlation.')
        return 1

    rho = _spearman(pairs_x, pairs_y)
    if rho is None:
        print('Could not compute Spearman rho.')
        return 1
    print(f'Spearman rho (human mean grade vs avg_redness_rg): {rho:.3f}')
    rho_target = 0.75
    print(f'Target rho >= {rho_target}: {"PASS" if rho >= rho_target else "NOT YET"}')

    passed = rho >= rho_target
    if len(complete_subjects) >= 5:
        icc = _icc_21(complete_subjects)
        if icc is not None and icc < 0.70:
            passed = False
    return 0 if passed else 2


def cmd_status(args: argparse.Namespace) -> int:
    output_root = Path(args.output).resolve()
    manifest_path = output_root / 'analysis_manifest.csv'
    gt_path = output_root / 'ground_truth_template.csv'

    if not manifest_path.exists():
        print(f'Missing export: {manifest_path}')
        return 1

    with manifest_path.open(newline='', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))

    ok_rows = [r for r in rows if not r.get('export_error')]
    err_rows = [r for r in rows if r.get('export_error')]
    stratum_breakdown: Dict[str, int] = {}
    for row in ok_rows:
        key = row.get('stratum') or 'unknown'
        stratum_breakdown[key] = stratum_breakdown.get(key, 0) + 1
    reliable = [
        r for r in ok_rows
        if r.get('left_redness_reliable') == 'True' and r.get('right_redness_reliable') == 'True'
    ]

    labeled = 0
    if gt_path.exists():
        with gt_path.open(newline='', encoding='utf-8') as handle:
            gt_rows = list(csv.DictReader(handle))
        labeled = sum(1 for r in gt_rows if (r.get('sclera_redness_grade_0_to_4') or '').strip())

    print(f'Export: {output_root}')
    print(f'  Samples in manifest : {len(rows)}')
    print(f'  Successful exports  : {len(ok_rows)}')
    print(f'  Export errors         : {len(err_rows)}')
    print(f'  Both eyes reliable    : {len(reliable)}')
    print(f'  Ground-truth cells filled : {labeled}')
    if stratum_breakdown:
        print(f'  Stratum breakdown       : {stratum_breakdown}')
    if err_rows:
        print('\nErrors:')
        for row in err_rows[:10]:
            print(f'  - {row.get("source_filename")}: {row.get("export_error")}')
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Export eye crops + metrics for redness validation.')
    sub = parser.add_subparsers(dest='command', required=True)

    export_p = sub.add_parser('export', help='Batch-export images to a validation directory')
    export_p.add_argument(
        '--input',
        nargs='+',
        required=True,
        help='One or more image files/directories (e.g. validation/images data/external_redness)',
    )
    export_p.add_argument('--output', required=True, help='Output directory')
    export_p.add_argument('--limit', type=int, default=0, help='Max images (0 = all; ignored if --stratified)')
    export_p.add_argument('--stratified', action='store_true', help='Balance strata (40/30/20/10)')
    export_p.add_argument('--target', type=int, default=150, help='Stratified export target count')
    export_p.add_argument('--pool-limit', type=int, default=600, help='Max candidate images to scan when stratified')
    export_p.add_argument('--seed', type=int, default=42, help='Shuffle seed for stratified sampling')
    export_p.add_argument('--recursive', action='store_true', help='Recurse into subdirectories')
    export_p.add_argument('--no-external-fallback', action='store_true',
                          help='Disable eye-crop fallback for external close-up datasets')
    export_p.add_argument('--no-source-copy', action='store_true', help='Skip copying source frame')
    export_p.set_defaults(func=cmd_export)

    status_p = sub.add_parser('status', help='Summarize an existing export')
    status_p.add_argument('--output', required=True, help='Export directory')
    status_p.set_defaults(func=cmd_status)

    corr_p = sub.add_parser('correlate', help='Spearman rho after graders fill ground truth')
    corr_p.add_argument('--output', required=True, help='Export directory')
    corr_p.add_argument('--ground-truth', help='Filled ground truth CSV (default: ground_truth_template.csv)')
    corr_p.set_defaults(func=cmd_correlate)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    raise SystemExit(args.func(args))


if __name__ == '__main__':
    main()
