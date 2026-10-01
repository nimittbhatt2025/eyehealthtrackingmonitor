"""allow vision tests without a 0–100 score; retire composite indices

Revision ID: c4d7e1a9f2b6
Revises: b2e5f8c1d4a7
Create Date: 2026-10-01

Colour (worst axis), Amsler (composite), dry eye (40/40/20) and Eye Glow
(symmetry) had 0–100 indices with no reference data behind them. New results
store no score; stored values move to test_details.legacy_display_index.

The earlier side-vision exercise was stored as test_type 'glaucoma_neural'. It was
never a glaucoma test, so stored rows are renamed 'side_vision_legacy'.
"""
import json

from alembic import op
import sqlalchemy as sa


revision = 'c4d7e1a9f2b6'
down_revision = 'b2e5f8c1d4a7'
branch_labels = None
depends_on = None

RETIRED_INDEX_TESTS = ('color_vision', 'amsler_grid', 'dry_eye', 'red_reflex')
OLD_SIDE_VISION_TYPE = 'glaucoma_neural'
NEW_SIDE_VISION_TYPE = 'side_vision_legacy'


def _details(raw):
    if isinstance(raw, str):
        try:
            return json.loads(raw) or {}
        except ValueError:
            return {}
    return dict(raw or {})


def upgrade():
    with op.batch_alter_table('vision_tests') as batch:
        batch.alter_column('score', existing_type=sa.Float(), nullable=True)

    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE vision_tests SET test_type = :new WHERE test_type = :old").bindparams(
            new=NEW_SIDE_VISION_TYPE, old=OLD_SIDE_VISION_TYPE
        )
    )
    rows = bind.execute(
        sa.text(
            "SELECT id, score, test_details FROM vision_tests "
            "WHERE test_type IN :types AND score IS NOT NULL"
        ).bindparams(sa.bindparam('types', expanding=True), types=list(RETIRED_INDEX_TESTS))
    ).fetchall()
    for r in rows:
        details = _details(r.test_details)
        details['legacy_display_index'] = r.score
        bind.execute(
            sa.text("UPDATE vision_tests SET score = NULL, test_details = :d WHERE id = :id").bindparams(
                sa.bindparam('d', type_=sa.JSON), d=details, id=r.id
            )
        )


def downgrade():
    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE vision_tests SET test_type = :old WHERE test_type = :new").bindparams(
            new=NEW_SIDE_VISION_TYPE, old=OLD_SIDE_VISION_TYPE
        )
    )
    rows = bind.execute(sa.text("SELECT id, test_details FROM vision_tests WHERE score IS NULL")).fetchall()
    for r in rows:
        legacy = _details(r.test_details).get('legacy_display_index')
        bind.execute(
            sa.text("UPDATE vision_tests SET score = :s WHERE id = :id").bindparams(
                s=float(legacy) if legacy is not None else 0.0, id=r.id
            )
        )
    with op.batch_alter_table('vision_tests') as batch:
        batch.alter_column('score', existing_type=sa.Float(), nullable=False)
