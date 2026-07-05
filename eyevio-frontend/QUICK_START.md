# 🚀 Quick Start Checklist

## Before You Start Coding

### ✅ Prerequisites
- [ ] Install Node.js (v18+): `brew install node`
- [ ] Verify installation: `node --version` and `npm --version`

### ✅ Initial Setup (5 minutes)
```bash
# 1. Navigate to frontend directory
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend

# 2. Install dependencies (this takes 2-3 minutes)
npm install

# 3. Copy environment file
cp .env.example .env

# 4. Start development server
npm run dev
```

### ✅ Start Backend (Separate Terminal)

**IMPORTANT**: The backend requires Python 3.9-3.12 (Python 3.13 has compatibility issues).

**Option 1: Install Python 3.12 via Homebrew (Recommended)**
```bash
# Install Python 3.12
brew install python@3.12

# Navigate to backend directory
cd /Users/vivaanbhatt/Desktop/research-project/eyevio

# Create virtual environment with Python 3.12
python3.12 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up database (first time only)
export DATABASE_URL="postgresql://localhost/eyevio_db"
export SECRET_KEY="your-secret-key-change-this-in-production"
createdb eyevio_db  # Create PostgreSQL database
flask db upgrade    # Run migrations

# Start Flask server
python run.py
```

**Option 2: Use system Python 3 (if version 3.9-3.12)**
```bash
# Check your Python version first
python3 --version  # Should be 3.9, 3.10, 3.11, or 3.12

# If it's 3.9-3.12, proceed:
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
createdb eyevio_db
flask db upgrade
python run.py
```

**Note**: If you get "zsh: command not found: createdb", PostgreSQL is already installed. Just skip that command and run `flask db upgrade`.

### ✅ Test Everything Works
- [ ] Frontend running at http://localhost:3000
- [ ] Backend running at http://localhost:5000
- [ ] Open frontend in browser
- [ ] Click "Get Started" or "Sign Up"
- [ ] Register a new account (use any email/password)
- [ ] Should redirect to dashboard after registration
- [ ] See health score, stats cards, and recent activity
- [ ] Click "Profile" in sidebar
- [ ] Update your information and save
- [ ] Verify changes saved (check toast notification)

**If all above work → You're ready to code! 🎉**

---

## Development Priorities

### 🔥 Week 1: Vision Tests (HIGHEST PRIORITY)

**File**: `src/pages/VisionTests.jsx`

**Tasks**:
- [ ] Create test type cards (Acuity, Contrast, Color)
- [ ] Fetch test history from API: `visionTestAPI.getAll()`
- [ ] Display history table with dates and scores
- [ ] Add "Start Test" buttons linking to `/vision-tests/{type}`

**File**: `src/pages/VisionTestRunner.jsx`

**Tasks**:
- [ ] Build Snellen chart for acuity test
- [ ] Add test instructions
- [ ] Implement user response collection
- [ ] Calculate score
- [ ] Submit to API: `visionTestAPI.submit({ test_type, score, details })`
- [ ] Show results screen

**Estimated Time**: 8-12 hours

---

### 📊 Week 2: Trends & Charts

**File**: `src/pages/Trends.jsx`

**Tasks**:
- [ ] Fetch trend data: `trendAPI.getTrend({ period: '90d' })`
- [ ] Install/import Recharts: `import { LineChart, Line } from 'recharts'`
- [ ] Create line chart for vision scores over time
- [ ] Fetch predictions: `trendAPI.getPrediction()`
- [ ] Display prediction cards
- [ ] Add date range filter
- [ ] Show trend indicators (↑ improving, → stable, ↓ declining)

**Estimated Time**: 4-6 hours

---

### 🎥 Week 3: Webcam Analysis

**File**: `src/pages/WebcamAnalysis.jsx`

**Tasks**:
- [ ] Import react-webcam: `import Webcam from 'react-webcam'`
- [ ] Add webcam component with permissions
- [ ] Create start/stop session buttons
- [ ] Capture frames every 5 seconds
- [ ] Send to API: `webcamAPI.submitAnalysis({ frame: base64Image })`
- [ ] Display real-time fatigue score
- [ ] Show session history

**Estimated Time**: 6-8 hours

---

### 📝 Week 4: Lifestyle & Reports

**Lifestyle Logging**:
- [ ] Create daily log form (screen time, sleep, outdoor hours)
- [ ] Submit to API: `lifestyleAPI.submitLog({ ... })`
- [ ] Display log history
- [ ] Fetch correlations: `lifestyleAPI.getCorrelations()`
- [ ] Show correlation charts

**Reports**:
- [ ] Add date range picker
- [ ] Generate report button
- [ ] Fetch PDF: `reportsAPI.generate({ period: '30d' })`
- [ ] Download file using FileSaver.js
- [ ] Add JSON export option

**Estimated Time**: 6-8 hours

---

## Quick Reference

### Common API Calls

```jsx
// Fetch user profile
const profile = await authAPI.getProfile()

// Submit vision test
const result = await visionTestAPI.submit({
  test_type: 'acuity',
  score: 85,
  details: { ... }
})

// Get trends
const trend = await trendAPI.getTrend({ period: '90d' })

// Get predictions
const prediction = await trendAPI.getPrediction()

// Submit webcam analysis
const analysis = await webcamAPI.submitAnalysis({
  frame: base64Image,
  timestamp: new Date().toISOString()
})
```

### Common Patterns

**Loading State**:
```jsx
const [loading, setLoading] = useState(false)

const fetchData = async () => {
  setLoading(true)
  try {
    const data = await api.getSomething()
    setData(data)
  } catch (error) {
    console.error(error)
  } finally {
    setLoading(false)
  }
}
```

**Toast Notifications**:
```jsx
import { toast } from 'react-hot-toast'

toast.success('Saved successfully!')
toast.error('Something went wrong')
toast.loading('Loading...')
```

**Protected Navigation**:
```jsx
import { useNavigate } from 'react-router-dom'

const navigate = useNavigate()
navigate('/dashboard')
```

---

## Debugging Tips

### Backend Not Responding
1. Check if Flask is running: http://localhost:5000/api/auth/profile
2. Check terminal for Python errors
3. Verify PostgreSQL is running: `psql -U postgres -d eyevio_db`

### Frontend Build Errors
1. Clear cache: `rm -rf node_modules package-lock.json && npm install`
2. Check for typos in imports
3. Verify all required packages installed

### API Calls Failing
1. Open browser DevTools → Network tab
2. Check request URL and payload
3. Verify JWT token in Authorization header
4. Check backend terminal for errors

### Styles Not Applying
1. Restart Vite dev server
2. Check Tailwind classes are correct
3. Verify `index.css` imports Tailwind directives
4. Hard refresh browser (Cmd+Shift+R)

---

## Useful Commands

```bash
# Frontend
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Check code quality

# Backend
python run.py        # Start Flask server
flask db migrate     # Create new migration
flask db upgrade     # Apply migrations

# Git
git status           # Check changes
git add .            # Stage all changes
git commit -m "..."  # Commit changes
git push             # Push to remote

# Process Management
lsof -ti:3000        # Find process on port 3000
kill -9 <PID>        # Kill process
```

---

## Files to Focus On

### When implementing Vision Tests:
- `src/pages/VisionTests.jsx` - Test selection
- `src/pages/VisionTestRunner.jsx` - Test execution
- `src/services/api.js` - Already has `visionTestAPI`

### When implementing Trends:
- `src/pages/Trends.jsx` - Main trends page
- `src/services/api.js` - Already has `trendAPI`
- Install Recharts components

### When implementing Webcam:
- `src/pages/WebcamAnalysis.jsx` - Webcam interface
- `src/services/api.js` - Already has `webcamAPI`
- Use react-webcam (already in package.json)

---

## Success Criteria

### ✅ Vision Tests Module Complete When:
- User can select test type
- Test runs with clear instructions
- Score is calculated correctly
- Results saved to backend
- History displays past tests

### ✅ Trends Module Complete When:
- Charts display vision trends over time
- Predictions show future forecasts
- Date filters work correctly
- Trend indicators are accurate

### ✅ Webcam Module Complete When:
- Webcam captures video successfully
- Frames sent to backend for analysis
- Fatigue metrics displayed in real-time
- Session history saved and displayed

---

## Time Estimates

| Feature | Estimated Hours |
|---------|----------------|
| Vision Tests (complete) | 8-12h |
| Trends & Charts | 4-6h |
| Webcam Analysis | 6-8h |
| Lifestyle Logging | 4-6h |
| Reports Generator | 3-4h |
| Alerts System | 2-3h |
| Polish & Testing | 4-6h |
| **TOTAL** | **30-45h** |

At 4 hours/day = ~1-2 weeks of focused work

---

## 🎯 Your Next Session

1. **Install Node.js** (if not installed)
2. **Run `npm install`** in frontend directory
3. **Start both servers** (frontend + backend)
4. **Test authentication flow**
5. **Start implementing Vision Tests page**

### Vision Tests Implementation Guide

Create these components in `src/components/vision-tests/`:
- `TestCard.jsx` - Card for each test type
- `SnellenChart.jsx` - Visual acuity chart
- `ContrastTest.jsx` - Contrast sensitivity
- `ColorTest.jsx` - Color vision test

Update `src/pages/VisionTests.jsx`:
```jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { visionTestAPI } from '../services/api'

function VisionTests() {
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTests()
  }, [])

  const loadTests = async () => {
    try {
      const response = await visionTestAPI.getAll({ limit: 10 })
      setTests(response.data.tests)
    } catch (error) {
      console.error('Failed to load tests:', error)
    } finally {
      setLoading(false)
    }
  }

  const testTypes = [
    {
      type: 'acuity',
      title: 'Visual Acuity',
      description: 'Test your ability to see details at various distances',
      icon: '👁️'
    },
    // ... more test types
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Vision Tests</h1>
      
      {/* Test Type Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {testTypes.map(test => (
          <Link
            key={test.type}
            to={`/vision-tests/${test.type}`}
            className="card hover:shadow-lg transition-shadow"
          >
            <div className="text-4xl mb-4">{test.icon}</div>
            <h3 className="text-xl font-bold mb-2">{test.title}</h3>
            <p className="text-gray-600">{test.description}</p>
          </Link>
        ))}
      </div>

      {/* Test History */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4">Recent Tests</h2>
        {loading ? (
          <p>Loading...</p>
        ) : tests.length === 0 ? (
          <p className="text-gray-600">No tests yet. Start your first test above!</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3">Test Type</th>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {tests.map(test => (
                <tr key={test.id} className="border-b">
                  <td className="p-3">{test.test_type}</td>
                  <td className="p-3">{new Date(test.timestamp).toLocaleDateString()}</td>
                  <td className="p-3">{test.score}/100</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default VisionTests
```

---

**You're all set! Time to build the rest of the app! 🚀**

Read SETUP.md for detailed instructions and IMPLEMENTATION_SUMMARY.md for the complete overview.
