#!/usr/bin/env python3
"""
Export validation-study participants' app results from the database.

  cd eyevio && ./venv/bin/python ../scripts/validation_export.py \
      --participants ../data/validation/participants.csv \
      --out ../data/validation/app_results.csv --since 2026-10-01 \
      --sessions-out ../data/validation/sessions_draft.csv

participants.csv maps participant_id → app account email. Emails are only used
for the lookup; the output carries participant IDs only. Withdrawn participants
(withdrawn_at set) are not exported. --sessions-out writes a draft sessions file
(every stored attempt, including unreliable ones) for study staff to complete.
See docs/validation/PROTOCOL.md.
"""

import argparse
import csv
import os
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / 'eyevio'))

from app import create_app  # noqa: E402
from app.models import User, VisionTest  # noqa: E402
from app.utils.validation_study import APP_COLUMNS, MEASURES, SESSION_COLUMNS, app_rows, session_draft_rows  # noqa: E402


def write_csv(path, rows, columns):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=columns)
        w.writeheader()
        w.writerows(rows)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--participants', required=True, help='CSV with participant_id,email[,withdrawn_at]')
    p.add_argument('--out', required=True, help='output CSV (long format)')
    p.add_argument('--sessions-out', help='optional draft sessions CSV (one row per stored attempt)')
    p.add_argument('--since', help='first study day, YYYY-MM-DD (inclusive)')
    p.add_argument('--until', help='last study day, YYYY-MM-DD (inclusive)')
    p.add_argument('--config', default=os.getenv('FLASK_ENV', 'development'))
    args = p.parse_args(argv)

    with open(args.participants, newline='', encoding='utf-8') as f:
        participants = [r for r in csv.DictReader(f) if (r.get('participant_id') or '').strip()]
    withdrawn = [r['participant_id'].strip() for r in participants if (r.get('withdrawn_at') or '').strip()]
    participants = [r for r in participants if not (r.get('withdrawn_at') or '').strip()]

    test_types = sorted({m.test_type for m in MEASURES.values()})
    since = datetime.fromisoformat(args.since) if args.since else None
    until = datetime.fromisoformat(args.until).replace(hour=23, minute=59, second=59) if args.until else None

    app = create_app(args.config)
    rows, session_rows, missing = [], [], []
    with app.app_context():
        for part in participants:
            pid, email = part['participant_id'].strip(), (part.get('email') or '').strip().lower()
            user = User.query.filter(User.email.ilike(email)).first() if email else None
            if user is None:
                missing.append(pid)
                continue
            q = VisionTest.query.filter(VisionTest.user_id == user.id, VisionTest.test_type.in_(test_types))
            if since:
                q = q.filter(VisionTest.created_at >= since)
            if until:
                q = q.filter(VisionTest.created_at <= until)
            tests = q.order_by(VisionTest.created_at).all()
            rows.extend(app_rows(pid, tests))
            session_rows.extend(session_draft_rows(pid, tests))

    write_csv(args.out, rows, APP_COLUMNS)
    print(f'Wrote {len(rows)} rows for {len(participants) - len(missing)} participants to {args.out}')
    if args.sessions_out:
        write_csv(args.sessions_out, session_rows, SESSION_COLUMNS)
        print(f'Wrote {len(session_rows)} draft session rows to {args.sessions_out} (complete visit, correction, device details)')
    if withdrawn:
        print(f'Skipped withdrawn participants: {", ".join(withdrawn)}', file=sys.stderr)
    if missing:
        print(f'No app account found for: {", ".join(missing)}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
