"""
Time-series prediction models for vision drift prediction

This module contains models for:
1. Vision score prediction using multiple time-series methods
2. Prescription change prediction
3. Lens effectiveness prediction
4. Health score calculation
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timedelta


def predict_vision_drift_advanced(
    test_dates: List[datetime],
    test_scores: List[float],
    days_ahead: int = 30,
    method: str = 'auto'
) -> Dict[str, Any]:
    """
    Advanced vision drift prediction using multiple methods
    
    Args:
        test_dates: List of test dates
        test_scores: List of corresponding vision scores
        days_ahead: Number of days to predict ahead
        method: Prediction method ('linear', 'polynomial', 'exponential', 'auto')
        
    Returns:
        Dictionary with predictions
    """
    if len(test_dates) < 3:
        return {'error': 'Need at least 3 data points for prediction'}
    
    try:
        # Convert to pandas for easier manipulation
        df = pd.DataFrame({
            'date': pd.to_datetime(test_dates),
            'score': test_scores
        }).sort_values('date')
        
        # Calculate days since first test
        df['days'] = (df['date'] - df['date'].iloc[0]).dt.days
        
        X = df['days'].values
        y = df['score'].values
        
        # Choose prediction method
        predictions = {}
        
        # Linear regression
        linear_coeffs = np.polyfit(X, y, deg=1)
        future_day = X[-1] + days_ahead
        linear_pred = np.polyval(linear_coeffs, future_day)
        predictions['linear'] = linear_pred
        
        # Polynomial regression (degree 2)
        if len(X) >= 4:
            poly_coeffs = np.polyfit(X, y, deg=2)
            poly_pred = np.polyval(poly_coeffs, future_day)
            predictions['polynomial'] = poly_pred
        
        # Exponential smoothing
        if len(y) >= 5:
            try:
                from statsmodels.tsa.holtwinters import SimpleExpSmoothing
                model = SimpleExpSmoothing(y)
                fitted = model.fit()
                exp_pred = fitted.forecast(1)[0]
                predictions['exponential'] = exp_pred
            except ImportError:
                pass
        
        # Auto: use average of available methods
        if method == 'auto':
            predicted_score = np.mean(list(predictions.values()))
            method_used = 'ensemble'
        else:
            predicted_score = predictions.get(method, linear_pred)
            method_used = method
        
        # Calculate confidence metrics
        linear_preds = np.polyval(linear_coeffs, X)
        ss_res = np.sum((y - linear_preds) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        
        # Calculate standard error
        mse = ss_res / len(y)
        std_error = np.sqrt(mse)
        
        # Predict confidence interval
        confidence_interval = {
            'lower': predicted_score - (1.96 * std_error),
            'upper': predicted_score + (1.96 * std_error)
        }
        
        # Trend analysis
        slope = linear_coeffs[0]
        if slope < -0.05:
            trend = 'declining'
            severity = 'significant' if slope < -0.1 else 'moderate'
        elif slope > 0.05:
            trend = 'improving'
            severity = 'significant' if slope > 0.1 else 'moderate'
        else:
            trend = 'stable'
            severity = 'minimal'
        
        # Anomaly detection
        deviations = np.abs(y - linear_preds)
        anomalies = deviations > (2 * np.std(deviations))
        
        return {
            'predicted_score': float(predicted_score),
            'current_score': float(y[-1]),
            'score_change': float(predicted_score - y[-1]),
            'confidence_interval': {
                'lower': float(confidence_interval['lower']),
                'upper': float(confidence_interval['upper'])
            },
            'trend': trend,
            'severity': severity,
            'slope': float(slope),
            'r_squared': float(r_squared),
            'std_error': float(std_error),
            'method_used': method_used,
            'days_predicted': days_ahead,
            'anomalies_detected': int(np.sum(anomalies)),
            'data_quality': 'good' if r_squared > 0.7 else 'fair' if r_squared > 0.4 else 'poor'
        }
        
    except Exception as e:
        return {'error': str(e)}


def predict_vision_drift(
    test_dates: List[datetime],
    test_scores: List[float],
    days_ahead: int = 30
) -> Dict[str, Any]:
    """
    Simple vision drift prediction (backward compatible)
    
    Args:
        test_dates: List of test dates
        test_scores: List of corresponding vision scores
        days_ahead: Number of days to predict ahead
        
    Returns:
        Dictionary with predictions
    """
    # Use advanced method under the hood
    return predict_vision_drift_advanced(test_dates, test_scores, days_ahead, method='auto')


def predict_prescription_change(
    current_prescription: Dict[str, float],
    vision_trend: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Predict if prescription change is needed based on vision trend
    
    Args:
        current_prescription: Current prescription values (sph, cyl, axis for each eye)
        vision_trend: Vision trend data
        
    Returns:
        Dictionary with prescription change predictions
    """
    if vision_trend.get('error'):
        return vision_trend
    
    change_needed = False
    recommended_change = {}
    
    # If vision is declining significantly, suggest prescription change
    if vision_trend.get('trend') == 'declining':
        score_change = abs(vision_trend.get('score_change', 0))
        
        if score_change > 5:  # 5% decline
            change_needed = True
            
            # Estimate prescription change (simplified)
            # In reality, this would use more sophisticated models
            change_magnitude = score_change / 20  # Rough estimate: 0.25D per 5% decline
            
            recommended_change = {
                'od_sph': current_prescription.get('od_sph', 0) + change_magnitude,
                'os_sph': current_prescription.get('os_sph', 0) + change_magnitude,
                'change_magnitude': change_magnitude
            }
    
    return {
        'change_needed': change_needed,
        'recommended_change': recommended_change,
        'confidence': vision_trend.get('confidence', 0),
        'reason': 'Vision score declining' if change_needed else 'Vision stable'
    }


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


def generate_health_score(
    vision_score: float,
    fatigue_score: float,
    lens_effectiveness: float,
    lifestyle_factors: Dict[str, float]
) -> Dict[str, Any]:
    """
    Generate an overall eye health score
    
    Args:
        vision_score: Current vision score (0-100)
        fatigue_score: Current fatigue score (0-100, higher is worse)
        lens_effectiveness: Lens effectiveness (0-100)
        lifestyle_factors: Dict with screen_time, sleep, etc.
        
    Returns:
        Dictionary with overall health score and breakdown
    """
    # Weight factors
    weights = {
        'vision': 0.35,
        'fatigue': 0.25,
        'lens': 0.20,
        'lifestyle': 0.20
    }
    
    # Calculate component scores
    vision_component = vision_score * weights['vision']
    fatigue_component = (100 - fatigue_score) * weights['fatigue']  # Invert fatigue
    lens_component = lens_effectiveness * weights['lens']
    
    # Lifestyle score
    lifestyle_score = 100
    if lifestyle_factors.get('screen_time', 0) > 8:
        lifestyle_score -= 20
    if lifestyle_factors.get('sleep_hours', 8) < 7:
        lifestyle_score -= 20
    if lifestyle_factors.get('breaks_taken', 5) < 3:
        lifestyle_score -= 15
    
    lifestyle_component = lifestyle_score * weights['lifestyle']
    
    # Total score
    total_score = vision_component + fatigue_component + lens_component + lifestyle_component
    
    # Determine grade
    if total_score >= 90:
        grade = 'Excellent'
    elif total_score >= 80:
        grade = 'Good'
    elif total_score >= 70:
        grade = 'Fair'
    elif total_score >= 60:
        grade = 'Poor'
    else:
        grade = 'Critical'
    
    return {
        'total_score': round(total_score, 1),
        'grade': grade,
        'breakdown': {
            'vision': round(vision_component, 1),
            'fatigue': round(fatigue_component, 1),
            'lens': round(lens_component, 1),
            'lifestyle': round(lifestyle_component, 1)
        },
        'components': {
            'vision_score': vision_score,
            'fatigue_score': fatigue_score,
            'lens_effectiveness': lens_effectiveness,
            'lifestyle_score': lifestyle_score
        }
    }
