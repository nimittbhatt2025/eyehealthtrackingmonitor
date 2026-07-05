from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, VisionTest, WebcamMetric, LensData, VisionTrend
from datetime import datetime, timedelta
import numpy as np

trend_bp = Blueprint('trend', __name__)


@trend_bp.route('/', methods=['GET'])
@jwt_required()
def get_trend():
    """Get comprehensive trend data"""
    try:
        user_id = int(get_jwt_identity())
        
        # Query parameters
        period = request.args.get('period', 'weekly')  # daily, weekly, monthly
        days = request.args.get('days', type=int, default=30)
        
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Get all relevant data
        vision_tests = VisionTest.query.filter(
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
        
        # Prepare trend data
        from collections import defaultdict
        
        # Group vision tests by date
        vision_by_date = defaultdict(list)
        for test in vision_tests:
            date_key = test.created_at.date().isoformat()
            vision_by_date[date_key].append(test.score)
        
        # Group fatigue by date
        fatigue_by_date = defaultdict(list)
        for metric in webcam_metrics:
            date_key = metric.created_at.date().isoformat()
            fatigue_by_date[date_key].append(metric.fatigue_score)
        
        # Build trend response
        trend_data = []
        all_dates = sorted(set(list(vision_by_date.keys()) + list(fatigue_by_date.keys())))
        
        for date in all_dates:
            trend_point = {'date': date}
            
            if date in vision_by_date:
                scores = vision_by_date[date]
                trend_point['avg_score'] = float(np.mean(scores))  # Changed from avg_vision_score
                trend_point['vision_test_count'] = len(scores)
            
            if date in fatigue_by_date:
                fatigue = fatigue_by_date[date]
                trend_point['avg_fatigue_score'] = float(np.mean(fatigue))
                trend_point['fatigue_metric_count'] = len(fatigue)
            
            trend_data.append(trend_point)
        
        print(f' Trend data for user {user_id}: {len(trend_data)} points')
        if trend_data:
            print(f'   Sample: {trend_data[0]}')
        
        # Calculate overall statistics
        all_vision_scores = [t.score for t in vision_tests]
        all_fatigue_scores = [m.fatigue_score for m in webcam_metrics]
        
        response = {
            'period': period,
            'days': days,
            'trend_data': trend_data,
            'statistics': {
                'vision': {
                    'avg_score': float(np.mean(all_vision_scores)) if all_vision_scores else None,  # Changed from 'average'
                    'min': float(np.min(all_vision_scores)) if all_vision_scores else None,
                    'max': float(np.max(all_vision_scores)) if all_vision_scores else None,
                    'std_dev': float(np.std(all_vision_scores)) if all_vision_scores else None,
                    'test_count': len(vision_tests)
                },
                'fatigue': {
                    'average': float(np.mean(all_fatigue_scores)) if all_fatigue_scores else None,
                    'min': float(np.min(all_fatigue_scores)) if all_fatigue_scores else None,
                    'max': float(np.max(all_fatigue_scores)) if all_fatigue_scores else None,
                    'std_dev': float(np.std(all_fatigue_scores)) if all_fatigue_scores else None,
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
    """Get vision drift predictions"""
    try:
        user_id = int(get_jwt_identity())
        
        # Get historical vision tests
        vision_tests = VisionTest.query.filter_by(user_id=user_id).order_by(VisionTest.created_at).all()
        
        print(f" Prediction request for user {user_id}")
        print(f"   Found {len(vision_tests)} vision tests")
        
        if len(vision_tests) < 10:
            print(f"    Not enough data: {len(vision_tests)}/10 tests")
            return jsonify({'error': 'Not enough data for prediction. Need at least 10 vision tests.'}), 400
        
        # Extract time series data
        dates = [(t.created_at - vision_tests[0].created_at).days for t in vision_tests]
        scores = [t.score for t in vision_tests]
        
        # Check if data spans enough time for meaningful prediction
        date_range = max(dates) - min(dates)
        if date_range < 7:
            print(f"    Data spans only {date_range} days - need at least 7 days for reliable predictions")
            return jsonify({
                'error': 'Not enough time range for prediction. Tests must span at least 7 days for meaningful trend analysis.',
                'current_range_days': date_range,
                'required_range_days': 7
            }), 400
        
        print(f"    Data range: {date_range} days, {len(dates)} tests, scores: {scores[:5]}... (showing first 5)")
        
        # Simple linear regression for prediction
        from sklearn.linear_model import LinearRegression
        
        X = np.array(dates).reshape(-1, 1)
        y = np.array(scores)
        
        model = LinearRegression()
        model.fit(X, y)
        
        # Predict for next 30, 60, 90 days
        last_day = dates[-1]
        future_days = [last_day + 30, last_day + 60, last_day + 90]
        predictions = model.predict(np.array(future_days).reshape(-1, 1))
        
        # Constrain predictions to valid range (0-100)
        predictions = np.clip(predictions, 0, 100)
        
        # Calculate confidence (R-squared)
        confidence = model.score(X, y)
        
        # Determine if prescription change is needed
        current_score = scores[-1]
        predicted_30d = predictions[0]
        
        prescription_change_needed = bool((current_score - predicted_30d) > 5)  # Convert to Python bool
        
        print(f"    Prediction successful. Current: {current_score}, 30d: {predicted_30d:.1f}, Confidence: {confidence:.2f}")
        
        return jsonify({
            'current_vision_score': float(current_score),
            'predictions': {
                '30_days': {
                    'score': float(predictions[0]),
                    'change': float(predictions[0] - current_score)
                },
                '60_days': {
                    'score': float(predictions[1]),
                    'change': float(predictions[1] - current_score)
                },
                '90_days': {
                    'score': float(predictions[2]),
                    'change': float(predictions[2] - current_score)
                }
            },
            'confidence_score': float(confidence),
            'prescription_change_recommended': prescription_change_needed,
            'data_points_used': len(vision_tests),
            'trend': 'declining' if float(model.coef_[0]) < 0 else 'improving'
        }), 200
        
    except Exception as e:
        print(f"    Prediction error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@trend_bp.route('/summary', methods=['GET'])
@jwt_required()
def get_summary():
    """Get comprehensive health summary"""
    try:
        user_id = int(get_jwt_identity())
        days = request.args.get('days', type=int, default=7)
        
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        from app.models import LifestyleLog
        
        # Get recent data
        vision_tests = VisionTest.query.filter(
            VisionTest.user_id == user_id,
            VisionTest.created_at >= cutoff_date
        ).all()
        
        webcam_metrics = WebcamMetric.query.filter(
            WebcamMetric.user_id == user_id,
            WebcamMetric.created_at >= cutoff_date
        ).all()
        
        lifestyle_logs = LifestyleLog.query.filter(
            LifestyleLog.user_id == user_id,
            LifestyleLog.log_date >= cutoff_date.date()
        ).all()
        
        lens_data = LensData.query.filter_by(user_id=user_id, is_active=True).first()
        
        # Calculate summaries
        summary = {
            'period_days': days,
            'vision_health': {},
            'fatigue_status': {},
            'lifestyle_summary': {},
            'lens_status': {},
            'recommendations': []
        }
        
        # Vision health
        if vision_tests:
            scores = [t.score for t in vision_tests]
            summary['vision_health'] = {
                'average_score': float(np.mean(scores)),
                'latest_score': scores[-1],
                'trend': 'improving' if len(scores) > 1 and scores[-1] > scores[0] else 'declining',
                'test_count': len(vision_tests)
            }
        else:
            summary['vision_health'] = {
                'average_score': 0,
                'latest_score': None,
                'trend': 'no_data',
                'test_count': 0
            }
        
        # Fatigue status
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
        
        # Lifestyle summary
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
        
        # Lens status
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
