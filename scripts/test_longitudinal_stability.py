#!/usr/bin/env python3
"""
Same-day longitudinal stability tests for Eye Health Photo Monitor.

Verifies that two captures taken minutes apart (or identical frames) resolve to
STABLE / "Matches baseline" — not false alerts.

Usage (from repo root):
  ./eyevio/venv/bin/python3.12 scripts/test_longitudinal_stability.py

  ./eyevio/venv/bin/python3.12 scripts/test_longitudinal_stability.py \\
    --images data/lighting_validation/dev/images --sample 20
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / 'eyevio'))

import cv2
import numpy as np

from app.ai_models.dry_eye_analysis import analyze_dry_eye_frame
from app.utils.eye_photo_comparison import compare_photos

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
STABLE_ACTIONS = frozenset({'STABLE', 'MONITOR', 'RETAKE_FOR_QUALITY'})
FAIL_ACTIONS = frozenset({'RETAKE_TO_CONFIRM_CHANGE', 'PERSISTENT_CHANGE'})


class FakePhoto:
    """Minimal EyePhoto stand-in for comparison tests."""

    def __init__(self, **kwargs: Any) -> None:
        self.id = kwargs.get('id', 1)
        self.user_id = kwargs.get('user_id', 1)
        self.condition_type = kwargs.get('condition_type', 'dry_eye')
        self.health_score = kwargs.get('health_score', 80.0)
        self.sclera_redness = kwargs.get('sclera_redness', 20.0)
        self.tear_film_quality = kwargs.get('tear_film_quality', 70.0)
        self.surface_irregularity = kwargs.get('surface_irregularity', 30.0)
        self.left_eye_score = kwargs.get('left_eye_score', 79.0)
        self.right_eye_score = kwargs.get('right_eye_score', 81.0)
        self.analysis_details = kwargs.get('analysis_details', {})
        self.captured_at = kwargs.get('captured_at', datetime.now(timezone.utc))
        self.image_thumbnail = 'data:image/jpeg;base64,'


def ok(label: str) -> None:
    print(f'  ✅ {label}')


def fail(label: str, detail: str = '') -> None:
    msg = f'  ❌ {label}'
    if detail:
        msg += f' — {detail}'
    print(msg)


def photo_from_analysis(analysis: Dict[str, Any], photo_id: int, captured_at: datetime) -> Optional[FakePhoto]:
    if analysis.get('error'):
        return None
    metrics = analysis.get('metrics') or {}
    left = analysis.get('left_eye') or {}
    right = analysis.get('right_eye') or {}
    return FakePhoto(
        id=photo_id,
        health_score=float(analysis.get('appearance_score') or 0),
        sclera_redness=float(metrics.get('avg_sclera_redness') or 0),
        tear_film_quality=float(metrics.get('avg_tear_film_quality') or 50),
        surface_irregularity=float(metrics.get('avg_surface_irregularity') or 50),
        left_eye_score=float(left.get('appearance_score') or left.get('health_score') or 0),
        right_eye_score=float(right.get('appearance_score') or right.get('health_score') or 0),
        analysis_details=analysis,
        captured_at=captured_at,
    )


def adjust_frame(frame: np.ndarray, *, brightness: float = 0, contrast: float = 1.0) -> np.ndarray:
    out = np.clip(frame.astype(np.float32) * contrast + brightness, 0, 255).astype(np.uint8)
    return out


def skip(label: str, detail: str = '') -> None:
    msg = f'  ⏭️  {label}'
    if detail:
        msg += f' — {detail}'
    print(msg)


def test_identical_fake_photos() -> bool:
    """Comparison logic only — no vision pipeline."""
    print('\n1. Identical stored metrics (must be STABLE)')
    now = datetime.now(timezone.utc)
    shared_details = {
        'capture_quality': {'score': 90, 'grade': 'high', 'usable': True},
        'aligned_crops': {'left': None, 'right': None},
    }
    baseline = FakePhoto(
        id=1,
        health_score=72.0,
        sclera_redness=38.0,
        tear_film_quality=65.0,
        surface_irregularity=12.0,
        left_eye_score=71.0,
        right_eye_score=73.0,
        analysis_details=shared_details,
        captured_at=now - timedelta(minutes=5),
    )
    current = FakePhoto(
        id=2,
        health_score=72.0,
        sclera_redness=38.0,
        tear_film_quality=65.0,
        surface_irregularity=12.0,
        left_eye_score=71.0,
        right_eye_score=73.0,
        analysis_details=shared_details,
        captured_at=now,
    )
    result = compare_photos(current, baseline, baseline_type='preferred')
    action = result.get('action')
    if action != 'STABLE':
        fail('identical fake photos', f'action={action}, burden={result.get("change_burden")}')
        return False
    ok(f'identical fake photos → {action}')
    return True


def compare_frames(
    baseline_frame: np.ndarray,
    current_frame: np.ndarray,
    *,
    minutes_apart: int = 5,
) -> Tuple[str, Dict[str, Any]]:
    base_analysis = analyze_dry_eye_frame(baseline_frame)
    cur_analysis = analyze_dry_eye_frame(current_frame)
    now = datetime.now(timezone.utc)
    baseline = photo_from_analysis(base_analysis, photo_id=1, captured_at=now - timedelta(minutes=minutes_apart))
    current = photo_from_analysis(cur_analysis, photo_id=2, captured_at=now)
    if baseline is None or current is None:
        return 'SKIP', {'error': base_analysis.get('error') or cur_analysis.get('error')}
    result = compare_photos(current, baseline, baseline_type='preferred')
    return result.get('action', 'UNKNOWN'), result


def test_identical_synthetic() -> bool:
    """Optional — requires MediaPipe face on synthetic art; skipped if no face."""
    print('\n2. Synthetic face frame (skipped if MediaPipe cannot detect face)')
    frame = np.full((480, 640, 3), 120, dtype=np.uint8)
    cv2.ellipse(frame, (320, 240), (90, 120), 0, 0, 360, (140, 115, 105), -1)
    cv2.circle(frame, (280, 220), 12, (240, 235, 230), -1)
    cv2.circle(frame, (360, 220), 12, (240, 235, 230), -1)

    action, result = compare_frames(frame, frame.copy())
    if action == 'SKIP':
        skip('synthetic face', str(result.get('error', 'no face')))
        return True
    if action != 'STABLE':
        fail('synthetic face identical', f'action={action}, burden={result.get("change_burden")}')
        return False
    ok(f'synthetic face identical → {action}')
    return test_mild_lighting_shifts(frame, 'synthetic') != 'fail'


def test_mild_lighting_shifts(frame: np.ndarray, label: str) -> str:
    """Returns 'pass', 'fail', or 'skip'."""
    shifts = [
        ('brightness +12', adjust_frame(frame, brightness=12)),
        ('brightness -12', adjust_frame(frame, brightness=-12)),
        ('contrast 1.08', adjust_frame(frame, contrast=1.08)),
        ('contrast 0.92', adjust_frame(frame, contrast=0.92)),
    ]
    outcome = 'pass'
    for shift_label, shifted in shifts:
        action, result = compare_frames(frame, shifted, minutes_apart=5)
        if action == 'SKIP':
            skip(f'{label} / {shift_label}', result.get('error', 'analysis failed'))
            return 'skip'
        if action in FAIL_ACTIONS:
            fail(f'{label} / {shift_label}', f'action={action}, burden={result.get("change_burden")}')
            outcome = 'fail'
        elif action not in STABLE_ACTIONS:
            fail(f'{label} / {shift_label}', f'unexpected action={action}')
            outcome = 'fail'
        else:
            ok(f'{label} / {shift_label} → {action}')
    return outcome


def test_real_images(image_paths: List[Path], sample_size: int, seed: int) -> bool:
    if not image_paths:
        print('\n3. Real webcam images — skipped (no paths)')
        return True

    rng = random.Random(seed)
    pool = image_paths.copy()
    rng.shuffle(pool)
    selected = pool[:sample_size]

    print(f'\n3. Real webcam images (n={len(selected)}, same frame + mild shifts)')
    passed = True
    ran = 0
    for path in selected:
        frame = cv2.imread(str(path))
        if frame is None:
            skip(path.name, 'unreadable')
            continue

        action, result = compare_frames(frame, frame.copy(), minutes_apart=5)
        if action == 'SKIP':
            skip(path.name, str(result.get('error', 'analysis failed')))
            continue

        ran += 1
        if action in FAIL_ACTIONS:
            fail(f'{path.name} identical', f'action={action}, burden={result.get("change_burden")}')
            passed = False
        elif action not in STABLE_ACTIONS:
            fail(f'{path.name} identical', f'unexpected action={action}')
            passed = False
        else:
            ok(f'{path.name} identical → {action}')

        shift_result = test_mild_lighting_shifts(frame, path.name)
        if shift_result == 'fail':
            passed = False
        elif shift_result == 'skip':
            skip(path.name, 'lighting-shift checks skipped after analysis failure')

    if ran == 0:
        skip('real image suite', 'no analyzable faces in sample — try --sample 20')
        return True
    return passed


def collect_images(directory: Path, limit: int) -> List[Path]:
    files = sorted(
        p for p in directory.glob('*')
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )
    return files[:limit] if limit > 0 else files


def main() -> None:
    parser = argparse.ArgumentParser(description='Same-day longitudinal stability tests')
    parser.add_argument(
        '--images',
        default=str(REPO_ROOT / 'data' / 'lighting_validation' / 'dev' / 'images'),
        help='Directory of real face photos (optional)',
    )
    parser.add_argument('--sample', type=int, default=10, help='Real images to sample (0 = skip)')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    print('Eye Health Photo Monitor — longitudinal stability tests')
    print('=' * 56)

    all_pass = True
    all_pass &= test_identical_fake_photos()
    all_pass &= test_identical_synthetic()

    image_dir = Path(args.images)
    if args.sample > 0 and image_dir.is_dir():
        paths = collect_images(image_dir, limit=max(args.sample * 5, 50))
        all_pass &= test_real_images(paths, args.sample, args.seed)
    else:
        print('\n3. Real webcam images — skipped')

    print('\n' + '=' * 56)
    if all_pass:
        print('All stability checks passed.')
        raise SystemExit(0)
    print('Some stability checks FAILED.')
    raise SystemExit(1)


if __name__ == '__main__':
    main()
