from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, create_refresh_token, jwt_required, get_jwt_identity
from app.models import db, User
from app.utils.auth import hash_password, verify_password
from datetime import datetime

auth_bp = Blueprint('auth', __name__)


def _optional_float(value):
    """Coerce profile numeric fields; empty strings must become NULL for Postgres."""
    if value is None or value == '':
        return None
    return float(value)


def _optional_int(value):
    if value is None or value == '':
        return None
    return int(value)


def _optional_date(value):
    if value is None or value == '':
        return None
    if isinstance(value, str):
        return datetime.fromisoformat(value).date()
    return value


@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.get_json()
        
        # Validate required fields
        email = data.get('email', '').strip().lower()
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Check if user already exists
        if User.query.filter_by(email=email).first():
            return jsonify({'error': 'Email already registered'}), 409
        
        # Create new user
        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=data.get('full_name'),
            age=data.get('age'),
            gender=data.get('gender'),
            lens_type=data.get('lens_type', 'none'),
            avg_screen_time_hours=data.get('avg_screen_time_hours', 0),
            avg_sleep_hours=data.get('avg_sleep_hours', 8),
            lighting_condition=data.get('lighting_condition', 'mixed'),
            activity_level=data.get('activity_level', 'moderate'),
            data_storage_preference=data.get('data_storage_preference', 'cloud')
        )
        
        db.session.add(user)
        db.session.commit()
        
        # Create tokens (convert user ID to string for JWT compatibility)
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))
        
        return jsonify({
            'message': 'Registration successful',
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': user.id,
                'email': user.email,
                'full_name': user.full_name
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """Authenticate user and return tokens"""
    try:
        data = request.get_json()
        
        email = data.get('email', '').strip().lower()
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        user = User.query.filter_by(email=email).first()
        
        if not user or not verify_password(password, user.password_hash):
            return jsonify({'error': 'Invalid credentials'}), 401

        if not user.is_active:
            return jsonify({'error': 'Account is inactive'}), 403
        
        # Create tokens (convert user ID to string for JWT compatibility)
        access_token = create_access_token(identity=str(user.id))
        refresh_token = create_refresh_token(identity=str(user.id))
        
        return jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': user.id,
                'email': user.email,
                'full_name': user.full_name,
                'lens_type': user.lens_type
            }
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    """Get user profile"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'id': user.id,
            'email': user.email,
            'full_name': user.full_name,
            'age': user.age,
            'gender': user.gender,
            'current_prescription': {
                'od': {
                    'sph': user.current_prescription_od_sph,
                    'cyl': user.current_prescription_od_cyl,
                    'axis': user.current_prescription_od_axis
                },
                'os': {
                    'sph': user.current_prescription_os_sph,
                    'cyl': user.current_prescription_os_cyl,
                    'axis': user.current_prescription_os_axis
                }
            },
            'lens_type': user.lens_type,
            'lens_brand': user.lens_brand,
            'lens_purchase_date': user.lens_purchase_date.isoformat() if user.lens_purchase_date else None,
            'lifestyle': {
                'avg_screen_time_hours': user.avg_screen_time_hours,
                'avg_sleep_hours': user.avg_sleep_hours,
                'lighting_condition': user.lighting_condition,
                'activity_level': user.activity_level
            },
            'data_storage_preference': user.data_storage_preference,
            'created_at': user.created_at.isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    """Update user profile"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json()
        
        # Update allowed fields
        if 'full_name' in data:
            user.full_name = data['full_name']
        if 'age' in data:
            user.age = data['age']
        if 'gender' in data:
            user.gender = data['gender']
        if 'lens_type' in data:
            user.lens_type = data['lens_type']
        if 'lens_brand' in data:
            user.lens_brand = data['lens_brand']
        if 'lens_purchase_date' in data:
            user.lens_purchase_date = _optional_date(data['lens_purchase_date'])
        if 'avg_screen_time_hours' in data:
            user.avg_screen_time_hours = data['avg_screen_time_hours']
        if 'avg_sleep_hours' in data:
            user.avg_sleep_hours = data['avg_sleep_hours']
        if 'lighting_condition' in data:
            user.lighting_condition = data['lighting_condition']
        if 'activity_level' in data:
            user.activity_level = data['activity_level']
        
        # Update prescription if provided
        if 'current_prescription' in data:
            prescription = data['current_prescription']
            if 'od' in prescription:
                od = prescription['od']
                user.current_prescription_od_sph = _optional_float(od.get('sph'))
                user.current_prescription_od_cyl = _optional_float(od.get('cyl'))
                user.current_prescription_od_axis = _optional_int(od.get('axis'))
            if 'os' in prescription:
                os_data = prescription['os']
                user.current_prescription_os_sph = _optional_float(os_data.get('sph'))
                user.current_prescription_os_cyl = _optional_float(os_data.get('cyl'))
                user.current_prescription_os_axis = _optional_int(os_data.get('axis'))
        
        user.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({'message': 'Profile updated successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Refresh access token"""
    try:
        user_id = int(get_jwt_identity())
        access_token = create_access_token(identity=user_id)
        return jsonify({'access_token': access_token}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """Change user password"""
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        data = request.get_json()
        
        if not data.get('current_password') or not data.get('new_password'):
            return jsonify({'error': 'Current password and new password are required'}), 400
        
        # Verify current password
        if not verify_password(data['current_password'], user.password_hash):
            return jsonify({'error': 'Current password is incorrect'}), 400
        
        # Update password
        user.password_hash = hash_password(data['new_password'])
        user.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({'message': 'Password changed successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
