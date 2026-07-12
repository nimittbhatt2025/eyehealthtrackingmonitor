/** True when user is on an individual vision test page (not the test list). */
export function isVisionTestActiveRoute(pathname) {
  return /^\/vision-tests\/[^/]+$/.test(pathname)
}

/** Full-width immersive sessions — hide sidebar, compact padding. */
export function isImmersiveSessionRoute(pathname) {
  return isVisionTestActiveRoute(pathname) || pathname === '/eye-tracking-analysis'
}
