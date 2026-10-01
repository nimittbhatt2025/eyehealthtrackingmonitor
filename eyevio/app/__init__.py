from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate
from config import config
from app.models import db


def create_app(config_name='development'):
    """Application factory pattern"""
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    db.init_app(app)
    CORS(app, origins=app.config['CORS_ORIGINS'])
    jwt = JWTManager(app)
    Migrate(app, db)
    
    # JWT error handlers
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return {'error': 'Token has expired', 'message': 'Please login again'}, 401
    
    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return {'error': 'Invalid token', 'message': 'Please login again'}, 401
    
    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return {'error': 'Authorization required', 'message': 'Please login to access this resource'}, 401
    
    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return {'error': 'Token has been revoked', 'message': 'Please login again'}, 401
    
    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.vision_test import vision_test_bp
    from app.routes.webcam import webcam_bp
    from app.routes.lens import lens_bp
    from app.routes.lifestyle import lifestyle_bp
    from app.routes.trend import trend_bp
    from app.routes.alert import alert_bp
    from app.routes.report import report_bp
    from app.routes.calibration import bp as calibration_bp
    from app.routes.eye_photo import eye_photo_bp
    from app.routes.notifications import notifications_bp
    from app.routes.myopia import myopia_bp
    from app.routes.wellbeing import wellbeing_bp
    from app.routes.family import family_bp
    from app.routes.jobs import jobs_bp
    
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(vision_test_bp, url_prefix='/api/vision-test')
    app.register_blueprint(webcam_bp, url_prefix='/api/webcam')
    app.register_blueprint(lens_bp, url_prefix='/api/lens')
    app.register_blueprint(lifestyle_bp, url_prefix='/api/lifestyle')
    app.register_blueprint(trend_bp, url_prefix='/api/trend')
    app.register_blueprint(alert_bp, url_prefix='/api/alerts')
    app.register_blueprint(report_bp, url_prefix='/api/report')
    app.register_blueprint(calibration_bp)
    app.register_blueprint(eye_photo_bp, url_prefix='/api/eye-photos')
    app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
    app.register_blueprint(myopia_bp, url_prefix='/api/myopia')
    app.register_blueprint(wellbeing_bp, url_prefix='/api/wellbeing')
    app.register_blueprint(family_bp, url_prefix='/api/family')
    app.register_blueprint(jobs_bp, url_prefix='/api/jobs')

    from app.services import trend_aggregates
    trend_aggregates.register_cli(app)
    
    from app.ai_models.warmup import start_background_warmup, warmup_state

    @app.route('/health')
    def health_check():
        return {'status': 'healthy', 'message': 'EyeVio API is running', 'models': warmup_state()}, 200

    # Never log headers (bearer tokens) or bodies (base64 photos can be megabytes).
    @app.before_request
    def log_request_info():
        from flask import request
        if request.path.startswith('/api/'):
            app.logger.info('%s %s (%s bytes)', request.method, request.path, request.content_length or 0)

    # Skip under the flask CLI (db upgrade, aggregate-trends, …): only servers need warm models.
    import click
    if app.config.get('WARM_MODELS') and click.get_current_context(silent=True) is None:
        start_background_warmup()

    return app
