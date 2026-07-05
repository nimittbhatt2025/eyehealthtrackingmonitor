# 🌟 EyeVio - AI-Powered Vision Health Monitoring

> "Track. Predict. Protect your vision."

EyeVio is a comprehensive vision health monitoring application that tracks eyesight, lens effectiveness, and eye fatigue over time. The app detects early signs of prescription changes, correlates lifestyle factors, and predicts potential vision drift.

## 🎯 Features

### Core Modules

1. **User Management**
   - User authentication (JWT-based)
   - Profile management with prescription tracking
   - Privacy options (local/cloud storage)

2. **Vision Testing**
   - Visual acuity tests
   - Contrast sensitivity tests
   - Color perception tests
   - Historical tracking with trend analysis

3. **Webcam Eye Analysis**
   - Blink rate monitoring
   - Squint detection
   - Sclera redness assessment
   - Eye fatigue scoring

4. **Lens Effectiveness Tracking**
   - Monitor lens performance over time
   - Predict replacement timing
   - Compare to baseline vision

5. **Trend & Predictions**
   - Vision score trends
   - Fatigue pattern analysis
   - AI-powered vision drift prediction
   - Prescription change recommendations

6. **Lifestyle Correlation**
   - Track screen time, sleep, lighting
   - Correlate with vision/fatigue
   - Personalized recommendations

7. **Alerts & Notifications**
   - Vision decline alerts
   - High fatigue warnings
   - Lens replacement reminders

8. **Reports**
   - PDF report generation
   - Doctor-ready summaries
   - Comprehensive health scores

## 🏗️ Architecture

### Backend Stack
- **Framework**: Flask (Python)
- **Database**: PostgreSQL
- **Authentication**: JWT tokens
- **AI/ML**: PyTorch, TensorFlow, scikit-learn
- **Computer Vision**: OpenCV, MTCNN, YOLO

### Project Structure
```
eyevio/
├── app/
│   ├── __init__.py              # Flask app factory
│   ├── models/                  # Database models
│   │   └── __init__.py          # User, VisionTest, WebcamMetric, etc.
│   ├── routes/                  # API endpoints
│   │   ├── auth.py              # Authentication
│   │   ├── vision_test.py       # Vision tests
│   │   ├── webcam.py            # Webcam analysis
│   │   ├── lens.py              # Lens tracking
│   │   ├── lifestyle.py         # Lifestyle logging
│   │   ├── trend.py             # Trend analysis
│   │   ├── alert.py             # Alerts
│   │   └── report.py            # Report generation
│   ├── services/                # Business logic
│   ├── ai_models/               # AI/ML models
│   │   ├── eye_analysis.py      # Eye detection & fatigue
│   │   └── prediction.py        # Vision drift prediction
│   └── utils/                   # Utilities
│       ├── auth.py              # Auth helpers
│       └── analytics.py         # Analytics functions
├── config.py                    # Configuration
├── run.py                       # Application entry point
├── requirements.txt             # Python dependencies
└── README.md                    # This file
```

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- PostgreSQL 12+
- pip or conda

### Installation

1. **Clone the repository**
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
```

2. **Create virtual environment**
```bash
python -m venv venv
source venv/bin/activate  # On macOS/Linux
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. **Set up PostgreSQL database**
```bash
# Create database
createdb eyevio_db

# Or use psql
psql -c "CREATE DATABASE eyevio_db;"
```

6. **Initialize database**
```bash
flask db init
flask db migrate -m "Initial migration"
flask db upgrade
```

7. **Run the application**
```bash
python run.py
```

The API will be available at `http://localhost:5000`

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update profile
- `POST /api/auth/refresh` - Refresh access token

### Vision Tests
- `POST /api/vision-test/` - Submit vision test
- `GET /api/vision-test/` - Get test history
- `GET /api/vision-test/<id>` - Get specific test
- `GET /api/vision-test/stats` - Get test statistics

### Webcam Analysis
- `POST /api/webcam/analysis` - Submit webcam metrics
- `GET /api/webcam/metrics` - Get metrics history
- `GET /api/webcam/fatigue-trend` - Get fatigue trend

### Lens Tracking
- `POST /api/lens/data` - Submit lens information
- `GET /api/lens/effectiveness` - Get lens effectiveness
- `GET /api/lens/history` - Get lens history

### Lifestyle
- `POST /api/lifestyle/log` - Log daily lifestyle data
- `GET /api/lifestyle/logs` - Get lifestyle logs
- `GET /api/lifestyle/correlations` - Get correlations

### Trends & Predictions
- `GET /api/trend/` - Get trend data
- `GET /api/trend/prediction` - Get vision predictions
- `GET /api/trend/summary` - Get health summary

### Alerts
- `GET /api/alerts/` - Get alerts
- `PUT /api/alerts/<id>/read` - Mark alert as read
- `PUT /api/alerts/<id>/dismiss` - Dismiss alert
- `PUT /api/alerts/<id>/action` - Mark action taken

### Reports
- `GET /api/report/?format=pdf` - Generate PDF report
- `GET /api/report/?format=json` - Get report data as JSON

## 🗄️ Database Schema

### Key Tables
- **users** - User accounts and profiles
- **vision_tests** - Vision test results
- **webcam_metrics** - Eye fatigue and health metrics
- **lens_data** - Lens information and effectiveness
- **lifestyle_logs** - Daily lifestyle tracking
- **alerts** - User notifications
- **vision_trends** - Aggregated trend data

## 🤖 AI Models

### Current Implementation
1. **Fatigue Scoring**: Rule-based algorithm using blink rate, squinting, and redness
2. **Vision Trend Analysis**: Statistical analysis of test scores
3. **Prediction**: Linear regression for vision drift prediction

### Future Enhancements
1. **Deep Learning Models**:
   - CNN for eye region analysis
   - ConvLSTM for temporal fatigue patterns
   - YOLO v8 for real-time eye detection

2. **Advanced Predictions**:
   - LSTM for time-series prediction
   - Ensemble models for prescription changes
   - Multivariate analysis for lifestyle correlation

## 🔧 Configuration

### Environment Variables
See `.env.example` for required configuration:
- `DATABASE_URL` - PostgreSQL connection string
- `SECRET_KEY` - Flask secret key
- `JWT_SECRET_KEY` - JWT signing key
- AWS credentials (optional, for video storage)

## 🧪 Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=app tests/
```

## 📊 MVP Features (Implemented)

✅ User authentication & profiles  
✅ Vision test submission & scoring  
✅ Database with historical tracking  
✅ Trend analysis API  
✅ Vision decline alerts  
✅ Fatigue score calculation  
✅ Lens effectiveness tracking  
✅ Lifestyle correlation  
✅ PDF report generation  
✅ Prediction models  

## 🚧 Next Steps

### Phase 2 (To Be Implemented)
- [ ] Real-time webcam processing
- [ ] Advanced AI models (YOLO, MTCNN integration)
- [ ] Mobile app (React Native/Flutter)
- [ ] Frontend dashboard (React/Vue)
- [ ] Email notifications
- [ ] Multi-language support
- [ ] Telemedicine integration

### Phase 3 (Future)
- [ ] Gamification features
- [ ] Social features (anonymous comparison)
- [ ] Wearable device integration
- [ ] Insurance integration
- [ ] Research data contribution (opt-in)

## 🔐 Security

- JWT-based authentication
- Password hashing with bcrypt
- CORS configuration
- SQL injection prevention (SQLAlchemy ORM)
- Input validation
- Rate limiting (to be added)

## 📝 License

MIT License - See LICENSE file for details

## 👥 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

For issues or questions:
- Open an issue on GitHub
- Email: support@eyevio.app (placeholder)

## 🙏 Acknowledgments

- Flask framework
- PostgreSQL database
- OpenCV for computer vision
- scikit-learn for ML algorithms
- ReportLab for PDF generation

---

**Built with ❤️ for better vision health**
