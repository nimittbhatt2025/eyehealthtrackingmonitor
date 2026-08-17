"""Family / caregiver account routes."""

from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models import FamilyInvite, FamilyMember, User, db
from app.services.family import (
    assert_can_view_child,
    caregiver_membership,
    child_detail,
    create_invite,
    create_managed_child,
    ensure_family_for_caregiver,
    family_dashboard,
    join_with_invite,
    membership_for,
)

family_bp = Blueprint('family', __name__)


def _current_user():
    user = User.query.get(int(get_jwt_identity()))
    if not user:
        raise ValueError('User not found')
    return user


@family_bp.route('/', methods=['GET'])
@jwt_required()
def get_family():
    user_id = int(get_jwt_identity())
    member = membership_for(user_id)
    if not member:
        return jsonify({'family': None, 'role': None, 'children': [], 'caregivers': []}), 200

    if member.role == 'caregiver':
        days = request.args.get('days', type=int, default=7)
        return jsonify(family_dashboard(user_id, days=days)), 200

    # Child sees goals + family name, not sibling data
    family = member.family
    caregivers = FamilyMember.query.filter_by(family_id=family.id, role='caregiver').all()
    return jsonify({
        'family': family.to_dict(),
        'role': 'child',
        'goals': member.goals_dict(),
        'caregivers': [{'display_name': c.display_name, 'id': c.id} for c in caregivers],
        'member': member.to_dict(),
    }), 200


@family_bp.route('/', methods=['POST'])
@jwt_required()
def create_family():
    try:
        user = _current_user()
        data = request.get_json() or {}
        family, member = ensure_family_for_caregiver(user, data.get('name'))
        db.session.commit()
        return jsonify({
            'message': 'Family ready',
            'family': family.to_dict(),
            'member': member.to_dict(),
        }), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@family_bp.route('/invites', methods=['POST'])
@jwt_required()
def create_family_invite():
    try:
        user = _current_user()
        family, _ = ensure_family_for_caregiver(user)
        data = request.get_json() or {}
        role = data.get('role') or 'child'
        invite = create_invite(family, user.id, role, days=int(data.get('days') or 14))
        db.session.commit()
        return jsonify({
            'message': 'Invite created',
            'invite': invite.to_dict(),
        }), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@family_bp.route('/join', methods=['POST'])
@jwt_required()
def join_family():
    try:
        user = _current_user()
        data = request.get_json() or {}
        code = data.get('code')
        if not code:
            return jsonify({'error': 'code is required'}), 400
        member = join_with_invite(user, code)
        db.session.commit()
        return jsonify({'message': 'Joined family', 'member': member.to_dict()}), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@family_bp.route('/children', methods=['POST'])
@jwt_required()
def add_managed_child():
    """Create a younger child the parent manages (no login until they claim the invite)."""
    try:
        user = _current_user()
        data = request.get_json() or {}
        name = (data.get('display_name') or data.get('full_name') or '').strip()
        if not name:
            return jsonify({'error': 'display_name is required'}), 400

        dob = data.get('date_of_birth')
        dob_parsed = datetime.fromisoformat(dob).date() if dob else None
        age = data.get('age')
        child, member, invite = create_managed_child(
            user,
            display_name=name,
            date_of_birth=dob_parsed,
            age=int(age) if age not in (None, '') else None,
        )
        db.session.commit()
        return jsonify({
            'message': 'Child added',
            'child': member.to_dict(child),
            'claim_invite': invite.to_dict(),
        }), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400


@family_bp.route('/children/<int:child_user_id>', methods=['GET'])
@jwt_required()
def get_child(child_user_id):
    try:
        days = request.args.get('days', type=int, default=30)
        return jsonify(child_detail(int(get_jwt_identity()), child_user_id, days=days)), 200
    except PermissionError as e:
        return jsonify({'error': str(e)}), 403


@family_bp.route('/children/<int:child_user_id>/goals', methods=['PUT'])
@jwt_required()
def update_child_goals(child_user_id):
    try:
        member = assert_can_view_child(int(get_jwt_identity()), child_user_id)
        data = request.get_json() or {}
        if 'outdoor_hours_target' in data and data['outdoor_hours_target'] not in (None, ''):
            member.outdoor_hours_target = float(data['outdoor_hours_target'])
        if 'screen_hours_limit' in data and data['screen_hours_limit'] not in (None, ''):
            member.screen_hours_limit = float(data['screen_hours_limit'])
        if 'breaks_target' in data and data['breaks_target'] not in (None, ''):
            member.breaks_target = int(data['breaks_target'])
        if 'test_interval_days' in data and data['test_interval_days'] not in (None, ''):
            member.test_interval_days = int(data['test_interval_days'])
        if 'display_name' in data and data['display_name']:
            member.display_name = data['display_name'].strip()
        if 'notify_caregivers' in data:
            member.notify_caregivers = bool(data['notify_caregivers'])
        member.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({'message': 'Goals updated', 'member': member.to_dict()}), 200
    except PermissionError as e:
        return jsonify({'error': str(e)}), 403


@family_bp.route('/invites/<int:invite_id>', methods=['DELETE'])
@jwt_required()
def revoke_invite(invite_id):
    user_id = int(get_jwt_identity())
    cg = caregiver_membership(user_id)
    if not cg:
        return jsonify({'error': 'Not a caregiver'}), 403
    invite = FamilyInvite.query.filter_by(id=invite_id, family_id=cg.family_id).first()
    if not invite:
        return jsonify({'error': 'Invite not found'}), 404
    db.session.delete(invite)
    db.session.commit()
    return jsonify({'message': 'Invite revoked'}), 200
