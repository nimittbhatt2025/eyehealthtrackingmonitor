#!/usr/bin/env python3
"""
EyeVio Milestone 4 — lighting validation dataset collector.

Records an immutable chain per sample:
  raw image → raw metrics → frozen algorithm decision → human decision

Two-dataset workflow (keep separate for defensible Milestone 5 results):
  1. dev (~20)              — smoke-test collector, UI, labeling workflow
  2. validation (pilot set) — frozen thresholds; used for Milestone 5 (exclude dev)

Sequence:
  ~20 dev samples → sanity check → validation collection → freeze dataset
  → Milestone 5 analysis → threshold calibration → re-validation

Do NOT tune thresholds during collection.

Usage (from repo root):
  ./eyevio/venv/bin/python3.12 scripts/collect_lighting_dataset.py capture \\
    --split dev --session LGT-20260819-session01

  ./eyevio/venv/bin/python3.12 scripts/collect_lighting_dataset.py capture \\
    --split validation --session LGT-20260820-session01

  ./eyevio/venv/bin/python3.12 scripts/collect_lighting_dataset.py status --split validation
  ./eyevio/venv/bin/python3.12 scripts/collect_lighting_dataset.py label --split dev

Heavy vision deps (OpenCV, MediaPipe, EyeVio models) load only for capture, ingest,
analyze, and label. The status command uses stdlib + CSV only.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
EYEVIO_ROOT = REPO_ROOT / 'eyevio'

DATA_ROOT = REPO_ROOT / 'data' / 'lighting_validation'
DEFAULT_DEV_DIR = DATA_ROOT / 'dev'
DEFAULT_VALIDATION_DIR = DATA_ROOT / 'validation'
IMAGES_SUBDIR = 'images'
CSV_FILENAME = 'lighting_dataset.csv'

CSV_COLUMNS = [
    'sample_id',
    'timestamp',
    'collection_session',
    'dataset_split',
    'left_eye_mean',
    'right_eye_mean',
    'forehead_mean',
    'left_right_delta',
    'under_ratio',
    'over_ratio',
    'lighting_status',
    'human_decision',
    'reason',
    'notes',
    'condition_category',
    'face_detected',
    'image_path',
    'algorithm_issues',
    'threshold_snapshot',
    'labeled_at',
]

# Never modified after capture/ingest (label mode preserves these exactly).
IMMUTABLE_AFTER_CAPTURE = frozenset({
    'sample_id',
    'timestamp',
    'collection_session',
    'dataset_split',
    'left_eye_mean',
    'right_eye_mean',
    'forehead_mean',
    'left_right_delta',
    'under_ratio',
    'over_ratio',
    'lighting_status',
    'face_detected',
    'image_path',
    'algorithm_issues',
    'threshold_snapshot',
})

# Required non-empty at append time (algorithm_issues/condition_category may be blank).
REQUIRED_AT_CAPTURE = frozenset({
    'sample_id',
    'timestamp',
    'collection_session',
    'dataset_split',
    'left_eye_mean',
    'right_eye_mean',
    'forehead_mean',
    'left_right_delta',
    'under_ratio',
    'over_ratio',
    'lighting_status',
    'face_detected',
    'image_path',
    'threshold_snapshot',
})

REASONS = {'too_dark', 'too_bright', 'uneven', 'shadow', 'glare', 'other', ''}

CONDITION_HINTS = [
    'normal_indoor',
    'daylight',
    'dim_indoor',
    'very_dark',
    'strong_backlight',
    'one_sided_lighting',
    'bright_direct_light',
    'heavy_shadows',
    'mixed_other',
]

THRESHOLD_SNAPSHOT: Dict[str, Any] = {
    'algorithm_version': 2.1,
    'frozen_at_collection': True,
}


def _import_cv2():
    import cv2  # noqa: WPS433 — lazy import keeps `status` lightweight

    return cv2


def _import_numpy():
    import numpy as np  # noqa: WPS433

    return np


def _ensure_eyevio_imports():
    if str(EYEVIO_ROOT) not in sys.path:
        sys.path.insert(0, str(EYEVIO_ROOT))
    from app.ai_models.capture_quality import (  # noqa: E402
        frozen_threshold_snapshot,
        assess_anatomical_lighting,
    )
    from app.ai_models.dry_eye_analysis import _crop_eye_regions  # noqa: E402
    global THRESHOLD_SNAPSHOT
    THRESHOLD_SNAPSHOT = frozen_threshold_snapshot()
    return assess_anatomical_lighting, _crop_eye_regions


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def resolve_dataset_dir(split: str, output: Optional[str]) -> Path:
    if output:
        return Path(output).expanduser().resolve()
    if split == 'validation':
        return DEFAULT_VALIDATION_DIR
    return DEFAULT_DEV_DIR


def ensure_dataset_layout(dataset_dir: Path) -> Tuple[Path, Path]:
    dataset_dir.mkdir(parents=True, exist_ok=True)
    images_dir = dataset_dir / IMAGES_SUBDIR
    images_dir.mkdir(parents=True, exist_ok=True)
    csv_path = dataset_dir / CSV_FILENAME
    if not csv_path.exists():
        with csv_path.open('w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
            writer.writeheader()
    else:
        _migrate_csv_header(csv_path)
    return csv_path, images_dir


def _migrate_csv_header(csv_path: Path) -> None:
    rows = _load_all_rows(csv_path)
    if not rows:
        return
    if set(CSV_COLUMNS).issubset(set(rows[0].keys())):
        return
    for row in rows:
        for col in CSV_COLUMNS:
            row.setdefault(col, '')
    _write_all_rows(csv_path, rows)


def resolve_session_id(session_arg: str, csv_path: Path) -> str:
    if session_arg and session_arg != 'auto':
        return session_arg
    date = datetime.now(timezone.utc).strftime('%Y%m%d')
    prefix = f'LGT-{date}-session'
    used: set[str] = set()
    if csv_path.exists():
        for row in _load_all_rows(csv_path):
            sid = (row.get('collection_session') or '').strip()
            if sid:
                used.add(sid)
    n = 1
    while f'{prefix}{n:02d}' in used:
        n += 1
    return f'{prefix}{n:02d}'


def read_frame_from_path(path: Path) -> Any:
    cv2 = _import_cv2()
    return cv2.imread(str(path))


def analyze_frame(frame: Any) -> Dict[str, Any]:
    assess_anatomical_lighting, _crop_eye_regions = _ensure_eyevio_imports()
    crop_result = _crop_eye_regions(frame)
    face_detected = crop_result.get('face_detected', False)
    landmarks = crop_result.get('landmarks')
    warning = crop_result.get('error')

    lighting = assess_anatomical_lighting(frame, landmarks)
    metrics = lighting.get('metrics') or {}

    return {
        'face_detected': face_detected,
        'face_warning': warning,
        'lighting': lighting,
        'metrics': metrics,
        'lighting_status': lighting.get('status', 'extreme_problem'),
        'algorithm_issues': '; '.join(lighting.get('issues') or []),
    }


def build_row(
    analysis: Dict[str, Any],
    *,
    sample_id: str,
    timestamp: str,
    collection_session: str,
    dataset_split: str,
    image_path: str,
    condition_category: str = '',
    human_decision: str = '',
    reason: str = '',
    notes: str = '',
    labeled_at: str = '',
) -> Dict[str, str]:
    metrics = analysis.get('metrics') or {}
    return {
        'sample_id': sample_id,
        'timestamp': timestamp,
        'collection_session': collection_session,
        'dataset_split': dataset_split,
        'left_eye_mean': _fmt(metrics.get('left_eye_mean')),
        'right_eye_mean': _fmt(metrics.get('right_eye_mean')),
        'forehead_mean': _fmt(metrics.get('forehead_mean')),
        'left_right_delta': _fmt(metrics.get('left_right_delta')),
        'under_ratio': _fmt(metrics.get('under_ratio')),
        'over_ratio': _fmt(metrics.get('over_ratio')),
        'lighting_status': analysis.get('lighting_status', ''),
        'human_decision': human_decision,
        'reason': reason,
        'notes': notes,
        'condition_category': condition_category,
        'face_detected': str(bool(analysis.get('face_detected'))).lower(),
        'image_path': image_path,
        'algorithm_issues': analysis.get('algorithm_issues', ''),
        'threshold_snapshot': json.dumps(THRESHOLD_SNAPSHOT, sort_keys=True),
        'labeled_at': labeled_at,
    }


def _fmt(value: Any) -> str:
    if value is None or value == '':
        return ''
    return str(value)


def append_row(csv_path: Path, row: Dict[str, str]) -> None:
    """Append one sample; refuse duplicate IDs or incomplete capture fields."""
    sample_id = (row.get('sample_id') or '').strip()
    if not sample_id:
        raise ValueError('Refusing to append a row without sample_id.')

    if csv_path.exists():
        with csv_path.open('r', newline='', encoding='utf-8') as f:
            for existing in csv.DictReader(f):
                if (existing.get('sample_id') or '').strip() == sample_id:
                    raise ValueError(f'Refusing to append duplicate sample_id: {sample_id}')

    missing = [
        col for col in REQUIRED_AT_CAPTURE
        if not str(row.get(col, '')).strip()
    ]
    if missing:
        raise ValueError(
            'Refusing to append sample with missing capture fields: '
            + ', '.join(sorted(missing))
        )

    with csv_path.open('a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writerow({col: row.get(col, '') for col in CSV_COLUMNS})


def save_frame_copy(frame: Any, images_dir: Path, sample_id: str) -> str:
    cv2 = _import_cv2()
    out = images_dir / f'{sample_id}.jpg'
    if out.exists():
        raise FileExistsError(
            f'Refusing to overwrite existing sample image: {out}'
        )
    cv2.imwrite(str(out), frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return f'{IMAGES_SUBDIR}/{sample_id}.jpg'


def print_analysis_summary(analysis: Dict[str, Any]) -> None:
    m = analysis.get('metrics') or {}
    print('\n--- Algorithm output (frozen thresholds) ---')
    print(f"  face_detected     : {analysis.get('face_detected')}")
    if analysis.get('face_warning'):
        print(f"  face_warning      : {analysis['face_warning']}")
    print(f"  left_eye_mean     : {m.get('left_eye_mean', '—')}")
    print(f"  right_eye_mean    : {m.get('right_eye_mean', '—')}")
    print(f"  forehead_mean     : {m.get('forehead_mean', '—')}")
    print(f"  left_right_delta  : {m.get('left_right_delta', '—')}")
    print(f"  under_ratio       : {m.get('under_ratio', '—')}")
    print(f"  over_ratio        : {m.get('over_ratio', '—')}")
    print(f"  lighting_status   : {analysis.get('lighting_status')}")
    if analysis.get('algorithm_issues'):
        print(f"  algorithm_issues  : {analysis['algorithm_issues']}")
    print('----------------------------------------------')


def prompt_human_label() -> Tuple[str, str, str]:
    while True:
        decision = input('Human decision [u=usable / n=not_usable / s=skip]: ').strip().lower()
        if decision in ('s', 'skip', ''):
            return '', '', ''
        if decision in ('u', 'usable'):
            return 'usable', '', _prompt_notes()
        if decision in ('n', 'not_usable', 'not-usable'):
            return 'not_usable', _prompt_reason(), _prompt_notes()
        print('  Enter u, n, or s.')


def _prompt_reason() -> str:
    print('  Reason options: too_dark, too_bright, uneven, shadow, glare, other')
    while True:
        reason = input('  Reason: ').strip().lower()
        if reason in REASONS:
            return reason
        if reason == '':
            return ''
        print('  Pick a listed reason or leave blank (Enter).')


def _prompt_notes() -> str:
    return input('Notes (optional): ').strip()


def prompt_condition_category(default: str = '') -> str:
    if default:
        use = input(f'Condition category [{default}] (Enter to keep): ').strip()
        return use or default
    print('Condition category hints:', ', '.join(CONDITION_HINTS))
    return input('Condition category (optional): ').strip()


def process_and_record(
    frame: Any,
    *,
    csv_path: Path,
    images_dir: Path,
    collection_session: str,
    dataset_split: str,
    condition_category: str = '',
    interactive_label: bool = True,
    notes_prefix: str = '',
) -> Optional[Dict[str, str]]:
    analysis = analyze_frame(frame)
    print_analysis_summary(analysis)

    human_decision, reason, notes = ('', '', '')
    labeled_at = ''
    if interactive_label:
        human_decision, reason, notes = prompt_human_label()
        if not human_decision:
            print('Skipped — not saved.')
            return None
        labeled_at = utc_now_iso()

    if notes_prefix and notes:
        notes = f'{notes_prefix}; {notes}'
    elif notes_prefix:
        notes = notes_prefix

    sample_id = f'LGT-{datetime.now(timezone.utc).strftime("%Y%m%d")}-{uuid.uuid4().hex[:8]}'
    timestamp = utc_now_iso()
    image_path = save_frame_copy(frame, images_dir, sample_id)

    row = build_row(
        analysis,
        sample_id=sample_id,
        timestamp=timestamp,
        collection_session=collection_session,
        dataset_split=dataset_split,
        image_path=image_path,
        condition_category=condition_category,
        human_decision=human_decision,
        reason=reason,
        notes=notes,
        labeled_at=labeled_at,
    )
    append_row(csv_path, row)
    print(f'Saved {sample_id} (session={collection_session}, split={dataset_split})')
    return row


def _add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        '--output', '-o',
        default='',
        help='Dataset directory (default: data/lighting_validation/dev or .../validation)',
    )
    parser.add_argument(
        '--split',
        choices=('dev', 'validation'),
        default='dev',
        help='dev (workflow smoke-test) or validation (Milestone 5 evaluation set)',
    )
    parser.add_argument(
        '--session', '-s',
        default='auto',
        help='Collection session id, e.g. LGT-20260819-session01 (default: auto-increment)',
    )


def cmd_capture(args: argparse.Namespace) -> int:
    cv2 = _import_cv2()
    _ensure_eyevio_imports()

    dataset_dir = resolve_dataset_dir(args.split, args.output or None)
    csv_path, images_dir = ensure_dataset_layout(dataset_dir)
    collection_session = resolve_session_id(args.session, csv_path)

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print(f'Could not open camera index {args.camera}')
        return 1

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    condition = args.condition or ''
    print('\nEyeVio lighting dataset — LIVE CAPTURE')
    print(f'  dataset_split      : {args.split}')
    print(f'  collection_session : {collection_session}')
    print(f'  output             : {dataset_dir}')
    print('\nFrozen thresholds (do not change during collection):')
    print(json.dumps(THRESHOLD_SNAPSHOT, indent=2))
    print('\nImmutable per sample: image, raw metrics, algorithm decision.')
    print('Human labels only add: human_decision, reason, notes, labeled_at.')
    print('\nControls: SPACE=capture  c=category  q=quit')

    window = 'EyeVio lighting capture (SPACE=capture, q=quit)'
    while True:
        ok, frame = cap.read()
        if not ok:
            print('Camera read failed.')
            break

        display = frame.copy()
        overlay = (
            f'{args.split} | {collection_session} | '
            f'{condition or "no category"} | SPACE=capture'
        )
        cv2.putText(display, overlay, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
        cv2.imshow(window, display)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('q'):
            break
        if key == ord('c'):
            condition = prompt_condition_category(condition)
            continue
        if key == 32:
            cv2.destroyWindow(window)
            process_and_record(
                frame,
                csv_path=csv_path,
                images_dir=images_dir,
                collection_session=collection_session,
                dataset_split=args.split,
                condition_category=condition,
                interactive_label=True,
            )
            cv2.namedWindow(window, cv2.WINDOW_NORMAL)

    cap.release()
    cv2.destroyAllWindows()
    cmd_status(args)
    return 0


def _iter_image_paths(directory: Path) -> List[Path]:
    exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
    return [p for p in sorted(directory.rglob('*')) if p.suffix.lower() in exts]


def cmd_ingest(args: argparse.Namespace) -> int:
    source = Path(args.dir).expanduser().resolve()
    if not source.is_dir():
        print(f'Not a directory: {source}')
        return 1

    dataset_dir = resolve_dataset_dir(args.split, args.output or None)
    csv_path, images_dir = ensure_dataset_layout(dataset_dir)
    collection_session = resolve_session_id(args.session, csv_path)
    paths = _iter_image_paths(source)
    if not paths:
        print(f'No images found under {source}')
        return 1

    print(f'Ingesting {len(paths)} images → {dataset_dir}')
    print(f'  session={collection_session}  split={args.split}')
    print('Metrics frozen at ingest; label later with `label`.\n')

    saved = 0
    for path in paths:
        frame = read_frame_from_path(path)
        if frame is None:
            print(f'Skip (unreadable): {path}')
            continue

        analysis = analyze_frame(frame)
        sample_id = f'LGT-{datetime.now(timezone.utc).strftime("%Y%m%d")}-{uuid.uuid4().hex[:8]}'
        rel_image = save_frame_copy(frame, images_dir, sample_id)

        row = build_row(
            analysis,
            sample_id=sample_id,
            timestamp=utc_now_iso(),
            collection_session=collection_session,
            dataset_split=args.split,
            image_path=rel_image,
            condition_category=args.condition or '',
            notes=f'ingested from {path.name}',
        )
        append_row(csv_path, row)
        saved += 1
        print(f'  {path.name} → {sample_id} [{analysis["lighting_status"]}]')

    print(f'\nSaved {saved} rows')
    cmd_status(args)
    return 0


def _load_all_rows(csv_path: Path) -> List[Dict[str, str]]:
    with csv_path.open('r', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def _write_all_rows(csv_path: Path, rows: List[Dict[str, str]]) -> None:
    with csv_path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col, '') for col in CSV_COLUMNS})


def _validate_immutable_preservation(
    original: Dict[str, str],
    merged: Dict[str, str],
) -> None:
    changed = [
        col for col in IMMUTABLE_AFTER_CAPTURE
        if (original.get(col, '') or '') != (merged.get(col, '') or '')
    ]
    if changed:
        raise RuntimeError(
            'Immutability violation: label operation attempted to change '
            + ', '.join(sorted(changed))
        )


def _merge_label_update(original: Dict[str, str], updates: Dict[str, str]) -> Dict[str, str]:
    merged = dict(original)
    for col in IMMUTABLE_AFTER_CAPTURE:
        merged[col] = original.get(col, '')
    merged['human_decision'] = updates.get('human_decision', '')
    merged['reason'] = updates.get('reason', '')
    merged['notes'] = updates.get('notes', original.get('notes', ''))
    merged['condition_category'] = updates.get(
        'condition_category', original.get('condition_category', '')
    )
    merged['labeled_at'] = updates.get('labeled_at', original.get('labeled_at', ''))
    return merged


def cmd_label(args: argparse.Namespace) -> int:
    cv2 = _import_cv2()

    dataset_dir = resolve_dataset_dir(args.split, args.output or None)
    csv_path, _ = ensure_dataset_layout(dataset_dir)
    rows = _load_all_rows(csv_path)
    unlabeled = [r for r in rows if not (r.get('human_decision') or '').strip()]

    if not unlabeled:
        print('All samples already labeled.')
        cmd_status(args)
        return 0

    print(f'Labeling {len(unlabeled)} samples (algorithm fields are immutable).\n')
    updated = 0
    for row in unlabeled:
        image_rel = row.get('image_path', '')
        image_full = dataset_dir / image_rel if image_rel else None
        print(
            f"\nSample: {row['sample_id']}  session={row.get('collection_session')}  "
            f"algo={row.get('lighting_status')}"
        )
        print(
            f"  left={row.get('left_eye_mean')} right={row.get('right_eye_mean')} "
            f"delta={row.get('left_right_delta')} under={row.get('under_ratio')} "
            f"over={row.get('over_ratio')}"
        )

        if image_full and image_full.exists():
            img = cv2.imread(str(image_full))
            if img is not None:
                cv2.imshow('Label this sample (close window after viewing)', img)
                cv2.waitKey(0)
                cv2.destroyAllWindows()

        condition = row.get('condition_category') or ''
        if not condition.strip():
            condition = prompt_condition_category()

        human_decision, reason, notes = prompt_human_label()
        if not human_decision:
            print('Skipped.')
            continue

        label_updates = {
            'human_decision': human_decision,
            'reason': reason,
            'notes': notes,
            'condition_category': condition,
            'labeled_at': utc_now_iso(),
        }
        merged = _merge_label_update(row, label_updates)
        _validate_immutable_preservation(row, merged)

        for i, original in enumerate(rows):
            if original['sample_id'] == row['sample_id']:
                rows[i] = merged
                break
        updated += 1

    _write_all_rows(csv_path, rows)
    print(f'\nUpdated {updated} human labels (algorithm outputs unchanged)')
    cmd_status(args)
    return 0


def _integrity_errors(rows: List[Dict[str, str]]) -> Tuple[List[str], List[Tuple[str, List[str]]]]:
    ids = [r.get('sample_id', '') for r in rows]
    duplicate_ids = sorted({sid for sid in ids if sid and ids.count(sid) > 1})

    malformed: List[Tuple[str, List[str]]] = []
    for r in rows:
        missing = [
            col for col in REQUIRED_AT_CAPTURE
            if not str(r.get(col, '')).strip()
        ]
        if missing:
            malformed.append((r.get('sample_id', '?'), missing))

    return duplicate_ids, malformed


def cmd_status(args: argparse.Namespace) -> int:
    dataset_dir = resolve_dataset_dir(args.split, args.output or None)
    csv_path = dataset_dir / CSV_FILENAME
    if not csv_path.exists():
        print(f'No dataset yet at {dataset_dir}')
        return 0

    rows = _load_all_rows(csv_path)

    duplicate_ids, malformed = _integrity_errors(rows)
    if duplicate_ids:
        print('ERROR: duplicate sample_id values found:')
        for sid in duplicate_ids:
            print(f'  {sid}')
        return 2
    if malformed:
        print('ERROR: samples with missing capture fields:')
        for sid, missing in malformed[:10]:
            print(f'  {sid}: {", ".join(sorted(missing))}')
        if len(malformed) > 10:
            print(f'  ... and {len(malformed) - 10} more')
        return 2

    labeled = [r for r in rows if (r.get('human_decision') or '').strip()]
    unlabeled = len(rows) - len(labeled)
    usable = sum(1 for r in labeled if r.get('human_decision') == 'usable')
    not_usable = sum(1 for r in labeled if r.get('human_decision') == 'not_usable')

    by_status: Dict[str, int] = {}
    by_human: Dict[str, int] = {}
    by_condition: Dict[str, int] = {}
    by_session: Dict[str, int] = {}
    for r in rows:
        by_status[r.get('lighting_status', '?')] = by_status.get(r.get('lighting_status', '?'), 0) + 1
        hd = r.get('human_decision') or '(unlabeled)'
        by_human[hd] = by_human.get(hd, 0) + 1
        cat = r.get('condition_category') or '(none)'
        by_condition[cat] = by_condition.get(cat, 0) + 1
        sess = r.get('collection_session') or '(none)'
        by_session[sess] = by_session.get(sess, 0) + 1

    split = args.split
    print(f'\n=== Lighting dataset [{split}] ===')
    print(f'Directory       : {dataset_dir}')
    print(f'CSV             : {csv_path}')
    print(f'Total samples   : {len(rows)}')
    print(f'Labeled         : {len(labeled)}')
    print(f'Unlabeled       : {unlabeled}')
    if labeled:
        print(f'Human usable    : {usable}')
        print(f'Human not_usable: {not_usable}')
    if split == 'dev':
        print('Purpose         : workflow sanity (~20); exclude from Milestone 5 metrics')
    else:
        print('Purpose         : pilot validation set — aim for balanced, varied conditions')
        print('Note            : ~100 is a practical target, not a magic sample size')

    print('\nCollection sessions:')
    for k, v in sorted(by_session.items()):
        print(f'  {k}: {v}')

    print('\nAlgorithm lighting_status:')
    for k, v in sorted(by_status.items()):
        print(f'  {k}: {v}')

    print('\nHuman decision:')
    for k, v in sorted(by_human.items()):
        print(f'  {k}: {v}')

    print('\nCondition category:')
    for k, v in sorted(by_condition.items()):
        print(f'  {k}: {v}')

    return 0


def cmd_analyze_file(args: argparse.Namespace) -> int:
    path = Path(args.image).expanduser()
    frame = read_frame_from_path(path)
    if frame is None:
        print(f'Could not read {path}')
        return 1
    print_analysis_summary(analyze_frame(frame))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='Collect EyeVio lighting validation dataset (Milestone 4).',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Two-dataset workflow:
  dev         → smoke-test collector + labeling workflow (~20)
  validation  → frozen thresholds; Milestone 5 metrics (exclude dev)

Example:
  capture --split dev --session LGT-20260819-session01
  capture --split validation --session LGT-20260820-session01

Human label = image suitability for EyeVio analysis (not clinical diagnosis).
Capture-time metrics/decisions are immutable; label mode edits human fields only.

Methodology:
  Version 1 frozen thresholds → validation dataset → measured performance
  → Version 2 calibrated thresholds → independent re-validation
        """,
    )

    sub = parser.add_subparsers(dest='command', required=True)

    p_capture = sub.add_parser('capture', help='Live webcam capture + interactive labeling')
    _add_common_args(p_capture)
    p_capture.add_argument('--camera', type=int, default=0)
    p_capture.add_argument('--condition', '-c', default='')
    p_capture.set_defaults(func=cmd_capture)

    p_ingest = sub.add_parser('ingest', help='Batch ingest images (metrics only; label later)')
    _add_common_args(p_ingest)
    p_ingest.add_argument('--dir', '-d', required=True)
    p_ingest.add_argument('--condition', '-c', default='')
    p_ingest.set_defaults(func=cmd_ingest)

    p_label = sub.add_parser('label', help='Label rows missing human_decision')
    _add_common_args(p_label)
    p_label.set_defaults(func=cmd_label)

    p_status = sub.add_parser('status', help='Dataset counts + integrity checks (no vision deps)')
    _add_common_args(p_status)
    p_status.set_defaults(func=cmd_status)

    p_analyze = sub.add_parser('analyze', help='Print metrics for one image (no CSV write)')
    p_analyze.add_argument('image')
    p_analyze.set_defaults(func=cmd_analyze_file)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == '__main__':
    raise SystemExit(main())
