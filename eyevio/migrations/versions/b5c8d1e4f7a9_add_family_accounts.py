"""Add family groups, members, and invites

Revision ID: b5c8d1e4f7a9
Revises: a4b7c0d3e6f8
Create Date: 2026-08-16 22:25:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b5c8d1e4f7a9'
down_revision = 'a4b7c0d3e6f8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'family_groups',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )

    op.create_table(
        'family_members',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('family_id', sa.Integer(), sa.ForeignKey('family_groups.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('display_name', sa.String(length=100), nullable=True),
        sa.Column('is_managed', sa.Boolean(), nullable=True),
        sa.Column('notify_caregivers', sa.Boolean(), nullable=True),
        sa.Column('outdoor_hours_target', sa.Float(), nullable=True),
        sa.Column('screen_hours_limit', sa.Float(), nullable=True),
        sa.Column('breaks_target', sa.Integer(), nullable=True),
        sa.Column('test_interval_days', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('family_id', 'user_id', name='uq_family_member'),
    )
    op.create_index('ix_family_members_family_id', 'family_members', ['family_id'])
    op.create_index('ix_family_members_user_id', 'family_members', ['user_id'])

    op.create_table(
        'family_invites',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('family_id', sa.Integer(), sa.ForeignKey('family_groups.id'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('code', sa.String(length=12), nullable=False),
        sa.Column('child_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('used_by_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_family_invites_family_id', 'family_invites', ['family_id'])
    op.create_index('ix_family_invites_code', 'family_invites', ['code'], unique=True)


def downgrade():
    op.drop_index('ix_family_invites_code', table_name='family_invites')
    op.drop_index('ix_family_invites_family_id', table_name='family_invites')
    op.drop_table('family_invites')
    op.drop_index('ix_family_members_user_id', table_name='family_members')
    op.drop_index('ix_family_members_family_id', table_name='family_members')
    op.drop_table('family_members')
    op.drop_table('family_groups')
