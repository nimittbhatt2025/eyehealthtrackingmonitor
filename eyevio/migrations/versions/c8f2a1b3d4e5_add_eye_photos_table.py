"""Add eye_photos table for historical photo monitoring

Revision ID: c8f2a1b3d4e5
Revises: b439affe4c60
Create Date: 2026-07-11 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'c8f2a1b3d4e5'
down_revision = 'b439affe4c60'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'eye_photos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('condition_type', sa.String(length=50), nullable=False),
        sa.Column('image_thumbnail', sa.Text(), nullable=False),
        sa.Column('health_score', sa.Float(), nullable=False),
        sa.Column('sclera_redness', sa.Float(), nullable=True),
        sa.Column('tear_film_quality', sa.Float(), nullable=True),
        sa.Column('surface_irregularity', sa.Float(), nullable=True),
        sa.Column('left_eye_score', sa.Float(), nullable=True),
        sa.Column('right_eye_score', sa.Float(), nullable=True),
        sa.Column('analysis_details', sa.JSON(), nullable=True),
        sa.Column('vision_test_id', sa.Integer(), nullable=True),
        sa.Column('captured_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['vision_test_id'], ['vision_tests.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('eye_photos', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_eye_photos_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_eye_photos_condition_type'), ['condition_type'], unique=False)
        batch_op.create_index(batch_op.f('ix_eye_photos_captured_at'), ['captured_at'], unique=False)


def downgrade():
    op.drop_table('eye_photos')
