# Distance Calibration Gate - Implementation Guide

## Overview
The Distance Calibration Gate is a **blocking component** that ensures users are at the correct distance from their screen before starting any vision test. This is critical for test accuracy, as different tests require different viewing distances based on clinical standards.

## How It Works

### 1. Distance Gate Flow
```
User clicks test → Distance Gate appears → User adjusts position → 
System validates distance for 2 seconds → Auto-proceeds to test instructions
```

### 2. Key Features
- **Blocks test execution** until correct distance is achieved
- **Face detection** using @vladmandic/face-api (no physical objects needed)
- **Real-time visual feedback** (color-coded borders, arrows, progress bars)
- **Test-specific optimal distances** (35cm for color vision vs 100cm for visual acuity)
- **Tolerance zones** (±5cm to ±10cm depending on test criticality)
- **2-second stability requirement** (prevents false positives from movement)
- **Auto-progression** (automatically moves to next screen when distance is valid)

### 3. Clinical Distance Standards

#### Near Zone (30-40cm / 12-16 inches)
Used for macular and fine detail assessment:
- **Amsler Grid**: 33cm (14") - Tests central 20° of macula
- **Ishihara/Color Vision**: 35cm (14") - Standard for dot discrimination
- **Contrast Sensitivity**: 40cm (16") - Reading distance simulation
- **Red Glow/Bruckner**: 30cm (12") - Camera needs close proximity

#### Arm's Length Zone (50-65cm / 20-25 inches)
Used for ergonomics and ciliary muscle testing:
- **Eye Burnout Meter**: 60cm (24") - Actual working distance
- **Ocular Ergonomics**: 60cm (24") - Standard monitor distance
- **Peripheral Trainer**: 50cm (20") - Close enough for peripheral vision

#### Standardized Zone (100cm / 40 inches)
Used for acuity tests requiring distance simulation:
- **Visual Acuity**: 100cm (40") - Simulates 20ft with scaled letters
- **Peripheral Field**: 45cm (18") - Locked center gaze required

---

## Implementation in Color Vision Test

### Step 1: Import the Component
```jsx
import InlineDistanceCalibration from '../components/InlineDistanceCalibration'
```

### Step 2: Add State Variables
```jsx
const [testState, setTestState] = useState('distance-gate') // Start with distance gate
const [distanceValid, setDistanceValid] = useState(false)
```

### Step 3: Create Distance Gate Render Function
```jsx
const renderDistanceGate = () => (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-6 px-4">
    <div className="max-w-4xl mx-auto">
      <InlineDistanceCalibration
        testType="color_vision"
        optimalDistanceMM={350} // 35cm "near" zone
        toleranceMM={50} // ±5cm tolerance
        testName="Color Vision Test"
        blockUntilValid={true}
        onDistanceValid={(valid) => {
          if (valid && !distanceValid) {
            setDistanceValid(true)
            // Wait 2 seconds after successful distance lock, then proceed
            setTimeout(() => {
              setTestState('instructions')
            }, 2000)
          }
        }}
        onDistanceInvalid={() => {
          setDistanceValid(false)
        }}
      />

      {/* Skip button for testing */}
      <div className="mt-8 text-center">
        <button
          onClick={() => setTestState('instructions')}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Skip calibration (for testing only)
        </button>
      </div>
    </div>
  </div>
)
```

### Step 4: Add to Main Render
```jsx
return (
  <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 py-12 px-4">
    <div className="max-w-7xl mx-auto">
      {testState === 'distance-gate' && renderDistanceGate()}
      {testState === 'instructions' && renderInstructions()}
      {testState === 'testing' && renderTesting()}
      {testState === 'results' && renderResults()}
    </div>
  </div>
)
```

---

## Props Reference

### `<InlineDistanceCalibration>` Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `testType` | string | No | 'default' | Test identifier for distance feedback system |
| `optimalDistanceMM` | number | No | 500 | Target distance in millimeters (500mm = 50cm) |
| `toleranceMM` | number | No | 100 | Acceptable deviation from optimal (±10cm) |
| `testName` | string | No | 'This Test' | Display name shown in header |
| `blockUntilValid` | boolean | No | true | Whether to blur/block until valid distance |
| `onDistanceValid` | function | No | undefined | Callback when user reaches valid distance |
| `onDistanceInvalid` | function | No | undefined | Callback when user leaves valid distance |

### Example Configurations

#### Visual Acuity Test (Critical Distance)
```jsx
<InlineDistanceCalibration
  testType="visual_acuity"
  optimalDistanceMM={1000} // 100cm
  toleranceMM={100} // ±10cm (strict)
  testName="Visual Acuity Test"
/>
```

#### Amsler Grid (Very Precise)
```jsx
<InlineDistanceCalibration
  testType="amsler_grid"
  optimalDistanceMM={330} // 33cm
  toleranceMM={30} // ±3cm (very strict)
  testName="Amsler Grid"
/>
```

#### Peripheral Awareness (More Flexible)
```jsx
<InlineDistanceCalibration
  testType="peripheral_awareness"
  optimalDistanceMM={500} // 50cm
  toleranceMM={150} // ±15cm (relaxed)
  testName="Peripheral Vision Test"
/>
```

---

## Integration Checklist

To add distance gate to a new test:

- [ ] Import `InlineDistanceCalibration` component
- [ ] Add `testState = 'distance-gate'` initial state
- [ ] Add `distanceValid` state variable
- [ ] Create `renderDistanceGate()` function
- [ ] Configure test-specific distance (see clinical standards above)
- [ ] Add auto-progression logic in `onDistanceValid`
- [ ] Add distance gate to main render routing
- [ ] Test with real camera to verify accuracy
- [ ] Remove "skip calibration" button before production

---

## Technical Details

### Face Detection
- **Library**: @vladmandic/face-api (maintained fork, better TensorFlow compatibility)
- **Models**: TinyFaceDetector + FaceLandmark68Net (~550KB total)
- **Detection Rate**: 100ms intervals (10 FPS)
- **IPD Measurement**: Eye landmarks 36-48 (6 points per eye)
- **Auto-Calibration**: Assumes 40cm starting distance on first face detection

### Distance Calculation
- **Method**: Triangle similarity (D = W × F / P)
- **W**: Real-world IPD (63mm average, 54-74mm range)
- **F**: Focal length (calibrated pixel distance at known distance)
- **P**: Current pixel distance between eyes
- **Accuracy**: ±5-10cm depending on lighting and face angle

### Stability Requirements
- **Valid Duration**: 2 seconds (20 consecutive readings at 100ms intervals)
- **Purpose**: Prevents false positives from user movement
- **Visual Feedback**: Progress bar shows 0-100% stability
- **Auto-Advance**: Automatically proceeds when stable

### Feedback System
Color-coded distance feedback:
- 🟢 **Green**: Perfect distance (within tolerance)
- 🟠 **Orange**: Slightly off (within 20% of tolerance)
- 🔵 **Blue**: Too far (move closer)
- 🔴 **Red**: Critical distance error

---

## Example: Adding to Visual Acuity Test

```jsx
// VisualAcuityTest.jsx

import InlineDistanceCalibration from '../components/InlineDistanceCalibration'

const VisualAcuityTest = () => {
  const [testState, setTestState] = useState('distance-gate')
  const [distanceValid, setDistanceValid] = useState(false)

  const renderDistanceGate = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-6 px-4">
      <div className="max-w-4xl mx-auto">
        <InlineDistanceCalibration
          testType="visual_acuity"
          optimalDistanceMM={1000} // 100cm - critical for 20/20 accuracy
          toleranceMM={100} // ±10cm
          testName="Visual Acuity Test"
          blockUntilValid={true}
          onDistanceValid={(valid) => {
            if (valid && !distanceValid) {
              setDistanceValid(true)
              setTimeout(() => {
                setTestState('monocular-selection') // Next screen
              }, 2000)
            }
          }}
        />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      {testState === 'distance-gate' && renderDistanceGate()}
      {testState === 'monocular-selection' && renderMonocularSelection()}
      {/* ... rest of test states ... */}
    </div>
  )
}
```

---

## Testing the Distance Gate

1. **Start the frontend**: `npm run dev`
2. **Navigate to Color Vision Test** from homepage
3. **Allow camera access** when prompted
4. **Position yourself at ~35cm** from screen
5. **Verify face detection** (green indicator appears)
6. **Watch distance feedback** (should show green border when correct)
7. **Hold position for 2 seconds** (progress bar fills up)
8. **Auto-advance to instructions** (after stability confirmed)

### Troubleshooting
- **No face detected**: Ensure adequate lighting and face is fully visible
- **Distance incorrect**: Try moving closer/farther based on arrows
- **Camera not starting**: Check browser permissions (chrome://settings/content/camera)
- **Models not loading**: Verify `/public/models/` directory has 4 files

---

## Next Steps

1. ✅ **Color Vision Test**: Distance gate implemented (35cm)
2. ⏳ **Visual Acuity Test**: Add distance gate (100cm) - HIGH PRIORITY
3. ⏳ **Amsler Grid Test**: Add distance gate (33cm) - HIGH PRIORITY
4. ⏳ **Contrast Sensitivity**: Add distance gate (40cm)
5. ⏳ **Peripheral Tests**: Add distance gate (50cm)
6. ⏳ **Eye Burnout Meter**: Add distance gate (60cm)

---

## Files Modified

- ✅ `/src/components/InlineDistanceCalibration.jsx` - Created distance gate component
- ✅ `/src/pages/ColorVisionTest.jsx` - Added distance gate integration
- ⏳ `/src/pages/VisualAcuityTest.jsx` - Pending integration
- ⏳ `/src/pages/AmslerGridTest.jsx` - Pending integration

---

## Clinical References

The distance standards are based on:
1. **Ishihara Color Vision Test**: Standard viewing distance of 75cm (converted to 35cm for web with scaled plates)
2. **Snellen Visual Acuity**: 20 feet (6m) standard, simulated at 1m with DPI-scaled letters
3. **Amsler Grid**: 33cm (arm's length) for central field testing
4. **Ergonomic Standards**: OSHA recommends 50-65cm monitor distance

---

## Production Considerations

Before deploying to production:
1. Remove "Skip calibration" buttons
2. Add analytics tracking for calibration completion rates
3. Add "Need help?" button linking to calibration tutorial video
4. Consider adding phone number for support if calibration fails repeatedly
5. Test on multiple devices (laptop, tablet, external monitors)
6. Add fallback message if camera is unavailable (suggest moving to device with camera)
