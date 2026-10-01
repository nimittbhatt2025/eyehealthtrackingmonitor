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
            'severity': 'medium',
            'summary': (
                f'Estimated change from the logged prescriptions ≈ {rate_d_per_year:+.2f} D/year (fast). '
                'You may want to ask the eye doctor who measured them about it.'
            ),
        }
    return {
        'label': 'very_fast',
        'severity': 'medium',
        'summary': (
            f'Estimated change from the logged prescriptions ≈ {rate_d_per_year:+.2f} D/year (very fast). '
            'You may want to ask the eye doctor who measured them about it.'
        ),
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


# Evidence catalogue. Effect sizes are quoted for education and flagged for
# verification against the original papers before any clinical use.
SOURCES = {
    'donovan2012': 'Donovan L et al. Myopia progression rates in urban children wearing single-vision spectacles. Optom Vis Sci 2012;89(1):27-32.',
    'hyman2005': 'Hyman L et al. Relationship of age, sex, and ethnicity with myopia progression and axial elongation in COMET. Arch Ophthalmol 2005;123(7):977-987.',
    'comet2013': 'COMET Group. Myopia stabilization and associated factors among participants in COMET. Invest Ophthalmol Vis Sci 2013;54(13):7871-7884.',
    'chua2016': 'Chua SYL et al. Age of onset of myopia predicts risk of high myopia in later childhood in myopic Singapore children. Ophthalmic Physiol Opt 2016;36(4):388-394.',
    'mutti2002': 'Mutti DO et al. Parental myopia, near work, school achievement, and children\'s refractive error. Invest Ophthalmol Vis Sci 2002;43(12):3633-3640.',
    'jones2007': 'Jones LA et al. Parental history of myopia, sports and outdoor activities, and future myopia. Invest Ophthalmol Vis Sci 2007;48(8):3524-3532.',
    'he2015': 'He M et al. Effect of time spent outdoors at school on the development of myopia among children in China: a randomized clinical trial. JAMA 2015;314(11):1142-1148.',
    'xiong2017': 'Xiong S et al. Time spent in outdoor activities in relation to myopia prevention and control: a meta-analysis and systematic review. Acta Ophthalmol 2017;95(6):551-566.',
    'huang2015': 'Huang HM, Chang DS, Wu PC. The association between near work activities and myopia in children: a systematic review and meta-analysis. PLoS One 2015;10(10):e0140419.',
    'foreman2021': 'Foreman J et al. Association between digital smart device use and myopia: a systematic review and meta-analysis. Lancet Digit Health 2021;3(12):e806-e818.',
    'yam2019': 'Yam JC et al. Low-Concentration Atropine for Myopia Progression (LAMP) study. Ophthalmology 2019;126(1):113-124.',
    'chamberlain2019': 'Chamberlain P et al. A 3-year randomized clinical trial of MiSight lenses for myopia control. Optom Vis Sci 2019;96(8):556-567.',
    'lam2020': 'Lam CSY et al. Defocus Incorporated Multiple Segments (DIMS) spectacle lenses slow myopia progression: a 2-year randomised clinical trial. Br J Ophthalmol 2020;104(3):363-368.',
}

EVIDENCE_REVIEW_NOTE = (
    'Citations and effect sizes were compiled for education. Verify quoted values against the original '
    'papers before relying on them clinically.'
)

# Approximate typical untreated progression (single-vision spectacles), D/year of added myopia.
# Synthesised from Donovan 2012 (faster in younger and East Asian children) and COMET
# (Hyman 2005; mean stabilisation age ~15.6 y, COMET 2013). Approximate ranges, not a fitted model.
AGE_TYPICAL_PROGRESSION = (
    (6, 8, 0.70, 1.10),
    (9, 11, 0.45, 0.85),
    (12, 14, 0.25, 0.60),
    (15, 17, 0.05, 0.35),
    (18, 200, 0.00, 0.15),
)

MIN_RATE_SPAN_YEARS = 0.5  # shorter intervals are dominated by refraction repeatability (~±0.25–0.5 D)


def typical_progression_for_age(age: Optional[int]) -> Optional[Dict[str, Any]]:
    if age is None or age < 6:
        return None
    for lo, hi, rmin, rmax in AGE_TYPICAL_PROGRESSION:
        if lo <= age <= hi:
            return {
                'age_band': f'{lo}–{hi}' if hi < 200 else f'{lo}+',
                'typical_range_d_per_year': [rmin, rmax],
                'basis': 'approximate, untreated single-vision wearers',
                'sources': ['donovan2012', 'hyman2005', 'comet2013'],
            }
    return None


def observed_progression(entries: List[MyopiaPrescriptionEntry]) -> Dict[str, Any]:
    """
    Robust observed rate from all binocular SE entries: Theil–Sen slope with Sen's CI
    when there are 3+ entries, otherwise first-to-last. Negative = more myopic per year.
    """
    pts = [(e.measured_at, e.se_binocular) for e in entries if e.measured_at and e.se_binocular is not None]
    if len(pts) < 2:
        return {'status': 'insufficient_data', 'n_entries': len(pts),
                'message': 'Need at least two prescriptions at least 6 months apart.'}
    t0 = pts[0][0]
    years = [(d - t0).days / 365.25 for d, _ in pts]
    se = [v for _, v in pts]
    span = years[-1] - years[0]
    if span < MIN_RATE_SPAN_YEARS:
        return {'status': 'insufficient_span', 'n_entries': len(pts), 'span_years': round(span, 2),
                'message': 'Prescriptions are less than 6 months apart; refraction noise would dominate the rate.'}
    if len(pts) >= 3:
        from app.utils.trend_forecast import theil_sen
        fit = theil_sen(years, se)
        rate, ci = fit['slope'], [fit['slope_lo'], fit['slope_hi']]
        method = 'theil_sen'
    else:
        rate, ci, method = (se[-1] - se[0]) / span, None, 'first_to_last'
    return {
        'status': 'ok',
        'method': method,
        'n_entries': len(pts),
        'span_years': round(span, 2),
        'rate_d_per_year': round(rate, 3),
        'rate_ci95': [round(c, 3) for c in ci] if ci else None,
    }


def compare_to_typical(observed: Dict[str, Any], typical: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if observed.get('status') != 'ok':
        return {'status': 'insufficient_data', 'summary': observed.get('message')}
    if not typical:
        return {'status': 'no_reference', 'summary': 'No age reference (date of birth missing or under 6).'}
    added = -observed['rate_d_per_year']
    lo, hi = typical['typical_range_d_per_year']
    ci = observed.get('rate_ci95')
    # "faster" only when the whole CI sits above the typical range (when a CI exists)
    added_lo = -ci[1] if ci else added
    added_hi = -ci[0] if ci else added
    if added_lo > hi:
        status = 'faster_than_typical'
    elif added_hi < lo:
        status = 'slower_than_typical'
    else:
        status = 'within_typical_range'
    text = {
        'faster_than_typical': 'faster than typical for this age',
        'slower_than_typical': 'slower than typical for this age',
        'within_typical_range': 'within the typical range for this age',
    }[status]
    return {
        'status': status,
        'added_myopia_d_per_year': round(added, 2),
        'typical_range_d_per_year': [lo, hi],
        'summary': f'About {added:.2f} D/year of added myopia — {text} ({typical["age_band"]} y: {lo:.2f}–{hi:.2f} D/year).',
    }


def _factor(fid, label, status, value, evidence, sources, modifiable=False):
    return {'id': fid, 'label': label, 'status': status, 'value': value,
            'evidence': evidence, 'sources': sources, 'modifiable': modifiable}


def build_risk_profile(
    subject: MyopiaSubject,
    entries: List[MyopiaPrescriptionEntry],
    lifestyle: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Evidence-linked risk-factor profile. Deliberately no composite score: the published
    evidence gives factor-level associations, not validated weights for adding them up.
    """
    age = subject.age_years()
    observed = observed_progression(entries)
    typical = typical_progression_for_age(age)
    comparison = compare_to_typical(observed, typical)

    factors: List[Dict[str, Any]] = []
    factors.append(_factor(
        'age', 'Current age',
        'unknown' if age is None else ('present' if age <= 11 else 'context'),
        age,
        'Younger myopic children progress faster; progression slows through the teens and most '
        'children stabilise in mid-to-late adolescence (COMET mean ≈ 15.6 years).',
        ['donovan2012', 'hyman2005', 'comet2013'],
    ))
    onset = subject.myopia_onset_age
    factors.append(_factor(
        'onset_age', 'Age at myopia onset',
        'unknown' if onset is None else ('present' if onset <= 8 else 'absent'),
        onset,
        'Earlier onset predicts a higher chance of reaching high myopia later in childhood.',
        ['chua2016'],
    ))
    parental = (subject.parental_myopia or 'unknown').lower()
    factors.append(_factor(
        'parental_myopia', 'Parental myopia',
        {'both_parents': 'present', 'one_parent': 'present', 'none': 'absent'}.get(parental, 'unknown'),
        parental,
        'Risk of developing myopia rises with the number of myopic parents.',
        ['mutti2002', 'jones2007'],
    ))
    outdoor = lifestyle.get('avg_outdoor_hours')
    target_out = subject.target_outdoor_hours or 2.0
    factors.append(_factor(
        'outdoor_time', 'Daily outdoor time',
        'unknown' if outdoor is None else ('protective' if outdoor >= target_out else 'present'),
        outdoor,
        'Extra outdoor time delays or prevents onset (e.g. +40 min/day at school: 3-year incidence '
        '30.4% vs 39.5%, He 2015). Meta-analysis found a clear effect on onset but little effect on '
        'progression once a child is already myopic (Xiong 2017).',
        ['he2015', 'xiong2017'], modifiable=True,
    ))
    screen = lifestyle.get('avg_screen_hours')
    target_screen = subject.target_screen_hours or 2.0
    factors.append(_factor(
        'near_work', 'Daily screen / near-work time',
        'unknown' if screen is None else ('present' if screen > target_screen else 'absent'),
        screen,
        'More near work is modestly associated with myopia (pooled OR ≈ 1.14, Huang 2015); '
        'smart-device screen time also shows an association (Foreman 2021). Associations, not proven causes.',
        ['huang2015', 'foreman2021'], modifiable=True,
    ))
    treatment = (subject.treatment or 'none').lower()
    factors.append(_factor(
        'treatment', 'Myopia-control treatment',
        'protective' if treatment in ('atropine', 'ortho_k', 'multifocal', 'dual_focus') else
        ('absent' if treatment == 'none' else 'context'),
        treatment,
        'Low-dose atropine, defocus spectacle lenses, dual-focus soft lenses and ortho-k slowed '
        'progression versus single-vision correction in randomised trials; the size of the effect varies by product and child.',
        ['yam2019', 'lam2020', 'chamberlain2019'],
    ))

    rate = observed.get('rate_d_per_year') if observed.get('status') == 'ok' else None
    used_sources = sorted({s for f in factors for s in f['sources']} | ({'donovan2012'} if typical else set()))
    return {
        'model': 'risk_factor_profile_v1',
        'composite_score': None,
        'composite_note': (
            'No single risk number is shown. Published studies report each factor separately; '
            'there are no validated weights for combining them into one score.'
        ),
        'factors': factors,
        'observed_progression': observed,
        'typical_for_age': typical,
        'comparison': comparison,
        'progression': classify_progression(rate),
        'recommendations': _recommendations(subject, lifestyle, rate),
        'sources': {k: SOURCES[k] for k in used_sources},
        'evidence_review_note': EVIDENCE_REVIEW_NOTE,
        'disclaimer': (
            'Educational only — not a diagnosis or a substitute for an eye exam. Home-entered prescriptions '
            'vary with how they were measured (cycloplegic vs not). Discuss progression and myopia-control '
            'options with an optometrist or ophthalmologist.'
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
    risk_profile = build_risk_profile(subject, entries, lifestyle)

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
        'risk_profile': risk_profile,
    }
