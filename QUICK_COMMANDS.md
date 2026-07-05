# ⚡ QUICK COMMANDS - EyeVio

## 🎯 START THE APP (Choose ONE method)

### Method 1: Automatic (Easiest!)
```bash
cd /Users/vivaanbhatt/Desktop/research-project
./start_eyevio.sh
```
Then open: **http://localhost:5173**

---

### Method 2: Manual (Step by Step)

**Terminal 1 - Backend:**
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
source venv/bin/activate
python run.py
```

**Terminal 2 - Frontend:**
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend
npm run dev
```

Then open: **http://localhost:5173**

---

## 🛑 STOP THE APP

**If using automatic start:**
- Press `Ctrl + C` in the terminal

**If using manual start:**
- Press `Ctrl + C` in BOTH terminals

---

## 🧪 TEST ML FEATURES

```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
source venv/bin/activate
python test_ml.py
```

---

## 🔧 FIX PROBLEMS

### App won't start?
```bash
# Kill stuck processes
lsof -ti:5000 | xargs kill -9   # Backend
lsof -ti:5173 | xargs kill -9   # Frontend

# Reinstall dependencies
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
source venv/bin/activate
pip install -r requirements.txt

cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend
npm install
```

### Database errors?
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
source venv/bin/activate
flask db upgrade
```

---

## 📊 USEFUL COMMANDS

### Check if servers are running
```bash
# Backend (should show Python)
lsof -i:5000

# Frontend (should show Node)
lsof -i:5173
```

### View logs
```bash
# Backend logs are in the terminal where you ran python run.py
# Frontend logs are in the browser console (F12 → Console)
```

### Install new Python package
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
source venv/bin/activate
pip install package-name
```

### Install new npm package
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend
npm install package-name
```

---

## 🎨 CUSTOMIZE YOUR APP

### Change colors/styling
Edit: `eyevio-frontend/tailwind.config.js`

### Add new page
1. Create file in: `eyevio-frontend/src/pages/YourPage.jsx`
2. Add route in: `eyevio-frontend/src/App.jsx`

### Add new API endpoint
1. Create in: `eyevio/app/routes/your_route.py`
2. Register in: `eyevio/app/__init__.py`

---

## 📱 PORTS USED

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **Database**: localhost:5432 (PostgreSQL)

---

## 🆘 QUICK HELP

**Something not working?**
1. Read the error message
2. Check BEGINNERS_GUIDE.md
3. Google the error
4. Check if ports are available: `lsof -i:5000` and `lsof -i:5173`

**Still stuck?**
- Look at ML_IMPLEMENTATION.md for ML details
- Look at PROJECT_OVERVIEW.md for architecture
- Run test_ml.py to verify ML works

---

## 🎓 LEARN MORE

- **React**: https://react.dev/learn
- **Flask**: https://flask.palletsprojects.com/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **MediaPipe**: https://google.github.io/mediapipe/

---

*Keep this file open while working on EyeVio!*
