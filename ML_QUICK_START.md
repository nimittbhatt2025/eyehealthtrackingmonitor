# EyeVio ML Quick Start Guide

## 🚀 Getting Started with ML Features

This guide will help you set up and test EyeVio's ML/AI features.

---

## Prerequisites

- Python 3.8+
- Webcam (for eye tracking features)
- PostgreSQL database running
- Backend dependencies installed

---

## Installation

### 1. Install ML Dependencies

```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio

# Activate virtual environment
source venv/bin/activate  # On macOS/Linux
# OR
venv\Scripts\activate  # On Windows

# Install new ML packages
pip install mediapipe>=0.10.0
pip install statsmodels>=0.14.0
pip install prophet>=1.1.0

# Verify installation
python -c "import mediapipe; import statsmodels; import pandas; print('✅ All ML packages installed')"
```

### 2. Verify Backend is Running

```bash
# Make sure PostgreSQL is running
# Start the Flask backend
python run.py
```

You should see:
```
* Running on http://127.0.0.1:5000
```

---

## Testing ML Features

### Test 1: Eye Blink Detection (Webcam Required)

Create a test file: `test_blink_detection.py`

```python
import cv2
import numpy as np
from app.ai_models.eye_analysis import process_webcam_session, detect_eyes

def test_live_webcam():
    """Test real-time blink detection"""
    print("🎥 Starting webcam...")
    print("👁️  Look at the camera and blink naturally for 10 seconds")
    
    cap = cv2.VideoCapture(0)
    frames = []
    
    # Capture 10 seconds at 30fps
    for i in range(300):
        ret, frame = cap.read()
        if ret:
            frames.append(frame)
            
            # Optional: Show live feed
            if i % 30 == 0:  # Every second
                print(f"Recording... {i//30}/10 seconds")
    
    cap.release()
    print("\n✅ Recording complete! Analyzing...")
    
    # Analyze
    result = process_webcam_session(frames=frames, fps=30)
    
    # Print results
    print("\n" + "="*50)
    print("📊 ANALYSIS RESULTS")
    print("="*50)
    print(f"Blink Rate: {result['blink_rate']:.1f} blinks/min")
    print(f"Total Blinks: {result['blink_count']}")
    print(f"  - Normal: {result['normal_blinks']}")
    print(f"  - Incomplete: {result['incomplete_blinks']}")
    print(f"  - Prolonged: {result['prolonged_blinks']}")
    print(f"\nAverage EAR: {result['avg_ear']:.3f}")
    print(f"Squint Count: {result['squint_count']}")
    print(f"\n🔋 FATIGUE SCORE: {result['fatigue_score']}/100")
    print(f"Level: {result['fatigue_level']}")
    print(f"💡 {result['recommendation']}")
    
    if result['fatigue_factors']:
        print(f"\n⚠️  Factors:")
        for factor in result['fatigue_factors']:
            print(f"  - {factor}")

if __name__ == "__main__":
    test_live_webcam()
```

Run it:
```bash
python test_blink_detection.py
```

### Test 2: Vision Drift Prediction

Create: `test_vision_prediction.py`

```python
from datetime import datetime, timedelta
from app.ai_models.prediction import predict_vision_drift_advanced

def test_prediction():
    """Test vision drift prediction"""
    
    # Simulate declining vision over 6 months
    base_date = datetime(2024, 6, 1)
    test_dates = [
        base_date,
        base_date + timedelta(days=30),
        base_date + timedelta(days=60),
        base_date + timedelta(days=90),
        base_date + timedelta(days=120),
        base_date + timedelta(days=150),
    ]
    
    # Scores showing gradual decline
    test_scores = [95.0, 93.0, 90.0, 87.0, 85.0, 82.0]
    
    print("📈 Testing Vision Drift Prediction")
    print("\nInput Data:")
    for date, score in zip(test_dates, test_scores):
        print(f"  {date.strftime('%Y-%m-%d')}: {score}")
    
    # Predict 30 days ahead
    result = predict_vision_drift_advanced(
        test_dates,
        test_scores,
        days_ahead=30,
        method='auto'
    )
    
    print("\n" + "="*50)
    print("🔮 PREDICTION RESULTS (30 days ahead)")
    print("="*50)
    print(f"Current Score: {result['current_score']}")
    print(f"Predicted Score: {result['predicted_score']:.1f}")
    print(f"Expected Change: {result['score_change']:+.1f}")
    print(f"\nTrend: {result['trend'].upper()}")
    print(f"Severity: {result['severity']}")
    print(f"Slope: {result['slope']:.4f} points/day")
    print(f"\nConfidence Interval:")
    print(f"  Lower: {result['confidence_interval']['lower']:.1f}")
    print(f"  Upper: {result['confidence_interval']['upper']:.1f}")
    print(f"\nModel Quality:")
    print(f"  R-squared: {result['r_squared']:.3f}")
    print(f"  Data Quality: {result['data_quality']}")
    print(f"  Method: {result['method_used']}")

if __name__ == "__main__":
    test_prediction()
```

Run it:
```bash
python test_vision_prediction.py
```

### Test 3: API Integration Test

Create: `test_ml_api.py`

```python
import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:5000/api"

def test_webcam_api():
    """Test webcam analysis API"""
    # You'll need to be logged in and have a valid token
    # This is a simplified example
    
    headers = {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
    }
    
    # Assuming you have a test video file
    data = {
        "duration": 10,
        "fps": 30
    }
    
    response = requests.post(
        f"{BASE_URL}/webcam/analyze",
        json=data,
        headers=headers
    )
    
    if response.status_code == 200:
        result = response.json()
        print(json.dumps(result, indent=2))
    else:
        print(f"Error: {response.status_code}")

def test_trend_api():
    """Test trend prediction API"""
    headers = {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
    }
    
    params = {
        "days_ahead": 30
    }
    
    response = requests.get(
        f"{BASE_URL}/trend/predict",
        params=params,
        headers=headers
    )
    
    if response.status_code == 200:
        result = response.json()
        print(json.dumps(result, indent=2))
    else:
        print(f"Error: {response.status_code}")

if __name__ == "__main__":
    print("Testing APIs...")
    # test_webcam_api()
    # test_trend_api()
```

---

## Understanding the Results

### Blink Rate Interpretation

| Rate (blinks/min) | Status | Meaning |
|-------------------|--------|---------|
| < 10 | ⚠️ Low | Possible dry eyes or fatigue |
| 10-15 | ⚡ Below Normal | Monitor for changes |
| 15-20 | ✅ Normal | Healthy blinking |
| 20-30 | ⚡ Above Normal | Possible irritation |
| > 30 | ⚠️ High | Check for environmental factors |

### Fatigue Score Interpretation

| Score | Level | Action |
|-------|-------|--------|
| 0-39 | ✅ Low | Continue monitoring |
| 40-69 | ⚠️ Moderate | Plan a break soon |
| 70-100 | 🔴 High | Take break immediately |

### Vision Trend Interpretation

| Trend | Slope | Meaning |
|-------|-------|---------|
| Declining (Significant) | < -0.1 | Rapid decline - see doctor |
| Declining (Moderate) | -0.1 to -0.05 | Monitor closely |
| Stable | -0.05 to 0.05 | No significant change |
| Improving (Moderate) | 0.05 to 0.1 | Positive progress |
| Improving (Significant) | > 0.1 | Strong improvement |

---

## Common Issues & Solutions

### Issue 1: MediaPipe Not Found
```
ImportError: No module named 'mediapipe'
```

**Solution:**
```bash
pip install --upgrade mediapipe
```

### Issue 2: Webcam Not Detected
```
ERROR: Cannot open webcam
```

**Solutions:**
- Check camera permissions in System Preferences (macOS)
- Try different camera index: `cv2.VideoCapture(1)` instead of `0`
- Verify camera works in other apps

### Issue 3: Low Prediction Confidence
```
r_squared: 0.23 (poor data quality)
```

**Solutions:**
- Need more data points (minimum 3, recommended 5+)
- Ensure tests are spaced appropriately (not all same day)
- Check for outliers in test scores

### Issue 4: High Fatigue Score Despite Good Conditions
```
fatigue_score: 85 (but user feels fine)
```

**Solutions:**
- Calibration may be needed for individual
- Check lighting conditions
- Ensure camera is at eye level
- Try different recording duration

---

## Next Steps

### 1. Frontend Integration
Update `WebcamAnalysis.jsx` to use new ML results:
```jsx
// Process results from backend
const analysis = await webcamAPI.analyzeSession(videoData)
setFatigueScore(analysis.fatigue_score)
setBlinkRate(analysis.blink_rate)
setRecommendation(analysis.recommendation)
```

### 2. Add Model Training
- Collect user feedback on predictions
- Implement feedback loop
- Retrain models periodically

### 3. Enhance Visualizations
- Real-time EAR graphs
- Blink timeline visualization
- Fatigue score trends over time

### 4. Add More Metrics
- Pupil dilation tracking
- Gaze direction analysis
- Head pose estimation
- Attention scoring

---

## Performance Optimization

### For Faster Processing
```python
# Reduce frame sampling
frames_subset = frames[::2]  # Every 2nd frame

# Lower resolution
frame_small = cv2.resize(frame, (640, 480))

# Disable unnecessary features
result = process_webcam_session(
    frames=frames,
    fps=30,
    include_redness=False,  # Skip redness analysis
    include_tear_film=False  # Skip tear film
)
```

### For Better Accuracy
```python
# Higher resolution
# Use original webcam resolution

# More frames
# Record for 30-60 seconds instead of 10

# Better lighting
# Ensure even, frontal lighting
```

---

## Resources

- [MediaPipe Documentation](https://google.github.io/mediapipe/)
- [EAR Algorithm Paper](https://vision.fe.uni-lj.si/cvww2016/proceedings/papers/05.pdf)
- [Statsmodels Documentation](https://www.statsmodels.org/)
- [Eye Fatigue Research](https://pubmed.ncbi.nlm.nih.gov/)

---

**Need Help?**
- Check logs in `eyevio/logs/`
- Run pytest for diagnostics: `pytest tests/test_ai_models.py -v`
- Review API examples in `eyevio/API_EXAMPLES.md`

---

**Last Updated**: December 12, 2025  
**Version**: 1.0.0
