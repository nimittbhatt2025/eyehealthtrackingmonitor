# Vision Test Distance Requirements - Quick Reference

## Distance Zones & Test Mapping

### 📍 Near Zone (30-40cm / 12-16 inches)
**Purpose**: Macular health, fine detail, color discrimination

| Test | Distance | Tolerance | Clinical Reason |
|------|----------|-----------|-----------------|
| Amsler Grid | 33cm (13") | ±3cm | Tests central 20° of macula; too far = grid too small for distortion detection |
| Color Vision (Ishihara) | 35cm (14") | ±5cm | Standard distance for cone processing of color dots |
| Contrast Sensitivity | 40cm (16") | ±5cm | Reading distance simulation for gray-on-white discrimination |
| Red Glow/Bruckner | 30cm (12") | ±5cm | Camera proximity needed for retinal reflex capture |

### 🔍 Arm's Length Zone (50-65cm / 20-25 inches)
**Purpose**: Ergonomics, ciliary muscle (focusing) health

| Test | Distance | Tolerance | Clinical Reason |
|------|----------|-----------|-----------------|
| Eye Burnout Meter | 60cm (24") | ±10cm | Measures ciliary muscle strain at actual working distance |
| Ocular Ergonomics | 60cm (24") | ±10cm | Standard ergonomic distance between eyes and monitor |
| Peripheral Trainer | 50cm (20") | ±10cm | Close enough that screen edges hit peripheral field |

### 📏 Standardized Zone (100cm / 40 inches)
**Purpose**: Distance acuity simulation

| Test | Distance | Tolerance | Clinical Reason |
|------|----------|-----------|-----------------|
| Visual Acuity | 100cm (40") | ±10cm | Simulates 20ft with DPI-scaled letters (5 arcminutes for 20/20) |
| Peripheral Field | 45cm (18") | ±5cm | User must lock nose in center so objects appear at fixed angles |

---

## Implementation Code Snippets

### Near Zone Example (Color Vision - 35cm)
```jsx
<InlineDistanceCalibration
  testType="color_vision"
  optimalDistanceMM={350}
  toleranceMM={50}
  testName="Color Vision Test"
/>
```

### Arm's Length Example (Eye Burnout - 60cm)
```jsx
<InlineDistanceCalibration
  testType="ocular_ergonomics"
  optimalDistanceMM={600}
  toleranceMM={100}
  testName="Eye Burnout Meter"
/>
```

### Standardized Example (Visual Acuity - 100cm)
```jsx
<InlineDistanceCalibration
  testType="visual_acuity"
  optimalDistanceMM={1000}
  toleranceMM={100}
  testName="Visual Acuity Test"
/>
```

---

## Visual Acuity Letter Scaling (LogMAR at 1 meter)

For proper 20/20 testing at 100cm distance:

| Snellen | LogMAR | Letter Height (mm) | Pixels @ 3.78 PPM | Description |
|---------|--------|-------------------|-------------------|-------------|
| 20/200 | 1.0 | 14.54mm | 55px | Legally blind threshold |
| 20/100 | 0.7 | 7.27mm | 27px | Very large print |
| 20/40 | 0.3 | 2.91mm | 11px | Most DMV requirements |
| 20/20 | 0.0 | **1.45mm** | **5.48px** | Standard "Normal" Vision |
| 20/15 | -0.1 | 1.09mm | 4px | Superior vision |

**Formula**: 
```
Physical height (mm) = (Distance (m) × tan(5 arcminutes)) × 1000
Pixels = Physical height (mm) × PPM (pixels per mm)
PPM = Calibrated pixel width / Known physical width (credit card = 85.6mm)
```

---

## Distance Validation Logic

### Tolerance Levels by Test Type

| Test Criticality | Tolerance | Tests |
|-----------------|-----------|-------|
| 🔴 **Very Strict** | ±3cm | Amsler Grid |
| 🟠 **Strict** | ±5cm | Visual Acuity, Color Vision, Red Glow |
| 🟡 **Moderate** | ±10cm | Contrast Sensitivity, Peripheral Field |
| 🟢 **Relaxed** | ±15cm | Eye Burnout, Ocular Ergonomics, Peripheral Trainer |

### Feedback Color Coding

```javascript
const distanceDiff = Math.abs(currentDistance - optimalDistance)

if (distanceDiff <= toleranceMM) {
  // 🟢 GREEN - Perfect distance
  return { color: 'green', message: 'Perfect distance!' }
} else if (distanceDiff <= toleranceMM * 1.5) {
  // 🟠 ORANGE - Close enough but suboptimal
  return { color: 'orange', message: 'Almost there...' }
} else if (distanceDiff <= toleranceMM * 2) {
  // 🔵 BLUE - Too far off
  return { color: 'blue', message: 'Move closer/farther' }
} else {
  // 🔴 RED - Critical error
  return { color: 'red', message: 'Distance too far off!' }
}
```

---

## Auto-Progression Requirements

To prevent false positives from user movement:

```javascript
const STABILITY_DURATION = 2 // seconds
const DETECTION_INTERVAL = 100 // milliseconds
const REQUIRED_VALID_FRAMES = STABILITY_DURATION * 1000 / DETECTION_INTERVAL // = 20 frames

// User must maintain valid distance for 20 consecutive frames before auto-advance
if (validFrameCount >= REQUIRED_VALID_FRAMES) {
  setTimeout(() => {
    setTestState('instructions')
  }, 2000) // Additional 2s delay for smooth transition
}
```

---

## Integration Priority

### ⚠️ HIGH PRIORITY (Critical Distance Requirements)
1. **Visual Acuity Test** - 100cm (most distance-sensitive)
2. **Amsler Grid** - 33cm (very precise distance needed)
3. **Color Vision Test** - 35cm ✅ **IMPLEMENTED**

### 🔶 MEDIUM PRIORITY (Moderate Distance Requirements)
4. **Contrast Sensitivity** - 40cm
5. **Peripheral Field** - 45cm
6. **Red Glow/Bruckner** - 30cm

### 🔷 LOWER PRIORITY (More Flexible)
7. **Eye Burnout Meter** - 60cm
8. **Ocular Ergonomics** - 60cm
9. **Peripheral Trainer** - 50cm

---

## Testing Checklist

Before marking a test as "distance-calibrated":

- [ ] Distance gate appears before test instructions
- [ ] Camera initializes and detects face
- [ ] Distance feedback shows correct colors (green when in range)
- [ ] Progress bar fills when user holds position
- [ ] Auto-advances to instructions after 2 seconds of stability
- [ ] "Move closer/farther" messages are clear
- [ ] Distance tolerance is appropriate for test criticality
- [ ] Skip button removed (production only)
- [ ] Test works on laptop, external monitor, and tablet
- [ ] Graceful fallback if camera unavailable

---

## Common Issues & Solutions

### Issue: Distance always shows "Too Close"
**Solution**: Lower `optimalDistanceMM` or increase `toleranceMM`

### Issue: Face not detected in bright light
**Solution**: Adjust lighting or lower `scoreThreshold` in TinyFaceDetectorOptions

### Issue: Distance jumps around randomly
**Solution**: Increase `STABILITY_DURATION` requirement (e.g., 3 seconds instead of 2)

### Issue: User has no camera
**Solution**: Add fallback message:
```jsx
if (!cameraAvailable) {
  return (
    <div className="text-center p-8">
      <p>This test requires a camera for distance calibration.</p>
      <p>Please use a device with a camera or contact support.</p>
    </div>
  )
}
```

---

## API for distanceCalibration.js

```javascript
import distanceCalibration from '../utils/distanceCalibration'

// Get optimal distance for a test
const optimalDistance = distanceCalibration.OPTIMAL_DISTANCES['visual_acuity'] // 6000mm

// Calibrate using IPD measurement
distanceCalibration.calibrate(pixelIPD, knownDistanceMM)

// Get current distance
const distance = distanceCalibration.getDistance(currentPixelIPD)

// Get feedback for display
const feedback = distanceCalibration.getDistanceFeedback(distance, 'color_vision')
// Returns: { status, severity, message, action, bgColor, textColor, borderColor }
```

---

## Production Deployment Checklist

Before pushing to production:

1. **Remove Debug Features**
   - [ ] Remove "Skip calibration" buttons
   - [ ] Remove console.log statements
   - [ ] Remove grayscale preview toggles

2. **Add Analytics**
   - [ ] Track calibration completion rate
   - [ ] Track average time to achieve correct distance
   - [ ] Track camera permission denial rate

3. **User Experience**
   - [ ] Add help video/tutorial for first-time users
   - [ ] Add "Calibration failed? Click here" support link
   - [ ] Test on 5+ different devices
   - [ ] Add loading skeleton for camera initialization

4. **Performance**
   - [ ] Verify models load from CDN (not bundled)
   - [ ] Optimize video resolution (640x480 is sufficient)
   - [ ] Add lazy loading for face-api library

5. **Accessibility**
   - [ ] Add screen reader announcements for distance feedback
   - [ ] Add keyboard navigation (Esc to cancel)
   - [ ] Add ARIA labels to video and feedback elements

---

**Last Updated**: February 12, 2026  
**Status**: Color Vision Test implemented with 35cm distance gate ✅  
**Next**: Visual Acuity Test (100cm) and Amsler Grid (33cm)
