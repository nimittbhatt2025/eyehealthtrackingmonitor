"""Background analysis jobs (202 + polling). Run: ./venv/bin/python -m pytest tests/test_analysis_jobs.py"""

import io
import json
import time

import pytest
from PIL import Image

ASYNC = {'Prefer': 'respond-async'}


@pytest.fixture
def app():
    from app import create_app
    from app.models import db

    app = create_app('testing')
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def register(client, email):
    r = client.post('/api/auth/register', json={'email': email, 'password': 'testpassword123'})
    return {'Authorization': f"Bearer {r.get_json()['access_token']}"}


@pytest.fixture
def auth(client):
    return register(client, 'jobs@example.com')


def upload(meta):
    buf = io.BytesIO()
    Image.new('RGB', (96, 72), (180, 120, 110)).save(buf, 'JPEG')
    return {'image': (io.BytesIO(buf.getvalue()), 'image.jpg', 'image/jpeg'), 'meta': json.dumps(meta)}


def fake_cataract(status='normal', boom=False):
    def fake(_image):
        if boom:
            raise RuntimeError('model exploded')
        eye = {'screening': {'status': 'assessed', 'likelihood': 0.1, 'band': 'low', 'gradcam': 'data:image/png;base64,AAAA'}}
        return {
            'kind': 'cataract', 'left_eye': eye, 'right_eye': dict(eye),
            'screening': {'status': 'assessed', 'band': 'low'},
            'pupil_crops': {'left': 'data:image/jpeg;base64,AAAA'},
            'lighting': {'status': status, 'acceptable': status == 'normal'}, 'metrics': {},
        }
    return fake


def submit(client, auth, meta=None):
    r = client.post('/api/eye-photos/', headers={**auth, **ASYNC}, content_type='multipart/form-data',
                    data=upload(meta or {'condition_type': 'cataract', 'store_image': False}))
    assert r.status_code == 202, r.get_json()
    body = r.get_json()
    assert body['poll_url'] == f"/api/jobs/{body['job_id']}"
    return body['job_id']


def wait(client, auth, job_id, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f'/api/jobs/{job_id}', headers=auth)
        assert r.status_code == 200
        job = r.get_json()
        if job['status'] in ('done', 'failed'):
            return job
        time.sleep(0.05)
    raise AssertionError('job did not finish')


def test_async_capture_polls_to_result(client, auth, monkeypatch):
    from app.models import AnalysisJob, db

    monkeypatch.setattr('app.routes.eye_photo.analyze_cataract_from_base64', fake_cataract())
    job_id = submit(client, auth)
    job = wait(client, auth, job_id)
    assert job['status'] == 'done' and job['http_status'] == 201
    assert job['result']['photo']['condition_type'] == 'cataract'
    assert job['result']['analysis']['left_eye']['screening']['gradcam'].startswith('data:')

    stored = db.session.get(AnalysisJob, job_id).result
    assert stored['analysis']['left_eye']['screening']['gradcam'] is None
    assert 'pupil_crops' not in stored['analysis']

    again = client.get(f'/api/jobs/{job_id}', headers=auth).get_json()
    assert again['result']['analysis']['left_eye']['screening']['gradcam'] is None


def test_gate_rejection_surfaces_original_status(client, auth, monkeypatch):
    monkeypatch.setattr('app.routes.eye_photo.analyze_cataract_from_base64', fake_cataract('framing_problem'))
    job = wait(client, auth, submit(client, auth))
    assert job['status'] == 'failed' and job['http_status'] == 422
    assert job['result']['error'] == 'face_framing'


def test_crash_marks_job_failed(client, auth, monkeypatch):
    monkeypatch.setattr('app.routes.eye_photo.analyze_cataract_from_base64', fake_cataract(boom=True))
    job = wait(client, auth, submit(client, auth))
    assert job['status'] == 'failed' and job['http_status'] == 500
    assert job['result'] == {'error': 'analysis_failed', 'message': 'model exploded'}


def test_other_users_cannot_read_job(client, auth, monkeypatch):
    monkeypatch.setattr('app.routes.eye_photo.analyze_cataract_from_base64', fake_cataract())
    job_id = submit(client, auth)
    wait(client, auth, job_id)
    other = register(client, 'someone-else@example.com')
    assert client.get(f'/api/jobs/{job_id}', headers=other).status_code == 404
    assert client.get('/api/jobs/does-not-exist', headers=auth).status_code == 404


def test_without_prefer_header_stays_synchronous(client, auth, monkeypatch):
    monkeypatch.setattr('app.routes.eye_photo.analyze_cataract_from_base64', fake_cataract())
    r = client.post('/api/eye-photos/', headers=auth, content_type='multipart/form-data',
                    data=upload({'condition_type': 'cataract'}))
    assert r.status_code == 201


def test_async_dry_eye_analysis(client, auth, monkeypatch):
    def fake(image, *, capture_mode='camera', white_balance=None):
        return {'score': 80, 'aligned_crops': {'left': 'data:...'}, 'lighting': {'status': 'normal', 'acceptable': True}}

    monkeypatch.setattr('app.ai_models.dry_eye_analysis.analyze_dry_eye_from_base64', fake)
    r = client.post('/api/vision-test/analyze-dry-eye', headers={**auth, **ASYNC},
                    content_type='multipart/form-data', data=upload({}))
    assert r.status_code == 202
    job = wait(client, auth, r.get_json()['job_id'])
    assert job['status'] == 'done' and job['http_status'] == 200
    assert job['result']['score'] == 80 and job['result']['aligned_crops'] == {'left': 'data:...'}
