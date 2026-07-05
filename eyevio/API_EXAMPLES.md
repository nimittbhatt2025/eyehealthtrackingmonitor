# API Testing with Postman/curl

## Health Check
```bash
curl http://localhost:5000/health
```

## Register User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "full_name": "John Doe",
    "age": 28,
    "lens_type": "glasses"
  }'
```

## Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

Save the `access_token` from the response.

## Get Profile
```bash
curl http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Submit Vision Test
```bash
curl -X POST http://localhost:5000/api/vision-test/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "test_type": "acuity",
    "score": 85.5,
    "response_time_ms": 1500,
    "errors": 2,
    "left_eye_score": 87.0,
    "right_eye_score": 84.0,
    "lighting_condition": "bright",
    "device_type": "desktop"
  }'
```

## Get Vision Tests
```bash
curl "http://localhost:5000/api/vision-test/?limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Submit Webcam Analysis
```bash
curl -X POST http://localhost:5000/api/webcam/analysis \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "blink_rate": 15.5,
    "incomplete_blinks": 2,
    "squint_count": 5,
    "sclera_redness_level": 25.0,
    "tear_film_quality": 80.0,
    "session_duration_minutes": 30
  }'
```

## Submit Lens Data
```bash
curl -X POST http://localhost:5000/api/lens/data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "lens_type": "glasses",
    "lens_brand": "Ray-Ban",
    "purchase_date": "2024-01-15",
    "prescription_od_sph": -2.5,
    "prescription_os_sph": -2.75,
    "baseline_vision_score": 90.0
  }'
```

## Get Lens Effectiveness
```bash
curl http://localhost:5000/api/lens/effectiveness \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Submit Lifestyle Log
```bash
curl -X POST http://localhost:5000/api/lifestyle/log \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "log_date": "2024-12-10",
    "screen_time_hours": 8.5,
    "sleep_hours": 7.0,
    "lighting_condition": "mixed",
    "activity_level": "moderate",
    "breaks_taken": 4,
    "eye_strain_level": 5
  }'
```

## Get Trend Data
```bash
curl "http://localhost:5000/api/trend/?days=30" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Get Vision Prediction
```bash
curl http://localhost:5000/api/trend/prediction \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Get Health Summary
```bash
curl "http://localhost:5000/api/trend/summary?days=7" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Get Alerts
```bash
curl http://localhost:5000/api/alerts/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Generate PDF Report
```bash
curl "http://localhost:5000/api/report/?days=30&format=pdf" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  --output report.pdf
```

## Get Report as JSON
```bash
curl "http://localhost:5000/api/report/?days=30&format=json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Get Lifestyle Correlations
```bash
curl "http://localhost:5000/api/lifestyle/correlations?days=30" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
