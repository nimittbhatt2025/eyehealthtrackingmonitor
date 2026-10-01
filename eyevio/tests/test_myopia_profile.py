"""Myopia risk-factor profile. Run: ./venv/bin/python -m pytest tests/test_myopia_profile.py"""

from datetime import date, timedelta
from types import SimpleNamespace

from app.services.myopia_progression import (
    build_risk_profile,
    compare_to_typical,
    observed_progression,
    typical_progression_for_age,
)


class Subject(SimpleNamespace):
    def age_years(self):
        return self.age


def entries(values, months_apart=6):
    start = date(2024, 1, 1)
    return [
        SimpleNamespace(measured_at=start + timedelta(days=int(30.44 * months_apart * i)), se_binocular=v)
        for i, v in enumerate(values)
    ]


def subject(**kw):
    base = dict(age=9, myopia_onset_age=7, parental_myopia='both_parents', treatment='none',
                target_outdoor_hours=2.0, target_screen_hours=2.0)
    return Subject(**{**base, **kw})


def test_short_interval_gives_no_rate():
    out = observed_progression(entries([-1.0, -1.25], months_apart=3))
    assert out['status'] == 'insufficient_span'


def test_theil_sen_used_with_three_entries():
    out = observed_progression(entries([-1.0, -1.5, -2.0, -2.5]))
    assert out['method'] == 'theil_sen'
    assert abs(out['rate_d_per_year'] + 1.0) < 0.02


def test_fast_progression_flagged_vs_age():
    obs = observed_progression(entries([-1.0, -1.6, -2.2, -2.8, -3.4]))
    cmp = compare_to_typical(obs, typical_progression_for_age(12))
    assert cmp['status'] == 'faster_than_typical'


def test_typical_progression_not_flagged():
    obs = observed_progression(entries([-1.0, -1.3, -1.6, -1.9]))
    assert compare_to_typical(obs, typical_progression_for_age(9))['status'] == 'within_typical_range'


def test_profile_has_no_composite_and_cites_sources():
    lifestyle = {'avg_outdoor_hours': 0.5, 'avg_screen_hours': 5}
    prof = build_risk_profile(subject(), entries([-1.0, -1.5, -2.0]), lifestyle)
    assert prof['composite_score'] is None
    ids = {f['id']: f for f in prof['factors']}
    assert ids['outdoor_time']['status'] == 'present' and ids['outdoor_time']['modifiable']
    assert ids['parental_myopia']['status'] == 'present'
    for f in prof['factors']:
        assert all(src in prof['sources'] for src in f['sources'])
