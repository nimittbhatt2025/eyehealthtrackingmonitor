"""Add myopia subject and prescription progression tables

Revision ID: f3a6b9c2d5e7
Revises: e2f5a8b1c4d6
Create Date: 2026-08-16 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f3a6b9c2d5e7'
down_revision = 'e2f5a8b1c4d6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'myopia_subjects',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column('relationship', sa.String(length=20), nullable=True),
        sa.Column('date_of_birth', sa.Date(), nullable=True),
        sa.Column('sex', sa.String(length=20), nullable=True),
        sa.Column('myopia_onset_age', sa.Float(), nullable=True),
        sa.Column('parental_myopia', sa.String(length=30), nullable=True),
        sa.Column('ethnicity_risk_note', sa.String(length=50), nullable=True),
        sa.Column('treatment', sa.String(length=50), nullable=True),
        sa.Column('treatment_notes', sa.Text(), nullable=True),
        sa.Column('target_outdoor_hours', sa.Float(), nullable=True),
        sa.Column('target_screen_hours', sa.Float(), nullable=True),
        sa.Column('school_grade', sa.String(length=30), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_myopia_subjects_user_id', 'myopia_subjects', ['user_id'])

    op.create_table(
        'myopia_prescription_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('subject_id', sa.Integer(), sa.ForeignKey('myopia_subjects.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('measured_at', sa.Date(), nullable=False),
        sa.Column('source', sa.String(length=30), nullable=True),
        sa.Column('od_sph', sa.Float(), nullable=True),
        sa.Column('od_cyl', sa.Float(), nullable=True),
        sa.Column('od_axis', sa.Integer(), nullable=True),
        sa.Column('os_sph', sa.Float(), nullable=True),
        sa.Column('os_cyl', sa.Float(), nullable=True),
        sa.Column('os_axis', sa.Integer(), nullable=True),
        sa.Column('se_od', sa.Float(), nullable=True),
        sa.Column('se_os', sa.Float(), nullable=True),
        sa.Column('se_binocular', sa.Float(), nullable=True),
        sa.Column('axial_length_od_mm', sa.Float(), nullable=True),
        sa.Column('axial_length_os_mm', sa.Float(), nullable=True),
        sa.Column('unaided_acuity_od', sa.String(length=20), nullable=True),
        sa.Column('unaided_acuity_os', sa.String(length=20), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_myopia_prescription_entries_subject_id', 'myopia_prescription_entries', ['subject_id'])
    op.create_index('ix_myopia_prescription_entries_user_id', 'myopia_prescription_entries', ['user_id'])
    op.create_index('ix_myopia_prescription_entries_measured_at', 'myopia_prescription_entries', ['measured_at'])


def downgrade():
    op.drop_index('ix_myopia_prescription_entries_measured_at', table_name='myopia_prescription_entries')
    op.drop_index('ix_myopia_prescription_entries_user_id', table_name='myopia_prescription_entries')
    op.drop_index('ix_myopia_prescription_entries_subject_id', table_name='myopia_prescription_entries')
    op.drop_table('myopia_prescription_entries')
    op.drop_index('ix_myopia_subjects_user_id', table_name='myopia_subjects')
    op.drop_table('myopia_subjects')
