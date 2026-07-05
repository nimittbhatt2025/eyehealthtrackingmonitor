from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    """User model for authentication and profile"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    
    # Profile Information
    full_name = db.Column(db.String(100))
    age = db.Column(db.Integer)
    gender = db.Column(db.String(20))
    
    # Prescription Information
    current_prescription_od_sph = db.Column(db.Float)  # Right eye sphere
    current_prescription_od_cyl = db.Column(db.Float)  # Right eye cylinder
    current_prescription_od_axis = db.Column(db.Integer)  # Right eye axis
    current_prescription_os_sph = db.Column(db.Float)  # Left eye sphere
    current_prescription_os_cyl = db.Column(db.Float)  # Left eye cylinder
    current_prescription_os_axis = db.Column(db.Integer)  # Left eye axis
    
    # Lens Information
    lens_type = db.Column(db.String(50))  # glasses, contacts, none
    lens_brand = db.Column(db.String(100))
    lens_purchase_date = db.Column(db.Date)
    
    # Lifestyle Information
    avg_screen_time_hours = db.Column(db.Float, default=0)
    avg_sleep_hours = db.Column(db.Float, default=8)
    lighting_condition = db.Column(db.String(50))  # bright, dim, mixed
    activity_level = db.Column(db.String(50))  # sedentary, moderate, active
    
    # Calibration Data
    blink_threshold = db.Column(db.Float)  # Personalized blink detection threshold
    blink_threshold_updated_at = db.Column(db.DateTime)  # When threshold was last calibrated
    
    # Account Settings
    data_storage_preference = db.Column(db.String(20), default='cloud')  # local, cloud
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    vision_tests = db.relationship('VisionTest', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    webcam_metrics = db.relationship('WebcamMetric', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    lens_data = db.relationship('LensData', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    lifestyle_logs = db.relationship('LifestyleLog', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    alerts = db.relationship('Alert', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<User {self.email}>'


class VisionTest(db.Model):
    """Vision test results"""
    __tablename__ = 'vision_tests'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Test Type
    test_type = db.Column(db.String(50), nullable=False)  # acuity, contrast, color
    
    # Test Results
    score = db.Column(db.Float, nullable=False)  # Percentage or normalized score
    response_time_ms = db.Column(db.Integer)  # Average response time in milliseconds
    errors = db.Column(db.Integer, default=0)  # Number of errors
    
    # Test Details (JSON for flexibility)
    test_details = db.Column(db.JSON)  # Store detailed results per test item
    
    # Eye-specific results
    left_eye_score = db.Column(db.Float)
    right_eye_score = db.Column(db.Float)
    
    # Environmental conditions during test
    lighting_condition = db.Column(db.String(50))
    device_type = db.Column(db.String(50))  # phone, tablet, desktop
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    notes = db.Column(db.Text)
    
    def __repr__(self):
        return f'<VisionTest {self.test_type} - Score: {self.score}>'


class WebcamMetric(db.Model):
    """Webcam-based eye fatigue and health metrics"""
    __tablename__ = 'webcam_metrics'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Blink Analysis
    blink_rate = db.Column(db.Float)  # Blinks per minute
    incomplete_blinks = db.Column(db.Integer, default=0)
    avg_blink_duration_ms = db.Column(db.Float)
    
    # Eye Strain Indicators
    squint_count = db.Column(db.Integer, default=0)
    squint_duration_seconds = db.Column(db.Float)
    
    # Eye Health Indicators
    sclera_redness_level = db.Column(db.Float)  # 0-100 scale
    tear_film_quality = db.Column(db.Float)  # 0-100 scale
    pupil_size_variation = db.Column(db.Float)
    
    # Fatigue Score (Computed)
    fatigue_score = db.Column(db.Float, nullable=False)  # 0-100, higher = more fatigued
    
    # Session Information
    session_duration_minutes = db.Column(db.Integer)
    analysis_frames = db.Column(db.Integer)  # Number of frames analyzed
    
    # Raw Data Storage (optional)
    video_url = db.Column(db.String(255))  # S3 URL if stored
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    notes = db.Column(db.Text)
    
    def __repr__(self):
        return f'<WebcamMetric Fatigue: {self.fatigue_score}>'


class LensData(db.Model):
    """Lens effectiveness tracking"""
    __tablename__ = 'lens_data'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Lens Information
    lens_type = db.Column(db.String(50), nullable=False)  # glasses, contacts
    lens_brand = db.Column(db.String(100))
    purchase_date = db.Column(db.Date, nullable=False)
    
    # Prescription at time of purchase
    prescription_od_sph = db.Column(db.Float)
    prescription_od_cyl = db.Column(db.Float)
    prescription_od_axis = db.Column(db.Integer)
    prescription_os_sph = db.Column(db.Float)
    prescription_os_cyl = db.Column(db.Float)
    prescription_os_axis = db.Column(db.Integer)
    
    # Effectiveness Metrics
    effectiveness_score = db.Column(db.Float)  # 0-100, how well lenses are correcting
    vision_clarity_score = db.Column(db.Float)  # User-reported clarity
    
    # Comparison to baseline
    baseline_vision_score = db.Column(db.Float)  # Vision score when lenses were new
    current_vision_score = db.Column(db.Float)  # Most recent vision score with these lenses
    effectiveness_decline_rate = db.Column(db.Float)  # Percentage decline per month
    
    # Predicted replacement date
    predicted_replacement_date = db.Column(db.Date)
    replacement_recommended = db.Column(db.Boolean, default=False)
    
    # Status
    is_active = db.Column(db.Boolean, default=True)  # Currently using these lenses
    replaced_date = db.Column(db.Date)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = db.Column(db.Text)
    
    def __repr__(self):
        return f'<LensData {self.lens_type} - Effectiveness: {self.effectiveness_score}>'


class LifestyleLog(db.Model):
    """Daily lifestyle data for correlation analysis"""
    __tablename__ = 'lifestyle_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Date for this log entry
    log_date = db.Column(db.Date, nullable=False, index=True)
    
    # Screen Time
    screen_time_hours = db.Column(db.Float)
    screen_time_breakdown = db.Column(db.JSON)  # {work: 6, leisure: 2, etc.}
    
    # Sleep
    sleep_hours = db.Column(db.Float)
    sleep_quality = db.Column(db.Integer)  # 1-10 scale
    
    # Environment
    lighting_condition = db.Column(db.String(50))  # bright, dim, mixed, outdoor
    blue_light_exposure_hours = db.Column(db.Float)
    
    # Activity
    activity_level = db.Column(db.String(50))  # sedentary, moderate, active
    outdoor_time_hours = db.Column(db.Float)
    exercise_minutes = db.Column(db.Integer)
    
    # Eye Care
    breaks_taken = db.Column(db.Integer)  # Number of 20-20-20 rule breaks
    eye_drops_used = db.Column(db.Boolean, default=False)
    
    # Symptoms
    eye_strain_level = db.Column(db.Integer)  # 0-10 scale, user-reported
    headache_level = db.Column(db.Integer)  # 0-10 scale
    dry_eyes = db.Column(db.Boolean, default=False)
    blurred_vision = db.Column(db.Boolean, default=False)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    notes = db.Column(db.Text)
    
    def __repr__(self):
        return f'<LifestyleLog {self.log_date} - User: {self.user_id}>'


class Alert(db.Model):
    """Alerts and notifications for users"""
    __tablename__ = 'alerts'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Alert Information
    alert_type = db.Column(db.String(50), nullable=False)  # vision_decline, high_fatigue, lens_replacement, etc.
    severity = db.Column(db.String(20), nullable=False)  # low, medium, high, critical
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    
    # Alert Data
    alert_data = db.Column(db.JSON)  # Additional data related to the alert
    
    # Status
    is_read = db.Column(db.Boolean, default=False)
    is_dismissed = db.Column(db.Boolean, default=False)
    is_actionable = db.Column(db.Boolean, default=True)
    action_taken = db.Column(db.Boolean, default=False)
    action_taken_at = db.Column(db.DateTime)
    
    # Delivery
    push_sent = db.Column(db.Boolean, default=False)
    email_sent = db.Column(db.Boolean, default=False)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    expires_at = db.Column(db.DateTime)  # Optional expiration for time-sensitive alerts
    
    def __repr__(self):
        return f'<Alert {self.alert_type} - {self.severity}>'


class VisionTrend(db.Model):
    """Aggregated trend data for efficient querying"""
    __tablename__ = 'vision_trends'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Time Period
    period_type = db.Column(db.String(20), nullable=False)  # daily, weekly, monthly
    period_start = db.Column(db.Date, nullable=False, index=True)
    period_end = db.Column(db.Date, nullable=False)
    
    # Vision Metrics
    avg_vision_score = db.Column(db.Float)
    avg_acuity_score = db.Column(db.Float)
    avg_contrast_score = db.Column(db.Float)
    avg_color_score = db.Column(db.Float)
    vision_score_change = db.Column(db.Float)  # Percentage change from previous period
    
    # Fatigue Metrics
    avg_fatigue_score = db.Column(db.Float)
    avg_blink_rate = db.Column(db.Float)
    avg_redness_level = db.Column(db.Float)
    fatigue_score_change = db.Column(db.Float)
    
    # Lens Effectiveness
    avg_lens_effectiveness = db.Column(db.Float)
    lens_effectiveness_change = db.Column(db.Float)
    
    # Lifestyle Correlations
    avg_screen_time = db.Column(db.Float)
    avg_sleep_hours = db.Column(db.Float)
    
    # Predictions
    predicted_vision_change_30d = db.Column(db.Float)  # Predicted change in 30 days
    predicted_prescription_change = db.Column(db.JSON)  # Predicted prescription adjustments
    confidence_score = db.Column(db.Float)  # 0-1, confidence in predictions
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<VisionTrend {self.period_type} - {self.period_start}>'
