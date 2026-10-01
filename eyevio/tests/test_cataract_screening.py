"""Cataract screening output + comparison. Run: ./venv/bin/python -m pytest tests/test_cataract_screening.py"""

import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest

from app.ai_models import cataract_opacity_analysis as cat
from app.ai_models.cataract_opacity_analysis import combine_eyes
from app.models import EyePhoto
from app.utils.eye_photo_comparison import compare_photos

REPO = Path(__file__).resolve().parents[2]
APP_CROPS = sorted((REPO / 'data' / 'app_captures').glob('photo*.jpg'))
CALIBRATED_ARTIFACTS = all(
    (REPO / name).is_file()
    for name in ('cataract_detection_resnet18.pth', 'cataract_model_meta.json', 'cataract_ood_stats.npz')
)


def eye(status, likelihood=None, band=None):
    s = {'status': status, 'method': 'resnet_v2_calibrated'}
    if status == 'assessed':
        s.update(likelihood=likelihood, band=band, thresholds={'rule_out': 0.2, 'rule_in': 0.8})
    else:
        s['reason'] = 'out_of_distribution'
    return {'screening': s}


def test_combine_uses_worse_eye():
    out = combine_eyes(eye('assessed', 0.1, 'low'), eye('assessed', 0.85, 'elevated'))
    assert out['status'] == 'assessed'
    assert out['driving_eye'] == 'right'
    assert out['band'] == 'elevated' and out['band_level'] == 2
    assert out['coverage'] == 'both_eyes'


def test_combine_one_eye_abstains():
    out = combine_eyes(eye('cannot_assess'), eye('assessed', 0.3, 'indeterminate'))
    assert out['status'] == 'assessed' and out['coverage'] == 'one_eye'


def test_combine_both_abstain_gives_no_number():
    out = combine_eyes(eye('cannot_assess'), eye('cannot_assess'))
    assert out['status'] == 'cannot_assess'
    assert out['likelihood'] is None and out['band'] is None


def photo(pid, band_level, days_ago, status='assessed'):
    bands = {0: 'low', 1: 'indeterminate', 2: 'elevated'}
    details = {
        'screening': {
            'status': status,
            'band': bands.get(band_level) if status == 'assessed' else None,
            'band_level': band_level if status == 'assessed' else None,
            'likelihood': {0: 0.05, 1: 0.5, 2: 0.9}.get(band_level) if status == 'assessed' else None,
        },
        'capture_quality': {'score': 95, 'usable': True},
    }
    return EyePhoto(
        id=pid, user_id=1, condition_type='cataract', image_thumbnail='', health_score=None,
        analysis_details=details, captured_at=datetime.utcnow() - timedelta(days=days_ago),
    )


def test_band_rise_one_level_asks_for_retake():
    result = compare_photos(photo(2, 1, 0), photo(1, 0, 30))
    assert result['action'] == 'RETAKE_TO_CONFIRM_CHANGE'
    assert any('low to indeterminate' in r for r in result['reasons'])


def test_stable_band_is_stable():
    result = compare_photos(photo(2, 0, 0), photo(1, 0, 30))
    assert result['action'] in ('STABLE', 'RETAKE_FOR_QUALITY')
    assert not result['reasons']


def test_abstained_photo_is_not_compared_on_model():
    result = compare_photos(photo(2, None, 0, status='cannot_assess'), photo(1, 0, 30))
    assert result['screening']['note']
    assert 'cataract_likelihood' not in result['changes']


@pytest.mark.skipif(not CALIBRATED_ARTIFACTS, reason='calibrated cataract artifacts not present')
def test_noise_image_abstains():
    from app.ai_models.cataract_resnet import screen_cataract
    noise = np.random.default_rng(0).integers(0, 255, (120, 160, 3), dtype=np.uint8)
    out = screen_cataract(noise)
    assert out['status'] == 'cannot_assess' and 'likelihood' not in out


@pytest.mark.skipif(not CALIBRATED_ARTIFACTS or len(APP_CROPS) < 2, reason='artifacts or app crops missing')
def test_full_frame_result_has_no_opacity_score(monkeypatch):
    import cv2
    left, right = cv2.imread(str(APP_CROPS[0])), cv2.imread(str(APP_CROPS[1]))
    monkeypatch.setattr(cat, '_crop_eyes', lambda frame: {
        'crops': {'left': left, 'right': right}, 'landmarks': None, 'face_detected': True,
    })
    monkeypatch.setattr(cat, 'assess_anatomical_lighting', lambda frame, lm: {'status': 'ok'})
    monkeypatch.setattr(cat, 'detect_eyewear', lambda frame, lm: {'detected': False})
    out = cat.analyze_cataract_frame(np.zeros((480, 640, 3), dtype=np.uint8))
    for banned in ('opacity_score', 'opacity_grade', 'grade_level'):
        assert banned not in out
    assert out['score'] is None
    assert out['screening']['status'] in ('assessed', 'cannot_assess')
    json.dumps(out)
