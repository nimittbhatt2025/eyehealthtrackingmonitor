"""Add digital wellbeing connections and screen_time_days

Revision ID: a4b7c0d3e6f8
Revises: f3a6b9c2d5e7
Create Date: 2026-08-16 22:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a4b7c0d3e6f8'
down_revision = 'f3a6b9c2d5e7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('lifestyle_logs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('screen_time_source', sa.String(length=40), nullable=True))

    op.create_table(
        'digital_wellbeing_connections',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('platform', sa.String(length=20), nullable=False),
        sa.Column('source', sa.String(length=40), nullable=False),
        sa.Column('device_id', sa.String(length=128), nullable=False),
        sa.Column('device_name', sa.String(length=120), nullable=True),
        sa.Column('status', sa.String(length=30), nullable=True),
        sa.Column('permission_granted', sa.Boolean(), nullable=True),
        sa.Column('auto_sync_enabled', sa.Boolean(), nullable=True),
        sa.Column('sync_lifestyle', sa.Boolean(), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('meta', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('user_id', 'device_id', name='uq_wellbeing_user_device'),
    )
    op.create_index('ix_digital_wellbeing_connections_user_id', 'digital_wellbeing_connections', ['user_id'])

    op.create_table(
        'screen_time_days',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('connection_id', sa.Integer(), sa.ForeignKey('digital_wellbeing_connections.id'), nullable=True),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('total_screen_hours', sa.Float(), nullable=False),
        sa.Column('pickup_count', sa.Integer(), nullable=True),
        sa.Column('notification_count', sa.Integer(), nullable=True),
        sa.Column('category_breakdown', sa.JSON(), nullable=True),
        sa.Column('top_apps', sa.JSON(), nullable=True),
        sa.Column('source', sa.String(length=40), nullable=False),
        sa.Column('raw_payload', sa.JSON(), nullable=True),
        sa.Column('applied_to_lifestyle', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('user_id', 'day', 'source', 'connection_id', name='uq_screen_time_day_source'),
    )
    op.create_index('ix_screen_time_days_user_id', 'screen_time_days', ['user_id'])
    op.create_index('ix_screen_time_days_connection_id', 'screen_time_days', ['connection_id'])
    op.create_index('ix_screen_time_days_day', 'screen_time_days', ['day'])


def downgrade():
    op.drop_index('ix_screen_time_days_day', table_name='screen_time_days')
    op.drop_index('ix_screen_time_days_connection_id', table_name='screen_time_days')
    op.drop_index('ix_screen_time_days_user_id', table_name='screen_time_days')
    op.drop_table('screen_time_days')
    op.drop_index('ix_digital_wellbeing_connections_user_id', table_name='digital_wellbeing_connections')
    op.drop_table('digital_wellbeing_connections')
    with op.batch_alter_table('lifestyle_logs', schema=None) as batch_op:
        batch_op.drop_column('screen_time_source')
