# 🏥 EYEVIO PROFESSIONAL ROADMAP
## AI Vision Monitoring & Early Detection Platform

**Positioning:** "A vision early-warning and monitoring system for functional vision changes."

---

## 📊 CURRENT STATUS AUDIT

### ✅ What You Have (Good Foundation)
- **Distance Calibration** (`DistanceCalibration.jsx`) - Credit card method ✓
- **Blink Calibration** (`BlinkCalibration.jsx`) - Personalized threshold ✓  
- **Contrast Sensitivity Test** - Pelli-Robson inspired ✓
- **Peripheral Awareness** - With MediaPipe eye tracking ✓
- **Ocular Ergonomics Monitor** - Lighting/distance/posture ✓
- **Accommodative Lag Test** - Near-work analysis ✓
- **Red Reflex Test** (exists but needs reframing) ⚠️
- **Glaucoma Screen** (peripheral field test) ✓
- **Cataract Test** (glare sensitivity) ⚠️

### ❌ What's Missing (Priority Gaps)
1. **Phase 0: Universal Calibration System** (CRITICAL)
   - No unified pre-test calibration flow
   - Missing ambient lighting check
   - No screen brightness normalization
   - No reliability scoring engine

2. **Phase 1 MVP: Core Tests Need Upgrades**
   - **Visual Acuity** - Not found! (Highest priority)
   - **Color Vision** - Not found! (Second priority)
   - **Amsler Grid** - Not found!
   - **Contrast Sensitivity** - Exists but needs LogMAR scoring
   - **Peripheral Vision** - Good but needs fixation control

3. **Safe Language & Compliance**
   - Tests use diagnostic language ("Glaucoma Test", "Cataract Test")
   - Need reframing to functional assessments
   - Missing confidence scoring
   - No "triage logic" (Stable/Monitor/Seek Care)

---

## 🎯 IMPLEMENTATION ROADMAP

## PHASE 0: FOUNDATIONS (MUST DO FIRST)

### 1. Universal Calibration Engine ⭐ **CRITICAL**
**Status:** Partial - needs consolidation

**What to Build:**
```
📁 eyevio-frontend/src/components/UniversalCalibration.jsx
```

**Must Include:**
- ✅ Screen size calibration (credit card - you have this)
- ✅ Viewing distance verification (40cm standard - you have this)
- ⚠️ **NEW:** Ambient lighting check (webcam brightness analysis)
- ⚠️ **NEW:** Screen brightness normalization prompt
- ⚠️ **NEW:** Environment quality score (optimal/acceptable/poor)
- ⚠️ **NEW:** Save calibration profile to user settings

**Technical Approach:**
```javascript
// Measure ambient light from webcam
const measureAmbientLight = () => {
  // Use existing OcularErgonomicsMonitor.measureAmbientLight()
  // Target: 300-500 lux (≈ 100-150 brightness value)
}

// Check screen brightness
const checkScreenBrightness = () => {
  // Show white screen, ask user to confirm visibility
  // Recommend 50-70% brightness for indoor use
}

// Generate calibration confidence
const getCalibrationConfidence = (ambient, distance, screenSize) => {
  let score = 100
  if (ambient < 80) score -= 20 // too dark
  if (distance < 35 || distance > 50) score -= 15
  return score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'
}
```

**Files to Create:**
```
eyevio-frontend/src/components/UniversalCalibration.jsx
eyevio-frontend/src/utils/calibrationEngine.js
eyevio-frontend/src/context/CalibrationContext.jsx (store settings)
```

**Integration:**
- Run ONCE when user first accesses tests
- Store in localStorage + backend
- Show "Recalibrate" button in test menus
- Auto-prompt if >7 days since last calibration

---

### 2. Reliability Engine 🧠 **CRITICAL**
**Status:** Missing

**What to Build:**
```javascript
// eyevio-frontend/src/utils/reliabilityEngine.js

class ReliabilityScorer {
  // Test-retest consistency
  checkConsistency(currentResult, historicalResults) {
    // If deviation > 2 SD, flag as unreliable
  }
  
  // Fatigue detection
  detectFatigue(responseTimestamps) {
    // If reaction time increases >30% toward end, flag
  }
  
  // Learning effect correction
  correctLearningBias(result, attempt_number) {
    // First attempts may be worse - apply small correction
  }
  
  // Confidence scoring
  calculateConfidence(calibration, consistency, fatigue) {
    return {
      level: 'high' | 'medium' | 'low',
      reasons: ['Good calibration', 'Consistent responses'],
      recommendation: 'Result is reliable' | 'Consider retesting'
    }
  }
}
```

**Display in Results:**
```jsx
<div className="confidence-badge">
  <span className="font-bold">Confidence: HIGH</span>
  <p className="text-sm">✓ Environment calibrated ✓ Consistent responses</p>
</div>
```

---

## PHASE 1: MVP (High Priority Tests)

### Priority 1: Visual Acuity Test 👁️ **CREATE NEW**
**Why First:** Baseline for everything, clinically essential, familiar to users

**File to Create:**
```
eyevio-frontend/src/pages/VisualAcuityTest.jsx
```

**Professional Requirements:**
- **LogMAR scoring** (not just 20/20)
- **Snellen conversion** for familiarity
- **Randomized optotypes** (E, F, L, O, P, T, Z)
- **Monocular testing** (left eye, then right eye, ENFORCE!)
- **Distance validation** (must be 40cm from screen)
- **Adaptive progression** (start large, get smaller until threshold)

**UX Flow:**
1. Calibration reminder
2. "Cover your LEFT eye with your palm"
3. Show large letter → progressively smaller
4. Record smallest readable line
5. Switch to right eye
6. Calculate LogMAR score
7. Show results: "Left: 20/25, Right: 20/20, LogMAR: 0.10"

**Scoring:**
```javascript
// LogMAR = -log10(Snellen fraction)
// 20/20 = 0.0 LogMAR (perfect)
// 20/40 = 0.3 LogMAR
// 20/200 = 1.0 LogMAR (legally blind threshold)

const calculateLogMAR = (correctLetters, startingSize) => {
  const snellenDenominator = startingSize / correctLetters
  return -Math.log10(20 / snellenDenominator)
}
```

**AI Enhancements:**
- Guessing detection (too-fast responses flagged)
- Asymmetry alerts (>2 line difference between eyes)
- Trend tracking (myopia progression in kids)

---

### Priority 2: Color Vision Test 🌈 **CREATE NEW**
**Why:** Fast, trusted, high demand (jobs, schools, sports)

**File to Create:**
```
eyevio-frontend/src/pages/ColorVisionTest.jsx
```

**Professional Requirements:**
- **Ishihara-inspired plates** (at least 10 plates)
- **Plate types:**
  - Control plates (everyone sees)
  - Red-green deficiency plates
  - Protan/Deutan confusion plates
- **Time-to-response tracking** (>3 sec = uncertain)
- **Error pattern classification**

**Plate Examples (Simplified):**
```javascript
const plates = [
  { id: 1, type: 'control', answer: '12', difficulty: 'easy' },
  { id: 2, type: 'red_green', answer: '8', difficulty: 'medium' },
  { id: 3, type: 'protan', answer: '29', difficulty: 'hard' },
  // ... 10-15 plates total
]
```

**Results:**
```
Normal Color Vision
Red-Green Deficiency Suspected (Protan Pattern)
Red-Green Deficiency Suspected (Deutan Pattern)
Recommend: Professional color vision examination
```

**Implementation:**
- Use SVG or high-quality PNG plates
- Mobile-optimized (crucial for color accuracy)
- Ambient lighting warning (affects color perception)

---

### Priority 3: Amsler Grid 🟦 **CREATE NEW**
**Why:** Essential macular screen, low effort, high safety value

**File to Create:**
```
eyevio-frontend/src/pages/AmslerGridTest.jsx
```

**Professional Requirements:**
- **Central fixation enforcement** (user must look at center dot)
- **Distortion mapping** (user taps areas that look wavy/missing)
- **Monocular testing** (one eye at a time)
- **Reading glasses reminder** (if user wears them)

**UX:**
1. Show grid with central red dot
2. "Keep your eye on the red dot"
3. "Tap any areas that look wavy, blurry, or missing"
4. Record touched coordinates
5. Repeat for other eye
6. Generate heat map of distortions

**AI Enhancements:**
- Change detection (compare to previous tests)
- Progression visualization (gif showing how distortions evolved)
- False positive reduction (ignore single taps)

**Results:**
```
✓ No distortions detected
⚠️ Minor distortion in lower right quadrant (right eye)
🚨 Significant distortion detected - Seek professional exam
```

---

### Priority 4: Upgrade Existing Tests

#### A. Contrast Sensitivity (Already Exists - Enhance)
**File:** `eyevio-frontend/src/pages/ContrastSensitivityTest.jsx`

**Add:**
- ✅ LogMAR contrast scoring (you may have this)
- ⚠️ **NEW:** Triplet letter design (show 3 letters per level)
- ⚠️ **NEW:** Monocular mode toggle
- ⚠️ **NEW:** Asymmetry detection (left vs right eye)

#### B. Peripheral Vision (Already Exists - Enhance)  
**File:** `eyevio-frontend/src/pages/PeripheralAwarenessTest.jsx`

**Add:**
- ⚠️ **NEW:** Fixation control (fail test if user looks away from center)
- ⚠️ **NEW:** Reaction time normalization (practice trials first)
- ⚠️ **NEW:** Quadrant-based scoring (superior/inferior/nasal/temporal)
- ⚠️ **NEW:** Field symmetry modeling (detect asymmetric loss)

---

## PHASE 2: PRO FEATURES (Careful Framing)

### 1. Reframe "Cataract Test" → "Glare Sensitivity Assessment" ⚠️
**File:** `eyevio-frontend/src/pages/CataractTest.jsx`

**Current Issue:** Names disease directly

**Reframe As:**
```
Glare & Light Sensitivity Test
"Measures your functional vision under challenging lighting conditions"
```

**Safe Results Language:**
```
❌ "Possible cataract detected"
✅ "Increased glare sensitivity observed. Common causes include:
   - Natural aging changes
   - Dry eyes
   - Cataracts (requires professional exam)
   Recommendation: Consult an eye care professional"
```

---

### 2. Reframe "Glaucoma Test" → "Peripheral Field Screen" ⚠️
**File:** `eyevio-frontend/src/pages/GlaucomaTest.jsx`

**Reframe As:**
```
Peripheral Vision Screening
"Checks your ability to detect objects in your peripheral field"
```

**Safe Results:**
```
❌ "Glaucoma risk: HIGH"
✅ "Peripheral field defect detected in lower nasal quadrant.
   Possible causes: Glaucoma, retinal issues, neurological conditions.
   Action: Schedule comprehensive eye exam"
```

---

### 3. Reframe "Red Reflex Test" → "Pupil Symmetry Check" ⚠️
**File:** `eyevio-frontend/src/pages/RedReflexTest.jsx`

**Current Issue:** Dangerous without validation

**Decision Options:**
1. **Remove entirely** (safest)
2. **Reframe as "Pupil Symmetry Assessment"** (detects asymmetry only)
3. **Move to Phase 4** (clinical validation required)

**If Keep:**
```
Pupil Symmetry Assessment
"Checks if both pupils respond similarly to light"

Results:
✓ Symmetrical response
⚠️ Asymmetry detected - May indicate:
   - Anisocoria (natural variation)
   - Neurological issues
   - Structural abnormalities
   Action: Seek immediate professional evaluation
```

---

## PHASE 3: LONGITUDINAL TRACKING & AI

### Vision Risk Dashboard 📊
**File to Create:**
```
eyevio-frontend/src/pages/VisionRiskDashboard.jsx
```

**Components:**
1. **Trend Graphs**
   - Acuity over time (left vs right)
   - Contrast sensitivity trajectory
   - Peripheral field stability map

2. **Risk Signals**
```javascript
const riskLevel = calculateRisk(tests) {
  if (acuityDecline > 2 lines && contrastDrop > 0.15) {
    return 'seek_care' // 🚨
  }
  if (asymmetry > 1 line || peripheralDefect) {
    return 'monitor' // ⚠️
  }
  return 'stable' // ✓
}
```

3. **Triage Logic**
```
✅ STABLE
   Your vision is stable. Continue monitoring.
   Next recommended test: 3 months

⚠️ MONITOR CLOSELY  
   Minor changes detected. Schedule follow-up in 1 month.
   Consider: Updated prescription, dry eye treatment

🚨 PROFESSIONAL EXAM RECOMMENDED
   Significant changes or asymmetry detected.
   Action: Schedule comprehensive eye exam within 1-2 weeks
   Findings: [Specific details]
```

---

## 🚨 COMPLIANCE & SAFETY

### Language Guidelines (Apply Everywhere)

**❌ NEVER SAY:**
- "You have glaucoma"
- "Cataract detected"
- "Macular degeneration confirmed"
- "Risk: 85%"

**✅ ALWAYS SAY:**
- "Pattern consistent with..."
- "May indicate..."
- "Common in conditions such as..."
- "Requires professional evaluation"

### Required Disclaimers

**Every Test Results Page:**
```jsx
<div className="disclaimer">
  <p className="text-sm text-gray-600 italic">
    ⚠️ This is a screening tool, not a diagnostic device. 
    Results should be discussed with an eye care professional. 
    Not FDA approved for medical diagnosis.
  </p>
</div>
```

**Landing Page:**
```
This platform is for:
✓ Vision monitoring
✓ Early change detection  
✓ Informed conversations with your doctor

This platform is NOT for:
✗ Medical diagnosis
✗ Treatment decisions
✗ Emergency eye conditions
```

---

## 📋 PRIORITY TASK LIST

### **WEEK 1-2: Phase 0 Foundation**
- [ ] Build `UniversalCalibration.jsx` component
- [ ] Add ambient lighting check
- [ ] Create `reliabilityEngine.js`
- [ ] Add confidence scoring to existing tests
- [ ] Create `CalibrationContext` for global state

### **WEEK 3-4: Phase 1 MVP**
- [ ] Create `VisualAcuityTest.jsx` (LogMAR)
- [ ] Create `ColorVisionTest.jsx` (Ishihara)
- [ ] Create `AmslerGridTest.jsx`
- [ ] Upgrade `ContrastSensitivityTest.jsx` (monocular mode)
- [ ] Upgrade `PeripheralAwarenessTest.jsx` (fixation control)

### **WEEK 5: Reframing & Safety**
- [ ] Rename "Cataract Test" → "Glare Sensitivity"
- [ ] Rename "Glaucoma Test" → "Peripheral Field Screen"
- [ ] Add disclaimers to all tests
- [ ] Remove diagnostic language
- [ ] Add triage logic to results

### **WEEK 6: Dashboard & Polish**
- [ ] Create `VisionRiskDashboard.jsx`
- [ ] Add trend graphs
- [ ] Implement risk scoring
- [ ] Add "Stable/Monitor/Seek Care" logic
- [ ] Professional export (PDF report)

---

## 🎯 SUCCESS METRICS

### For Professionals to Trust:
✓ All tests have calibration
✓ Confidence scores on every result
✓ No diagnostic claims
✓ Clear triage recommendations
✓ Longitudinal tracking

### For Users to Value:
✓ Fast (<5 min per test)
✓ Clear instructions
✓ Actionable insights
✓ Trend visualizations
✓ Mobile-friendly

### For Investors to Fund:
✓ Clinically validated approach
✓ Clear use cases (myopia tracking, fall prevention, job screening)
✓ Differentiation (AI + longitudinal + calibration)
✓ Regulatory path (FDA De Novo for vision monitoring)

---

## 📁 FILE STRUCTURE (Target)

```
eyevio-frontend/src/
├── components/
│   ├── UniversalCalibration.jsx ⭐ NEW
│   ├── DistanceCalibration.jsx ✅ EXISTS
│   ├── ConfidenceBadge.jsx ⭐ NEW
│   └── DisclaimerFooter.jsx ⭐ NEW
│
├── pages/
│   ├── VisualAcuityTest.jsx ⭐ NEW (Priority 1)
│   ├── ColorVisionTest.jsx ⭐ NEW (Priority 2)
│   ├── AmslerGridTest.jsx ⭐ NEW (Priority 3)
│   ├── ContrastSensitivityTest.jsx ✅ UPGRADE
│   ├── PeripheralAwarenessTest.jsx ✅ UPGRADE
│   ├── GlareSensitivityTest.jsx ⚠️ RENAME (was Cataract)
│   ├── PeripheralFieldScreen.jsx ⚠️ RENAME (was Glaucoma)
│   └── VisionRiskDashboard.jsx ⭐ NEW
│
├── utils/
│   ├── calibrationEngine.js ⭐ NEW
│   ├── reliabilityEngine.js ⭐ NEW
│   ├── triage Logic.js ⭐ NEW
│   └── eyeTracker.js ✅ EXISTS
│
└── context/
    └── CalibrationContext.jsx ⭐ NEW
```

---

## 💡 DIFFERENTIATORS (Why Pros Will Care)

1. **Calibration-First Approach** (rare in consumer apps)
2. **Confidence Scoring** (shows reliability awareness)
3. **Longitudinal AI** (detects trends, not just snapshots)
4. **Safe Language** (regulatory compliance built-in)
5. **Test–Retest Validation** (detects outliers automatically)
6. **Triage Logic** (actionable, not just data)

---

## 🚀 GO-TO-MARKET STRATEGY

### Target Users (Phase 1):
1. **Myopia-concerned parents** (kids 8-18)
2. **Office workers** (digital eye strain monitoring)
3. **Seniors** (fall prevention via peripheral screen)
4. **Job applicants** (color vision pre-checks)

### Partnerships:
- **Optometry schools** (validation studies)
- **Employers** (occupational health screening)
- **Insurance companies** (preventive care incentives)

---

## ⚖️ REGULATORY PATH

### Current Classification:
**Non-Medical Device** (wellness, monitoring only)

### Future Path (Optional):
**FDA De Novo** for "Vision Monitoring Software"
- Class II medical device
- Requires clinical validation (100+ subjects)
- Time: 12-18 months
- Cost: $50k-150k

### Strategy:
Build credibility with longitudinal data → Seek FDA clearance → Unlock clinical partnerships

---

**Next Step:** Should I start implementing **Phase 0: Universal Calibration** or **Phase 1: Visual Acuity Test** first?
