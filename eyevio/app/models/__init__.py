from datetime import datetime

from flask_sqlalchemy import SQLAlchemy

from app.utils.datetime_utils import serialize_utc_datetime

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
    date_of_birth = db.Column(db.Date)
    
    # Prescription Information
    current_prescription_od_sph = db.Column(db.Float)  # Right eye sphere
    current_prescription_od_cyl = db.Column(db.Float)  # Right eye cylinder
    current_prescription_od_axis = db.Column(db.Integer)  # Right eye axis
    current_prescription_os_sph = db.Column(db.Float)  # Left eye sphere
    current_prescription_os_cyl = db.Column(db.Float)  # Left eye cylinder
    current_prescription_os_axis = db.Column(db.Integer)  # Left eye axis
    
    # Lens Information
    lens_type = db.Column(db.String(50))  # glasses, contacts, both, none
    lens_brand = db.Column(db.String(100))
    lens_purchase_date = db.Column(db.Date)
    
    # Lifestyle Information
    avg_screen_time_hours = db.Column(db.Float, default=0)
    avg_sleep_hours = db.Column(db.Float, default=8)
    avg_outdoor_time_hours = db.Column(db.Float)
    lighting_condition = db.Column(db.String(50))  # bright, dim, mixed
    activity_level = db.Column(db.String(50))  # sedentary, moderate, active
    occupation = db.Column(db.String(50))
    
    # Onboarding / preferences
    onboarding_completed = db.Column(db.Boolean, default=False, nullable=False)
    onboarding_data = db.Column(db.JSON)  # Full onboarding questionnaire payload
    preferred_units = db.Column(db.String(20), default='metric')  # metric, imperial
    primary_goal = db.Column(db.String(50))
    test_frequency = db.Column(db.String(30))
    notifications_enabled = db.Column(db.Boolean, default=True)
    email_alerts_enabled = db.Column(db.Boolean, default=True)
    push_alerts_enabled = db.Column(db.Boolean, default=True)
    notification_preferences = db.Column(db.JSON)  # Granular toggles (lens reminders, etc.)
    
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
    eye_photos = db.relationship('EyePhoto', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    push_subscriptions = db.relationship('PushSubscription', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    myopia_subjects = db.relationship('MyopiaSubject', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    wellbeing_connections = db.relationship(
        'DigitalWellbeingConnection', backref='user', lazy='dynamic', cascade='all, delete-orphan'
    )
    family_memberships = db.relationship(
        'FamilyMember', backref='user', lazy='dynamic', cascade='all, delete-orphan'
    )
    
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
    screen_time_source = db.Column(db.String(40))  # manual, android_usage_stats, ios_device_activity, import
    
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


class PushSubscription(db.Model):
    """Web Push subscription endpoints for a user"""
    __tablename__ = 'push_subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    endpoint = db.Column(db.Text, nullable=False, unique=True)
    p256dh = db.Column(db.String(255), nullable=False)
    auth = db.Column(db.String(255), nullable=False)
    user_agent = db.Column(db.String(512))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_subscription_info(self):
        return {
            'endpoint': self.endpoint,
            'keys': {
                'p256dh': self.p256dh,
                'auth': self.auth,
            },
        }

    def __repr__(self):
        return f'<PushSubscription user={self.user_id}>'


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


class EyePhoto(db.Model):
    """Historical eye photos for month-over-month health monitoring"""
    __tablename__ = 'eye_photos'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    # What the patient is monitoring (dry eye, cornea scar, glaucoma, etc.)
    condition_type = db.Column(db.String(50), nullable=False, default='general', index=True)

    # Compressed JPEG thumbnail (data URL) for timeline / side-by-side comparison
    image_thumbnail = db.Column(db.Text, nullable=False)

    # Aggregated surface-health metrics from CV analysis
    health_score = db.Column(db.Float, nullable=False)
    sclera_redness = db.Column(db.Float)
    tear_film_quality = db.Column(db.Float)
    surface_irregularity = db.Column(db.Float)
    left_eye_score = db.Column(db.Float)
    right_eye_score = db.Column(db.Float)

    # Full per-eye metrics and findings
    analysis_details = db.Column(db.JSON)

    # Optional link to a vision test record
    vision_test_id = db.Column(db.Integer, db.ForeignKey('vision_tests.id'), nullable=True)

    captured_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, include_thumbnail=True):
        data = {
            'id': self.id,
            'condition_type': self.condition_type,
            'health_score': self.health_score,
            'sclera_redness': self.sclera_redness,
            'tear_film_quality': self.tear_film_quality,
            'surface_irregularity': self.surface_irregularity,
            'left_eye_score': self.left_eye_score,
            'right_eye_score': self.right_eye_score,
            'analysis_details': self.analysis_details,
            'vision_test_id': self.vision_test_id,
            'captured_at': serialize_utc_datetime(self.captured_at),
            'created_at': serialize_utc_datetime(self.created_at),
        }
        if include_thumbnail:
            data['image_thumbnail'] = self.image_thumbnail
        return data

    def __repr__(self):
        return f'<EyePhoto {self.condition_type} score={self.health_score}>'


class MyopiaSubject(db.Model):
    """Child, teen, or self profile for myopia progression tracking."""
    __tablename__ = 'myopia_subjects'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    display_name = db.Column(db.String(100), nullable=False)
    relationship = db.Column(db.String(20), default='self')  # self, child, ward
    date_of_birth = db.Column(db.Date)
    sex = db.Column(db.String(20))

    # Clinical context (educational tracking — not a diagnosis)
    myopia_onset_age = db.Column(db.Float)
    parental_myopia = db.Column(db.String(30))  # none, one_parent, both_parents, unknown
    ethnicity_risk_note = db.Column(db.String(50))  # optional coarse flag, user-entered
    treatment = db.Column(db.String(50), default='none')  # none, atropine, ortho_k, multifocal, dual_focus, other
    treatment_notes = db.Column(db.Text)
    target_outdoor_hours = db.Column(db.Float, default=2.0)
    target_screen_hours = db.Column(db.Float, default=2.0)
    school_grade = db.Column(db.String(30))
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    prescriptions = db.relationship(
        'MyopiaPrescriptionEntry',
        backref='subject',
        lazy='dynamic',
        cascade='all, delete-orphan',
        order_by='MyopiaPrescriptionEntry.measured_at',
    )

    def age_years(self, on_date=None):
        if not self.date_of_birth:
            return None
        on_date = on_date or datetime.utcnow().date()
        return (
            on_date.year
            - self.date_of_birth.year
            - ((on_date.month, on_date.day) < (self.date_of_birth.month, self.date_of_birth.day))
        )

    def to_dict(self):
        return {
            'id': self.id,
            'display_name': self.display_name,
            'relationship': self.relationship,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'age_years': self.age_years(),
            'sex': self.sex,
            'myopia_onset_age': self.myopia_onset_age,
            'parental_myopia': self.parental_myopia,
            'ethnicity_risk_note': self.ethnicity_risk_note,
            'treatment': self.treatment or 'none',
            'treatment_notes': self.treatment_notes,
            'target_outdoor_hours': self.target_outdoor_hours,
            'target_screen_hours': self.target_screen_hours,
            'school_grade': self.school_grade,
            'is_active': bool(self.is_active),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<MyopiaSubject {self.display_name}>'


class MyopiaPrescriptionEntry(db.Model):
    """Longitudinal refraction / SE log for myopia progression."""
    __tablename__ = 'myopia_prescription_entries'

    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey('myopia_subjects.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    measured_at = db.Column(db.Date, nullable=False, index=True)
    source = db.Column(db.String(30), default='exam')  # exam, self_report, acuity_estimate

    od_sph = db.Column(db.Float)
    od_cyl = db.Column(db.Float)
    od_axis = db.Column(db.Integer)
    os_sph = db.Column(db.Float)
    os_cyl = db.Column(db.Float)
    os_axis = db.Column(db.Integer)

    # Spherical equivalent (D) — sph + cyl/2
    se_od = db.Column(db.Float)
    se_os = db.Column(db.Float)
    se_binocular = db.Column(db.Float)  # mean of available eyes

    # Optional advanced metrics
    axial_length_od_mm = db.Column(db.Float)
    axial_length_os_mm = db.Column(db.Float)
    unaided_acuity_od = db.Column(db.String(20))  # e.g. 20/40
    unaided_acuity_os = db.Column(db.String(20))

    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'subject_id': self.subject_id,
            'measured_at': self.measured_at.isoformat() if self.measured_at else None,
            'source': self.source,
            'od': {'sph': self.od_sph, 'cyl': self.od_cyl, 'axis': self.od_axis},
            'os': {'sph': self.os_sph, 'cyl': self.os_cyl, 'axis': self.os_axis},
            'se_od': self.se_od,
            'se_os': self.se_os,
            'se_binocular': self.se_binocular,
            'axial_length_od_mm': self.axial_length_od_mm,
            'axial_length_os_mm': self.axial_length_os_mm,
            'unaided_acuity_od': self.unaided_acuity_od,
            'unaided_acuity_os': self.unaided_acuity_os,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<MyopiaPrescriptionEntry subject={self.subject_id} {self.measured_at}>'


class DigitalWellbeingConnection(db.Model):
    """Per-device link to OS screen-time APIs (via native shell)."""
    __tablename__ = 'digital_wellbeing_connections'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)

    platform = db.Column(db.String(20), nullable=False)  # ios, android, web_import
    source = db.Column(db.String(40), nullable=False)  # ios_device_activity, android_usage_stats, csv_import
    device_id = db.Column(db.String(128), nullable=False)
    device_name = db.Column(db.String(120))
    status = db.Column(db.String(30), default='pending')  # pending, connected, paused, revoked, error
    permission_granted = db.Column(db.Boolean, default=False)
    auto_sync_enabled = db.Column(db.Boolean, default=True)
    sync_lifestyle = db.Column(db.Boolean, default=True)  # upsert lifestyle_logs.screen_time_hours
    last_sync_at = db.Column(db.DateTime)
    last_error = db.Column(db.Text)
    meta = db.Column(db.JSON)  # OS version, plugin version, etc.

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'device_id', name='uq_wellbeing_user_device'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'platform': self.platform,
            'source': self.source,
            'device_id': self.device_id,
            'device_name': self.device_name,
            'status': self.status,
            'permission_granted': bool(self.permission_granted),
            'auto_sync_enabled': bool(self.auto_sync_enabled),
            'sync_lifestyle': bool(self.sync_lifestyle),
            'last_sync_at': self.last_sync_at.isoformat() if self.last_sync_at else None,
            'last_error': self.last_error,
            'meta': self.meta or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<DigitalWellbeingConnection {self.platform}:{self.device_id}>'


class ScreenTimeDay(db.Model):
    """Daily device screen-time aggregate pulled from OS wellbeing APIs."""
    __tablename__ = 'screen_time_days'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    connection_id = db.Column(
        db.Integer, db.ForeignKey('digital_wellbeing_connections.id'), nullable=True, index=True
    )

    day = db.Column(db.Date, nullable=False, index=True)
    total_screen_hours = db.Column(db.Float, nullable=False)
    pickup_count = db.Column(db.Integer)
    notification_count = db.Column(db.Integer)
    # Category buckets in hours, e.g. {social: 2.1, productivity: 3.0, entertainment: 1.2, other: 0.5}
    category_breakdown = db.Column(db.JSON)
    # Optional top apps [{name, bundle_id, hours}]
    top_apps = db.Column(db.JSON)
    source = db.Column(db.String(40), nullable=False)
    raw_payload = db.Column(db.JSON)
    applied_to_lifestyle = db.Column(db.Boolean, default=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'day', 'source', 'connection_id', name='uq_screen_time_day_source'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'connection_id': self.connection_id,
            'day': self.day.isoformat(),
            'total_screen_hours': self.total_screen_hours,
            'pickup_count': self.pickup_count,
            'notification_count': self.notification_count,
            'category_breakdown': self.category_breakdown or {},
            'top_apps': self.top_apps or [],
            'source': self.source,
            'applied_to_lifestyle': bool(self.applied_to_lifestyle),
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<ScreenTimeDay user={self.user_id} {self.day} {self.total_screen_hours}h>'


class FamilyGroup(db.Model):
    """A household of caregivers and children."""
    __tablename__ = 'family_groups'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    members = db.relationship(
        'FamilyMember', backref='family', lazy='dynamic', cascade='all, delete-orphan'
    )
    invites = db.relationship(
        'FamilyInvite', backref='family', lazy='dynamic', cascade='all, delete-orphan'
    )

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'created_by_user_id': self.created_by_user_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<FamilyGroup {self.name}>'


class FamilyMember(db.Model):
    """Membership + parent-enforced goals for a child."""
    __tablename__ = 'family_members'

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey('family_groups.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False)  # caregiver, child
    display_name = db.Column(db.String(100))
    is_managed = db.Column(db.Boolean, default=False)  # parent-created child account
    notify_caregivers = db.Column(db.Boolean, default=True)

    # Parent-enforced daily targets (used for younger kids)
    outdoor_hours_target = db.Column(db.Float, default=2.0)
    screen_hours_limit = db.Column(db.Float, default=2.0)
    breaks_target = db.Column(db.Integer, default=12)  # 20-20-20 breaks / day
    test_interval_days = db.Column(db.Integer, default=30)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('family_id', 'user_id', name='uq_family_member'),
    )

    def goals_dict(self):
        return {
            'outdoor_hours_target': self.outdoor_hours_target if self.outdoor_hours_target is not None else 2.0,
            'screen_hours_limit': self.screen_hours_limit if self.screen_hours_limit is not None else 2.0,
            'breaks_target': self.breaks_target if self.breaks_target is not None else 12,
            'test_interval_days': self.test_interval_days if self.test_interval_days is not None else 30,
        }

    def to_dict(self, user=None):
        u = user or self.user
        return {
            'id': self.id,
            'family_id': self.family_id,
            'user_id': self.user_id,
            'role': self.role,
            'display_name': self.display_name or (u.full_name if u else None),
            'email': None if self.is_managed else (u.email if u else None),
            'age': u.age if u else None,
            'is_managed': bool(self.is_managed),
            'notify_caregivers': bool(self.notify_caregivers),
            'goals': self.goals_dict(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<FamilyMember family={self.family_id} user={self.user_id} {self.role}>'


class FamilyInvite(db.Model):
    """Join code for a caregiver or child."""
    __tablename__ = 'family_invites'

    id = db.Column(db.Integer, primary_key=True)
    family_id = db.Column(db.Integer, db.ForeignKey('family_groups.id'), nullable=False, index=True)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # caregiver, child
    code = db.Column(db.String(12), unique=True, nullable=False, index=True)
    child_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # claim-managed child
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime)
    used_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'family_id': self.family_id,
            'role': self.role,
            'code': self.code,
            'child_user_id': self.child_user_id,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'used_at': self.used_at.isoformat() if self.used_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<FamilyInvite {self.code} {self.role}>'
