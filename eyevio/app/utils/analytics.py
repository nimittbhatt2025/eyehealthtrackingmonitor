from datetime import datetime, timedelta
from typing import List, Dict, Any
import numpy as np
from app.models import VisionTest, WebcamMetric, LensData, LifestyleLog


def calculate_vision_trend(tests: List[VisionTest], period_days: int = 30) -> Dict[str, Any]:
    """Calculate vision trend statistics over a period"""
    if not tests:
        return {}
    
    cutoff_date = datetime.utcnow() - timedelta(days=period_days)
    recent_tests = [t for t in tests if t.created_at >= cutoff_date]
    
    if not recent_tests:
        return {}
    
    scores = [t.score for t in recent_tests]
    
    return {
        'average_score': np.mean(scores),
        'min_score': np.min(scores),
        'max_score': np.max(scores),
        'std_dev': np.std(scores),
        'test_count': len(recent_tests),
        'trend': 'improving' if len(scores) > 1 and scores[-1] > scores[0] else 'declining'
    }


def calculate_fatigue_score(webcam_metric: WebcamMetric) -> float:
    """
    Calculate fatigue score based on webcam metrics
    Returns: float between 0-100 (higher = more fatigued)
    """
    score = 0.0
    
    # Blink rate (normal: 15-20 blinks per minute)
    if webcam_metric.blink_rate:
        if webcam_metric.blink_rate < 10:
            score += 20
        elif webcam_metric.blink_rate < 15:
            score += 10
        elif webcam_metric.blink_rate > 30:
            score += 15
    
    # Incomplete blinks
    if webcam_metric.incomplete_blinks:
        score += min(webcam_metric.incomplete_blinks * 2, 20)
    
    # Squinting
    if webcam_metric.squint_count:
        score += min(webcam_metric.squint_count * 3, 25)
    
    # Redness
    if webcam_metric.sclera_redness_level:
        score += webcam_metric.sclera_redness_level * 0.25
    
    # Tear film quality (lower is worse)
    if webcam_metric.tear_film_quality:
        score += (100 - webcam_metric.tear_film_quality) * 0.15
    
    return min(score, 100)


def calculate_lens_effectiveness(lens_data: LensData, recent_vision_tests: List[VisionTest]) -> float:
    """
    Calculate lens effectiveness based on vision test performance
    Returns: float between 0-100 (higher = more effective)
    """
    if not recent_vision_tests or not lens_data.baseline_vision_score:
        return 0.0
    
    recent_scores = [t.score for t in recent_vision_tests[-5:]]  # Last 5 tests
    current_avg = np.mean(recent_scores)
    
    # Calculate effectiveness as percentage of baseline
    effectiveness = (current_avg / lens_data.baseline_vision_score) * 100
    
    return min(effectiveness, 100)


def detect_vision_decline(tests: List[VisionTest], test_type: str = None, method_version: Any = None) -> Dict[str, Any]:
    """
    Reliable-change decline check (see app.utils.change_detection).
    `declined` is True only for a decline confirmed on two consecutive sessions.
    """
    from app.utils.change_detection import assess_tests, summary_message

    if test_type is None and tests:
        test_type = getattr(tests[0], 'test_type', None)
    assessment = assess_tests(tests, test_type, method_version)
    flagged = [s for s in assessment['series'] if s['status'] == assessment['status']]
    lead = flagged[0] if flagged else {}
    return {
        'declined': assessment['status'] == 'confirmed_decline',
        'status': assessment['status'],
        'message': summary_message(assessment),
        'baseline_score': lead.get('baseline_mean'),
        'current_score': lead.get('latest'),
        'tests_analyzed': len(tests),
        'assessment': assessment,
    }


def correlate_lifestyle_with_vision(
    lifestyle_logs: List[LifestyleLog],
    vision_tests: List[VisionTest],
    fatigue_metrics: List[WebcamMetric]
) -> Dict[str, Any]:
    """
    Correlate lifestyle factors with vision and fatigue
    Returns: Dict with correlation insights
    """
    correlations = {}
    
    if not lifestyle_logs:
        return correlations
    
    # Extract lifestyle data
    screen_times = [log.screen_time_hours for log in lifestyle_logs if log.screen_time_hours]
    sleep_hours = [log.sleep_hours for log in lifestyle_logs if log.sleep_hours]
    
    # Extract vision and fatigue data (matching dates)
    vision_scores = []
    fatigue_scores = []
    
    for log in lifestyle_logs:
        # Find vision tests on same date
        matching_tests = [t for t in vision_tests if t.created_at.date() == log.log_date]
        if matching_tests:
            vision_scores.append(np.mean([t.score for t in matching_tests]))
        
        # Find fatigue metrics on same date
        matching_fatigue = [m for m in fatigue_metrics if m.created_at.date() == log.log_date]
        if matching_fatigue:
            fatigue_scores.append(np.mean([m.fatigue_score for m in matching_fatigue]))
    
    # Calculate correlations
    if screen_times and fatigue_scores and len(screen_times) == len(fatigue_scores):
        correlations['screen_time_fatigue_correlation'] = np.corrcoef(screen_times, fatigue_scores)[0, 1]
    
    if sleep_hours and fatigue_scores and len(sleep_hours) == len(fatigue_scores):
        correlations['sleep_fatigue_correlation'] = np.corrcoef(sleep_hours, fatigue_scores)[0, 1]
    
    # Generate insights
    insights = []
    
    if screen_times and np.mean(screen_times) > 8:
        insights.append("High screen time detected. Consider taking more breaks.")
    
    if sleep_hours and np.mean(sleep_hours) < 7:
        insights.append("Low sleep hours may be affecting your vision health.")
    
    if correlations.get('screen_time_fatigue_correlation', 0) > 0.5:
        insights.append("Screen time is strongly correlated with eye fatigue.")
    
    correlations['insights'] = insights
    correlations['avg_screen_time'] = np.mean(screen_times) if screen_times else 0
    correlations['avg_sleep_hours'] = np.mean(sleep_hours) if sleep_hours else 0
    
    return correlations
