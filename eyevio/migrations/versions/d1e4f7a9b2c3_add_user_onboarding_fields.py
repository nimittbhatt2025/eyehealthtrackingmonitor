"""Add user onboarding and preference fields

Revision ID: d1e4f7a9b2c3
Revises: c8f2a1b3d4e5
Create Date: 2026-08-16 21:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd1e4f7a9b2c3'
down_revision = 'c8f2a1b3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('date_of_birth', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('avg_outdoor_time_hours', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('occupation', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('onboarding_completed', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('onboarding_data', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('preferred_units', sa.String(length=20), nullable=True, server_default='metric'))
        batch_op.add_column(sa.Column('primary_goal', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('test_frequency', sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column('notifications_enabled', sa.Boolean(), nullable=True, server_default=sa.true()))


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('notifications_enabled')
        batch_op.drop_column('test_frequency')
        batch_op.drop_column('primary_goal')
        batch_op.drop_column('preferred_units')
        batch_op.drop_column('onboarding_data')
        batch_op.drop_column('onboarding_completed')
        batch_op.drop_column('occupation')
        batch_op.drop_column('avg_outdoor_time_hours')
        batch_op.drop_column('date_of_birth')
