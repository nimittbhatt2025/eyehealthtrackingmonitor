"""
Time-series helpers for vision drift and lens replacement.

Vision drift uses a robust Theil–Sen line with a prediction interval, a minimum
number of sessions, and a forecast horizon capped at half the observed span
(see app.utils.trend_forecast). Polynomial / exponential extrapolation, the
prescription-change estimate and the weighted "health score" composite were
removed: extrapolating curves from a handful of noisy points produced confident
but unfounded predictions.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple

import numpy as np

from app.utils.change_detection import DEFAULT_METRIC, MetricSpec
from app.utils.trend_forecast import forecast_series


def predict_vision_drift_advanced(
    test_dates: List[datetime],
    test_scores: List[float],
    days_ahead: int = 30,
    method: str = 'theil_sen',
    spec: MetricSpec = DEFAULT_METRIC,
) -> Dict[str, Any]:
    """
    Robust drift estimate for one test series in a single unit.

    `days_ahead` is honoured only up to the capped horizon; the response always
    carries a prediction interval rather than a single number.
    """
    if not test_dates or len(test_dates) != len(test_scores):
        return {'error': 'test_dates and test_scores must be the same non-zero length'}
    order = sorted(range(len(test_dates)), key=lambda i: test_dates[i])
    t0 = test_dates[order[0]]
    days = [(test_dates[i] - t0).total_seconds() / 86400.0 for i in order]
    values = [float(test_scores[i]) for i in order]

    fc = forecast_series(days, values, spec)
    if fc['status'] != 'ok':
        return {'error': 'insufficient_data', **fc}

    horizon = min(int(days_ahead), fc['horizon_days'])
    point = min(fc['forecast'], key=lambda p: abs(p['days_ahead'] - horizon))
    return {
        'method_used': 'theil_sen',
        'current_score': values[-1],
        'days_predicted': point['days_ahead'],
        'requested_days': days_ahead,
        'horizon_cap_days': fc['horizon_days'],
        'predicted_score': point['fit'],
        'prediction_interval_95': {'lower': point['lower'], 'upper': point['upper']},
        'slope_per_30d': fc['slope_per_30d'],
        'slope_per_30d_ci95': fc['slope_per_30d_ci95'],
        'trend': fc['verdict'],
        'n_sessions': fc['n_sessions'],
        'span_days': fc['span_days'],
    }


def predict_vision_drift(
    test_dates: List[datetime],
    test_scores: List[float],
    days_ahead: int = 30
) -> Dict[str, Any]:
    return predict_vision_drift_advanced(test_dates, test_scores, days_ahead)


def predict_lens_replacement_date(
    purchase_date: datetime,
    effectiveness_history: List[Tuple[datetime, float]],
    threshold: float = 80.0
) -> Dict[str, Any]:
    """
    Predict when lenses should be replaced
    
    Args:
        purchase_date: Date when lenses were purchased
        effectiveness_history: List of (date, effectiveness_score) tuples
        threshold: Effectiveness threshold below which replacement is recommended
        
    Returns:
        Dictionary with replacement prediction
    """
    if len(effectiveness_history) < 2:
        return {'error': 'Need at least 2 effectiveness measurements'}
    
    try:
        # Extract data
        dates = [d for d, _ in effectiveness_history]
        effectiveness = [e for _, e in effectiveness_history]
        
        # Calculate days since purchase
        days = [(d - purchase_date).days for d in dates]
        
        # Fit decline curve
        coeffs = np.polyfit(days, effectiveness, deg=1)
        
        # Find when effectiveness crosses threshold
        if coeffs[0] >= 0:  # Not declining
            return {
                'replacement_needed': False,
                'predicted_date': None,
                'message': 'Lens effectiveness is stable or improving'
            }
        
        # Calculate days until threshold
        days_until_threshold = (threshold - coeffs[1]) / coeffs[0]
        
        if days_until_threshold <= 0:  # Already below threshold
            return {
                'replacement_needed': True,
                'predicted_date': datetime.now().date(),
                'current_effectiveness': float(effectiveness[-1]),
                'message': 'Replacement recommended now'
            }
        
        predicted_date = purchase_date + timedelta(days=int(days_until_threshold))
        
        return {
            'replacement_needed': days_until_threshold < 30,  # Within 30 days
            'predicted_date': predicted_date.date(),
            'days_remaining': int(days_until_threshold),
            'current_effectiveness': float(effectiveness[-1]),
            'decline_rate': float(-coeffs[0])  # Negative coefficient = decline
        }
        
    except Exception as e:
        return {'error': str(e)}
