import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import ErrorBoundary from './components/ErrorBoundary'
import AIChatbot from './components/AIChatbot'
import { ThemeProvider } from './context/ThemeContext'
import { KeyboardShortcutsProvider } from './context/KeyboardShortcutsContext'
import { CameraProvider } from './context/CameraContext'
import CameraIndicator from './components/CameraIndicator'
import CameraPermissionBanner from './components/CameraPermissionBanner'

// Layouts
import MainLayout from './components/layout/MainLayout'
import AuthLayout from './components/layout/AuthLayout'

// Pages
import Home from './pages/Home'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import VisionTests from './pages/VisionTests'
import VisionTestRunner from './pages/VisionTestRunner'
import ContrastSensitivityTest from './pages/ContrastSensitivityTest'
import GlaucomaTest from './pages/GlaucomaTest'
import CataractTest from './pages/CataractTest'
import RedReflexTest from './pages/RedReflexTest'
import AccommodativeLagTest from './pages/AccommodativeLagTest'
import PeripheralAwarenessTest from './pages/PeripheralAwarenessTest'
import OcularErgonomicsMonitor from './pages/OcularErgonomicsMonitor'
import TestDetails from './pages/TestDetails'
import Trends from './pages/Trends'
import Lifestyle from './pages/Lifestyle'
import Achievements from './pages/Achievements'
import EyeConditions from './pages/EyeConditions'
import Community from './pages/Community'
import Alerts from './pages/Alerts'
import Settings from './pages/Settings'
import Help from './pages/Help'
import Profile from './pages/Profile'
import Reports from './pages/Reports'
import BlinkCalibration from './pages/BlinkCalibration'
import EyeTrackingAnalysis from './pages/EyeTrackingAnalysis'
import UniversalCalibration from './components/UniversalCalibration'
import IPDDistanceCalibration from './components/IPDDistanceCalibration'
import VisualAcuityTest from './pages/VisualAcuityTest'
import ColorVisionTest from './pages/ColorVisionTest'
import AmslerGridTest from './pages/AmslerGridTest'

// Protected Route Component
function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const hydrate = useAuthStore((state) => state.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const hasToken = !!localStorage.getItem('access_token')

  if (!isAuthenticated && !hasToken) {
    return <Navigate to="/login" replace />
  }

  return children
}

// Calibration Wrapper to handle returnTo parameter
function CalibrationWrapper() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo')

  const handleComplete = () => {
    if (returnTo) {
      navigate(returnTo)
    } else {
      navigate('/vision-tests')
    }
  }

  return <UniversalCalibration onComplete={handleComplete} />
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <CameraProvider eagerModels={true}>
          <Router>
            <KeyboardShortcutsProvider>
            <Toaster 
              position="top-right"
              toastOptions={{
                className: 'dark:bg-gray-800 dark:text-white',
                style: {
                  background: 'var(--toast-bg, #fff)',
                  color: 'var(--toast-color, #000)',
                },
              }}
            />
            <PWAInstallPrompt />
            <AIChatbot />
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              
              {/* Auth Routes */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Route>

              {/* Onboarding Route - Protected but outside MainLayout */}
              <Route path="/onboarding" element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              } />

              {/* IPD Distance Calibration - Advanced face tracking */}
              <Route path="/calibration" element={
                <ProtectedRoute>
                  <IPDDistanceCalibration />
                </ProtectedRoute>
              } />

              {/* Protected Routes */}
              <Route element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/vision-tests" element={<VisionTests />} />
                {/* Specific test pages must come before the :testType catch-all */}
                <Route path="/vision-tests/visual_acuity" element={<VisualAcuityTest />} />
                <Route path="/vision-tests/color_vision" element={<ColorVisionTest />} />
                <Route path="/vision-tests/amsler_grid" element={<AmslerGridTest />} />
                <Route path="/vision-tests/contrast_sensitivity" element={<ContrastSensitivityTest />} />
                <Route path="/vision-tests/glaucoma_neural" element={<GlaucomaTest />} />
                <Route path="/vision-tests/cataract_glare" element={<CataractTest />} />
                <Route path="/vision-tests/red_reflex" element={<RedReflexTest />} />
                <Route path="/vision-tests/accommodative_lag" element={<AccommodativeLagTest />} />
                <Route path="/vision-tests/peripheral_awareness" element={<PeripheralAwarenessTest />} />
                <Route path="/vision-tests/ocular_ergonomics" element={<OcularErgonomicsMonitor />} />
                <Route path="/vision-tests/:testType" element={<VisionTestRunner />} />
                <Route path="/test-details/:testId" element={<TestDetails />} />
                <Route path="/trends" element={<Trends />} />
                
                {/* Eye Tracking / Health Monitoring - Consolidated */}
                <Route path="/eye-tracking-analysis" element={<EyeTrackingAnalysis />} />
                <Route path="/webcam" element={<Navigate to="/eye-tracking-analysis" replace />} /> {/* Redirect old route */}
                <Route path="/calibrate-blink" element={<BlinkCalibration />} />
                
                <Route path="/eye-conditions" element={<EyeConditions />} />
                <Route path="/lifestyle" element={<Lifestyle />} />
                <Route path="/achievements" element={<Achievements />} />
                <Route path="/community" element={<Community />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/help" element={<Help />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/reports" element={<Reports />} />
              </Route>

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </KeyboardShortcutsProvider>
          </Router>
          <CameraPermissionBanner />
          <CameraIndicator />
        </CameraProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
