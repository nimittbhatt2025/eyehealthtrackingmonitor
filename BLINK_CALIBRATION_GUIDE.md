# Blink Detection Calibration System

## Problem
The default blink detection was counting 17-29 blinks when you only did 9-10. This happens because:
- Everyone's eyes are different shapes
- Different people have different EAR (Eye Aspect Ratio) values
- A one-size-fits-all threshold doesn't work well

## Solution: Personalized Calibration

I've created a calibration system that learns YOUR specific eye characteristics.

---

## How It Works

### Step 1: Baseline Collection (5 seconds)
- Look at the camera normally with eyes open
- System records your "normal eyes open" EAR values
- Need at least 30 samples (~1 second at 30fps)

### Step 2: Blink Collection 
- Perform 10 slow, deliberate blinks
- System records your "eyes closed" EAR values
- Only counts frames where eyes are actually closed

### Step 3: Calculate Personal Threshold
The system calculates a threshold specifically for YOU:
```
threshold = (blink_mean + (baseline_mean - 2*std)) / 2
```

This finds the sweet spot between your normal eyes and your blinks.

---

## API Endpoints Created

### 1. Start Calibration
```bash
POST /api/calibration/start
Authorization: Bearer <token>
```

### 2. Add Baseline Samples (eyes open)
```bash
POST /api/calibration/baseline
Authorization: Bearer <token>
Content-Type: application/json

{
  "frame": "data:image/jpeg;base64,..."
}
```

### 3. Add Blink Samples (during blinks)
```bash
POST /api/calibration/blink
Authorization: Bearer <token>
Content-Type: application/json

{
  "frame": "data:image/jpeg;base64,..."
}
```

### 4. Finalize & Get Personalized Threshold
```bash
POST /api/calibration/finalize
Authorization: Bearer <token>
```

Returns:
```json
{
  "success": true,
  "threshold": 0.142,
  "baseline_mean": 0.285,
  "blink_mean": 0.112,
  "confidence": "excellent"
}
```

### 5. Check Status
```bash
GET /api/calibration/status
Authorization: Bearer <token>
```

---

## Next Steps for Frontend

You need to create a calibration page in the React app:

### Calibration Flow:

1. **Welcome Screen**
   - "Let's calibrate blink detection for your eyes!"
   - "This takes about 30 seconds"
   - Start button

2. **Step 1: Baseline (5 seconds)**
   - Show webcam feed
   - "Look at the camera normally, keep eyes open"
   - Progress bar (0-5 seconds)
   - Auto-capture frames and send to `/baseline` endpoint

3. **Step 2: Blink Collection**
   - "Now blink 10 times slowly and deliberately"
   - Counter: "Blinks detected: X/10"
   - Capture frames during blinks, send to `/blink` endpoint

4. **Step 3: Results**
   - Call `/finalize` endpoint
   - Show results:
     - ✅ "Calibration successful!"
     - "Your personalized threshold: 0.142"
     - "Confidence: Excellent"
   - Save button (stores to user profile)

5. **Step 4: Test**
   - "Let's test it! Blink 5 times"
   - Show real-time count
   - "Perfect! Counted 5/5 blinks"

---

## How to Use in Webcam Analysis

Once calibrated, the webcam analysis should use the personalized threshold:

```python
from app.ai_models.blink_calibration import AdaptiveBlinkDetector

# Get user's calibrated threshold from database
user_threshold = user.blink_threshold or 0.15  # fallback to default

# Create detector with personalized threshold
detector = AdaptiveBlinkDetector(personalized_threshold=user_threshold)

# For each frame:
for frame in frames:
    eye_data = detect_eyes(frame)
    if eye_data.get('detected'):
        ear = eye_data.get('avg_ear')
        blink_detected, metadata = detector.detect_blink(ear)
        
        if blink_detected:
            print(f"Blink detected! Total: {detector.blink_count}")

# Get final stats
stats = detector.get_statistics()
blink_rate = detector.get_blink_rate(duration_seconds)
```

---

## Database Changes Needed

Add to `User` model:
```python
blink_threshold = db.Column(db.Float)  # Personalized blink detection threshold
blink_calibrated_at = db.Column(db.DateTime)  # When calibration was done
```

---

## Benefits

- **Accurate**: Calibrated specifically for YOUR eyes
- **Adaptive**: Can be recalibrated anytime
- **Confidence Score**: Tells you how good the calibration is
- **Fallback**: Still works with default threshold if not calibrated

---

## Testing

To test the calibration:

1. Start backend: `./start.sh`
2. Create calibration UI in React
3. Go through calibration flow
4. Run webcam analysis with new threshold
5. Should now count blinks accurately!

---

## Why This is Better Than "Training an AI Model"

You suggested training an AI model, which is a good idea, but:
- **Requires lots of data**: Need 1000s of labeled blink videos
- **Takes time**: Training takes hours/days
- **Overkill**: This is a simpler problem that calibration solves well
- **Personalized**: This is calibrated per-user, AI model would be generic

The calibration approach gives you:
- ✅ Personalized accuracy
- ✅ Works immediately (30 seconds)
- ✅ No training data needed
- ✅ Can recalibrate anytime
- ✅ Lightweight and fast

---

## What I Built

1. **BlinkCalibrator class**: Collects baseline and blink samples, calculates threshold
2. **AdaptiveBlinkDetector class**: Uses personalized threshold for detection
3. **Calibration API endpoints**: 5 endpoints for the full calibration flow
4. **Validation logic**: Ensures blinks are valid (not too long, not too soon)

Now you just need to build the frontend UI for the calibration flow!
