"""
Sample test file for EyeVio

Run with: pytest tests/
"""

import pytest
from app import create_app
from app.models import db, User
from config import config


@pytest.fixture
def app():
    """Create application for testing"""
    app = create_app('testing')
    
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    """Create test client"""
    return app.test_client()


def test_health_check(client):
    """Test health check endpoint"""
    response = client.get('/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data['status'] == 'healthy'


def test_register_user(client):
    """Test user registration"""
    response = client.post('/api/auth/register', json={
        'email': 'test@example.com',
        'password': 'testpassword123',
        'full_name': 'Test User'
    })
    assert response.status_code == 201
    data = response.get_json()
    assert 'access_token' in data
    assert data['user']['email'] == 'test@example.com'


def test_login_user(client):
    """Test user login"""
    # First register
    client.post('/api/auth/register', json={
        'email': 'test@example.com',
        'password': 'testpassword123'
    })
    
    # Then login
    response = client.post('/api/auth/login', json={
        'email': 'test@example.com',
        'password': 'testpassword123'
    })
    assert response.status_code == 200
    data = response.get_json()
    assert 'access_token' in data


def test_submit_vision_test(client):
    """Test vision test submission"""
    # Register and login
    register_response = client.post('/api/auth/register', json={
        'email': 'test@example.com',
        'password': 'testpassword123'
    })
    token = register_response.get_json()['access_token']
    
    # Submit vision test
    response = client.post('/api/vision-test/', 
        json={
            'test_type': 'visual_acuity',
            'score': 85.5,
            'response_time_ms': 1500,
            'errors': 2
        },
        headers={'Authorization': f'Bearer {token}'}
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data['score'] == 85.5


def _token(client):
    return client.post('/api/auth/register', json={
        'email': 'rules@example.com', 'password': 'testpassword123',
    }).get_json()['access_token']


def _submit(client, token, **body):
    return client.post('/api/vision-test/', json={'response_time_ms': 0, 'errors': 0, **body},
                       headers={'Authorization': f'Bearer {token}'})


def test_retired_index_tests_store_no_score(client):
    token = _token(client)
    for test_type in ('color_vision', 'amsler_grid', 'dry_eye', 'red_reflex'):
        r = _submit(client, token, test_type=test_type, score=77, test_details={'method_version': 2})
        assert r.status_code == 201, test_type
        assert r.get_json()['score'] is None, test_type


def test_score_required_unless_optional_index(client):
    token = _token(client)
    assert _submit(client, token, test_type='visual_acuity', score=None).status_code == 400
    for test_type in ('accommodative_lag', 'near_point_convergence'):
        r = _submit(client, token, test_type=test_type, score=None, test_details={'method_version': 2})
        assert r.status_code == 201, test_type
        assert r.get_json()['score'] is None


def test_earlier_side_vision_type_is_renamed(client):
    token = _token(client)
    r = _submit(client, token, test_type='glaucoma_neural', score=60)
    assert r.status_code == 201
    history = client.get('/api/vision-test/', headers={'Authorization': f'Bearer {token}'}).get_json()
    rows = history.get('tests', history) if isinstance(history, dict) else history
    assert [t['test_type'] for t in rows] == ['side_vision_legacy']


def test_detect_vision_decline_keys():
    """Decline detection returns baseline/current keys used by alerts, in native units."""
    from app.utils.analytics import detect_vision_decline
    from datetime import datetime

    class FakeTest:
        def __init__(self, logmar, score=0):
            self.score = score
            self.test_type = 'visual_acuity'
            self.test_details = {'method_version': 2, 'right_eye': {'logMAR': logmar}, 'left_eye': {'logMAR': 0.0}}
            self.created_at = datetime.utcnow()

    tests = [FakeTest(v) for v in (0.0, 0.02, -0.02, 0.0, 0.0, 0.3, 0.3)]
    result = detect_vision_decline(tests, 'visual_acuity', 2)
    assert 'baseline_score' in result
    assert 'current_score' in result
    assert result['declined'] is True
    assert result['baseline_score'] < result['current_score']


def test_display_index_decline_never_alerts():
    """A fall in a 0–100 display index is never treated as a decline."""
    from app.utils.analytics import detect_vision_decline
    from datetime import datetime

    class FakeTest:
        def __init__(self, score):
            self.score = score
            self.test_details = {}
            self.created_at = datetime.utcnow()

    tests = [FakeTest(s) for s in (90, 88, 87, 86, 85, 70, 68, 65, 62, 60)]
    result = detect_vision_decline(tests, 'red_reflex', 2)
    assert result['declined'] is False
    assert result['message'] is None
