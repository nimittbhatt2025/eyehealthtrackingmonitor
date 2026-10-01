"""add vision test data-quality flag; exclude pre-2026-09-27 glare results

Revision ID: c9d2e5f8a1b4
Revises: b5c8d1e4f7a9
Create Date: 2026-09-28

Glare Sensitivity results saved before 2026-09-27 were produced by a stimulus
that swapped horizontal and vertical gratings, so correct answers were marked
wrong on half the trials. They are flagged here so every consumer that uses
VisionTest.usable() drops them.
"""
from alembic import op
import sqlalchemy as sa


revision = 'c9d2e5f8a1b4'
down_revision = 'b5c8d1e4f7a9'
branch_labels = None
depends_on = None

GLARE_BUG_FLAG = 'glare_orientation_bug'
GLARE_BUG_CUTOFF_UTC = '2026-09-27 00:00:00'
GLARE_BUG_NOTE = (
    'Excluded: the glare test swapped horizontal and vertical stripes before 2026-09-27, '
    'so correct answers were scored wrong on half the trials.'
)


def upgrade():
    with op.batch_alter_table('vision_tests', schema=None) as batch_op:
        batch_op.add_column(sa.Column('data_quality_flag', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('data_quality_note', sa.Text(), nullable=True))
        batch_op.create_index('ix_vision_tests_data_quality_flag', ['data_quality_flag'], unique=False)

    op.execute(
        sa.text(
            "UPDATE vision_tests SET data_quality_flag = :flag, data_quality_note = :note "
            "WHERE test_type = 'cataract_glare' AND created_at < :cutoff AND data_quality_flag IS NULL"
        ).bindparams(flag=GLARE_BUG_FLAG, note=GLARE_BUG_NOTE, cutoff=GLARE_BUG_CUTOFF_UTC)
    )


def downgrade():
    with op.batch_alter_table('vision_tests', schema=None) as batch_op:
        batch_op.drop_index('ix_vision_tests_data_quality_flag')
        batch_op.drop_column('data_quality_note')
        batch_op.drop_column('data_quality_flag')
