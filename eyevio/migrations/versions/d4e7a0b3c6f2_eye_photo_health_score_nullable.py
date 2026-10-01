"""eye_photos.health_score nullable (cataract screening stores no composite score)

Revision ID: d4e7a0b3c6f2
Revises: c9d2e5f8a1b4
Create Date: 2026-09-28
"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e7a0b3c6f2'
down_revision = 'c9d2e5f8a1b4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('eye_photos') as batch_op:
        batch_op.alter_column('health_score', existing_type=sa.Float(), nullable=True)


def downgrade():
    op.execute('UPDATE eye_photos SET health_score = 0 WHERE health_score IS NULL')
    with op.batch_alter_table('eye_photos') as batch_op:
        batch_op.alter_column('health_score', existing_type=sa.Float(), nullable=False)
