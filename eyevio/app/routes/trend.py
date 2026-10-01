from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import VisionTest, WebcamMetric, LensData, Alert
from app.services import trend_aggregates
from app.utils.trend_forecast import (
    MAX_HORIZON_DAYS,
    MIN_SESSIONS,
    MIN_SPAN_DAYS,
    build_per_test_trends,
)
from datetime import datetime, timedelta
from collections import defaultdict
import numpy as np

trend_bp = Blueprint('trend', __name__)

NO_COMPOSITE_NOTE = (
    'Each test is tracked in its own unit. Scores from different tests are not averaged '
    'into a single vision score because they measure different functions on different scales.'
)


@trend_bp.route('/', methods=['GET'])
@jwt_required()
def get_trend():
    """Per-test history in native units, plus daily activity counts."""
    try:
        user_id = int(get_jwt_identity())
        period = request.args.get('period', 'daily')
        days = request.args.get('days', type=int, default=30)
        cutoff_date = datetime.utcnow() - timedelta(days=days)

        vision_tests = VisionTest.usable().filter(
            VisionTest.user_id == user_id,
            VisionTest.created_at >= cutoff_date
        ).order_by(VisionTest.created_at).all()

        webcam_metrics = WebcamMetric.query.filter(
            WebcamMetric.user_id == user_id,
            WebcamMetric.created_at >= cutoff_date
        ).order_by(WebcamMetric.created_at).all()

        lens_data = LensData.query.filter(
            LensData.user_id == user_id,
            LensData.is_active == True
        ).first()

        tests_by_date = defaultdict(int)
        for test in vision_tests:
            tests_by_date[test.created_at.date().isoformat()] += 1
        fatigue_by_date = defaultdict(list)
        for metric in webcam_metrics:
            fatigue_by_date[metric.created_at.date().isoformat()].append(metric.fatigue_score)

        trend_data = []
        for date in sorted(set(tests_by_date) | set(fatigue_by_date)):
            point = {'date': date}
            if date in tests_by_date:
                point['vision_test_count'] = tests_by_date[date]
            if date in fatigue_by_date:
                point['avg_fatigue_score'] = float(np.mean(fatigue_by_date[date]))
                point['fatigue_metric_count'] = len(fatigue_by_date[date])
            trend_data.append(point)

        fatigue_scores = [m.fatigue_score for m in webcam_metrics]
        response = {
            'period': period,
            'days': days,
            'trend_data': trend_data,
            'by_test': build_per_test_trends(vision_tests, with_forecast=False),
            'note': NO_COMPOSITE_NOTE,
            'statistics': {
                'vision': {
                    'test_count': len(vision_tests),
                    'test_types': len({t.test_type for t in vision_tests}),
                },
                'fatigue': {
                    'average': float(np.mean(fatigue_scores)) if fatigue_scores else None,
                    'min': float(np.min(fatigue_scores)) if fatigue_scores else None,
                    'max': float(np.max(fatigue_scores)) if fatigue_scores else None,
                    'std_dev': float(np.std(fatigue_scores)) if fatigue_scores else None,
                    'metric_count': len(webcam_metrics)
                }
            }
        }

        if lens_data:
            response['lens_effectiveness'] = {
                'effectiveness_score': lens_data.effectiveness_score,
                'days_since_purchase': (datetime.utcnow().date() - lens_data.purchase_date).days
            }

        return jsonify(response), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@trend_bp.route('/prediction', methods=['GET'])
@jwt_required()
def get_prediction():
    """
    Per-test robust trend (Theil–Sen) with a prediction interval.
    No composite score and no prescription-change prediction.
    """
    try:
        user_id = int(get_jwt_identity())
        test_type = request.args.get('test_type')
        payload, source, computed_at = trend_aggregates.refresh(user_id)
        tests = payload['prediction']
        if test_type:
            tests = [t for t in tests if t['test_type'] == test_type]

        return jsonify({
            'method': 'theil_sen_robust_linear',
            'rules': {
                'min_sessions': MIN_SESSIONS,
                'min_span_days': MIN_SPAN_DAYS,
                'max_horizon_days': MAX_HORIZON_DAYS,
                'horizon': 'at most half the observed span',
                'interval': '95% prediction interval, robust (MAD) residual scale, never narrower than the test\'s retest SD',
                'verdict': 'worsening/improving only if the slope 95% CI excludes 0 and the projected change reaches the MCID',
            },
            'note': NO_COMPOSITE_NOTE,
            'tests': tests,
            'snapshot': trend_aggregates.snapshot_meta(source, computed_at),
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@trend_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_summary():
    """Health summary: per-test change status (no composite score)."""
    try:
        user_id = int(get_jwt_identity())
        days = request.args.get('days', type=int, default=7)

        cutoff_date = datetime.utcnow() - timedelta(days=days)

        from app.models import LifestyleLog

        payload, source, computed_at = trend_aggregates.refresh(user_id)
        change_status = payload['change_status']
        recent_test_count = VisionTest.usable().filter(
            VisionTest.user_id == user_id,
            VisionTest.created_at >= cutoff_date,
        ).count()

        webcam_metrics = WebcamMetric.query.filter(
            WebcamMetric.user_id == user_id,
            WebcamMetric.created_at >= cutoff_date
        ).all()

        lifestyle_logs = LifestyleLog.query.filter(
            LifestyleLog.user_id == user_id,
            LifestyleLog.log_date >= cutoff_date.date()
        ).all()

        lens_data = LensData.query.filter_by(user_id=user_id, is_active=True).first()

        summary = {
            'period_days': days,
            'vision_health': {},
            'fatigue_status': {},
            'lifestyle_summary': {},
            'lens_status': {},
            'recommendations': [],
            'note': NO_COMPOSITE_NOTE,
            'snapshot': trend_aggregates.snapshot_meta(source, computed_at),
        }

        counts = defaultdict(int)
        for c in change_status:
            counts[c['status']] += 1

        summary['vision_health'] = {
            'test_count': recent_test_count,
            'test_types_tracked': len(change_status),
            'change_status': change_status,
            'status_counts': dict(counts),
        }
        summary['active_alerts'] = Alert.query.filter_by(
            user_id=user_id, is_read=False, is_dismissed=False
        ).count()
        if counts.get('confirmed_decline'):
            summary['recommendations'].append(
                'A vision check has been reliably worse two sessions in a row. Consider booking an eye exam.'
            )
        elif counts.get('possible_decline'):
            summary['recommendations'].append(
                'One recent check was worse than your baseline. Retest on another day before drawing conclusions.'
            )

        if webcam_metrics:
            fatigue_scores = [m.fatigue_score for m in webcam_metrics]
            avg_fatigue = np.mean(fatigue_scores)
            summary['fatigue_status'] = {
                'average_score': float(avg_fatigue),
                'status': 'high' if avg_fatigue > 70 else 'moderate' if avg_fatigue > 40 else 'low',
                'metric_count': len(webcam_metrics)
            }
            if avg_fatigue > 60:
                summary['recommendations'].append("Your eye fatigue is elevated. Take more frequent breaks.")
        else:
            summary['fatigue_status'] = {
                'average_score': 0,
                'status': 'no_data',
                'metric_count': 0
            }

        if lifestyle_logs:
            screen_times = [log.screen_time_hours for log in lifestyle_logs if log.screen_time_hours]
            sleep_hours = [log.sleep_hours for log in lifestyle_logs if log.sleep_hours]

            if screen_times:
                avg_screen = np.mean(screen_times)
                summary['lifestyle_summary']['avg_screen_time_hours'] = float(avg_screen)
                if avg_screen > 8:
                    summary['recommendations'].append("Consider reducing screen time to below 8 hours per day.")

            if sleep_hours:
                avg_sleep = np.mean(sleep_hours)
                summary['lifestyle_summary']['avg_sleep_hours'] = float(avg_sleep)
                if avg_sleep < 7:
                    summary['recommendations'].append("Aim for at least 7-8 hours of sleep for better eye health.")

        if lens_data:
            summary['lens_status'] = {
                'lens_type': lens_data.lens_type,
                'effectiveness_score': lens_data.effectiveness_score,
                'days_since_purchase': (datetime.utcnow().date() - lens_data.purchase_date).days,
                'replacement_recommended': lens_data.replacement_recommended
            }

            if lens_data.replacement_recommended:
                summary['recommendations'].append("Your lenses may need replacement. Consult your eye care professional.")

        return jsonify(summary), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
