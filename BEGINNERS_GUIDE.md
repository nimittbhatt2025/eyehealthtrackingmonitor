# 🚀 BEGINNER'S GUIDE TO RUNNING EYEVIO

## What You Have
You have a complete vision health app with AI/ML features! Here's what it does:
- **Tracks vision tests** over time
- **Predicts vision changes** using AI
- **Analyzes your eyes** through webcam (blink rate, fatigue, squinting)
- **Monitors lifestyle** factors affecting eye health

---

## ⚡ Quick Start (5 Minutes)

### Step 1: Start the Backend (Brain of the App)
Open Terminal and run these commands one by one:

```bash
# Go to backend folder
cd /Users/vivaanbhatt/Desktop/research-project/eyevio

# Activate Python environment
source venv/bin/activate

# Start the backend server
python run.py
```

✅ **You should see**: "Running on http://127.0.0.1:5000"  
⚠️ **Keep this terminal open!**

---

### Step 2: Start the Frontend (What You See)
Open a **NEW terminal** window and run:

```bash
# Go to frontend folder
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend

# Start the frontend
npm run dev
```

✅ **You should see**: "Local: http://localhost:5173"  
⚠️ **Keep this terminal open too!**

---

### Step 3: Open the App
1. Open your browser (Chrome/Safari/Firefox)
2. Go to: **http://localhost:5173**
3. You should see the EyeVio homepage!

---

## 🎯 What to Try

### 1. Create an Account
- Click "Register" or "Sign Up"
- Enter your email and password
- You're in!

### 2. Try the Webcam Analysis (The ML Feature!)
- Click "Webcam Analysis" in the sidebar
- Allow camera access when prompted
- Record a 10-30 second video
- The AI will analyze:
  - Your blink rate
  - Eye fatigue level
  - Squinting behavior
  - Give you health recommendations!

### 3. Take Vision Tests
- Click "Vision Tests" in sidebar
- Try different test types
- See your scores over time

### 4. View Trends & Predictions
- Click "Trends & Predictions"
- The AI predicts where your vision is headed
- Shows if you might need prescription changes

---

## 🛑 How to Stop

When you're done:

**Terminal 1 (Backend)**:
- Press `Ctrl + C`
- Type `deactivate`

**Terminal 2 (Frontend)**:
- Press `Ctrl + C`

---

## 🔧 Troubleshooting

### "Port already in use" error?
```bash
# Kill whatever is using the port
lsof -ti:5000 | xargs kill -9   # For backend
lsof -ti:5173 | xargs kill -9   # For frontend
```

### Frontend won't start?
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend
npm install
npm run dev
```

### Backend errors?
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
source venv/bin/activate
pip install -r requirements.txt
python run.py
```

---

## 📚 What Each Folder Does

```
research-project/
├── eyevio/              👈 Backend (Python/Flask)
│   ├── app/
│   │   ├── ai_models/   👈 ML CODE IS HERE!
│   │   ├── routes/      👈 API endpoints
│   │   └── models/      👈 Database tables
│   ├── venv/            👈 Python packages
│   └── run.py           👈 Start backend with this
│
└── eyevio-frontend/     👈 Frontend (React)
    ├── src/
    │   ├── pages/       👈 All the pages you see
    │   └── components/  👈 Reusable UI parts
    └── package.json     👈 Dependencies list
```

---

## 🎓 Understanding the ML Features

### What We Built:

1. **Blink Detection** (eye_analysis.py)
   - Uses your webcam to track your eyes
   - Counts how many times you blink
   - Normal: 15-20 blinks/minute
   - Detects incomplete blinks (fatigue sign)

2. **Fatigue Scoring** (eye_analysis.py)
   - Combines blink rate, squinting, eye opening
   - Gives you a 0-100 fatigue score
   - Tells you when to take breaks

3. **Vision Prediction** (prediction.py)
   - Looks at your vision test history
   - Predicts future vision score
   - Warns if you might need new glasses

---

## 🎨 Tech Stack (What's Under the Hood)

**Backend:**
- Python (programming language)
- Flask (web framework)
- PostgreSQL (database)
- MediaPipe (eye tracking AI)
- NumPy/Pandas (math/data)

**Frontend:**
- React (UI framework)
- Tailwind CSS (styling)
- Vite (build tool)

**ML Libraries:**
- MediaPipe - Face tracking
- OpenCV - Video processing
- Statsmodels - Predictions
- NumPy - Math calculations

---

## 🚀 Next Steps

### Easy Additions:
1. **Customize your profile** (Profile page)
2. **Set up reminders** (Settings page)
3. **Track lifestyle** (Lifestyle page)
4. **Earn achievements** (Achievements page)

### Advanced (When You're Ready):
1. Add more ML models
2. Deploy to the cloud (Heroku/AWS)
3. Add mobile app version
4. Connect to real eye tracking devices

---

## 💡 Common Questions

**Q: Is my data private?**  
A: Yes! Everything runs on your computer. Nothing is sent anywhere.

**Q: Do I need internet?**  
A: Only for the first setup. After that, it works offline!

**Q: Can I customize it?**  
A: Absolutely! All the code is yours to modify.

**Q: What if something breaks?**  
A: Just run `git status` to see what changed, or ask for help!

---

## 📞 Need Help?

1. Check the error message carefully
2. Google the error (seriously, this helps!)
3. Look at the documentation files:
   - `ML_IMPLEMENTATION.md` - How ML works
   - `PROJECT_OVERVIEW.md` - Full project structure
   - `QUICKSTART.md` - Setup guide

---

## 🎉 You Did It!

You now have a working AI-powered vision health app!

**What Makes This Special:**
✅ Real ML/AI (not fake!)
✅ Works offline
✅ Privacy-focused
✅ Professional-grade code
✅ Fully customizable

**Have fun exploring!** 🚀

---

*Last Updated: December 12, 2025*
