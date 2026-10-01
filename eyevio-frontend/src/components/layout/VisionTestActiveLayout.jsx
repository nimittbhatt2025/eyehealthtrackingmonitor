import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { TestExitButton, useVisionTestExit } from '../TestPrepLayout'
import RouteFallback from '../RouteFallback'

/** Wraps individual vision test routes — provides a consistent exit control. */
export default function VisionTestActiveLayout() {
  const exitTest = useVisionTestExit()

  return (
    <div className="vision-test-page">
      <div className="vision-test-page-bar">
        <TestExitButton onExit={exitTest} />
      </div>
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </div>
  )
}
