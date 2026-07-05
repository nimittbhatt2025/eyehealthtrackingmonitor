# 🧪 Quick Test Guide - Eye Tracking Analysis

## 🚀 How to Access

### Option 1: Direct URL
```
http://localhost:3000/eye-tracking-analysis
```

### Option 2: Through UI
1. Go to http://localhost:3000
2. Login with: **demo@eyevio.com** / **Demo123!**
3. Click **Vision Tests** (sidebar or dashboard)
4. Find **Eye Tracking Analysis** card
5. Click **Start Test**

---

## ✅ What to Expect

### **Screen 1: Instructions**
- Clear setup guide (distance, lighting, head stability)
- What metrics will be measured
- Duration notice (5 minutes)
- **Blue "Start Eye Tracking Session" button**

### **Screen 2: Live Tracking (5 minutes)**
- Webcam feed (you should see yourself)
- **Green/Red indicator**: "Face Detected" / "No Face Detected"
- **Timer**: Counts down from 5:00
- **Progress bar**: Fills up as session progresses

**Real-time Metrics Cards:**
1. **Blink Rate** (e.g., "15 /min") - Normal: 12-20/min
2. **Total Blinks** (e.g., "76")
3. **Avg Duration** (e.g., "250 ms") - Normal: 100-300ms
4. **Fatigue Score** (e.g., "25 /100") - Color coded

### **Screen 3: Results**
- Large fatigue score with color coding:
  - Green (0-30): Normal
  - Yellow (31-60): Mild Strain
  - Red (61-100): High Fatigue
- **Detailed metrics** comparison
- **Recommendation** box with personalized advice
- **View Dashboard** and **View Trends** buttons

---

## 🎯 Test Scenarios

### **Scenario 1: Normal Eyes (Expected: Score 0-30)**
1. Sit 50-70cm from screen
2. Ensure good lighting (face light source)
3. Blink naturally (don't think about it)
4. Keep head relatively still
5. Look at screen normally

**Expected Results:**
- Blink Rate: 12-20/min
- Avg Duration: 100-300ms
- Fatigue Score: 0-30 (Green)
- Status: "Normal"
- Recommendation: "Your eyes are healthy!"

---

### **Scenario 2: Eye Strain (Expected: Score 31-60)**
1. Start the test
2. **Reduce blinking** - try to stare without blinking
3. Only blink when absolutely necessary (< 10 times/min)

**Expected Results:**
- Blink Rate: <10/min (too low)
- Fatigue Score: 31-60 (Yellow)
- Status: "Mild Strain"
- Recommendation: "Consider taking breaks..."

---

### **Scenario 3: High Fatigue (Expected: Score 61-100)**
1. Start the test
2. **Blink frequently** - 25+ times per minute
3. **Blink slowly** - close eyes for 400-500ms
4. Reduce eye movements

**Expected Results:**
- Blink Rate: >25/min (too high)
- Avg Duration: >300ms (prolonged)
- Fatigue Score: 61-100 (Red)
- Status: "High Fatigue"
- Recommendation: "High eye fatigue detected. Take a 10-minute break..."

---

## 🔍 What to Verify

### ✅ **Technical Checks**
- [ ] Camera permission prompt appears
- [ ] Webcam feed shows your face
- [ ] Face detection indicator turns **green** when face in view
- [ ] Face detection turns **red** when you move away
- [ ] Metrics update in real-time (numbers change)
- [ ] Timer counts down from 5:00
- [ ] Progress bar advances smoothly
- [ ] Blinks are detected (Total Blinks increases)
- [ ] Session auto-completes after 5 minutes
- [ ] Results screen shows all data
- [ ] "View Dashboard" button works
- [ ] "View Trends" button works

### ✅ **Data Accuracy**
- [ ] Blink counter increases when you blink
- [ ] Blink rate is reasonable (10-25/min range)
- [ ] Avg duration is 100-400ms range
- [ ] Fatigue score changes based on behavior
- [ ] Different scenarios produce different scores

### ✅ **Backend Integration**
- [ ] Test result saves to database
- [ ] Can view test in Dashboard
- [ ] Can view test in Trends page
- [ ] Test appears in Recent Tests list

---

## 🐛 Troubleshooting

### **Camera Not Starting**
1. Check browser permissions (camera allowed)
2. Close other apps using camera (Zoom, Teams, etc.)
3. Try different browser (Chrome recommended)
4. Check console for errors (F12)

### **Face Not Detected**
1. Ensure good lighting (face the light)
2. Remove glasses (or keep them on consistently)
3. Position face 50-70cm from screen
4. Make sure face is fully in frame

### **Metrics Not Updating**
1. Open console (F12)
2. Look for errors starting with `[MediaPipe]` or `[Eye Tracker]`
3. Check if MediaPipe loaded: Type in console:
   ```javascript
   typeof FaceMesh
   ```
   Should return: `"function"`

### **Blinks Not Counted**
1. Blink normally (not too fast)
2. Complete blinks (close eyes fully)
3. Check "Avg Duration" - should be 100-300ms
4. If 0, MediaPipe might not be detecting eyes

---

## 🖥️ Browser Console Commands

### **Check MediaPipe Status**
```javascript
// Should show "function" if loaded
console.log(typeof FaceMesh)
console.log(typeof Camera)
```

### **Check Tracker State** (on tracking page)
```javascript
// View current metrics
console.log(metrics)

// Check if tracking
console.log(isTracking)

// Check tracker instance
console.log(trackerRef.current)
```

### **Manual Camera Test**
```javascript
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    console.log('✅ Camera works:', stream)
    stream.getTracks().forEach(t => t.stop())
  })
  .catch(err => console.error('❌ Camera error:', err))
```

---

## 📊 Expected Console Output

### **During Session:**
```
🎯 Initializing MediaPipe FaceMesh...
✅ MediaPipe FaceMesh initialized
✅ Eye tracking started
👁️ Blink detected! Total: 1
👁️ Blink detected! Total: 2
👁️ Blink detected! Total: 3
...
📊 Session complete: { blinkRate: 15.2, fatigueScore: 25, ... }
✅ Session saved: { test_id: 123, ... }
```

### **If Errors Occur:**
```
❌ Failed to start eye tracking: [error message]
❌ Face not detected. Please stay in view.
❌ Failed to save session data
```

---

## 🎯 Success Criteria

### **Feature is Working If:**
1. ✅ Camera activates smoothly
2. ✅ Face detection works reliably
3. ✅ Blinks are counted accurately (±2 blinks)
4. ✅ Metrics update every second
5. ✅ Fatigue score reflects behavior
6. ✅ Session completes automatically
7. ✅ Results are comprehensive
8. ✅ Data saves to backend

### **Feature is Production-Ready If:**
1. ✅ Works in Chrome, Firefox, Safari
2. ✅ Handles poor lighting gracefully
3. ✅ Doesn't crash or freeze
4. ✅ Privacy-friendly (no video upload)
5. ✅ Clear error messages
6. ✅ Consistent results across runs
7. ✅ Mobile-friendly (future)

---

## 📝 Quick Notes for Demo

### **Selling Points:**
- "Uses Google's MediaPipe - same tech in Google Meet"
- "Eye Aspect Ratio algorithm - used in drowsiness detection"
- "All processing on-device - your video never leaves your computer"
- "5-minute session provides comprehensive fatigue analysis"
- "Research-backed thresholds (12-20 blinks/min is clinical standard)"

### **Wow Factors:**
- Live face detection indicator
- Real-time blink counting (watch it increment!)
- Color-coded fatigue scoring
- Professional recommendations
- Smooth, polished UI

---

## 🚀 Ready to Test!

**Start here:**
```
http://localhost:3000/eye-tracking-analysis
```

**Or login and navigate through UI.**

**Recommended test order:**
1. Quick normal run (5 min)
2. Try strain scenario (reduced blinking)
3. Check Dashboard to see saved results
4. Check Trends to see data integration

---

**Good luck! This is your best feature yet! 🎉👁️**
