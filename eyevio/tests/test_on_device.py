"""On-device (browser) result validation. Run: ./venv/bin/python -m pytest tests/test_on_device.py"""

import base64
import copy
import io

import pytest
from PIL import Image

from app.ai_models.on_device import (
    OnDeviceValidationError,
    build_on_device_analysis,
    load_manifest,
    strip_images,
)

MANIFEST = load_manifest()
pytestmark = pytest.mark.skipif(not MANIFEST, reason='ONNX manifest not found')


def runtime(name):
    entry = MANIFEST[name]
    return {
        'ort_version': '1.30.0',
        'webgpu': False,
        'wasm_threads': 1,
        'models': {name: {'variant': entry['browser_variant'], 'sha256': entry['files'][entry['browser_variant']]['sha256']}},
    }


def redness_eye(redness=22.4, ml=0.8, reliable=True):
    return {
        'redness': {
            'sclera_redness': redness,
            'sclera_redness_raw': redness + 1,
            'white_balance_applied': True,
            'redness_rg': 17.9,
            'redness_normalized': 0.03,
            'red_pixel_fraction': 0.12,
            'mask_coverage': 0.21,
            'redness_reliable': reliable,
        },
        'surface': {'experimental_tear_proxy': 71.3, 'experimental_texture_proxy': 33.8},
        'ml': {'available': True, 'score': ml},
    }


def redness_payload(**over):
    p = {
        'kind': 'redness',
        'version': 1,
        'white_balance': {
            'available': True,
            'frame_chroma_bgr': [0.29, 0.33, 0.38],
            'gains_bgr': [1.03, 1.0, 0.99],
            'cast_ratio': 1.04,
            'strong_cast': False,
        },
        'eyes': {'left': redness_eye(), 'right': redness_eye(30.0, 1.7)},
        'runtime': runtime('sclera_redness'),
    }
    p.update(over)
    return p


def cataract_payload(left=(0.1, 0.5), right=(0.9, 0.4)):
    def eye(prob, ood):
        return {
            'screening': {'prob': prob, 'ood_score': ood, 'cam_central_mass': 0.61},
            'image_metrics': {'mean_brightness': 91.2, 'texture_energy': 0.4, 'dark_pupil_ratio': 0.2, 'red_minus_blue': 12.0},
        }
    return {'kind': 'cataract', 'version': 1, 'eyes': {'left': eye(*left), 'right': eye(*right)}, 'runtime': runtime('cataract_screen')}


def test_redness_rebuilds_findings_and_grades_server_side():
    out = build_on_device_analysis('dry_eye', redness_payload(), lighting={'status': 'normal', 'acceptable': True})
    assert out['ml_redness']['score'] == 1.25
    assert out['ml_redness']['discretized_grade'] == 1
    assert out['ml_redness']['model_version'].endswith('+onnx_int8')
    assert out['left_eye']['efron_style_grade'] == 1
    assert out['metrics']['avg_sclera_redness'] == pytest.approx(26.2)
    assert 'Model detects mild visible redness in this photo' in out['findings']
    assert out['on_device']['model_verified'] is True
    assert out['aligned_crops'] is None
    assert out['capture_quality']['usable'] is True


def test_client_findings_and_extra_fields_are_ignored():
    p = redness_payload()
    p['findings'] = ['Diagnosed with conjunctivitis']
    p['eyes']['left']['appearance_score'] = 100
    out = build_on_device_analysis('dry_eye', p)
    assert 'Diagnosed with conjunctivitis' not in out['findings']
    assert out['left_eye']['appearance_score'] != 100


def test_unknown_model_hash_rejected():
    p = redness_payload()
    p['runtime']['models']['sclera_redness']['sha256'] = '0' * 64
    with pytest.raises(OnDeviceValidationError, match='hash'):
        build_on_device_analysis('dry_eye', p)


@pytest.mark.parametrize('path,value', [
    (('eyes', 'left', 'ml', 'score'), 9),
    (('eyes', 'left', 'redness', 'sclera_redness'), -5),
    (('eyes', 'right', 'surface', 'experimental_tear_proxy'), float('nan')),
    (('eyes', 'right', 'redness', 'mask_coverage'), 'lots'),
])
def test_out_of_range_values_rejected(path, value):
    p = redness_payload()
    target = p
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(OnDeviceValidationError):
        build_on_device_analysis('dry_eye', p)


def test_unreliable_redness_is_null_not_zero():
    p = redness_payload()
    p['eyes']['left'] = redness_eye(reliable=False)
    out = build_on_device_analysis('dry_eye', p)
    assert out['left_eye']['sclera_redness'] is None
    assert out['metrics']['avg_sclera_redness'] == 30.0


def test_cataract_server_applies_its_own_ood_threshold_and_bands():
    thr = MANIFEST['cataract_screen']['ood_threshold']
    out = build_on_device_analysis('cataract', cataract_payload(left=(0.1, 0.5), right=(0.95, thr + 0.5)))
    assert out['left_eye']['screening']['status'] == 'assessed'
    assert out['left_eye']['screening']['band'] == 'low'
    assert out['right_eye']['screening']['status'] == 'cannot_assess'
    assert 'likelihood' not in out['right_eye']['screening']
    assert out['screening']['coverage'] == 'one_eye'
    assert 'stayed on this device' not in out['risk_message']


def test_cataract_elevated_band_and_photo_note():
    out = build_on_device_analysis('cataract', cataract_payload(left=(0.85, 0.3), right=(0.5, 0.3)))
    assert out['screening']['band'] == 'elevated' and out['screening']['driving_eye'] == 'left'
    thr = MANIFEST['cataract_screen']['ood_threshold']
    both_ood = build_on_device_analysis('cataract', cataract_payload(left=(0.5, thr + 1), right=(0.5, thr + 1)))
    assert both_ood['screening']['status'] == 'cannot_assess'
    assert 'stayed on this device' in both_ood['risk_message']


def test_wrong_payload_version_rejected():
    with pytest.raises(OnDeviceValidationError, match='version'):
        build_on_device_analysis('dry_eye', redness_payload(version=99))


def test_lighting_is_sanitised():
    out = build_on_device_analysis('dry_eye', redness_payload(), lighting={
        'status': 'extreme_problem', 'acceptable': False, 'issues': ['x' * 500], 'metrics': {'a': 1, 'b': 'no'},
    })
    assert out['lighting']['status'] == 'extreme_problem'
    assert len(out['lighting']['issues'][0]) == 160
    assert out['lighting']['metrics'] == {'a': 1}
    assert out['capture_quality']['reasons'] == ['extreme_lighting']


def test_strip_images_removes_crops_and_gradcam():
    analysis = {
        'aligned_crops': {'left': 'data:...'},
        'pupil_crops': {'left': 'data:...'},
        'left_eye': {'screening': {'status': 'assessed', 'gradcam': 'data:...'}},
        'right_eye': {'screening': {'status': 'cannot_assess'}},
    }
    original = copy.deepcopy(analysis)
    out = strip_images(analysis)
    assert 'aligned_crops' not in out and 'pupil_crops' not in out
    assert out['left_eye']['screening']['gradcam'] is None
    assert analysis == original


# --- routes (need the test database) ---

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
    r = client.post('/api/auth/register', json={'email': 'ondevice@example.com', 'password': 'testpassword123'})
    return {'Authorization': f"Bearer {r.get_json()['access_token']}"}


def data_url(size=(96, 72)):
    buf = io.BytesIO()
    Image.new('RGB', size, (180, 120, 110)).save(buf, 'JPEG')
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def fake_server_cataract(_image):
    crop = data_url((64, 64))
    eye = {'screening': {'status': 'assessed', 'likelihood': 0.1, 'band': 'low', 'gradcam': crop}}
    return {
        'kind': 'cataract', 'left_eye': eye, 'right_eye': copy.deepcopy(eye),
        'screening': {'status': 'assessed', 'band': 'low'},
        'aligned_crops': {'left': crop, 'right': crop}, 'pupil_crops': {'left': crop, 'right': crop},
        'lighting': {'status': 'normal', 'acceptable': True}, 'metrics': {},
    }


def test_route_on_device_stores_scores_only(client, auth):
    r = client.post('/api/eye-photos/', headers=auth, json={'condition_type': 'dry_eye', 'on_device': redness_payload()})
    assert r.status_code == 201, r.get_json()
    photo = r.get_json()['photo']
    assert photo['image_thumbnail'] is None
    details = photo['analysis_details']
    assert details['ml_redness'] == {'status': 'withheld'}
    assert details['experimental_models']['models_run'] == ['sclera_redness']
    assert 'ml_sclera_grade' not in details['metrics']
    assert 'ml_redness' not in details['left_eye']

    r = client.post('/api/eye-photos/', headers=auth, json={'condition_type': 'dry_eye', 'on_device': redness_payload()})
    cmp = client.get(f"/api/eye-photos/compare?current_id={r.get_json()['photo']['id']}&baseline_id={photo['id']}", headers=auth)
    assert cmp.status_code == 200
    assert 'metric_only_photo_kept_on_device' in str(cmp.get_json())


def test_route_rejects_forged_model_hash(client, auth):
    p = redness_payload()
    p['runtime']['models']['sclera_redness']['sha256'] = 'f' * 64
    r = client.post('/api/eye-photos/', headers=auth, json={'condition_type': 'dry_eye', 'on_device': p})
    assert r.status_code == 400 and r.get_json()['error'] == 'invalid_on_device_result'


@pytest.mark.parametrize('store', [False, True])
def test_route_server_fallback_respects_store_image(client, auth, monkeypatch, store):
    monkeypatch.setattr('app.routes.eye_photo.analyze_cataract_from_base64', fake_server_cataract)
    r = client.post('/api/eye-photos/', headers=auth, json={'condition_type': 'cataract', 'image': data_url(), 'store_image': store})
    assert r.status_code == 201, r.get_json()
    photo = r.get_json()['photo']
    details = photo['analysis_details']
    assert (photo['image_thumbnail'] is not None) is store
    assert ('pupil_crops' in details) is store
    assert details['left_eye']['screening'] == {'status': 'withheld'}
    assert details['screening'] == {'status': 'withheld'}
    assert details['experimental_models']['messages'][0] == 'Experimental analysis completed'


def test_route_dry_eye_test_accepts_on_device(client, auth):
    r = client.post('/api/vision-test/analyze-dry-eye', headers=auth, json={'on_device': redness_payload()})
    assert r.status_code == 200
    body = r.get_json()
    assert body['crop_source'] == 'on_device_face_mesh'
    assert body['ml_redness'] == {'status': 'withheld'}
    assert body['findings'] == body['heuristic_findings']


def test_research_mode_returns_raw_outputs(client, auth, monkeypatch):
    monkeypatch.setenv('EXPERIMENTAL_IMAGE_MODELS_USER_FACING', '1')
    r = client.post('/api/vision-test/analyze-dry-eye', headers=auth, json={'on_device': redness_payload()})
    assert r.get_json()['ml_redness']['discretized_grade'] == 1
