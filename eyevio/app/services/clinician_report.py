"""One-page clinician PDF — glanceable in a real appointment."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from io import BytesIO
from typing import Any, Dict, List, Optional

from reportlab.lib.colors import HexColor, white

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

from app.models import (
    Alert,
    LifestyleLog,
    MyopiaPrescriptionEntry,
    MyopiaSubject,
    User,
    VisionTest,
    WebcamMetric,
)

INK = HexColor('#1c1917')
MUTED = HexColor('#57534e')
RULE = HexColor('#d6d3d1')
TEAL = HexColor('#0f766e')
TEAL_DARK = HexColor('#134e4a')
AMBER = HexColor('#b45309')
RED = HexColor('#b91c1c')
CREAM = HexColor('#f5f0e8')

TEST_LABELS = [
    ('visual_acuity', 'Distance acuity'),
    ('contrast_sensitivity', 'Contrast sensitivity'),
    ('color_vision', 'Color (Ishihara-style)'),
    ('amsler_grid', 'Amsler / central'),
    ('glaucoma_neural', 'Paracentral screen'),
    ('cataract_glare', 'Glare / scatter'),
    ('dry_eye', 'Dry-eye screen'),
    ('peripheral_awareness', 'Peripheral awareness'),
]


def _fmt_score(value: Optional[float]) -> str:
    if value is None:
        return '—'
    return f'{float(value):.0f}'


def _fmt_date(value) -> str:
    if not value:
        return '—'
    if isinstance(value, datetime):
        return value.strftime('%d %b %Y')
    return value.strftime('%d %b %Y')


def _fmt_rx(sph, cyl, axis) -> str:
    if sph is None and cyl is None:
        return '—'
    parts = []
    if sph is not None:
        parts.append(f'{sph:+.2f}')
    if cyl is not None:
        ax = f' x{int(axis)}' if axis is not None else ''
        parts.append(f'{cyl:+.2f}{ax}')
    return ' '.join(parts) if parts else '—'


def clinician_filename(user: User) -> str:
    raw = (user.full_name or user.email or 'patient').lower()
    slug = re.sub(r'[^a-z0-9]+', '_', raw).strip('_')[:40] or 'patient'
    return f'eyevio_clinician_{slug}_{datetime.utcnow().strftime("%Y%m%d")}.pdf'


def assemble_clinician_payload(user: User, days: int = 90) -> Dict[str, Any]:
    days = max(7, min(int(days or 90), 365))
    cutoff = datetime.utcnow() - timedelta(days=days)

    tests = (
        VisionTest.query.filter_by(user_id=user.id)
        .order_by(VisionTest.created_at.desc())
        .all()
    )
    tests_in_period = [t for t in tests if t.created_at and t.created_at >= cutoff]
    # Newest-first list → take 24 most recent, then chronological for the sparkline
    trend_tests = list(reversed(tests_in_period[:24])) if tests_in_period else []

    latest_by_type: List[Dict[str, Any]] = []
    seen = set()
    for test in tests:
        if test.test_type in seen:
            continue
        seen.add(test.test_type)
        label = dict(TEST_LABELS).get(test.test_type, test.test_type.replace('_', ' ').title())
        latest_by_type.append({
            'type': test.test_type,
            'label': label,
            'score': test.score,
            'od': test.right_eye_score,
            'os': test.left_eye_score,
            'date': test.created_at,
        })

    # Keep preferred order, then any extras
    ordered = []
    preferred = [k for k, _ in TEST_LABELS]
    for key in preferred:
        match = next((r for r in latest_by_type if r['type'] == key), None)
        if match:
            ordered.append(match)
    for row in latest_by_type:
        if row['type'] not in preferred:
            ordered.append(row)
    latest_by_type = ordered[:8]

    metrics = (
        WebcamMetric.query.filter(
            WebcamMetric.user_id == user.id,
            WebcamMetric.created_at >= cutoff,
        )
        .order_by(WebcamMetric.created_at.desc())
        .all()
    )
    latest_fatigue = metrics[0] if metrics else None
    avg_fatigue = (
        sum(m.fatigue_score for m in metrics) / len(metrics) if metrics else None
    )

    logs = (
        LifestyleLog.query.filter(
            LifestyleLog.user_id == user.id,
            LifestyleLog.log_date >= cutoff.date(),
        ).all()
    )

    def _avg(vals):
        nums = [v for v in vals if v is not None]
        return round(sum(nums) / len(nums), 1) if nums else None

    lifestyle = {
        'days_logged': len(logs),
        'screen': _avg([l.screen_time_hours for l in logs]),
        'outdoor': _avg([l.outdoor_time_hours for l in logs]),
        'breaks': _avg([l.breaks_taken for l in logs]),
        'sleep': _avg([l.sleep_hours for l in logs]),
    }

    alerts = (
        Alert.query.filter(
            Alert.user_id == user.id,
            Alert.created_at >= cutoff,
            Alert.is_dismissed.is_(False),
        )
        .order_by(Alert.created_at.desc())
        .limit(12)
        .all()
    )

    flags: List[Dict[str, str]] = []

    def add_flag(severity: str, title: str, detail: str):
        flags.append({'severity': severity, 'title': title, 'detail': detail})

    for alert in alerts:
        if alert.severity in ('high', 'critical', 'medium'):
            add_flag(alert.severity, alert.title, (alert.message or '')[:160])

    if tests_in_period and len(tests_in_period) >= 4:
        recent = [t.score for t in tests_in_period[:3] if t.score is not None]
        older = [t.score for t in tests_in_period[3:8] if t.score is not None]
        if recent and older:
            r_avg = sum(recent) / len(recent)
            o_avg = sum(older) / len(older)
            if o_avg > 0 and (o_avg - r_avg) / o_avg >= 0.10:
                add_flag(
                    'high',
                    'Screening scores down ≥10%',
                    f'Recent mean {r_avg:.0f} vs prior {o_avg:.0f} (app screening, not refraction).',
                )

    if avg_fatigue is not None and avg_fatigue >= 70:
        add_flag(
            'medium',
            'Elevated digital-eye-strain / fatigue',
            f'Mean fatigue score {avg_fatigue:.0f}/100 over {len(metrics)} webcam sessions.',
        )

    if lifestyle['screen'] is not None and lifestyle['screen'] >= 6:
        add_flag(
            'medium',
            'High near-work / screen time',
            f'Average {lifestyle["screen"]} h/day logged in this window.',
        )

    if user.age is not None and user.age <= 18:
        if lifestyle['outdoor'] is not None and lifestyle['outdoor'] < 1.5:
            add_flag(
                'medium',
                'Low outdoor time (pediatric myopia risk)',
                f'Average {lifestyle["outdoor"]} h/day — evidence supports ~2 h outdoor daily.',
            )

    myopia = None
    subject = (
        MyopiaSubject.query.filter_by(user_id=user.id, is_active=True)
        .order_by(MyopiaSubject.created_at.desc())
        .first()
    )
    if subject:
        entries = (
            MyopiaPrescriptionEntry.query.filter_by(subject_id=subject.id)
            .order_by(MyopiaPrescriptionEntry.measured_at.asc())
            .all()
        )
        if entries:
            latest = entries[-1]
            myopia = {
                'se': latest.se_binocular,
                'se_od': latest.se_od,
                'se_os': latest.se_os,
                'date': latest.measured_at,
            }
            if len(entries) >= 2:
                from app.services.myopia_progression import classify_progression, progression_rate_d_per_year

                rate = progression_rate_d_per_year(entries[-2], latest, 'binocular')
                klass = classify_progression(rate)
                myopia['rate'] = rate
                myopia['rate_label'] = klass['label']
                if klass['label'] in ('fast', 'very_fast'):
                    add_flag('high', 'Myopia progression (reported SE)', klass['summary'])

    # Deduplicate by title, keep highest severity, cap at 5
    rank = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
    uniq = {}
    for flag in flags:
        key = flag['title']
        if key not in uniq or rank.get(flag['severity'], 9) < rank.get(uniq[key]['severity'], 9):
            uniq[key] = flag
    flags = sorted(uniq.values(), key=lambda f: rank.get(f['severity'], 9))[:5]

    return {
        'patient': {
            'name': user.full_name or user.email,
            'email': user.email,
            'age': user.age,
            'dob': user.date_of_birth,
            'lens_type': user.lens_type,
            'rx_od': _fmt_rx(
                user.current_prescription_od_sph,
                user.current_prescription_od_cyl,
                user.current_prescription_od_axis,
            ),
            'rx_os': _fmt_rx(
                user.current_prescription_os_sph,
                user.current_prescription_os_cyl,
                user.current_prescription_os_axis,
            ),
        },
        'generated_at': datetime.utcnow(),
        'days': days,
        'latest_by_type': latest_by_type,
        'trend': [{'date': t.created_at, 'score': t.score} for t in trend_tests],
        'tests_in_period': len(tests_in_period),
        'latest_fatigue': latest_fatigue.fatigue_score if latest_fatigue else None,
        'avg_fatigue': avg_fatigue,
        'lifestyle': lifestyle,
        'myopia': myopia,
        'flags': flags,
    }


def _draw_sparkline(c: canvas.Canvas, x: float, y: float, w: float, h: float, points: List[Dict[str, Any]]):
    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    c.rect(x, y, w, h, stroke=1, fill=0)
    points = [p for p in points if p.get('score') is not None]
    if len(points) < 2:
        c.setFillColor(MUTED)
        c.setFont('Times-Italic', 9)
        c.drawCentredString(x + w / 2, y + h / 2 - 3, 'Need ≥2 tests in window')
        return

    scores = [p['score'] for p in points]
    lo = min(min(scores), 40)
    hi = max(max(scores), 100)
    span = hi - lo or 1
    pad = 8
    xs, ys = [], []
    for i, p in enumerate(points):
        t = i / (len(points) - 1)
        xs.append(x + pad + t * (w - 2 * pad))
        ys.append(y + pad + ((p['score'] - lo) / span) * (h - 2 * pad))

    c.setStrokeColor(TEAL)
    c.setLineWidth(1.6)
    pth = c.beginPath()
    pth.moveTo(xs[0], ys[0])
    for px, py in zip(xs[1:], ys[1:]):
        pth.lineTo(px, py)
    c.drawPath(pth, stroke=1, fill=0)

    c.setFillColor(TEAL_DARK)
    c.circle(xs[-1], ys[-1], 2.4, stroke=0, fill=1)

    c.setFillColor(MUTED)
    c.setFont('Helvetica', 7)
    c.drawString(x + 4, y + 3, f'{lo:.0f}')
    c.drawRightString(x + w - 4, y + h - 10, f'{hi:.0f}')


def render_clinician_pdf(payload: Dict[str, Any]) -> BytesIO:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    width, height = letter
    ml, mr = 0.55 * inch, 0.55 * inch
    content_w = width - ml - mr

    # Header bar
    c.setFillColor(TEAL_DARK)
    c.rect(0, height - 0.58 * inch, width, 0.58 * inch, stroke=0, fill=1)
    c.setFillColor(white)
    c.setFont('Times-Bold', 16)
    c.drawString(ml, height - 0.36 * inch, 'EyeVio  ·  Clinical screening summary')
    c.setFont('Helvetica', 8)
    c.drawRightString(width - mr, height - 0.28 * inch, 'ONE PAGE')
    c.drawRightString(width - mr, height - 0.44 * inch, 'Not a diagnosis  ·  Home screening data')

    y = height - 0.82 * inch
    patient = payload['patient']
    generated = payload['generated_at'].strftime('%d %b %Y  %H:%M UTC')
    dob = _fmt_date(patient['dob']) if patient['dob'] else '—'
    age = f"{patient['age']} y" if patient['age'] is not None else '—'

    c.setFillColor(INK)
    c.setFont('Times-Bold', 14)
    name = (patient['name'] or 'Unnamed patient')[:48]
    c.drawString(ml, y, name)
    c.setFont('Helvetica', 8)
    c.setFillColor(MUTED)
    c.drawRightString(width - mr, y + 2, f'Generated {generated}')

    y -= 16
    c.setFillColor(INK)
    c.setFont('Helvetica', 8.5)
    meta = (
        f'DOB {dob}   Age {age}   Correction {patient["lens_type"] or "—"}   '
        f'Window {payload["days"]} days   Tests in window {payload["tests_in_period"]}'
    )
    c.drawString(ml, y, meta)

    y -= 10
    c.setStrokeColor(TEAL)
    c.setLineWidth(1.2)
    c.line(ml, y, width - mr, y)

    # Latest scores + sparkline
    y -= 18
    c.setFillColor(TEAL_DARK)
    c.setFont('Times-Bold', 11)
    c.drawString(ml, y, 'Latest screening scores')
    c.drawString(ml + content_w * 0.58, y, 'Vision score trend')

    y -= 12
    table_top = y
    col_w = content_w * 0.56
    row_h = 14
    headers = [('Test', 0), ('Score', 0.42 * col_w), ('OD / OS', 0.58 * col_w), ('Date', 0.78 * col_w)]

    c.setFillColor(CREAM)
    c.rect(ml, y - row_h, col_w, row_h, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont('Helvetica-Bold', 7.5)
    for label, ox in headers:
        c.drawString(ml + 4 + ox, y - 10, label)

    y -= row_h
    c.setFont('Helvetica', 8)
    rows = payload['latest_by_type'] or []
    if not rows:
        c.setFillColor(MUTED)
        c.setFont('Times-Italic', 8)
        c.drawString(ml + 4, y - 10, 'No screening tests on file.')
        y -= row_h
    else:
        for i, row in enumerate(rows):
            if i % 2 == 1:
                c.setFillColor(HexColor('#fafaf9'))
                c.rect(ml, y - row_h, col_w, row_h, stroke=0, fill=1)
            c.setFillColor(INK)
            c.setFont('Helvetica', 8)
            c.drawString(ml + 4, y - 10, row['label'][:28])
            c.setFont('Helvetica-Bold', 8)
            c.drawString(ml + 4 + 0.42 * col_w, y - 10, _fmt_score(row['score']))
            c.setFont('Helvetica', 8)
            odos = f"{_fmt_score(row['od'])} / {_fmt_score(row['os'])}"
            c.drawString(ml + 4 + 0.58 * col_w, y - 10, odos)
            c.setFillColor(MUTED)
            c.drawString(ml + 4 + 0.78 * col_w, y - 10, _fmt_date(row['date']))
            y -= row_h

    table_bottom = y
    c.setStrokeColor(RULE)
    c.setLineWidth(0.4)
    c.rect(ml, table_bottom, col_w, table_top - table_bottom, stroke=1, fill=0)

    spark_x = ml + content_w * 0.58
    spark_w = content_w * 0.42
    spark_h = max(table_top - table_bottom, 72)
    spark_y = table_top - spark_h
    _draw_sparkline(c, spark_x, spark_y, spark_w, spark_h, payload['trend'])
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 7)
    c.drawString(spark_x, spark_y - 11, 'Home screening %  ·  last 24 tests in window  ·  higher is better')

    y = min(table_bottom, spark_y) - 26

    # Flagged concerns
    c.setFillColor(TEAL_DARK)
    c.setFont('Times-Bold', 11)
    c.drawString(ml, y, 'Flagged concerns')
    y -= 6
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(ml, y, width - mr, y)
    y -= 16

    flags = payload['flags']
    if not flags:
        c.setFillColor(MUTED)
        c.setFont('Times-Italic', 9)
        c.drawString(ml, y, 'No automated flags in this window.')
        y -= 18
    else:
        for flag in flags:
            sev = (flag['severity'] or 'medium').lower()
            color = RED if sev in ('high', 'critical') else AMBER
            c.setFillColor(color)
            c.circle(ml + 4, y + 2, 3.2, stroke=0, fill=1)
            c.setFillColor(INK)
            c.setFont('Helvetica-Bold', 9)
            c.drawString(ml + 14, y, flag['title'][:72])
            y -= 12
            c.setFillColor(MUTED)
            c.setFont('Helvetica', 8)
            c.drawString(ml + 14, y, (flag['detail'] or '')[:110])
            y -= 16

    # Bottom snapshot cards
    y -= 4
    c.setStrokeColor(TEAL)
    c.setLineWidth(1)
    c.line(ml, y, width - mr, y)
    y -= 18
    c.setFillColor(TEAL_DARK)
    c.setFont('Times-Bold', 11)
    c.drawString(ml, y, 'At-a-glance')

    y -= 14
    card_w = (content_w - 16) / 3
    card_h = 78
    cards = [
        (
            'Reported refraction',
            [
                f'OD  {patient["rx_od"]}',
                f'OS  {patient["rx_os"]}',
                'Patient-entered; confirm clinically.',
            ],
        ),
        (
            'Lifestyle (period avg)',
            [
                f'Screen  {payload["lifestyle"]["screen"] if payload["lifestyle"]["screen"] is not None else "—"} h',
                f'Outdoor  {payload["lifestyle"]["outdoor"] if payload["lifestyle"]["outdoor"] is not None else "—"} h',
                f'20-20-20  {payload["lifestyle"]["breaks"] if payload["lifestyle"]["breaks"] is not None else "—"} /d   Sleep  {payload["lifestyle"]["sleep"] if payload["lifestyle"]["sleep"] is not None else "—"} h',
            ],
        ),
        (
            'Fatigue / myopia',
            [
                f'Last fatigue  {_fmt_score(payload["latest_fatigue"])}/100',
                f'Mean fatigue  {_fmt_score(payload["avg_fatigue"])}/100',
                (
                    f'SE  {payload["myopia"]["se"]:+.2f} D'
                    if payload.get('myopia') and payload['myopia'].get('se') is not None
                    else 'SE  —'
                )
                + (
                    f'   {payload["myopia"]["rate"]:+.2f} D/y'
                    if payload.get('myopia') and payload['myopia'].get('rate') is not None
                    else ''
                ),
            ],
        ),
    ]

    for i, (title, lines) in enumerate(cards):
        cx = ml + i * (card_w + 8)
        c.setFillColor(CREAM)
        c.roundRect(cx, y - card_h, card_w, card_h, 4, stroke=0, fill=1)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.5)
        c.roundRect(cx, y - card_h, card_w, card_h, 4, stroke=1, fill=0)
        c.setFillColor(TEAL_DARK)
        c.setFont('Helvetica-Bold', 8)
        c.drawString(cx + 8, y - 14, title)
        c.setFillColor(INK)
        c.setFont('Helvetica', 8)
        ty = y - 28
        for line in lines:
            c.drawString(cx + 8, ty, line[:42])
            ty -= 12

    # Footer — stay on page 1
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 7)
    footer = (
        'Educational home-screening summary for clinical conversation only. Not a refraction, not LOCS/ICD diagnosis, '
        'not a substitute for a comprehensive eye examination. Scores are app-based and device/distance dependent.'
    )
    c.drawString(ml, 0.42 * inch, footer[:120])
    c.drawString(ml, 0.30 * inch, footer[120:])
    c.setFont('Helvetica', 7)
    c.drawRightString(width - mr, 0.30 * inch, 'Page 1 of 1')

    # Do not call showPage() — that would emit a blank second page.
    c.save()
    buf.seek(0)
    return buf
