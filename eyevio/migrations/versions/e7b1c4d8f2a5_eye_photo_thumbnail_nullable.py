"""eye_photos.image_thumbnail nullable (on-device analysis stores no image)

Revision ID: e7b1c4d8f2a5
Revises: d4e7a0b3c6f2
Create Date: 2026-09-28
"""
from alembic import op
import sqlalchemy as sa


revision = 'e7b1c4d8f2a5'
down_revision = 'd4e7a0b3c6f2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('eye_photos') as batch_op:
        batch_op.alter_column('image_thumbnail', existing_type=sa.Text(), nullable=True)


def downgrade():
    op.execute("UPDATE eye_photos SET image_thumbnail = '' WHERE image_thumbnail IS NULL")
    with op.batch_alter_table('eye_photos') as batch_op:
        batch_op.alter_column('image_thumbnail', existing_type=sa.Text(), nullable=False)
