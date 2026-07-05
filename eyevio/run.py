from app import create_app
from config import config
import os

# Create Flask app
app = create_app(os.getenv('FLASK_ENV', 'development'))

if __name__ == '__main__':
    # Get port from environment
    port = int(os.getenv('PORT', 5001))
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False,  # Disable debug mode to avoid reloader issues
        threaded=True
    )
