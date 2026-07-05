from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import User, VisionTest, WebcamMetric, LensData, LifestyleLog
from datetime import datetime, timedelta
import io
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.units import inch
import numpy as np

report_bp = Blueprint('report', __name__)


@report_bp.route('/', methods=['GET'])
@jwt_required()
def generate_report():
    """Generate a comprehensive PDF report"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Query parameters
        days = request.args.get('days', type=int, default=30)
        format_type = request.args.get('format', default='pdf')  # pdf or json
        
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Gather data
        vision_tests = VisionTest.query.filter(
            VisionTest.user_id == user_id,
            VisionTest.created_at >= cutoff_date
        ).order_by(VisionTest.created_at).all()
        
        webcam_metrics = WebcamMetric.query.filter(
            WebcamMetric.user_id == user_id,
            WebcamMetric.created_at >= cutoff_date
        ).order_by(WebcamMetric.created_at).all()
        
        lifestyle_logs = LifestyleLog.query.filter(
            LifestyleLog.user_id == user_id,
            LifestyleLog.log_date >= cutoff_date.date()
        ).order_by(LifestyleLog.log_date).all()
        
        lens_data = LensData.query.filter_by(user_id=user_id, is_active=True).first()
        
        # Calculate statistics
        report_data = {
            'user': {
                'name': user.full_name or user.email,
                'email': user.email,
                'age': user.age,
                'lens_type': user.lens_type
            },
            'report_period': {
                'start_date': cutoff_date.date().isoformat(),
                'end_date': datetime.utcnow().date().isoformat(),
                'days': days
            },
            'vision_summary': {},
            'fatigue_summary': {},
            'lifestyle_summary': {},
            'lens_summary': {},
            'recommendations': []
        }
        
        # Vision summary
        if vision_tests:
            scores = [t.score for t in vision_tests]
            report_data['vision_summary'] = {
                'total_tests': len(vision_tests),
                'average_score': float(np.mean(scores)),
                'min_score': float(np.min(scores)),
                'max_score': float(np.max(scores)),
                'latest_score': scores[-1],
                'trend': 'improving' if len(scores) > 1 and scores[-1] > scores[0] else 'stable' if scores[-1] == scores[0] else 'declining'
            }
            
            # Recommendations based on vision
            if scores[-1] < np.mean(scores[:5]) * 0.9:
                report_data['recommendations'].append("Vision has declined by more than 10%. Schedule an eye exam.")
        
        # Fatigue summary
        if webcam_metrics:
            fatigue_scores = [m.fatigue_score for m in webcam_metrics]
            blink_rates = [m.blink_rate for m in webcam_metrics if m.blink_rate]
            
            report_data['fatigue_summary'] = {
                'total_metrics': len(webcam_metrics),
                'average_fatigue': float(np.mean(fatigue_scores)),
                'max_fatigue': float(np.max(fatigue_scores)),
                'average_blink_rate': float(np.mean(blink_rates)) if blink_rates else None
            }
            
            if np.mean(fatigue_scores) > 60:
                report_data['recommendations'].append("Average eye fatigue is high. Implement the 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds.")
        
        # Lifestyle summary
        if lifestyle_logs:
            screen_times = [log.screen_time_hours for log in lifestyle_logs if log.screen_time_hours]
            sleep_hours = [log.sleep_hours for log in lifestyle_logs if log.sleep_hours]
            
            report_data['lifestyle_summary'] = {
                'avg_screen_time': float(np.mean(screen_times)) if screen_times else None,
                'avg_sleep_hours': float(np.mean(sleep_hours)) if sleep_hours else None,
                'days_logged': len(lifestyle_logs)
            }
            
            if screen_times and np.mean(screen_times) > 8:
                report_data['recommendations'].append("Screen time exceeds 8 hours/day. Consider using blue light filters and taking regular breaks.")
            
            if sleep_hours and np.mean(sleep_hours) < 7:
                report_data['recommendations'].append("Sleep duration is below recommended 7-8 hours. Adequate sleep is crucial for eye health.")
        
        # Lens summary
        if lens_data:
            days_since_purchase = (datetime.utcnow().date() - lens_data.purchase_date).days
            report_data['lens_summary'] = {
                'lens_type': lens_data.lens_type,
                'lens_brand': lens_data.lens_brand,
                'days_since_purchase': days_since_purchase,
                'effectiveness_score': lens_data.effectiveness_score,
                'replacement_recommended': lens_data.replacement_recommended
            }
            
            if lens_data.replacement_recommended:
                report_data['recommendations'].append("Lens effectiveness has declined. Consider getting new lenses.")
        
        # Return JSON format if requested
        if format_type == 'json':
            return jsonify(report_data), 200
        
        # Generate PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title = Paragraph(f"<b>EyeVio Vision Health Report</b>", styles['Title'])
        elements.append(title)
        elements.append(Spacer(1, 0.3*inch))
        
        # User info
        user_info = Paragraph(f"<b>Patient:</b> {report_data['user']['name']}<br/>"
                             f"<b>Report Period:</b> {report_data['report_period']['start_date']} to {report_data['report_period']['end_date']} ({days} days)", 
                             styles['Normal'])
        elements.append(user_info)
        elements.append(Spacer(1, 0.3*inch))
        
        # Vision Summary
        if report_data['vision_summary']:
            elements.append(Paragraph("<b>Vision Summary</b>", styles['Heading2']))
            vision_data = [
                ['Metric', 'Value'],
                ['Total Tests', str(report_data['vision_summary']['total_tests'])],
                ['Average Score', f"{report_data['vision_summary']['average_score']:.2f}"],
                ['Latest Score', f"{report_data['vision_summary']['latest_score']:.2f}"],
                ['Trend', report_data['vision_summary']['trend'].capitalize()]
            ]
            vision_table = Table(vision_data, colWidths=[3*inch, 2*inch])
            vision_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(vision_table)
            elements.append(Spacer(1, 0.3*inch))
        
        # Fatigue Summary
        if report_data['fatigue_summary']:
            elements.append(Paragraph("<b>Eye Fatigue Summary</b>", styles['Heading2']))
            fatigue_data = [
                ['Metric', 'Value'],
                ['Total Measurements', str(report_data['fatigue_summary']['total_metrics'])],
                ['Average Fatigue', f"{report_data['fatigue_summary']['average_fatigue']:.2f}"],
                ['Max Fatigue', f"{report_data['fatigue_summary']['max_fatigue']:.2f}"]
            ]
            if report_data['fatigue_summary']['average_blink_rate']:
                fatigue_data.append(['Avg Blink Rate', f"{report_data['fatigue_summary']['average_blink_rate']:.2f} blinks/min"])
            
            fatigue_table = Table(fatigue_data, colWidths=[3*inch, 2*inch])
            fatigue_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(fatigue_table)
            elements.append(Spacer(1, 0.3*inch))
        
        # Recommendations
        if report_data['recommendations']:
            elements.append(Paragraph("<b>Recommendations</b>", styles['Heading2']))
            for i, rec in enumerate(report_data['recommendations'], 1):
                elements.append(Paragraph(f"{i}. {rec}", styles['Normal']))
                elements.append(Spacer(1, 0.1*inch))
        
        # Build PDF
        doc.build(elements)
        buffer.seek(0)
        
        return send_file(
            buffer,
            as_attachment=True,
            download_name=f'eyevio_report_{datetime.utcnow().strftime("%Y%m%d")}.pdf',
            mimetype='application/pdf'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
