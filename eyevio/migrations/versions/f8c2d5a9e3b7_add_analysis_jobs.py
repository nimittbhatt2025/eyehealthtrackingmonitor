"""analysis_jobs table (background photo analysis, 202 + polling)

Revision ID: f8c2d5a9e3b7
Revises: e7b1c4d8f2a5
Create Date: 2026-09-28
"""
from alembic import op
import sqlalchemy as sa


revision = 'f8c2d5a9e3b7'
down_revision = 'e7b1c4d8f2a5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'analysis_jobs',
        sa.Column('id', sa.String(length=32), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('http_status', sa.Integer(), nullable=True),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_analysis_jobs_user_id', 'analysis_jobs', ['user_id'])
    op.create_index('ix_analysis_jobs_created_at', 'analysis_jobs', ['created_at'])


def downgrade():
    op.drop_index('ix_analysis_jobs_created_at', table_name='analysis_jobs')
    op.drop_index('ix_analysis_jobs_user_id', table_name='analysis_jobs')
    op.drop_table('analysis_jobs')
