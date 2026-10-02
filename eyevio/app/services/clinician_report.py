"""One-page clinician PDF — glanceable in a real appointment."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from io import BytesIO
from typing import Any, Dict, List

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
from app.services.myopia_progression import classify_progression, progression_rate_d_per_year
from app.utils.native_measures import native_summary

INK = HexColor('#1c1917')
MUTED = HexColor('#57534e')
RULE = HexColor('#d6d3d1')
TEAL = HexColor('#0f766e')
TEAL_DARK = HexColor('#134e4a')
CREAM = HexColor('#f5f0e8')

TEST_LABELS = [
    ('visual_acuity', 'Distance acuity'),
    ('contrast_sensitivity', 'Contrast sensitivity'),
    ('color_vision', 'Color thresholds (protan/deutan/tritan)'),
    ('amsler_grid', 'Amsler (full + 5% contrast) / vernier'),
    ('near_point_convergence', 'Near point of convergence (camera-assisted)'),
    ('side_vision', 'Side-vision relative asymmetry (home check)'),
    ('side_vision_legacy', 'Side-vision home check (earlier version)'),
    ('cataract_glare', 'Glare / scatter'),
    ('dry_eye', 'Dry-eye home check'),
    ('peripheral_awareness', 'Peripheral awareness'),
]


RETIRED_ALERT_TYPES = ('high_fatigue', 'lens_replacement', 'eye_health_deterioration')


def _reportable(alert: Alert) -> bool:
    """Alerts raised from display indices or research-only models never reach a clinician."""
    if alert.alert_type in RETIRED_ALERT_TYPES:
        return False
    unit = (((alert.alert_data or {}).get('assessment') or {}).get('unit')) or ''
    return not (unit.startswith('score') or unit.startswith('display index'))


def _flag_text(alert: Alert):
    """Myopia alerts are re-worded from their stored rate, so older stored wording is not shown."""
    rate = (alert.alert_data or {}).get('rate_d_per_year')
    if alert.alert_type != 'myopia_progression' or rate is None:
        return alert.title, (alert.message or '')[:160]
    name = (alert.title or '').split('—')[-1].strip()
    title = f'Prescription change logged — {name}' if name else 'Prescription change logged'
    return title, _first_sentence(classify_progression(rate)['summary'])


def _first_sentence(text: str) -> str:
    return text.split('. ')[0].rstrip('.') + '.'


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
        VisionTest.usable().filter_by(user_id=user.id)
        .order_by(VisionTest.created_at.desc())
        .all()
    )
    tests_in_period = [t for t in tests if t.created_at and t.created_at >= cutoff]
    # Sparkline is one test in one unit: better-eye logMAR from the current acuity method.
    acuity_points = []
    for t in reversed(tests_in_period):
        d = t.test_details or {}
        if t.test_type != 'visual_acuity' or d.get('method_version') != 2:
            continue
        vals = [(d.get(k) or {}).get('logMAR') for k in ('right_eye', 'left_eye')]
        vals = [v for v in vals if isinstance(v, (int, float))]
        if vals:
            acuity_points.append({'date': t.created_at, 'score': min(vals)})
    acuity_points = acuity_points[-24:]

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
            **native_summary(test.test_type, test.test_details),
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
    blink_rates = [m.blink_rate for m in metrics if m.blink_rate is not None]
    avg_blink_rate = sum(blink_rates) / len(blink_rates) if blink_rates else None

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
        if alert.severity in ('high', 'critical', 'medium') and _reportable(alert):
            add_flag('medium' if alert.alert_type == 'myopia_progression' else alert.severity, *_flag_text(alert))

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
                rate = progression_rate_d_per_year(entries[-2], latest, 'binocular')
                klass = classify_progression(rate)
                myopia['rate'] = rate
                myopia['rate_label'] = klass['label']
                if klass['label'] in ('fast', 'very_fast'):
                    add_flag('medium', 'Prescription change logged (reported SE)', _first_sentence(klass['summary']))

    # Deduplicate by title and cap at 5; notes are listed, not ranked by concern.
    uniq = {}
    for flag in flags:
        uniq.setdefault(flag['title'], flag)
    flags = list(uniq.values())[:5]

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
        'trend': acuity_points,
        'tests_in_period': len(tests_in_period),
        'avg_blink_rate': avg_blink_rate,
        'webcam_sessions': len(metrics),
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
        c.drawCentredString(x + w / 2, y + h / 2 - 3, 'Need ≥2 acuity tests in window')
        return

    scores = [p['score'] for p in points]
    lo = min(min(scores), -0.1)
    hi = max(max(scores), 0.5)
    span = hi - lo or 1
    pad = 8
    xs, ys = [], []
    for i, p in enumerate(points):
        t = i / (len(points) - 1)
        xs.append(x + pad + t * (w - 2 * pad))
        # logMAR: lower is better, so better acuity plots higher.
        ys.append(y + pad + ((hi - p['score']) / span) * (h - 2 * pad))

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
    c.drawString(x + 4, y + 3, f'{hi:+.1f}')
    c.drawRightString(x + w - 4, y + h - 10, f'{lo:+.1f}')


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
    c.drawString(ml, height - 0.36 * inch, 'EyeVio  ·  Home-check summary')
    c.setFont('Helvetica', 8)
    c.drawRightString(width - mr, height - 0.28 * inch, 'UNVALIDATED RESEARCH & EDUCATIONAL PROTOTYPE')
    c.drawRightString(width - mr, height - 0.44 * inch, 'Not clinically validated  ·  Not for diagnosis or treatment')

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

    # Latest measurements (native units) + sparkline
    y -= 18
    c.setFillColor(TEAL_DARK)
    c.setFont('Times-Bold', 11)
    c.drawString(ml, y, 'Latest home-check measurements')

    y -= 12
    table_top = y
    col_w = content_w
    row_h = 14
    headers = [
        ('Test', 0), ('Measurement', 0.30 * col_w), ('OD', 0.62 * col_w),
        ('OS', 0.76 * col_w), ('Date', 0.89 * col_w),
    ]

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
            c.drawString(ml + 4, y - 10, row['label'][:40])
            c.setFont('Helvetica-Bold', 8)
            c.drawString(ml + 4 + 0.30 * col_w, y - 10, row['measure'][:46])
            c.setFont('Helvetica', 7.5)
            c.drawString(ml + 4 + 0.62 * col_w, y - 10, row['od'][:20])
            c.drawString(ml + 4 + 0.76 * col_w, y - 10, row['os'][:20])
            c.setFillColor(MUTED)
            c.drawString(ml + 4 + 0.89 * col_w, y - 10, _fmt_date(row['date']))
            y -= row_h

    table_bottom = y
    c.setStrokeColor(RULE)
    c.setLineWidth(0.4)
    c.rect(ml, table_bottom, col_w, table_top - table_bottom, stroke=1, fill=0)
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 7)
    c.drawString(
        ml, table_bottom - 10,
        'Each test in its own unit. 0–100 app indices are not clinically validated and are omitted.',
    )

    y = table_bottom - 28
    c.setFillColor(TEAL_DARK)
    c.setFont('Times-Bold', 11)
    c.drawString(ml, y, 'Acuity trend')
    spark_h = 64
    spark_y = y - 8 - spark_h
    _draw_sparkline(c, ml, spark_y, content_w, spark_h, payload['trend'])
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 7)
    c.drawString(ml, spark_y - 11, 'Better-eye logMAR (home chart)  ·  up to 24 acuity tests  ·  plotted up = better')

    y = spark_y - 32

    # Automated notes
    c.setFillColor(TEAL_DARK)
    c.setFont('Times-Bold', 11)
    c.drawString(ml, y, 'Automated notes (not clinically validated)')
    y -= 6
    c.setStrokeColor(RULE)
    c.setLineWidth(0.5)
    c.line(ml, y, width - mr, y)
    y -= 16

    flags = payload['flags']
    if not flags:
        c.setFillColor(MUTED)
        c.setFont('Times-Italic', 9)
        c.drawString(ml, y, 'No automated notes in this window.')
        y -= 18
    else:
        for flag in flags:
            c.setFillColor(MUTED)
            c.circle(ml + 4, y + 2, 2.4, stroke=0, fill=1)
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
            'Blinking / myopia',
            [
                (
                    f'Blink rate  {payload["avg_blink_rate"]:.0f} /min'
                    if payload.get('avg_blink_rate') is not None
                    else 'Blink rate  —'
                ),
                f'Webcam sessions  {payload.get("webcam_sessions", 0)}',
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
    footer_1 = ('EyeVio is a research and educational prototype. It has not been clinically validated, reviewed, '
                'cleared, or approved as a medical device.')
    footer_2 = ('Its outputs must not be used to diagnose, exclude, monitor, or treat an eye condition. '
                'Home measurements depend on device and distance.')
    c.drawString(ml, 0.42 * inch, footer_1)
    c.drawString(ml, 0.30 * inch, footer_2)
    c.setFont('Helvetica', 7)
    c.drawRightString(width - mr, 0.30 * inch, 'Page 1 of 1')

    # Do not call showPage() — that would emit a blank second page.
    c.save()
    buf.seek(0)
    return buf
