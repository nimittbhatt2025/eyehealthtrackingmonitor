import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
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
import RouteFallback from './components/RouteFallback'

// Layouts
import MainLayout from './components/layout/MainLayout'
import AuthLayout from './components/layout/AuthLayout'
import VisionTestActiveLayout from './components/layout/VisionTestActiveLayout'

// Auth pages load eagerly; every other page is its own chunk, so MediaPipe and
// onnxruntime-web download only with the tests that use them.
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'

const Home = lazy(() => import('./pages/Home'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const VisionTests = lazy(() => import('./pages/VisionTests'))
const VisionTestRouteRedirect = lazy(() => import('./components/VisionTestRouteRedirect'))
const ContrastSensitivityTest = lazy(() => import('./pages/ContrastSensitivityTest'))
const SideVisionTest = lazy(() => import('./pages/SideVisionTest'))
const CataractTest = lazy(() => import('./pages/CataractTest'))
const DryEyeTest = lazy(() => import('./pages/DryEyeTest'))
const RedReflexTest = lazy(() => import('./pages/RedReflexTest'))
const AccommodativeLagTest = lazy(() => import('./pages/AccommodativeLagTest'))
const NearPointConvergenceTest = lazy(() => import('./pages/NearPointConvergenceTest'))
const PeripheralAwarenessTest = lazy(() => import('./pages/PeripheralAwarenessTest'))
const OcularErgonomicsMonitor = lazy(() => import('./pages/OcularErgonomicsMonitor'))
const TestDetails = lazy(() => import('./pages/TestDetails'))
const Trends = lazy(() => import('./pages/Trends'))
const Lifestyle = lazy(() => import('./pages/Lifestyle'))
const Achievements = lazy(() => import('./pages/Achievements'))
const EyeConditions = lazy(() => import('./pages/EyeConditions'))
const Community = lazy(() => import('./pages/Community'))
const Alerts = lazy(() => import('./pages/Alerts'))
const Settings = lazy(() => import('./pages/Settings'))
const Help = lazy(() => import('./pages/Help'))
const Profile = lazy(() => import('./pages/Profile'))
const Reports = lazy(() => import('./pages/Reports'))
const BlinkCalibration = lazy(() => import('./pages/BlinkCalibration'))
const EyeTrackingAnalysis = lazy(() => import('./pages/EyeTrackingAnalysis'))
const EyeHealthMonitor = lazy(() => import('./pages/EyeHealthMonitor'))
const CataractOpacityMonitor = lazy(() => import('./pages/CataractOpacityMonitor'))
const ResearchLab = lazy(() => import('./pages/ResearchLab'))
const MyopiaProgression = lazy(() => import('./pages/MyopiaProgression'))
const DigitalWellbeing = lazy(() => import('./pages/DigitalWellbeing'))
const FamilyDashboard = lazy(() => import('./pages/FamilyDashboard'))
const IPDDistanceCalibration = lazy(() => import('./components/IPDDistanceCalibration'))
const VisualAcuityTest = lazy(() => import('./pages/VisualAcuityTest'))
const ColorVisionTest = lazy(() => import('./pages/ColorVisionTest'))
const AmslerGridTest = lazy(() => import('./pages/AmslerGridTest'))

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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <CameraProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
            <Suspense fallback={<RouteFallback fullScreen />}>
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
                <Route element={<VisionTestActiveLayout />}>
                  <Route path="/vision-tests/visual_acuity" element={<VisualAcuityTest />} />
                  <Route path="/vision-tests/color_vision" element={<ColorVisionTest />} />
                  <Route path="/vision-tests/amsler_grid" element={<AmslerGridTest />} />
                  <Route path="/vision-tests/contrast_sensitivity" element={<ContrastSensitivityTest />} />
                  <Route path="/vision-tests/side_vision" element={<SideVisionTest />} />
                  <Route path="/vision-tests/glaucoma_neural" element={<Navigate to="/vision-tests/side_vision" replace />} />
                  <Route path="/vision-tests/cataract_glare" element={<CataractTest />} />
                  <Route path="/vision-tests/dry_eye" element={<DryEyeTest />} />
                  <Route path="/vision-tests/red_reflex" element={<RedReflexTest />} />
                  <Route path="/vision-tests/accommodative_lag" element={<AccommodativeLagTest />} />
                  <Route path="/vision-tests/near_point_convergence" element={<NearPointConvergenceTest />} />
                  <Route path="/vision-tests/peripheral_awareness" element={<PeripheralAwarenessTest />} />
                  <Route path="/vision-tests/ocular_ergonomics" element={<OcularErgonomicsMonitor />} />
                  <Route path="/vision-tests/:testType" element={<VisionTestRouteRedirect />} />
                </Route>
                <Route path="/test-details/:testId" element={<TestDetails />} />
                <Route path="/trends" element={<Trends />} />
                <Route path="/myopia" element={<MyopiaProgression />} />
                <Route path="/digital-wellbeing" element={<DigitalWellbeing />} />
                <Route path="/family" element={<FamilyDashboard />} />
                
                {/* Eye Tracking / Health Monitoring - Consolidated */}
                <Route path="/eye-tracking-analysis" element={<EyeTrackingAnalysis />} />
                <Route path="/eye-health-monitor" element={<EyeHealthMonitor />} />
                <Route path="/cataract-opacity-monitor" element={<CataractOpacityMonitor />} />
                <Route path="/webcam" element={<Navigate to="/eye-tracking-analysis" replace />} /> {/* Redirect old route */}
                <Route path="/calibrate-blink" element={<BlinkCalibration />} />
                <Route path="/blink-calibration" element={<Navigate to="/calibrate-blink" replace />} />
                
                <Route path="/eye-conditions" element={<EyeConditions />} />
                <Route path="/research-lab" element={<ResearchLab />} />
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
            </Suspense>
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
