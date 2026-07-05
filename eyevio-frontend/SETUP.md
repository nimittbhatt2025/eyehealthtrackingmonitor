# Frontend Setup & Launch Guide

## Prerequisites Installation

### 1. Install Node.js and npm

**Option A: Using Homebrew (Recommended for macOS)**
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js (includes npm)
brew install node

# Verify installation
node --version  # Should show v18.x.x or higher
npm --version   # Should show v9.x.x or higher
```

**Option B: Direct Download**
- Visit https://nodejs.org/
- Download the LTS version (18.x or higher)
- Run the installer
- Restart your terminal

## Quick Start

### 1. Install Dependencies
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio-frontend
npm install
```

This will install all required packages (~300MB):
- React, React DOM, React Router
- Vite (dev server & build tool)
- Tailwind CSS & PostCSS
- Zustand (state management)
- Axios (API client)
- Recharts (charts)
- React Icons, React Hot Toast
- And more...

### 2. Configure Environment
```bash
cp .env.example .env
```

The `.env` file should contain:
```
VITE_API_URL=http://localhost:5000/api
```

### 3. Start Development Server
```bash
npm run dev
```

The app will start at: **http://localhost:3000**

### 4. Start Backend API (In Separate Terminal)
```bash
cd /Users/vivaanbhatt/Desktop/research-project/eyevio
source venv/bin/activate
python run.py
```

Backend runs at: **http://localhost:5000**

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (http://localhost:3000) |
| `npm run build` | Build for production (output in `dist/`) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint to check code quality |

## Project Overview

### Completed Features ✅

1. **Authentication System**
   - Registration page with form validation
   - Login page with JWT token handling
   - Protected routes (redirect to login if not authenticated)
   - Logout functionality
   - Token storage in localStorage

2. **Dashboard**
   - Health score display with visual indicators
   - Quick stats cards (vision tests, trends, fatigue)
   - Recent activity section
   - Quick action buttons to start tests
   - Responsive design for mobile/tablet/desktop

3. **Layout Components**
   - `AuthLayout` - Clean layout for login/register pages
   - `MainLayout` - App layout with navbar and sidebar
   - `Navbar` - Top navigation with user menu and notifications
   - `Sidebar` - Collapsible side navigation (mobile-friendly)

4. **Profile Management**
   - Update personal information (name, age, gender)
   - Manage prescription details (left/right eye)
   - Save changes to backend

5. **API Integration**
   - Axios client with interceptors
   - Automatic JWT token injection
   - Error handling with toast notifications
   - API endpoints for all backend routes:
     - Auth: register, login, profile
     - Vision Tests: submit, get history, get stats
     - Webcam: analysis, metrics, fatigue trends
     - Lens: data, effectiveness, history
     - Lifestyle: logs, correlations
     - Trends: predictions, summaries
     - Alerts: manage notifications
     - Reports: generate PDFs

6. **State Management**
   - Zustand store for authentication
   - User data persistence
   - Loading states
   - Token management

7. **UI/UX**
   - Tailwind CSS for styling
   - Custom component classes (btn-primary, card, input)
   - Responsive design (mobile-first)
   - Toast notifications for feedback
   - React Icons for consistent iconography

### Pending Implementation 🚧

1. **Vision Tests Module** (Priority 1)
   - Visual acuity test interface (Snellen chart)
   - Contrast sensitivity test
   - Color vision test (Ishihara-style plates)
   - Test instructions and calibration
   - Results display with scoring
   - Test history table

2. **Trends & Predictions Page** (Priority 2)
   - Line charts for vision trends (Recharts)
   - Prediction visualizations
   - Date range filters
   - Export data functionality

3. **Webcam Analysis Module** (Priority 3)
   - React-webcam integration
   - Real-time video display
   - Start/stop session controls
   - Live fatigue metrics display
   - Session history

4. **Lifestyle Logging** (Priority 4)
   - Daily log entry forms
   - Activity tracking (screen time, sleep, outdoor)
   - Correlation charts
   - Weekly summaries

5. **Reports Generator** (Priority 5)
   - Date range selector
   - Report customization options
   - PDF download
   - JSON export

6. **Alerts & Notifications** (Priority 6)
   - Notification center
   - Mark as read/dismiss actions
   - Real-time updates (future: WebSocket)
   - Email notification settings

## Development Workflow

### Step 1: Test Authentication
1. Start both backend and frontend servers
2. Open http://localhost:3000
3. Click "Get Started" or "Sign Up"
4. Register a new account
5. You should be redirected to the dashboard

### Step 2: Test Dashboard
1. After login, verify dashboard loads
2. Check health score display
3. Verify quick stats cards
4. Check API data loading

### Step 3: Test Profile
1. Click profile in sidebar
2. Update your information
3. Add prescription details
4. Save and verify changes

### Step 4: Implement Vision Tests (Next Task)
The scaffolding is ready in:
- `src/pages/VisionTests.jsx` - Test selection page
- `src/pages/VisionTestRunner.jsx` - Test execution interface

Next steps:
1. Create test type cards (Acuity, Contrast, Color)
2. Build Snellen chart for acuity test
3. Implement scoring logic
4. Submit results to backend
5. Display test history

### Step 5: Implement Trends Page
The scaffolding is in `src/pages/Trends.jsx`

Next steps:
1. Fetch trend data from API
2. Create Recharts line charts
3. Display predictions
4. Add filters and export

### Step 6: Implement Webcam Module
The scaffolding is in `src/pages/WebcamAnalysis.jsx`

Next steps:
1. Add react-webcam component
2. Capture video frames
3. Send to backend for analysis
4. Display fatigue metrics
5. Track sessions

## Troubleshooting

### Port 3000 already in use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
npm run dev -- --port 3001
```

### Backend connection issues
- Ensure backend is running on http://localhost:5000
- Check `.env` has correct `VITE_API_URL`
- Check browser console for CORS errors
- Verify vite.config.js proxy settings

### Build errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Tailwind styles not working
- Ensure `index.css` imports Tailwind directives
- Check `tailwind.config.js` content paths
- Restart dev server after config changes

## File Structure

```
eyevio-frontend/
├── public/              # Static assets
├── src/
│   ├── components/
│   │   └── layout/      # Layout components
│   ├── pages/           # Page components
│   │   └── auth/        # Auth pages
│   ├── services/
│   │   └── api.js       # API client
│   ├── store/
│   │   └── authStore.js # Auth state
│   ├── App.jsx          # Main app with routing
│   ├── main.jsx         # Entry point
│   └── index.css        # Global styles
├── .env                 # Environment variables
├── .env.example         # Environment template
├── .gitignore           # Git ignore rules
├── index.html           # HTML template
├── package.json         # Dependencies
├── postcss.config.js    # PostCSS config
├── tailwind.config.js   # Tailwind config
├── vite.config.js       # Vite config
└── README.md            # This file
```

## Production Deployment

### Build for Production
```bash
npm run build
```

Output in `dist/` directory contains:
- Optimized JavaScript bundles
- Minified CSS
- Static HTML
- Assets with cache-busting hashes

### Deploy Options

**Option 1: Vercel (Recommended)**
```bash
npm install -g vercel
vercel login
vercel --prod
```

**Option 2: Netlify**
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=dist
```

**Option 3: Traditional Server**
- Upload `dist/` contents to web server
- Configure server to serve index.html for all routes (SPA)
- Set up SSL certificate
- Configure CORS on backend

### Environment Variables for Production
Update `.env` with production API URL:
```
VITE_API_URL=https://api.eyevio.com/api
```

Rebuild after changing environment variables:
```bash
npm run build
```

## Next Development Session

### Recommended Order:
1. **Install Node.js** (see prerequisites above)
2. **Run `npm install`** in frontend directory
3. **Start both servers** (backend + frontend)
4. **Test authentication flow** (register → login → dashboard)
5. **Implement Vision Tests page** (highest priority)
6. **Add charts to Trends page**
7. **Build Webcam module**

### Time Estimates:
- Vision Tests Module: 8-12 hours
- Trends & Charts: 4-6 hours
- Webcam Analysis: 6-8 hours
- Lifestyle Logging: 4-6 hours
- Reports: 3-4 hours
- Alerts: 2-3 hours

**Total:** ~30-40 hours for complete frontend

## Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Zustand](https://github.com/pmndrs/zustand)
- [React Router](https://reactrouter.com)
- [Recharts](https://recharts.org)

## Support

For issues or questions:
1. Check browser console for errors
2. Verify backend is running and accessible
3. Check network tab for failed API calls
4. Review component-specific TODO comments

---

**Status**: Frontend foundation complete ✅  
**Next**: Install dependencies and start development server
