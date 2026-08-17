"""Add push subscriptions and alert delivery preference columns

Revision ID: e2f5a8b1c4d6
Revises: d1e4f7a9b2c3
Create Date: 2026-08-16 21:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e2f5a8b1c4d6'
down_revision = 'd1e4f7a9b2c3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('email_alerts_enabled', sa.Boolean(), nullable=True, server_default=sa.true()))
        batch_op.add_column(sa.Column('push_alerts_enabled', sa.Boolean(), nullable=True, server_default=sa.true()))
        batch_op.add_column(sa.Column('notification_preferences', sa.JSON(), nullable=True))

    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.String(length=255), nullable=False),
        sa.Column('auth', sa.String(length=255), nullable=False),
        sa.Column('user_agent', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_push_subscriptions_user_id', 'push_subscriptions', ['user_id'])
    op.create_index('ix_push_subscriptions_endpoint', 'push_subscriptions', ['endpoint'], unique=True)


def downgrade():
    op.drop_index('ix_push_subscriptions_endpoint', table_name='push_subscriptions')
    op.drop_index('ix_push_subscriptions_user_id', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('notification_preferences')
        batch_op.drop_column('push_alerts_enabled')
        batch_op.drop_column('email_alerts_enabled')
