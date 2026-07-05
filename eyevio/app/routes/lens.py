from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models import db, LensData, VisionTest, Alert
from app.utils.analytics import calculate_lens_effectiveness
from datetime import datetime, timedelta

lens_bp = Blueprint('lens', __name__)


@lens_bp.route('/data', methods=['POST'])
@jwt_required()
def submit_lens_data():
    """Submit lens information"""
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()
        
        # Validate required fields
        if not data.get('lens_type') or not data.get('purchase_date'):
            return jsonify({'error': 'lens_type and purchase_date are required'}), 400
        
        # Deactivate previous lenses
        LensData.query.filter_by(user_id=user_id, is_active=True).update({'is_active': False})
        
        # Create new lens data record
        lens_data = LensData(
            user_id=user_id,
            lens_type=data['lens_type'],
            lens_brand=data.get('lens_brand'),
            purchase_date=datetime.fromisoformat(data['purchase_date']),
            prescription_od_sph=data.get('prescription_od_sph'),
            prescription_od_cyl=data.get('prescription_od_cyl'),
            prescription_od_axis=data.get('prescription_od_axis'),
            prescription_os_sph=data.get('prescription_os_sph'),
            prescription_os_cyl=data.get('prescription_os_cyl'),
            prescription_os_axis=data.get('prescription_os_axis'),
            baseline_vision_score=data.get('baseline_vision_score'),
            notes=data.get('notes'),
            is_active=True
        )
        
        db.session.add(lens_data)
        db.session.commit()
        
        return jsonify({
            'message': 'Lens data submitted successfully',
            'lens_id': lens_data.id,
            'created_at': lens_data.created_at.isoformat()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@lens_bp.route('/effectiveness', methods=['GET'])
@jwt_required()
def get_lens_effectiveness():
    """Get effectiveness of current lenses"""
    try:
        user_id = int(get_jwt_identity())
        
        # Get active lenses
        lens_data = LensData.query.filter_by(user_id=user_id, is_active=True).first()
        
        if not lens_data:
            return jsonify({'error': 'No active lenses found'}), 404
        
        # Get recent vision tests since lens purchase
        recent_tests = VisionTest.query.filter(
            VisionTest.user_id == user_id,
            VisionTest.created_at >= lens_data.purchase_date
        ).order_by(VisionTest.created_at).all()
        
        if not recent_tests:
            return jsonify({'error': 'No vision tests found since lens purchase'}), 404
        
        # Calculate effectiveness
        effectiveness = calculate_lens_effectiveness(lens_data, recent_tests)
        
        # Update lens data
        lens_data.effectiveness_score = effectiveness
        lens_data.current_vision_score = recent_tests[-1].score if recent_tests else None
        
        # Calculate decline rate (per month)
        if lens_data.baseline_vision_score and recent_tests:
            days_since_purchase = (datetime.utcnow().date() - lens_data.purchase_date).days
            if days_since_purchase > 0:
                months = days_since_purchase / 30
                decline = lens_data.baseline_vision_score - lens_data.current_vision_score
                lens_data.effectiveness_decline_rate = (decline / months) if months > 0 else 0
        
        # Check if replacement is needed
        if effectiveness < 80:  # Less than 80% effectiveness
            lens_data.replacement_recommended = True
            
            # Create alert if not already alerted
            existing_alert = Alert.query.filter_by(
                user_id=user_id,
                alert_type='lens_replacement',
                is_dismissed=False
            ).first()
            
            if not existing_alert:
                alert = Alert(
                    user_id=user_id,
                    alert_type='lens_replacement',
                    severity='medium',
                    title='Lens Replacement Recommended',
                    message=f'Your lens effectiveness is {effectiveness:.1f}%. Consider replacing your lenses.',
                    alert_data={'effectiveness': effectiveness, 'lens_id': lens_data.id}
                )
                db.session.add(alert)
        
        db.session.commit()
        
        return jsonify({
            'lens_id': lens_data.id,
            'lens_type': lens_data.lens_type,
            'lens_brand': lens_data.lens_brand,
            'purchase_date': lens_data.purchase_date.isoformat(),
            'effectiveness_score': effectiveness,
            'baseline_vision_score': lens_data.baseline_vision_score,
            'current_vision_score': lens_data.current_vision_score,
            'effectiveness_decline_rate': lens_data.effectiveness_decline_rate,
            'replacement_recommended': lens_data.replacement_recommended,
            'days_since_purchase': (datetime.utcnow().date() - lens_data.purchase_date).days
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@lens_bp.route('/history', methods=['GET'])
@jwt_required()
def get_lens_history():
    """Get lens history"""
    try:
        user_id = int(get_jwt_identity())
        
        lenses = LensData.query.filter_by(user_id=user_id).order_by(LensData.purchase_date.desc()).all()
        
        return jsonify({
            'total': len(lenses),
            'lenses': [{
                'id': lens.id,
                'lens_type': lens.lens_type,
                'lens_brand': lens.lens_brand,
                'purchase_date': lens.purchase_date.isoformat(),
                'effectiveness_score': lens.effectiveness_score,
                'replacement_recommended': lens.replacement_recommended,
                'is_active': lens.is_active,
                'replaced_date': lens.replaced_date.isoformat() if lens.replaced_date else None
            } for lens in lenses]
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
