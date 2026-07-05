# EyeVio Frontend

React-based web application for AI-powered vision health monitoring.

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Zustand** - Lightweight state management
- **Axios** - HTTP client for API calls
- **Recharts** - Data visualization
- **React Hook Form + Zod** - Form handling and validation
- **React Icons** - Icon library
- **React Hot Toast** - Toast notifications

## Project Structure

```
src/
├── components/
│   └── layout/
│       ├── AuthLayout.jsx      # Layout for login/register pages
│       ├── MainLayout.jsx      # Main app layout with sidebar
│       ├── Navbar.jsx          # Top navigation bar
│       └── Sidebar.jsx         # Side navigation menu
├── pages/
│   ├── auth/
│   │   ├── Login.jsx           # Login page
│   │   └── Register.jsx        # Registration page
│   ├── Dashboard.jsx           # Main dashboard
│   ├── VisionTests.jsx         # Vision test selection
│   ├── VisionTestRunner.jsx   # Test execution interface
│   ├── Trends.jsx              # Trend analysis & predictions
│   ├── WebcamAnalysis.jsx      # Webcam-based eye analysis
│   ├── Profile.jsx             # User profile settings
│   ├── Reports.jsx             # PDF report generation
│   └── Home.jsx                # Landing page
├── services/
│   └── api.js                  # API client and endpoints
├── store/
│   └── authStore.js            # Authentication state management
├── App.jsx                     # Main app component with routing
├── main.jsx                    # Application entry point
└── index.css                   # Global styles + Tailwind directives

```

## Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn
- Backend API running on http://localhost:5000

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your API URL (default: http://localhost:5000/api):
```
VITE_API_URL=http://localhost:5000/api
```

### Development

Start the development server:
```bash
npm run dev
```

The app will be available at http://localhost:3000

### Build for Production

```bash
npm run build
```

Build output will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Features

### ✅ Implemented

- **Authentication**
  - User registration with profile details
  - Login with JWT token management
  - Protected routes
  - Logout functionality

- **Dashboard**
  - Health score overview
  - Quick stats (vision tests, trends, fatigue)
  - Recent activity
  - Quick action buttons

- **Profile Management**
  - Update personal information
  - Manage prescription details
  - Profile settings

- **Layout & Navigation**
  - Responsive design (mobile, tablet, desktop)
  - Sidebar navigation
  - Top navbar with user menu
  - Toast notifications

### 🚧 To Be Implemented

- **Vision Tests Module**
  - Visual acuity test interface
  - Contrast sensitivity test
  - Color vision test
  - Test history and results

- **Trends & Predictions**
  - Interactive charts (Recharts)
  - Vision drift predictions
  - Prescription change forecasting
  - Lens replacement recommendations

- **Webcam Analysis**
  - Real-time webcam capture
  - Eye fatigue detection
  - Blink rate monitoring
  - Session tracking

- **Lifestyle Logging**
  - Daily screen time tracking
  - Sleep hours logging
  - Outdoor activity tracking
  - Correlation analysis

- **Reports**
  - PDF report generation
  - Customizable date ranges
  - Download and share functionality

- **Alerts & Notifications**
  - Alert center
  - Push notifications
  - Email notifications
  - Action items

## API Integration

The app connects to the Flask backend via Axios. All API calls go through `src/services/api.js`:

- **Auth API**: `/api/auth/*` - Registration, login, profile
- **Vision Test API**: `/api/vision-test/*` - Submit tests, get results
- **Webcam API**: `/api/webcam/*` - Submit analysis, get metrics
- **Lens API**: `/api/lens/*` - Track lens effectiveness
- **Lifestyle API**: `/api/lifestyle/*` - Log activities, get correlations
- **Trend API**: `/api/trend/*` - Get trends, predictions, summaries
- **Alerts API**: `/api/alerts/*` - Manage notifications
- **Reports API**: `/api/report/*` - Generate PDF/JSON reports

## State Management

Using **Zustand** for global state:

- `authStore.js` - User authentication state
  - `user` - Current user object
  - `token` - JWT access token
  - `isAuthenticated` - Auth status
  - `login()` - Login function
  - `register()` - Registration function
  - `logout()` - Logout function
  - `updateUser()` - Update user data

## Styling

Using **Tailwind CSS** with custom configuration:

- Custom primary color palette (blue shades)
- Reusable component classes (`.btn-primary`, `.card`, `.input`)
- Responsive design utilities
- Dark mode support (future enhancement)

## Development Guidelines

1. **Component Structure**: Use functional components with hooks
2. **State Management**: Use Zustand for global state, local state for component-specific data
3. **API Calls**: Always use the API client from `services/api.js`
4. **Error Handling**: Show toast notifications for errors
5. **Loading States**: Display loading indicators during async operations
6. **Responsive Design**: Mobile-first approach with Tailwind breakpoints
7. **Code Style**: Follow ESLint configuration

## Next Steps

1. **Implement Vision Tests**
   - Build visual acuity test with Snellen chart
   - Create contrast sensitivity test
   - Add color vision test (Ishihara-style)

2. **Add Trend Charts**
   - Integrate Recharts for data visualization
   - Create line charts for vision trends
   - Add prediction visualizations

3. **Build Webcam Module**
   - Integrate react-webcam
   - Connect to backend webcam API
   - Display real-time fatigue metrics

4. **Complete Lifestyle Module**
   - Create logging forms
   - Display correlation charts
   - Add daily reminders

5. **Implement Alerts System**
   - Fetch and display alerts
   - Add real-time notifications
   - Implement action buttons

## License

Proprietary - All rights reserved
