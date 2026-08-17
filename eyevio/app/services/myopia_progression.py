"""Myopia progression analytics for kids/teens (educational screening)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.models import LifestyleLog, MyopiaPrescriptionEntry, MyopiaSubject


def spherical_equivalent(sph: Optional[float], cyl: Optional[float] = None) -> Optional[float]:
    """SE (D) = sphere + cylinder/2."""
    if sph is None:
        return None
    cyl_val = float(cyl or 0)
    return round(float(sph) + cyl_val / 2.0, 3)


def fill_spherical_equivalents(entry: MyopiaPrescriptionEntry) -> None:
    entry.se_od = spherical_equivalent(entry.od_sph, entry.od_cyl)
    entry.se_os = spherical_equivalent(entry.os_sph, entry.os_cyl)
    available = [v for v in (entry.se_od, entry.se_os) if v is not None]
    entry.se_binocular = round(sum(available) / len(available), 3) if available else None


def _years_between(a, b) -> float:
    days = abs((b - a).days)
    return max(days / 365.25, 1 / 365.25)


def progression_rate_d_per_year(
    older: MyopiaPrescriptionEntry,
    newer: MyopiaPrescriptionEntry,
    eye: str = 'binocular',
) -> Optional[float]:
    """
    Annualized change in SE (D/year).
    More negative SE = more myopia, so a negative rate means worsening.
    """
    attr = {'od': 'se_od', 'os': 'se_os', 'binocular': 'se_binocular'}.get(eye, 'se_binocular')
    old_se = getattr(older, attr, None)
    new_se = getattr(newer, attr, None)
    if old_se is None or new_se is None or not older.measured_at or not newer.measured_at:
        return None
    years = _years_between(older.measured_at, newer.measured_at)
    return round((new_se - old_se) / years, 3)


def classify_progression(rate_d_per_year: Optional[float]) -> Dict[str, Any]:
    """
    Classify myopia progression speed from annualized SE change.
    Negative rate = worsening (more myopic).
    """
    if rate_d_per_year is None:
        return {
            'label': 'insufficient_data',
            'severity': 'low',
            'summary': 'Need at least two prescription entries spaced over time.',
        }

    worsening = -rate_d_per_year  # positive = diopters of myopia gained per year
    if worsening < 0.25:
        return {
            'label': 'stable_or_slow',
            'severity': 'low',
            'summary': f'Estimated change ≈ {rate_d_per_year:+.2f} D/year (stable or slow).',
        }
    if worsening < 0.50:
        return {
            'label': 'moderate',
            'severity': 'medium',
            'summary': f'Estimated progression ≈ {rate_d_per_year:+.2f} D/year (moderate).',
        }
    if worsening < 1.0:
        return {
            'label': 'fast',
            'severity': 'high',
            'summary': f'Estimated progression ≈ {rate_d_per_year:+.2f} D/year (fast). Discuss myopia control with an eye doctor.',
        }
    return {
        'label': 'very_fast',
        'severity': 'critical',
        'summary': f'Estimated progression ≈ {rate_d_per_year:+.2f} D/year (very fast). Prompt clinical follow-up recommended.',
    }


def lifestyle_averages(user_id: int, days: int = 30) -> Dict[str, Optional[float]]:
    cutoff = datetime.utcnow().date() - timedelta(days=days)
    logs = (
        LifestyleLog.query.filter(
            LifestyleLog.user_id == user_id,
            LifestyleLog.log_date >= cutoff,
        )
        .order_by(LifestyleLog.log_date)
        .all()
    )
    if not logs:
        return {
            'days_logged': 0,
            'avg_screen_hours': None,
            'avg_outdoor_hours': None,
            'avg_sleep_hours': None,
            'avg_breaks': None,
        }

    def _avg(values):
        vals = [v for v in values if v is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    return {
        'days_logged': len(logs),
        'avg_screen_hours': _avg([l.screen_time_hours for l in logs]),
        'avg_outdoor_hours': _avg([l.outdoor_time_hours for l in logs]),
        'avg_sleep_hours': _avg([l.sleep_hours for l in logs]),
        'avg_breaks': _avg([l.breaks_taken for l in logs]),
        'series': [
            {
                'date': l.log_date.isoformat(),
                'screen_time_hours': l.screen_time_hours,
                'outdoor_time_hours': l.outdoor_time_hours,
            }
            for l in logs
        ],
    }


def compute_risk_score(
    subject: MyopiaSubject,
    entries: List[MyopiaPrescriptionEntry],
    lifestyle: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Heuristic 0–100 educational risk score for kids/teen myopia progression.
    Higher = higher concern. Not a clinical diagnosis.
    """
    factors: List[Dict[str, Any]] = []
    score = 0

    age = subject.age_years()
    if age is not None:
        if age <= 9:
            score += 20
            factors.append({'id': 'young_age', 'points': 20, 'detail': f'Age {age}: younger children often progress faster'})
        elif age <= 14:
            score += 14
            factors.append({'id': 'school_age', 'points': 14, 'detail': f'Age {age}: peak school-age progression window'})
        elif age <= 18:
            score += 8
            factors.append({'id': 'teen', 'points': 8, 'detail': f'Age {age}: teen years — still at risk until eye growth slows'})

    if subject.myopia_onset_age is not None and subject.myopia_onset_age <= 8:
        score += 12
        factors.append({'id': 'early_onset', 'points': 12, 'detail': 'Onset at age 8 or earlier increases lifetime myopia risk'})

    parental = (subject.parental_myopia or 'unknown').lower()
    if parental == 'both_parents':
        score += 15
        factors.append({'id': 'parental_both', 'points': 15, 'detail': 'Both parents myopic — strong hereditary risk'})
    elif parental == 'one_parent':
        score += 8
        factors.append({'id': 'parental_one', 'points': 8, 'detail': 'One parent myopic'})

    rate = None
    if len(entries) >= 2:
        rate = progression_rate_d_per_year(entries[-2], entries[-1], 'binocular')
        classification = classify_progression(rate)
        if classification['label'] == 'moderate':
            score += 12
            factors.append({'id': 'prog_moderate', 'points': 12, 'detail': classification['summary']})
        elif classification['label'] == 'fast':
            score += 22
            factors.append({'id': 'prog_fast', 'points': 22, 'detail': classification['summary']})
        elif classification['label'] == 'very_fast':
            score += 30
            factors.append({'id': 'prog_very_fast', 'points': 30, 'detail': classification['summary']})

    outdoor = lifestyle.get('avg_outdoor_hours')
    target_out = subject.target_outdoor_hours or 2.0
    if outdoor is not None:
        if outdoor < 1.0:
            score += 16
            factors.append({'id': 'outdoor_low', 'points': 16, 'detail': f'Outdoor time {outdoor}h/day — evidence supports ~2h/day to slow progression'})
        elif outdoor < target_out:
            score += 8
            factors.append({'id': 'outdoor_below_target', 'points': 8, 'detail': f'Outdoor {outdoor}h/day below target {target_out}h'})

    screen = lifestyle.get('avg_screen_hours')
    target_screen = subject.target_screen_hours or 2.0
    if screen is not None:
        if screen >= 6:
            score += 14
            factors.append({'id': 'screen_very_high', 'points': 14, 'detail': f'Screen time {screen}h/day — high near-work load'})
        elif screen > target_screen:
            score += 8
            factors.append({'id': 'screen_high', 'points': 8, 'detail': f'Screen time {screen}h/day above target {target_screen}h'})

    if outdoor is not None and screen is not None and outdoor < 1.5 and screen >= 4:
        score += 10
        factors.append({
            'id': 'screen_outdoor_imbalance',
            'points': 10,
            'detail': 'High screen + low outdoor time — classic progression risk pattern for school-age kids',
        })

    treatment = (subject.treatment or 'none').lower()
    if treatment in ('atropine', 'ortho_k', 'multifocal', 'dual_focus') and score > 0:
        score = max(0, score - 8)
        factors.append({'id': 'treatment_active', 'points': -8, 'detail': f'Active myopia-control treatment ({treatment}) noted'})

    score = int(min(100, max(0, score)))
    if score >= 70:
        band = 'high'
    elif score >= 40:
        band = 'moderate'
    else:
        band = 'lower'

    recommendations = _recommendations(subject, lifestyle, rate)

    return {
        'score': score,
        'band': band,
        'factors': factors,
        'progression_rate_d_per_year': rate,
        'progression': classify_progression(rate),
        'recommendations': recommendations,
        'disclaimer': (
            'Educational estimate only — not a diagnosis or substitute for an eye exam. '
            'Discuss progression and myopia-control options with an optometrist or ophthalmologist.'
        ),
    }


def _recommendations(
    subject: MyopiaSubject,
    lifestyle: Dict[str, Any],
    rate: Optional[float],
) -> List[Dict[str, str]]:
    recs: List[Dict[str, str]] = []
    target_out = subject.target_outdoor_hours or 2.0
    outdoor = lifestyle.get('avg_outdoor_hours')
    screen = lifestyle.get('avg_screen_hours')

    if outdoor is None or outdoor < target_out:
        recs.append({
            'priority': 'high',
            'title': 'Increase outdoor time',
            'detail': f'Aim for about {target_out:.0f}+ hours outdoors daily — one of the strongest lifestyle levers for slowing childhood myopia.',
        })
    if screen is not None and screen > (subject.target_screen_hours or 2.0):
        recs.append({
            'priority': 'high',
            'title': 'Reduce continuous near work',
            'detail': 'Use 20-20-20 breaks, keep screens farther away, and batch homework with outdoor pauses.',
        })
    if rate is not None and rate <= -0.50:
        recs.append({
            'priority': 'critical',
            'title': 'Ask about myopia-control options',
            'detail': 'Fast progression warrants a conversation about atropine, ortho-k, or dual-focus/multifocal lenses with a clinician.',
        })
    if (subject.treatment or 'none') == 'none' and subject.age_years() is not None and subject.age_years() <= 16:
        recs.append({
            'priority': 'medium',
            'title': 'Schedule regular pediatric eye exams',
            'detail': 'School-age kids with myopia often need checks every 6–12 months (or sooner if progressing).',
        })
    recs.append({
        'priority': 'medium',
        'title': 'Log each new prescription',
        'detail': 'Enter SE after every eye exam so progression rate stays accurate over months and years.',
    })
    return recs


def build_dashboard(subject: MyopiaSubject, user_id: int, lifestyle_days: int = 30) -> Dict[str, Any]:
    entries = (
        MyopiaPrescriptionEntry.query.filter_by(subject_id=subject.id)
        .order_by(MyopiaPrescriptionEntry.measured_at.asc())
        .all()
    )
    lifestyle = lifestyle_averages(user_id, days=lifestyle_days)
    risk = compute_risk_score(subject, entries, lifestyle)

    timeline = [e.to_dict() for e in entries]
    rates: List[Dict[str, Any]] = []
    for i in range(1, len(entries)):
        rates.append({
            'from': entries[i - 1].measured_at.isoformat(),
            'to': entries[i].measured_at.isoformat(),
            'od': progression_rate_d_per_year(entries[i - 1], entries[i], 'od'),
            'os': progression_rate_d_per_year(entries[i - 1], entries[i], 'os'),
            'binocular': progression_rate_d_per_year(entries[i - 1], entries[i], 'binocular'),
        })

    latest = entries[-1].to_dict() if entries else None
    first = entries[0].to_dict() if entries else None
    total_change = None
    if latest and first and latest.get('se_binocular') is not None and first.get('se_binocular') is not None:
        total_change = round(latest['se_binocular'] - first['se_binocular'], 3)

    return {
        'subject': subject.to_dict(),
        'latest_prescription': latest,
        'entry_count': len(entries),
        'timeline': timeline,
        'interval_rates': rates,
        'total_se_change_d': total_change,
        'lifestyle': lifestyle,
        'risk': risk,
    }
