"""Myopia progression tracking for kids/teens."""

from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models import MyopiaPrescriptionEntry, MyopiaSubject, db
from app.services.alert_delivery import create_and_deliver_alert
from app.services.myopia_progression import (
    build_dashboard,
    classify_progression,
    fill_spherical_equivalents,
    progression_rate_d_per_year,
)

myopia_bp = Blueprint('myopia', __name__)


def _optional_float(value):
    if value is None or value == '':
        return None
    return float(value)


def _optional_int(value):
    if value is None or value == '':
        return None
    return int(value)


def _optional_date(value):
    if value is None or value == '':
        return None
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace('Z', '')).date()
    return value


def _get_owned_subject(user_id: int, subject_id: int) -> MyopiaSubject:
    return MyopiaSubject.query.filter_by(id=subject_id, user_id=user_id, is_active=True).first()


@myopia_bp.route('/subjects', methods=['GET'])
@jwt_required()
def list_subjects():
    user_id = int(get_jwt_identity())
    subjects = (
        MyopiaSubject.query.filter_by(user_id=user_id, is_active=True)
        .order_by(MyopiaSubject.created_at.asc())
        .all()
    )
    return jsonify({
        'subjects': [s.to_dict() for s in subjects],
        'count': len(subjects),
    }), 200


@myopia_bp.route('/subjects', methods=['POST'])
@jwt_required()
def create_subject():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    name = (data.get('display_name') or '').strip()
    if not name:
        return jsonify({'error': 'display_name is required'}), 400

    subject = MyopiaSubject(
        user_id=user_id,
        display_name=name,
        relationship=data.get('relationship') or 'self',
        date_of_birth=_optional_date(data.get('date_of_birth')),
        sex=data.get('sex') or None,
        myopia_onset_age=_optional_float(data.get('myopia_onset_age')),
        parental_myopia=data.get('parental_myopia') or 'unknown',
        ethnicity_risk_note=data.get('ethnicity_risk_note') or None,
        treatment=data.get('treatment') or 'none',
        treatment_notes=data.get('treatment_notes') or None,
        target_outdoor_hours=_optional_float(data.get('target_outdoor_hours')) or 2.0,
        target_screen_hours=_optional_float(data.get('target_screen_hours')) or 2.0,
        school_grade=data.get('school_grade') or None,
    )
    db.session.add(subject)
    db.session.commit()
    return jsonify({'message': 'Myopia profile created', 'subject': subject.to_dict()}), 201


@myopia_bp.route('/subjects/<int:subject_id>', methods=['PUT'])
@jwt_required()
def update_subject(subject_id):
    user_id = int(get_jwt_identity())
    subject = _get_owned_subject(user_id, subject_id)
    if not subject:
        return jsonify({'error': 'Subject not found'}), 404

    data = request.get_json() or {}
    for field in (
        'display_name', 'relationship', 'sex', 'parental_myopia',
        'ethnicity_risk_note', 'treatment', 'treatment_notes', 'school_grade',
    ):
        if field in data:
            setattr(subject, field, data[field] or None)

    if 'date_of_birth' in data:
        subject.date_of_birth = _optional_date(data['date_of_birth'])
    if 'myopia_onset_age' in data:
        subject.myopia_onset_age = _optional_float(data['myopia_onset_age'])
    if 'target_outdoor_hours' in data:
        subject.target_outdoor_hours = _optional_float(data['target_outdoor_hours']) or 2.0
    if 'target_screen_hours' in data:
        subject.target_screen_hours = _optional_float(data['target_screen_hours']) or 2.0

    subject.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Profile updated', 'subject': subject.to_dict()}), 200


@myopia_bp.route('/subjects/<int:subject_id>', methods=['DELETE'])
@jwt_required()
def archive_subject(subject_id):
    user_id = int(get_jwt_identity())
    subject = _get_owned_subject(user_id, subject_id)
    if not subject:
        return jsonify({'error': 'Subject not found'}), 404
    subject.is_active = False
    subject.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Profile archived'}), 200


@myopia_bp.route('/subjects/<int:subject_id>/dashboard', methods=['GET'])
@jwt_required()
def subject_dashboard(subject_id):
    user_id = int(get_jwt_identity())
    subject = _get_owned_subject(user_id, subject_id)
    if not subject:
        return jsonify({'error': 'Subject not found'}), 404

    days = request.args.get('days', type=int, default=30)
    return jsonify(build_dashboard(subject, user_id, lifestyle_days=days)), 200


@myopia_bp.route('/subjects/<int:subject_id>/prescriptions', methods=['GET'])
@jwt_required()
def list_prescriptions(subject_id):
    user_id = int(get_jwt_identity())
    subject = _get_owned_subject(user_id, subject_id)
    if not subject:
        return jsonify({'error': 'Subject not found'}), 404

    entries = (
        MyopiaPrescriptionEntry.query.filter_by(subject_id=subject.id)
        .order_by(MyopiaPrescriptionEntry.measured_at.desc())
        .all()
    )
    return jsonify({'entries': [e.to_dict() for e in entries], 'count': len(entries)}), 200


@myopia_bp.route('/subjects/<int:subject_id>/prescriptions', methods=['POST'])
@jwt_required()
def add_prescription(subject_id):
    user_id = int(get_jwt_identity())
    subject = _get_owned_subject(user_id, subject_id)
    if not subject:
        return jsonify({'error': 'Subject not found'}), 404

    data = request.get_json() or {}
    measured_at = _optional_date(data.get('measured_at'))
    if not measured_at:
        return jsonify({'error': 'measured_at is required (YYYY-MM-DD)'}), 400

    od = data.get('od') or {}
    os_eye = data.get('os') or {}

    entry = MyopiaPrescriptionEntry(
        subject_id=subject.id,
        user_id=user_id,
        measured_at=measured_at,
        source=data.get('source') or 'exam',
        od_sph=_optional_float(od.get('sph', data.get('od_sph'))),
        od_cyl=_optional_float(od.get('cyl', data.get('od_cyl'))),
        od_axis=_optional_int(od.get('axis', data.get('od_axis'))),
        os_sph=_optional_float(os_eye.get('sph', data.get('os_sph'))),
        os_cyl=_optional_float(os_eye.get('cyl', data.get('os_cyl'))),
        os_axis=_optional_int(os_eye.get('axis', data.get('os_axis'))),
        axial_length_od_mm=_optional_float(data.get('axial_length_od_mm')),
        axial_length_os_mm=_optional_float(data.get('axial_length_os_mm')),
        unaided_acuity_od=data.get('unaided_acuity_od') or None,
        unaided_acuity_os=data.get('unaided_acuity_os') or None,
        notes=data.get('notes') or None,
    )
    fill_spherical_equivalents(entry)

    if entry.se_binocular is None:
        return jsonify({'error': 'Provide at least OD or OS sphere values'}), 400

    db.session.add(entry)
    db.session.flush()

    # Compare to previous entry for progression alert
    previous = (
        MyopiaPrescriptionEntry.query.filter(
            MyopiaPrescriptionEntry.subject_id == subject.id,
            MyopiaPrescriptionEntry.id != entry.id,
            MyopiaPrescriptionEntry.measured_at <= entry.measured_at,
        )
        .order_by(MyopiaPrescriptionEntry.measured_at.desc())
        .first()
    )

    alert_info = None
    if previous:
        rate = progression_rate_d_per_year(previous, entry, 'binocular')
        classification = classify_progression(rate)
        if classification['label'] in ('fast', 'very_fast'):
            alert = create_and_deliver_alert(
                user_id=user_id,
                alert_type='myopia_progression',
                severity=classification['severity'],
                title=f'Myopia progression alert — {subject.display_name}',
                message=(
                    f'{subject.display_name}: {classification["summary"]} '
                    f'Latest SE {entry.se_binocular:+.2f} D (was {previous.se_binocular:+.2f} D).'
                ),
                alert_data={
                    'subject_id': subject.id,
                    'entry_id': entry.id,
                    'rate_d_per_year': rate,
                    'classification': classification,
                },
                commit=False,
            )
            alert_info = {'id': alert.id, 'severity': alert.severity, 'title': alert.title}

    db.session.commit()
    return jsonify({
        'message': 'Prescription logged',
        'entry': entry.to_dict(),
        'alert': alert_info,
    }), 201


@myopia_bp.route('/prescriptions/<int:entry_id>', methods=['DELETE'])
@jwt_required()
def delete_prescription(entry_id):
    user_id = int(get_jwt_identity())
    entry = MyopiaPrescriptionEntry.query.filter_by(id=entry_id, user_id=user_id).first()
    if not entry:
        return jsonify({'error': 'Entry not found'}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'message': 'Entry deleted'}), 200
