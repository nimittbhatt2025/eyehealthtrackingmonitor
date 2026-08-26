#!/usr/bin/env python3
"""Smoke test Eye Health Photo Monitor backend logic (no browser)."""
from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'eyevio'))

import cv2
import numpy as np

from app.ai_models.capture_quality import assess_anatomical_lighting, build_capture_quality_summary
from app.ai_models.dry_eye_analysis import analyze_dry_eye_frame, analyze_eye_patch
from app.utils.eye_photo_comparison import (
    CONFIRM_THRESHOLD,
    _apply_confirmation_upgrade,
    _decide_comparison_action,
    calculate_comparison_confidence,
    comparison_snapshot_from_result,
)


class FakePhoto:
    def __init__(self, **kwargs):
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
        self.captured_at = kwargs.get('captured_at', datetime.utcnow())
        self.image_thumbnail = 'data:image/jpeg;base64,'


def ok(label: str) -> None:
    print(f'  ✅ {label}')


def fail(label: str, detail: str = '') -> None:
    msg = f'  ❌ {label}'
    if detail:
        msg += f' — {detail}'
    print(msg)
    raise SystemExit(1)


def make_face_frame(mean: int = 120) -> np.ndarray:
    frame = np.full((480, 640, 3), mean, dtype=np.uint8)
    cv2.ellipse(frame, (320, 240), (90, 120), 0, 0, 360, (mean + 15, mean, mean - 10), -1)
    return frame


def main() -> None:
    print('Eye Health Photo Monitor — backend smoke test\n')

    # 1. Lighting
    frame = make_face_frame(120)
    lighting = assess_anatomical_lighting(frame, None)
    if lighting['status'] != 'framing_problem':
        fail('framing without landmarks', lighting['status'])
    ok('framing without landmarks → amber path')

    cq = build_capture_quality_summary({'status': 'normal', 'algorithm_version': 2.10})
    if not cq['usable'] or cq['grade'] != 'high':
        fail('capture quality normal room', str(cq))
    ok('capture quality summary (normal lighting)')

    # 2. Appearance score
    patch = np.zeros((80, 120, 3), dtype=np.uint8)
    patch[:, :, 2] = 170
    patch[:, :, 1] = 140
    eye = analyze_eye_patch(patch)
    if eye.get('appearance_score') is None:
        fail('appearance score missing')
    ok(f'appearance score computed ({eye["appearance_score"]})')

    # 3. Comparison decisions
    assert _decide_comparison_action(5, 'high', 'preferred', {}) == 'STABLE'
    assert _decide_comparison_action(15, 'high', 'preferred', {}) == 'MONITOR'
    assert _decide_comparison_action(22, 'high', 'preferred', {}) == 'RETAKE_TO_CONFIRM_CHANGE'
    assert _decide_comparison_action(22, 'low', 'preferred', {}) == 'RETAKE_FOR_QUALITY'
    ok('comparison decision ladder')

    # 4. Pairwise confidence
    current = FakePhoto(health_score=75, captured_at=datetime.utcnow())
    baseline = FakePhoto(
        id=2,
        health_score=82,
        captured_at=datetime.utcnow() - timedelta(days=30),
        analysis_details={'capture_quality': {'score': 90, 'grade': 'high', 'usable': True}},
    )
    current.analysis_details = {
        'capture_quality': {'score': 88, 'grade': 'high', 'usable': True},
        'aligned_crops': {'left': None, 'right': None},
    }
    conf = calculate_comparison_confidence(current, baseline, {'available': False}, 30)
    if conf['level'] not in ('high', 'moderate', 'low'):
        fail('comparison confidence level', conf['level'])
    ok(f'pairwise comparison confidence ({conf["level"]}, score {conf["score"]})')

    # 5. Confirmation upgrade
    prior = FakePhoto(
        id=3,
        analysis_details={
            'comparison_snapshot': {
                'action': 'RETAKE_TO_CONFIRM_CHANGE',
                'baseline_photo_id': 2,
                'health_score_delta': -8,
            }
        },
    )
    comp = {
        'action': 'RETAKE_TO_CONFIRM_CHANGE',
        'change_burden': 22,
        'changes': {'health_score': {'delta': -9}},
        'reasons': ['Appearance score dropped 9 points'],
        'comparison_confidence': 'high',
        'baseline_type': 'preferred',
        'baseline_photo_id': 2,
        'days_between': 30,
    }
    upgraded = _apply_confirmation_upgrade(comp, prior, 'dry_eye', 30)
    if upgraded['action'] != 'PERSISTENT_CHANGE' or not upgraded.get('deteriorated'):
        fail('confirmation upgrade', upgraded.get('action'))
    ok('confirmation retake → persistent change')

    snap = comparison_snapshot_from_result(comp)
    if snap.get('action') != 'RETAKE_TO_CONFIRM_CHANGE':
        fail('comparison snapshot')
    ok('comparison snapshot for storage')

    print('\n✨ All smoke checks passed.\n')


if __name__ == '__main__':
    main()
