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


def test_detect_vision_decline_keys():
    """Decline detection returns baseline/current score keys used by alerts."""
    from app.utils.analytics import detect_vision_decline
    from app.models import VisionTest
    from datetime import datetime, timedelta

    class FakeTest:
        def __init__(self, score):
            self.score = score
            self.created_at = datetime.utcnow()

    tests = [FakeTest(90), FakeTest(88), FakeTest(87), FakeTest(86), FakeTest(85),
             FakeTest(70), FakeTest(68), FakeTest(65), FakeTest(62), FakeTest(60)]
    result = detect_vision_decline(tests)
    assert 'baseline_score' in result
    assert 'current_score' in result
    assert result['declined'] is True
    assert result['baseline_score'] > result['current_score']
