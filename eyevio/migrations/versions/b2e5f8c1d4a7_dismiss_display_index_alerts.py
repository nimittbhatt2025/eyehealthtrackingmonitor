"""dismiss alerts that were raised from display indices or research-only models

Revision ID: b2e5f8c1d4a7
Revises: a3f6c9e2b5d8
Create Date: 2026-09-30

Fatigue score, lens effectiveness, photo appearance scores and generic 0–100
test scores are display indices, not clinically validated measures, and the
photo comparison also leaned on the research-only image models. No code raises
these alerts any more; this hides the ones already stored.
"""
import json

from alembic import op
import sqlalchemy as sa


revision = 'b2e5f8c1d4a7'
down_revision = 'a3f6c9e2b5d8'
branch_labels = None
depends_on = None

RETIRED_TYPES = ('high_fatigue', 'lens_replacement', 'eye_health_deterioration')


def _display_index_decline(alert_data) -> bool:
    if isinstance(alert_data, str):
        try:
            alert_data = json.loads(alert_data)
        except ValueError:
            return False
    unit = ((alert_data or {}).get('assessment') or {}).get('unit') or ''
    return unit.startswith('score') or unit.startswith('display index')


def upgrade():
    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE alerts SET is_dismissed = :yes WHERE alert_type IN :types").bindparams(
            sa.bindparam('types', expanding=True), yes=True, types=list(RETIRED_TYPES)
        )
    )
    rows = bind.execute(
        sa.text("SELECT id, alert_data FROM alerts WHERE alert_type = 'vision_decline' AND is_dismissed = :no")
        .bindparams(no=False)
    ).fetchall()
    ids = [r.id for r in rows if _display_index_decline(r.alert_data)]
    if ids:
        bind.execute(
            sa.text("UPDATE alerts SET is_dismissed = :yes WHERE id IN :ids").bindparams(
                sa.bindparam('ids', expanding=True), yes=True, ids=ids
            )
        )


def downgrade():
    # Dismissal is a one-way data cleanup; the alerts themselves are kept.
    pass
