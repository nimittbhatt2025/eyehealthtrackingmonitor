# Contrast Sensitivity Test - Quick Start

## What Was Added

A new **Contrast Sensitivity Test** that serves as an early warning system for Glaucoma, Cataracts, and other eye conditions. This test measures **functional vision** - your ability to see in low-contrast conditions.

## Key Features

### 🎯 Clinical Value
- **Early Detection**: Spots vision problems before standard eye charts
- **Functional Assessment**: Tests real-world vision, not just acuity
- **Disease Monitoring**: Tracks progression of glaucoma, cataracts, etc.

### 🧪 How It Works
1. Shows letters that fade into the background (9 contrast levels)
2. Adaptive testing - adjusts difficulty based on your responses
3. 18 trials total (~3-4 minutes)
4. Uses Pelli-Robson clinical methodology

### 📊 Scoring
- **85-100**: Excellent functional vision
- **70-84**: Good, continue monitoring
- **50-69**: Fair, schedule eye exam
- **0-49**: Needs attention - consult professional

## Access the Test

### Frontend
Navigate to: **Vision Tests** → **Contrast Sensitivity Test**

Or directly: `http://localhost:3000/vision-tests/contrast_sensitivity`

### Backend
Test results are saved to the `vision_tests` table with:
- `test_type`: `contrast_sensitivity`
- `score`: 0-100 functional vision score
- `test_details`: Full response data including threshold

## Files Modified/Created

### New Files
- `eyevio-frontend/src/pages/ContrastSensitivityTest.jsx` - Main test component
- `CONTRAST_SENSITIVITY_GUIDE.md` - Full documentation

### Modified Files
- `eyevio-frontend/src/pages/VisionTests.jsx` - Added test card
- `eyevio-frontend/src/App.jsx` - Added route
- `eyevio/app/routes/vision_test.py` - Added documentation

## Testing Instructions

1. **Start the servers** (already running):
   ```bash
   Frontend: http://localhost:3000
   Backend:  http://localhost:5002
   ```

2. **Navigate to the test**:
   - Login to your account
   - Go to "Vision Tests"
   - Click on "Contrast Sensitivity Test" (marked as "Advanced")

3. **Take the test**:
   - Read the instructions
   - Complete 18 trials
   - View your results and interpretation

4. **Verify data persistence**:
   - Check that results appear in test history
   - Verify score is calculated correctly
   - Ensure test_details JSON is saved

## Marketing Positioning

### Tagline Options
- "Beyond 20/20: Test Your Functional Vision"
- "Early Warning System for Eye Health"
- "See What Your Eye Doctor Sees"

### Key Messages
1. **You might have 20/20 vision but still struggle** with:
   - Night driving
   - Reading in dim light
   - Seeing faces in shadows

2. **Contrast sensitivity declines first** in conditions like:
   - Glaucoma (years before acuity loss)
   - Cataracts (early clouding detection)
   - Macular degeneration

3. **This is a sophisticated health metric** used by:
   - Optometrists for disease monitoring
   - Research studies for early detection
   - Athletes for performance optimization

## Next Steps

### Immediate
- [x] Test the implementation
- [ ] Gather user feedback
- [ ] Validate scoring thresholds

### Short-term
- [ ] Add screen calibration tool
- [ ] Implement separate eye testing
- [ ] Add age-adjusted norms
- [ ] Create export functionality for doctors

### Long-term
- [ ] Clinical validation study
- [ ] ML model for risk prediction
- [ ] Professional dashboard
- [ ] Integration with EHR systems

## Technical Details

### Color Calculation
The test dynamically calculates text color based on contrast level:
```javascript
const getTextColor = (contrast, bgColor = '#f5f5f5') => {
  const bgRGB = 245 // light gray background
  const foregroundValue = Math.round(bgRGB - (bgRGB * contrast))
  return `rgb(${foregroundValue}, ${foregroundValue}, ${foregroundValue})`
}
```

### Adaptive Algorithm
- Starts at high contrast (easy)
- Success → decrease contrast (harder)
- Failure → increase contrast (easier)
- Finds threshold where user maintains ~50% accuracy

### Data Structure
```json
{
  "test_type": "contrast_sensitivity",
  "score": 85,
  "test_details": {
    "threshold_logCS": 1.6,
    "total_trials": 18,
    "responses": [
      {
        "level": 3,
        "contrast": 0.4,
        "letter": "K",
        "userAnswer": "K",
        "correct": true,
        "responseTime": 1200
      }
    ]
  }
}
```

## Support

For issues or questions:
1. Check browser console for errors
2. Verify backend is running on port 5002
3. Check `/tmp/backend.log` and `/tmp/frontend.log`
4. Review `CONTRAST_SENSITIVITY_GUIDE.md` for details

---

**Status**: ✅ Ready to test
**Version**: 1.0.0
**Estimated Test Time**: 3-4 minutes
