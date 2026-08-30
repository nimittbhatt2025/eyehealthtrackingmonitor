import { Navigate, useParams } from 'react-router-dom'
import { getVisionTestRoute } from '../utils/visionTestRoutes'

/**
 * Redirects legacy /vision-tests/:testType URLs to canonical test routes.
 * Replaces VisionTestRunner catch-all to avoid duplicate scoring logic.
 */
export default function VisionTestRouteRedirect() {
  const { testType } = useParams()
  const target = getVisionTestRoute(testType || '')
  return <Navigate to={target} replace />
}
