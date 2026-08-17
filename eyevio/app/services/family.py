"""Family / caregiver helpers."""

from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.models import (
    Alert,
    FamilyGroup,
    FamilyInvite,
    FamilyMember,
    LifestyleLog,
    MyopiaPrescriptionEntry,
    MyopiaSubject,
    User,
    VisionTest,
    db,
)
from app.utils.auth import hash_password


INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def generate_invite_code(length: int = 6) -> str:
    return ''.join(secrets.choice(INVITE_ALPHABET) for _ in range(length))


def membership_for(user_id: int) -> Optional[FamilyMember]:
    return FamilyMember.query.filter_by(user_id=user_id).first()


def caregiver_membership(user_id: int) -> Optional[FamilyMember]:
    return FamilyMember.query.filter_by(user_id=user_id, role='caregiver').first()


def ensure_family_for_caregiver(user: User, family_name: Optional[str] = None) -> Tuple[FamilyGroup, FamilyMember]:
    member = caregiver_membership(user.id)
    if member:
        return member.family, member

    # If they're already a child, they cannot create a family
    existing = membership_for(user.id)
    if existing and existing.role == 'child':
        raise ValueError('Child accounts cannot create a family. Ask a caregiver to invite you.')

    family = FamilyGroup(
        name=family_name or f"{(user.full_name or 'Family').split()[0]}'s family",
        created_by_user_id=user.id,
    )
    db.session.add(family)
    db.session.flush()
    member = FamilyMember(
        family_id=family.id,
        user_id=user.id,
        role='caregiver',
        display_name=user.full_name,
        is_managed=False,
    )
    db.session.add(member)
    db.session.flush()
    return family, member


def caregivers_for_child(child_user_id: int) -> List[User]:
    child_memberships = FamilyMember.query.filter_by(user_id=child_user_id, role='child').all()
    if not child_memberships:
        return []
    family_ids = [m.family_id for m in child_memberships if m.notify_caregivers]
    if not family_ids:
        return []
    caregiver_rows = FamilyMember.query.filter(
        FamilyMember.family_id.in_(family_ids),
        FamilyMember.role == 'caregiver',
    ).all()
    user_ids = [r.user_id for r in caregiver_rows]
    if not user_ids:
        return []
    return User.query.filter(User.id.in_(user_ids), User.is_active.is_(True)).all()


def assert_can_view_child(caregiver_user_id: int, child_user_id: int) -> FamilyMember:
    cg = caregiver_membership(caregiver_user_id)
    if not cg:
        raise PermissionError('You are not a caregiver in a family')
    child = FamilyMember.query.filter_by(
        family_id=cg.family_id, user_id=child_user_id, role='child'
    ).first()
    if not child:
        raise PermissionError('That child is not in your family')
    return child


def create_invite(family: FamilyGroup, created_by_user_id: int, role: str, child_user_id: Optional[int] = None, days: int = 14) -> FamilyInvite:
    if role not in ('caregiver', 'child'):
        raise ValueError('role must be caregiver or child')
    for _ in range(8):
        code = generate_invite_code()
        if not FamilyInvite.query.filter_by(code=code).first():
            break
    invite = FamilyInvite(
        family_id=family.id,
        created_by_user_id=created_by_user_id,
        role=role,
        code=code,
        child_user_id=child_user_id,
        expires_at=datetime.utcnow() + timedelta(days=days),
    )
    db.session.add(invite)
    db.session.flush()
    return invite


def get_valid_invite(code: str) -> FamilyInvite:
    invite = FamilyInvite.query.filter_by(code=(code or '').strip().upper()).first()
    if not invite:
        raise ValueError('Invite code not found')
    if invite.used_at:
        raise ValueError('Invite code already used')
    if invite.expires_at and invite.expires_at < datetime.utcnow():
        raise ValueError('Invite code expired')
    return invite


def join_with_invite(user: User, code: str) -> FamilyMember:
    invite = get_valid_invite(code)
    existing = FamilyMember.query.filter_by(family_id=invite.family_id, user_id=user.id).first()
    if existing:
        raise ValueError('You are already in this family')

    other_family = membership_for(user.id)
    if other_family:
        raise ValueError('Leave your current family before joining another')

    member = FamilyMember(
        family_id=invite.family_id,
        user_id=user.id,
        role=invite.role,
        display_name=user.full_name,
        is_managed=False,
    )
    db.session.add(member)
    invite.used_at = datetime.utcnow()
    invite.used_by_user_id = user.id
    db.session.flush()
    return member


def create_managed_child(
    caregiver: User,
    *,
    display_name: str,
    date_of_birth: Optional[date] = None,
    age: Optional[int] = None,
) -> Tuple[User, FamilyMember, FamilyInvite]:
    family, _ = ensure_family_for_caregiver(caregiver)
    token = secrets.token_hex(8)
    email = f'managed-{token}@children.eyevio.local'
    child = User(
        email=email,
        password_hash=hash_password(secrets.token_urlsafe(24)),
        full_name=display_name.strip(),
        date_of_birth=date_of_birth,
        age=age,
        onboarding_completed=True,
        notifications_enabled=False,
        email_alerts_enabled=False,
        push_alerts_enabled=False,
    )
    db.session.add(child)
    db.session.flush()

    member = FamilyMember(
        family_id=family.id,
        user_id=child.id,
        role='child',
        display_name=display_name.strip(),
        is_managed=True,
        notify_caregivers=True,
    )
    db.session.add(member)
    db.session.flush()
    invite = create_invite(family, caregiver.id, 'child', child_user_id=child.id, days=90)
    return child, member, invite


def _avg(values: List[Optional[float]]) -> Optional[float]:
    nums = [float(v) for v in values if v is not None]
    if not nums:
        return None
    return round(sum(nums) / len(nums), 2)


def child_progress_card(child_member: FamilyMember, days: int = 7) -> Dict[str, Any]:
    user = child_member.user
    cutoff = datetime.utcnow().date() - timedelta(days=days)
    logs = (
        LifestyleLog.query.filter(
            LifestyleLog.user_id == user.id,
            LifestyleLog.log_date >= cutoff,
        ).all()
    )
    tests = (
        VisionTest.query.filter_by(user_id=user.id)
        .order_by(VisionTest.created_at.desc())
        .limit(5)
        .all()
    )
    last_test = tests[0] if tests else None
    unread_alerts = Alert.query.filter_by(user_id=user.id, is_read=False, is_dismissed=False).count()

    goals = child_member.goals_dict()
    avg_outdoor = _avg([l.outdoor_time_hours for l in logs])
    avg_screen = _avg([l.screen_time_hours for l in logs])
    avg_breaks = _avg([l.breaks_taken for l in logs])

    last_test_at = last_test.created_at.date() if last_test and last_test.created_at else None
    test_overdue = False
    if last_test_at:
        test_overdue = (datetime.utcnow().date() - last_test_at).days > goals['test_interval_days']
    elif tests is not None:
        test_overdue = True

    myopia_se = None
    subject = (
        MyopiaSubject.query.filter_by(user_id=user.id, is_active=True)
        .order_by(MyopiaSubject.created_at.desc())
        .first()
    )
    if subject:
        entry = (
            MyopiaPrescriptionEntry.query.filter_by(subject_id=subject.id)
            .order_by(MyopiaPrescriptionEntry.measured_at.desc())
            .first()
        )
        if entry:
            myopia_se = entry.se_binocular

    def met(avg, target, kind):
        if avg is None or target is None:
            return None
        if kind == 'min':
            return avg >= target
        return avg <= target

    return {
        'member': child_member.to_dict(user),
        'period_days': days,
        'lifestyle': {
            'days_logged': len(logs),
            'avg_outdoor_hours': avg_outdoor,
            'avg_screen_hours': avg_screen,
            'avg_breaks': avg_breaks,
            'outdoor_on_track': met(avg_outdoor, goals['outdoor_hours_target'], 'min'),
            'screen_on_track': met(avg_screen, goals['screen_hours_limit'], 'max'),
            'breaks_on_track': met(avg_breaks, goals['breaks_target'], 'min'),
        },
        'last_test': {
            'id': last_test.id if last_test else None,
            'test_type': last_test.test_type if last_test else None,
            'score': last_test.score if last_test else None,
            'created_at': last_test.created_at.isoformat() if last_test and last_test.created_at else None,
        } if last_test else None,
        'test_overdue': test_overdue,
        'unread_alerts': unread_alerts,
        'myopia_se': myopia_se,
        'goals': goals,
    }


def family_dashboard(caregiver_user_id: int, days: int = 7) -> Dict[str, Any]:
    cg = caregiver_membership(caregiver_user_id)
    if not cg:
        return {'family': None, 'role': None, 'children': [], 'caregivers': []}

    family = cg.family
    members = FamilyMember.query.filter_by(family_id=family.id).all()
    children = [m for m in members if m.role == 'child']
    caregivers = [m for m in members if m.role == 'caregiver']
    return {
        'family': family.to_dict(),
        'role': 'caregiver',
        'caregivers': [m.to_dict() for m in caregivers],
        'children': [child_progress_card(m, days=days) for m in children],
        'open_invites': [
            i.to_dict()
            for i in FamilyInvite.query.filter_by(family_id=family.id)
            .filter(FamilyInvite.used_at.is_(None))
            .filter(FamilyInvite.expires_at > datetime.utcnow())
            .all()
        ],
    }


def child_detail(caregiver_user_id: int, child_user_id: int, days: int = 30) -> Dict[str, Any]:
    child_member = assert_can_view_child(caregiver_user_id, child_user_id)
    card = child_progress_card(child_member, days=min(days, 14))
    cutoff = datetime.utcnow() - timedelta(days=days)

    tests = (
        VisionTest.query.filter(
            VisionTest.user_id == child_user_id,
            VisionTest.created_at >= cutoff,
        )
        .order_by(VisionTest.created_at.desc())
        .all()
    )
    logs = (
        LifestyleLog.query.filter(
            LifestyleLog.user_id == child_user_id,
            LifestyleLog.log_date >= cutoff.date(),
        )
        .order_by(LifestyleLog.log_date.desc())
        .all()
    )
    alerts = (
        Alert.query.filter(
            Alert.user_id == child_user_id,
            Alert.created_at >= cutoff,
            Alert.is_dismissed.is_(False),
        )
        .order_by(Alert.created_at.desc())
        .limit(20)
        .all()
    )

    return {
        **card,
        'tests': [
            {
                'id': t.id,
                'test_type': t.test_type,
                'score': t.score,
                'created_at': t.created_at.isoformat() if t.created_at else None,
            }
            for t in tests
        ],
        'lifestyle_series': [
            {
                'date': l.log_date.isoformat(),
                'screen_time_hours': l.screen_time_hours,
                'outdoor_time_hours': l.outdoor_time_hours,
                'breaks_taken': l.breaks_taken,
                'screen_time_source': l.screen_time_source,
            }
            for l in reversed(logs)
        ],
        'alerts': [
            {
                'id': a.id,
                'alert_type': a.alert_type,
                'severity': a.severity,
                'title': a.title,
                'message': a.message,
                'is_read': a.is_read,
                'created_at': a.created_at.isoformat() if a.created_at else None,
            }
            for a in alerts
        ],
    }
