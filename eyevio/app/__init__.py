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
    
    # Health check endpoint
    @app.route('/health')
    def health_check():
        return {'status': 'healthy', 'message': 'EyeVio API is running'}, 200
    
    # Request logging for debugging
    @app.before_request
    def log_request_info():
        from flask import request
        if request.path.startswith('/api/'):
            print(f"\n=== Incoming Request ===")
            print(f"Path: {request.path}")
            print(f"Method: {request.method}")
            print(f"Headers: {dict(request.headers)}")
            if request.method in ['POST', 'PUT', 'PATCH']:
                print(f"Body: {request.get_json(silent=True)}")
            print("========================\n")
    
    return app
