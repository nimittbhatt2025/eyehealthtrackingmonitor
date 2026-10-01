"""Trend snapshots (precomputed /trend aggregates). Run: ./venv/bin/python -m pytest tests/test_trend_aggregates.py"""

from datetime import datetime, timedelta

import pytest
from sqlalchemy import text

from app.utils.change_detection import metric_for


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


@pytest.fixture
def user(client):
    from app.models import User

    r = client.post('/api/auth/register', json={'email': 'trends@example.com', 'password': 'testpassword123'})
    uid = User.query.filter_by(email='trends@example.com').one().id
    return uid, {'Authorization': f"Bearer {r.get_json()['access_token']}"}


def add_acuity(user_id, n, start=None, logmar=0.1, drift=0.0):
    from app.models import VisionTest, db

    start = start or datetime.utcnow() - timedelta(days=n * 3)
    rows = []
    for i in range(n):
        v = round(logmar + drift * i, 3)
        rows.append(VisionTest(
            user_id=user_id, test_type='visual_acuity', score=80,
            test_details={'method': 'etdrs_tumbling_e', 'right_eye': {'logMAR': v}, 'left_eye': {'logMAR': v + 0.02}},
            created_at=start + timedelta(days=3 * i),
        ))
    db.session.add_all(rows)
    db.session.commit()
    return rows


def snapshot(user_id):
    from app.models import TrendSnapshot, db

    db.session.expire_all()
    return db.session.get(TrendSnapshot, user_id)


def test_refresh_caches_until_rows_change(app, user):
    from app.services import trend_aggregates as ta

    uid, _ = user
    add_acuity(uid, 6)
    payload, source, _ = ta.refresh(uid)
    assert source == 'refreshed'
    assert [t['test_type'] for t in payload['prediction']] == ['visual_acuity']
    assert payload['change_status'][0]['sessions'] == 6

    assert ta.refresh(uid)[1] == 'cached'
    add_acuity(uid, 1, start=datetime.utcnow())
    assert snapshot(uid).stale is True
    payload, source, _ = ta.refresh(uid)
    assert source == 'refreshed' and payload['change_status'][0]['sessions'] == 7


def test_payload_matches_direct_computation(app, user):
    from app.models import VisionTest
    from app.services import trend_aggregates as ta
    from app.utils.trend_forecast import build_per_test_trends

    uid, _ = user
    add_acuity(uid, 8, drift=0.02)
    tests = VisionTest.usable().filter_by(user_id=uid).order_by(VisionTest.created_at).all()
    assert ta.refresh(uid)[0]['prediction'] == build_per_test_trends(tests, with_forecast=True)


def test_update_flag_and_delete_invalidate(app, user):
    from app.models import VisionTest, db
    from app.services import trend_aggregates as ta

    uid, _ = user
    rows = add_acuity(uid, 5)

    ta.refresh(uid)
    rows[0].notes = 'edited'
    db.session.commit()
    assert snapshot(uid).stale is True

    ta.refresh(uid)
    rows[1].data_quality_flag = 'glare'
    db.session.commit()
    payload, source, _ = ta.refresh(uid)
    assert source == 'refreshed' and payload['change_status'][0]['sessions'] == 4

    db.session.delete(db.session.get(VisionTest, rows[2].id))
    db.session.commit()
    assert snapshot(uid).stale is True
    assert ta.refresh(uid)[0]['change_status'][0]['sessions'] == 3


def test_signature_catches_writes_that_bypass_the_orm(app, user):
    from app.models import db
    from app.services import trend_aggregates as ta

    uid, _ = user
    add_acuity(uid, 4)
    ta.refresh(uid)
    db.session.execute(text(
        "INSERT INTO vision_tests (user_id, test_type, score, test_details, created_at) "
        "VALUES (:u, 'visual_acuity', 80, CAST(:d AS jsonb), now())"
    ), {'u': uid, 'd': '{"right_eye": {"logMAR": 0.1}, "left_eye": {"logMAR": 0.1}}'})
    db.session.commit()
    assert snapshot(uid).stale is False
    payload, source, _ = ta.refresh(uid)
    assert source == 'refreshed' and payload['change_status'][0]['sessions'] == 5


def test_algo_version_bump_recomputes(app, user, monkeypatch):
    from app.services import trend_aggregates as ta

    uid, _ = user
    add_acuity(uid, 4)
    ta.refresh(uid)
    monkeypatch.setattr(ta, 'ALGO_VERSION', ta.ALGO_VERSION + 1)
    assert ta.refresh(uid)[1] == 'refreshed'
    assert snapshot(uid).algo_version == ta.ALGO_VERSION


def test_prediction_and_summary_routes_use_snapshot(client, user):
    uid, auth = user
    add_acuity(uid, 6, drift=0.03)

    r = client.get('/api/trend/prediction', headers=auth)
    body = r.get_json()
    assert r.status_code == 200 and body['snapshot']['source'] == 'refreshed'
    assert body['tests'][0]['test_type'] == 'visual_acuity'
    assert client.get('/api/trend/prediction', headers=auth).get_json()['snapshot']['source'] == 'cached'
    assert client.get('/api/trend/prediction?test_type=amsler_grid', headers=auth).get_json()['tests'] == []

    r = client.get('/api/trend/summary?days=7', headers=auth)
    vh = r.get_json()['vision_health']
    assert r.status_code == 200
    assert vh['test_types_tracked'] == 1 and vh['change_status'][0]['sessions'] == 6
    assert vh['test_count'] == 2  # only sessions inside the 7-day window


def test_snapshots_are_per_user(client, user):
    from app.models import User
    from app.services import trend_aggregates as ta

    uid, _ = user
    client.post('/api/auth/register', json={'email': 'other@example.com', 'password': 'testpassword123'})
    other = User.query.filter_by(email='other@example.com').one().id
    add_acuity(uid, 4)
    add_acuity(other, 3)
    ta.refresh(uid)
    ta.refresh(other)
    add_acuity(other, 1, start=datetime.utcnow())
    assert snapshot(uid).stale is False and snapshot(other).stale is True


def test_cli_rebuilds_stale_only_unless_forced(app, user):
    uid, _ = user
    add_acuity(uid, 4)
    runner = app.test_cli_runner()
    assert '1 refreshed' in runner.invoke(args=['aggregate-trends']).output
    assert '1 already fresh' in runner.invoke(args=['aggregate-trends']).output
    assert '1 refreshed' in runner.invoke(args=['aggregate-trends', '--force']).output
    assert '1 refreshed' in runner.invoke(args=['aggregate-trends', '--user-id', str(uid), '--force']).output


def test_colour_series_order_ignores_stored_key_order():
    axes = {'threshold_units': 8, 'beyond_screen_gamut': False}
    a = {'eyes': {'both': {'axes': {'protan': axes, 'deutan': axes, 'tritan': axes}}}}
    b = {'eyes': {'both': {'axes': {'tritan': axes, 'deutan': axes, 'protan': axes}}}}
    series = metric_for('color_vision', 2).series
    assert list(series(a, None)) == list(series(b, None)) == ['both protan', 'both deutan', 'both tritan']
