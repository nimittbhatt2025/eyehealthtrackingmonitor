"""per-user (user_id, time) indexes, vision_tests.test_details as JSONB + GIN, trend_snapshots

Revision ID: a3f6c9e2b5d8
Revises: f8c2d5a9e3b7
Create Date: 2026-09-28

The composite indexes replace the single-column user_id indexes: every
per-user query filters on user_id and orders or ranges on the timestamp, and
the leading column still serves plain user_id lookups.

On a large production table, build the indexes with CREATE INDEX CONCURRENTLY
out of band first; the JSON -> JSONB conversion rewrites vision_tests.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'a3f6c9e2b5d8'
down_revision = 'f8c2d5a9e3b7'
branch_labels = None
depends_on = None

COMPOSITES = (
    ('vision_tests', 'created_at'),
    ('webcam_metrics', 'created_at'),
    ('eye_photos', 'captured_at'),
)


def upgrade():
    for table, ts in COMPOSITES:
        op.create_index(f'ix_{table}_user_id_{ts}', table, ['user_id', ts])
        op.drop_index(f'ix_{table}_user_id', table_name=table)

    op.alter_column(
        'vision_tests', 'test_details',
        type_=postgresql.JSONB(), existing_type=sa.JSON(), postgresql_using='test_details::jsonb',
    )
    op.create_index(
        'ix_vision_tests_test_details_gin', 'vision_tests', ['test_details'],
        postgresql_using='gin', postgresql_ops={'test_details': 'jsonb_path_ops'},
    )

    op.create_table(
        'trend_snapshots',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('algo_version', sa.Integer(), nullable=False),
        sa.Column('source_count', sa.Integer(), nullable=False),
        sa.Column('source_max_id', sa.Integer(), nullable=True),
        sa.Column('stale', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('payload', postgresql.JSONB(), nullable=False),
        sa.Column('computed_at', sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table('trend_snapshots')

    op.drop_index('ix_vision_tests_test_details_gin', table_name='vision_tests')
    op.alter_column(
        'vision_tests', 'test_details',
        type_=sa.JSON(), existing_type=postgresql.JSONB(), postgresql_using='test_details::json',
    )

    for table, ts in COMPOSITES:
        op.create_index(f'ix_{table}_user_id', table, ['user_id'])
        op.drop_index(f'ix_{table}_user_id_{ts}', table_name=table)
