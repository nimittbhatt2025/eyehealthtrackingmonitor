"""Multipart vs base64 image transport. Run: ./venv/bin/python -m pytest tests/test_image_upload.py"""

import base64
import io
import json

import numpy as np
import pytest
from PIL import Image

from app.ai_models.dry_eye_analysis import decode_base64_image


def jpeg_bytes(size=(96, 72), colour=(180, 120, 110)):
    buf = io.BytesIO()
    Image.new('RGB', size, colour).save(buf, 'JPEG')
    return buf.getvalue()


def test_decoder_accepts_bytes_and_base64_identically():
    raw = jpeg_bytes()
    from_bytes = decode_base64_image(raw)
    from_b64 = decode_base64_image('data:image/jpeg;base64,' + base64.b64encode(raw).decode())
    assert from_bytes is not None and from_bytes.shape == (72, 96, 3)
    assert np.array_equal(from_bytes, from_b64)
    assert decode_base64_image(b'not an image') is None


@pytest.fixture
def client():
    from app import create_app
    from app.models import db

    app = create_app('testing')
    with app.app_context():
        db.create_all()
        yield app.test_client()
        db.session.remove()
        db.drop_all()


@pytest.fixture
def auth(client):
    r = client.post('/api/auth/register', json={'email': 'upload@example.com', 'password': 'testpassword123'})
    return {'Authorization': f"Bearer {r.get_json()['access_token']}"}


@pytest.fixture
def seen(monkeypatch):
    calls = []

    def fake(image):
        calls.append(image)
        frame = decode_base64_image(image)
        return {
            'kind': 'cataract', 'left_eye': {}, 'right_eye': {},
            'screening': {'status': 'cannot_assess'},
            'lighting': {'status': 'normal', 'acceptable': True}, 'metrics': {},
            'decoded_shape': list(frame.shape),
        }

    monkeypatch.setattr('app.routes.eye_photo.analyze_cataract_from_base64', fake)
    return calls


def multipart(image, meta, field='image'):
    return {field: (io.BytesIO(image), 'image.jpg', 'image/jpeg'), 'meta': json.dumps(meta)}


def test_multipart_upload_reaches_analysis_as_bytes(client, auth, seen):
    raw = jpeg_bytes()
    crop = {'source_size': [1280, 720], 'box': [400, 100, 480, 520], 'scale': 1, 'reason': 'face_region', 'junk': {'x': 1}}
    r = client.post('/api/eye-photos/', headers=auth, content_type='multipart/form-data',
                    data=multipart(raw, {'condition_type': 'cataract', 'store_image': False, 'client_crop': crop}))
    assert r.status_code == 201, r.get_json()
    assert seen == [raw]
    details = r.get_json()['photo']['analysis_details']
    assert details['decoded_shape'] == [72, 96, 3]
    assert details['upload']['transport'] == 'multipart'
    assert details['upload']['bytes'] == len(raw)
    assert details['upload']['client_crop'] == {k: crop[k] for k in ('source_size', 'box', 'scale', 'reason')}
    assert r.get_json()['photo']['image_thumbnail'] is None


def test_base64_json_still_accepted(client, auth, seen):
    url = 'data:image/jpeg;base64,' + base64.b64encode(jpeg_bytes()).decode()
    r = client.post('/api/eye-photos/', headers=auth, json={'condition_type': 'cataract', 'image': url})
    assert r.status_code == 201
    assert seen == [url]
    assert r.get_json()['photo']['analysis_details']['upload']['transport'] == 'base64'
    assert r.get_json()['photo']['image_thumbnail'] is not None


def test_multipart_rejects_non_image_and_bad_meta(client, auth, seen):
    r = client.post('/api/eye-photos/', headers=auth, content_type='multipart/form-data',
                    data=multipart(b'<svg onload=alert(1)>', {'condition_type': 'cataract'}))
    assert r.status_code == 400 and r.get_json()['error'] == 'invalid_image'
    r = client.post('/api/eye-photos/', headers=auth, content_type='multipart/form-data',
                    data={'image': (io.BytesIO(jpeg_bytes()), 'i.jpg'), 'meta': '[1, 2]'})
    assert r.status_code == 400 and r.get_json()['error'] == 'invalid_image'
    assert seen == []


WB = {'available': True, 'frame_chroma_bgr': [0.28, 0.33, 0.39], 'gains_bgr': [1.07, 1.0, 0.97], 'cast_ratio': 1.1, 'strong_cast': False}


@pytest.fixture
def dry_eye_calls(monkeypatch):
    calls = []

    def fake(image, *, capture_mode='camera', white_balance=None):
        calls.append(white_balance)
        return {'score': 80, 'metrics': {}, 'left_eye': {}, 'right_eye': {}, 'lighting': {'status': 'normal', 'acceptable': True}}

    monkeypatch.setattr('app.routes.eye_photo.analyze_dry_eye_from_base64', fake)
    monkeypatch.setattr('app.ai_models.dry_eye_analysis.analyze_dry_eye_from_base64', fake)
    return calls


def test_face_crop_upload_uses_client_full_frame_white_balance(client, auth, dry_eye_calls):
    crop = {'source_size': [1280, 720], 'box': [100, 0, 900, 720], 'scale': 1, 'reason': 'face_region', 'white_balance': WB}
    r = client.post('/api/eye-photos/', headers=auth, content_type='multipart/form-data',
                    data=multipart(jpeg_bytes(), {'condition_type': 'dry_eye', 'client_crop': crop}))
    assert r.status_code == 201, r.get_json()
    r = client.post('/api/vision-test/analyze-dry-eye', headers=auth, content_type='multipart/form-data',
                    data=multipart(jpeg_bytes(), {'client_crop': crop}))
    assert r.status_code == 200, r.get_json()
    assert [wb['gains_bgr'] for wb in dry_eye_calls] == [WB['gains_bgr']] * 2
    assert all(wb['source'] == 'client_full_frame' for wb in dry_eye_calls)


def test_uncropped_upload_ignores_client_white_balance(client, auth, dry_eye_calls):
    crop = {'source_size': [1280, 720], 'box': None, 'scale': 1, 'reason': 'no_landmarks', 'white_balance': WB}
    r = client.post('/api/eye-photos/', headers=auth, content_type='multipart/form-data',
                    data=multipart(jpeg_bytes(), {'condition_type': 'dry_eye', 'client_crop': crop}))
    assert r.status_code == 201
    assert dry_eye_calls == [None]


def test_out_of_range_client_white_balance_rejected(client, auth, dry_eye_calls):
    crop = {'box': [0, 0, 100, 100], 'white_balance': {**WB, 'gains_bgr': [5, 1, 1]}}
    r = client.post('/api/eye-photos/', headers=auth, content_type='multipart/form-data',
                    data=multipart(jpeg_bytes(), {'condition_type': 'dry_eye', 'client_crop': crop}))
    assert r.status_code == 400 and r.get_json()['error'] == 'invalid_image'
    assert dry_eye_calls == []


def test_calibration_accepts_multipart_frame(client, auth, monkeypatch):
    shapes = []

    def fake_detect(frame):
        shapes.append(frame.shape)
        return {'detected': True, 'avg_ear': 0.3}

    monkeypatch.setattr('app.routes.calibration.detect_eyes', fake_detect)
    assert client.post('/api/calibration/start', headers=auth).status_code == 200
    r = client.post('/api/calibration/baseline', headers=auth, content_type='multipart/form-data',
                    data=multipart(jpeg_bytes((64, 48)), {}, field='frame'))
    assert r.status_code == 200, r.get_json()
    r = client.post('/api/calibration/baseline', headers=auth,
                    json={'frame': 'data:image/jpeg;base64,' + base64.b64encode(jpeg_bytes((64, 48))).decode()})
    assert r.status_code == 200
    assert shapes == [(48, 64, 3), (48, 64, 3)]
