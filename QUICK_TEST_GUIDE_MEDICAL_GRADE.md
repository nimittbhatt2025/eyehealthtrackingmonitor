# 🧪 Quick Test Guide - Medical-Grade Contrast Sensitivity Test

## 🚀 Test It Now!

### Start the Test
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend
npm run dev
```

Then navigate to: **http://localhost:3000** → Vision Tests → Contrast Sensitivity Test

---

## ✅ What to Look For

### 1. **Sloan Letters** (C, D, H, K, N, O, R, S, V, Z)
- ✅ Only these 10 letters appear
- ✅ No A, B, E, F, G, etc.
- ✅ Check triplet randomization (no repeats within or between triplets)

### 2. **24-Level Scale**
- ✅ Progress shows "Level 1/24" not just "Contrast: 100%"
- ✅ Letters get progressively lighter (255 → 5 RGB)
- ✅ Console shows: `Rendering Level 12: RGB(85) = 33% contrast (LogCS 1.40)`

### 3. **Jump Phase** 🚀
- ✅ After 3 consecutive correct triplets: "🚀 Jump Phase" badge appears
- ✅ Console shows: `🚀 Jump Phase Active! (2/3 correct)`
- ✅ Jumps 3 levels instead of 1: `Level 3 → Level 6 (+3 levels)`
- ✅ Ends on first failure: `❌ Jump Phase Cancelled (failed triplet)`

### 4. **Adaptive Staircase**
- ✅ Pass triplet → level increases (harder)
- ✅ Fail triplet → level decreases (easier)
- ✅ Reversals tracked: `🔄 REVERSAL #3 at Level 14 (Moderate)`
- ✅ Test ends after 5 reversals

### 5. **Results Dashboard** (After completing both eyes)
- ✅ **Hero Section**: Speedometer gauge with colored gradient
- ✅ **Score Display**: Large 7xl font showing LogCS (e.g., "1.42")
- ✅ **Badge**: Emoji + text (🦅 Eagle Eye, 👁️ Normal Vision, etc.)
- ✅ **Age Comparison**: Horizontal bar with "You ▼" arrow
- ✅ **Eye Cards**: Blue left eye, purple right eye side-by-side
- ✅ **Impact Simulator**: 3 scenarios (night driving, fog, stairs) with CSS filters
- ✅ **Safety Checklist**: 5 color-coded scenarios (green/yellow/red)
- ✅ **Clinical Recs**: Amber box if score < 1.5 LogCS

---

## 🎯 Expected Behavior

### Early Trials (Jump Phase)
```
Trial 1: Level 1 (RGB 255) - Pass → Level 4 (+3)
Trial 2: Level 4 (RGB 193) - Pass → Level 7 (+3)
Trial 3: Level 7 (RGB 134) - Pass → Level 10 (+3)
Trial 4: Level 10 (RGB 101) - Fail → Level 9 (-1, Jump Phase ends)
```

### Normal Phase (After Jump)
```
Trial 5: Level 9 (RGB 109) - Pass → Level 10 (+1)
Trial 6: Level 10 (RGB 101) - Pass → Level 11 (+1)
Trial 7: Level 11 (RGB 93) - Fail → Level 10 (-1) [REVERSAL #1]
Trial 8: Level 10 (RGB 101) - Pass → Level 11 (+1) [REVERSAL #2]
... continues until 5 reversals ...
```

### Final Score Calculation
```
Reversals at: [15, 13, 14, 13, 14]
Last 4 reversals: [13, 14, 13, 14]
Average: 13.5
Level 13.5 → LogCS 1.445 (interpolated between Level 13 and 14)
```

---

## 🐛 Troubleshooting

### Issue: "All letters appear, not just Sloan"
**Fix**: Check line 64 of `ContrastSensitivityTest.jsx`:
```javascript
const testLetters = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z']
```

### Issue: "No Jump Phase indicator"
**Check**: 
1. Pass first 3 consecutive triplets
2. Look for "🚀 Jump Phase" in header (line 1310)
3. Check console for: `🚀 Jump Phase Active! (2/3 correct)`

### Issue: "Letters are all black or white"
**Check**:
1. `currentLevel` state initialized to 1? (line 99)
2. `LogCS_LEVELS` array populated? (lines 64-98)
3. Console shows correct RGB values?

### Issue: "Results page looks wrong"
**Check**:
1. Syntax errors fixed? Run `npm run dev` and check browser console
2. Closing div tags balanced? (fixed at line 1850)
3. Dark mode styles applied? (gray-900 background)

---

## 📊 Sample Console Output

### Successful Test Run
```
Rendering Level 1: RGB(255) = 100% contrast (LogCS 2.00)
New triplet: K, O, V
Answer: "K" vs "K" - Correct (1.2s) at Level 1 (Maximum (100%))
Answer: "O" vs "O" - Correct (1.5s) at Level 1 (Maximum (100%))
Answer: "V" vs "V" - Correct (1.3s) at Level 1 (Maximum (100%))
Triplet: 3/3 correct, Avg latency: 1.3s, Max: 1.5s
🚀 Jump Phase Active! (1/3 correct)
✓ Passed! Level 1 → Level 4 (+3 levels)
📊 Trial 1, Reversals: 0/5, Next: Level 4 (Easy)

Rendering Level 4: RGB(193) = 75.7% contrast (LogCS 1.82)
New triplet: D, R, N
... continues ...

🔄 REVERSAL #5 at Level 13 (Moderate)
✅ Test complete! Reversals: 5, Trials: 18
📊 Final Score: Avg Level = 13.2, LogCS = 1.43
```

---

## 🎨 Visual Checklist

### Testing Screen
- [ ] White background (RGB 255, 255, 255)
- [ ] Letter color changes each level (255 → 5 gradient)
- [ ] Header shows: "Level 12/24 (33%)"
- [ ] Jump Phase badge appears when active
- [ ] Triplet progress dots: green (correct), red (wrong), gray (pending)
- [ ] Voice recognition indicator: 🎤 when active
- [ ] Feedback shows checkmark ✓ or X ✗ after each letter

### Results Dashboard
- [ ] Dark background (gray-900)
- [ ] Speedometer gauge with colored gradient
- [ ] Large score number (7xl font)
- [ ] Emoji badge (🦅, ✨, 👁️, ⚠️, 🚨)
- [ ] Age comparison bar with arrow
- [ ] Blue/purple eye cards side-by-side
- [ ] 3 visual simulators (car, pedestrian, stairs)
- [ ] 5 safety scenarios with color borders
- [ ] Clinical recommendations (if score < 1.5)
- [ ] Test details table (type, algorithm, distance, gamma)
- [ ] "Return to Vision Tests" button (purple gradient)

---

## 🔬 Advanced Testing

### Test Jump Phase Explicitly
1. Start test with both eyes open (cheat mode)
2. Deliberately answer all 9 letters correctly (first 3 triplets)
3. Observe console: Should show `🚀 Jump Phase Active!` 3 times
4. Observe progression: Level 1 → 4 → 7 → 10 (jumps of 3)
5. On 4th triplet, fail 2/3 letters
6. Observe console: `❌ Jump Phase Cancelled (failed triplet)`
7. Next triplet: Should jump only 1 level (not 3)

### Test Reversal Detection
1. Pass several triplets to reach Level 15
2. Fail next triplet → Level 14 (direction change = REVERSAL)
3. Pass next triplet → Level 15 (direction change = REVERSAL)
4. Check console: `🔄 REVERSAL #1 at Level 15 (Hard)`
5. Continue until 5 reversals → Test ends

### Test Results Calculation
1. Complete both eyes
2. Check console for final score: `📊 Final Score: Avg Level = 13.2, LogCS = 1.43`
3. Verify results page shows same score
4. Verify badge matches score range
5. Verify age comparison arrow points to correct position

---

## 📝 Notes

- **Test Duration**: Expect 6-8 minutes per eye with Jump Phase
- **Typical Threshold**: Level 12-14 (LogCS 1.3-1.5) for healthy adults
- **Jump Phase**: Should trigger in first ~3 triplets if answering correctly
- **Reversals**: Usually need 15-20 trials to get 5 reliable reversals
- **Results**: Dashboard should render instantly after right eye completes

---

## ✅ Success Criteria

**Test is working correctly if:**
1. ✅ Only 10 Sloan letters appear
2. ✅ Level progression: 1 → 4 → 7 → 10 (Jump Phase)
3. ✅ Console logs show level numbers, not just percentages
4. ✅ Jump Phase badge appears and disappears correctly
5. ✅ Reversals detected and logged
6. ✅ Test ends after 5 reversals
7. ✅ Results dashboard shows speedometer with score
8. ✅ Real-world simulators adjust based on score
9. ✅ Safety checklist shows appropriate color-coding
10. ✅ Clinical recommendations appear if needed

---

*Quick Test Guide Generated: Phase 6*  
*Ready for Production Testing ✅*
