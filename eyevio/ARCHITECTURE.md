# 🏗️ EyeVio System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         EYEVIO SYSTEM                           │
│                    Vision Health Monitoring                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   FRONTEND      │         │   BACKEND API    │         │   DATABASE      │
│   (To Build)    │◄───────►│   (Complete ✅)  │◄───────►│   (Complete ✅) │
└─────────────────┘         └──────────────────┘         └─────────────────┘
│                           │                            │
│ - Web Dashboard          │ - Flask REST API           │ - PostgreSQL
│ - Mobile App             │ - JWT Auth                 │ - 7 Tables
│ - Vision Tests           │ - 42 Endpoints             │ - Migrations
│ - Results Viewer         │ - Error Handling           │ - Indexes
└─────────────────┘         │ - Validation               └─────────────────┘
                            │
                            ▼
                    ┌──────────────────┐
                    │   AI/ML MODELS   │
                    │  (Framework ✅)  │
                    └──────────────────┘
                    │
                    │ - Eye Detection
                    │ - Fatigue Analysis
                    │ - Predictions
                    │ - Correlations
                    └──────────────────┘
```

## Backend Architecture (Implemented)

```
┌────────────────────────────────────────────────────────────────────┐
│                        FLASK APPLICATION                            │
└────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  API LAYER (app/routes/)                                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Auth    │  │  Vision  │  │  Webcam  │  │   Lens   │          │
│  │  Routes  │  │  Routes  │  │  Routes  │  │  Routes  │          │
│  │  (5)     │  │  (4)     │  │  (3)     │  │  (3)     │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │Lifestyle │  │  Trend   │  │  Alert   │  │  Report  │          │
│  │  Routes  │  │  Routes  │  │  Routes  │  │  Routes  │          │
│  │  (3)     │  │  (3)     │  │  (5)     │  │  (1)     │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  BUSINESS LOGIC LAYER (app/utils/, app/services/)                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │  Authentication     │  │  Analytics          │                  │
│  │  - Password Hash    │  │  - Trend Calc       │                  │
│  │  - JWT Helpers      │  │  - Fatigue Score    │                  │
│  │  - Decorators       │  │  - Correlations     │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  AI/ML LAYER (app/ai_models/)                                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │  Eye Analysis       │  │  Predictions        │                  │
│  │  - Eye Detection    │  │  - Vision Drift     │                  │
│  │  - Blink Analysis   │  │  - Prescription     │                  │
│  │  - Squint Detection │  │  - Lens Replace     │                  │
│  │  - Redness Measure  │  │  - Health Score     │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  DATA LAYER (app/models/)                                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐             │
│  │  User  │  │  Vision  │  │  Webcam  │  │  Lens   │             │
│  │        │  │   Test   │  │  Metric  │  │  Data   │             │
│  └────────┘  └──────────┘  └──────────┘  └─────────┘             │
│                                                                     │
│  ┌──────────┐  ┌────────┐  ┌──────────┐                           │
│  │Lifestyle │  │ Alert  │  │  Vision  │                           │
│  │   Log    │  │        │  │  Trend   │                           │
│  └──────────┘  └────────┘  └──────────┘                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  DATABASE (PostgreSQL)                                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌──────────────┐
│    USER      │
└──────┬───────┘
       │ 1. Request (with JWT token)
       ▼
┌──────────────┐
│   API Route  │ ◄── 2. Validate JWT
└──────┬───────┘
       │ 3. Process Request
       ▼
┌──────────────┐
│  Utilities/  │
│   Services   │ ◄── 4. Business Logic
└──────┬───────┘
       │ 5. Query/Update
       ▼
┌──────────────┐
│  Database    │
│   Models     │ ◄── 6. SQLAlchemy ORM
└──────┬───────┘
       │ 7. Return Data
       ▼
┌──────────────┐
│  AI Models   │ ◄── 8. Analyze (if needed)
└──────┬───────┘
       │ 9. Generate Response
       ▼
┌──────────────┐
│ JSON Response│
└──────┬───────┘
       │ 10. Return to User
       ▼
┌──────────────┐
│    USER      │
└──────────────┘
```

## Example: Vision Test Submission Flow

```
1. User submits vision test via POST /api/vision-test/
   ├── Frontend sends: {test_type, score, response_time, ...}
   └── Include JWT token in Authorization header

2. Flask receives request at vision_test.py route
   ├── @jwt_required decorator validates token
   └── Extract user_id from JWT

3. Route validates input data
   ├── Check required fields
   └── Validate data types

4. Create VisionTest model instance
   ├── Set user_id
   ├── Set test data
   └── Set timestamp

5. Save to database
   ├── db.session.add(vision_test)
   └── db.session.commit()

6. Analyze trend (analytics.py)
   ├── Get all user's tests
   ├── Calculate statistics
   └── Detect decline

7. Check if alert needed
   ├── If decline > threshold
   ├── Create Alert instance
   └── Save alert to DB

8. Return response
   └── JSON: {message, test_id, score, created_at}
```

## Database Schema

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS TABLE                              │
├─────────────────────────────────────────────────────────────────┤
│ id, email, password_hash, full_name, age, gender                │
│ prescription (OD/OS: sph, cyl, axis)                            │
│ lens_type, lens_brand, lens_purchase_date                       │
│ lifestyle (screen_time, sleep, lighting, activity)              │
│ data_storage_preference, created_at, updated_at                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┬──────────────────┐
         │               │               │                  │
         ▼               ▼               ▼                  ▼
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐
│VISION_TESTS│  │WEBCAM      │  │LENS_DATA   │  │LIFESTYLE_LOGS│
│            │  │METRICS     │  │            │  │              │
│test_type   │  │blink_rate  │  │lens_type   │  │log_date      │
│score       │  │squint_count│  │purchase_dt │  │screen_time   │
│response_ms │  │redness     │  │effectiveness│  │sleep_hours   │
│errors      │  │fatigue_score│  │replacement│  │activity      │
│created_at  │  │created_at  │  │created_at  │  │symptoms      │
└────────────┘  └────────────┘  └────────────┘  └──────────────┘
         │               │               │                  │
         └───────────────┴───────────────┴──────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │     ALERTS       │
              │                  │
              │ alert_type       │
              │ severity         │
              │ title, message   │
              │ is_read          │
              │ created_at       │
              └──────────────────┘
```

## API Endpoint Structure

```
/api/
  │
  ├── /auth/
  │   ├── POST   /register          - Create account
  │   ├── POST   /login             - Authenticate
  │   ├── GET    /profile           - Get user info
  │   ├── PUT    /profile           - Update info
  │   └── POST   /refresh           - Refresh token
  │
  ├── /vision-test/
  │   ├── POST   /                  - Submit test
  │   ├── GET    /                  - Get history
  │   ├── GET    /<id>              - Get specific test
  │   └── GET    /stats             - Get statistics
  │
  ├── /webcam/
  │   ├── POST   /analysis          - Submit metrics
  │   ├── GET    /metrics           - Get history
  │   └── GET    /fatigue-trend     - Get trend
  │
  ├── /lens/
  │   ├── POST   /data              - Add lens info
  │   ├── GET    /effectiveness     - Get effectiveness
  │   └── GET    /history           - Get history
  │
  ├── /lifestyle/
  │   ├── POST   /log               - Log daily data
  │   ├── GET    /logs              - Get logs
  │   └── GET    /correlations      - Get correlations
  │
  ├── /trend/
  │   ├── GET    /                  - Get trend data
  │   ├── GET    /prediction        - Get predictions
  │   └── GET    /summary           - Get summary
  │
  ├── /alerts/
  │   ├── GET    /                  - Get alerts
  │   ├── PUT    /<id>/read         - Mark read
  │   ├── PUT    /<id>/dismiss      - Dismiss
  │   ├── PUT    /<id>/action       - Mark action
  │   └── PUT    /mark-all-read     - Mark all read
  │
  └── /report/
      └── GET    /                  - Generate report
```

## Technology Stack Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    TECHNOLOGY STACK                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Python    │  │    Flask    │  │ PostgreSQL  │  │    JWT      │
│    3.9+     │  │     3.0     │  │    12+      │  │   Tokens    │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ SQLAlchemy  │  │   bcrypt    │  │   PyTorch   │  │ TensorFlow  │
│    ORM      │  │  Password   │  │   AI/ML     │  │   AI/ML     │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   OpenCV    │  │   NumPy     │  │   pandas    │  │ scikit-learn│
│   Vision    │  │    Math     │  │    Data     │  │     ML      │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ ReportLab   │  │   pytest    │  │    CORS     │  │   Alembic   │
│     PDF     │  │   Testing   │  │  Frontend   │  │ Migrations  │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

## Deployment Architecture (Planned)

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLOUD INFRASTRUCTURE                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────┐
│   Users     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Load        │
│ Balancer    │ ◄── SSL/TLS
└──────┬──────┘
       │
       ├───────────────┬───────────────┐
       ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│  Backend   │  │  Backend   │  │  Backend   │
│ Instance 1 │  │ Instance 2 │  │ Instance 3 │
└──────┬─────┘  └──────┬─────┘  └──────┬─────┘
       │               │               │
       └───────────────┴───────────────┘
                       │
                       ▼
              ┌────────────────┐
              │   Database     │
              │   (PostgreSQL) │
              │   Master/Slave │
              └────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  File Storage  │
              │  (S3/Blob)     │
              └────────────────┘
```

## Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      SECURITY ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────┘

1. NETWORK LAYER
   ├── HTTPS/TLS encryption
   ├── Firewall rules
   └── DDoS protection

2. APPLICATION LAYER
   ├── JWT authentication
   ├── Password hashing (bcrypt)
   ├── Input validation
   ├── SQL injection prevention (ORM)
   └── CORS configuration

3. DATA LAYER
   ├── Database encryption at rest
   ├── Encrypted backups
   ├── Access controls
   └── Audit logging

4. API LAYER
   ├── Rate limiting (to add)
   ├── Request validation
   └── Error handling
```

---

**Architecture Status**: Backend Complete ✅  
**Next**: Frontend & Deployment Implementation  
**Ready For**: Production Deployment
