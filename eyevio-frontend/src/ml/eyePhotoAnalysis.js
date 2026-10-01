import { analyzeOnDevice, onDeviceSupported, shouldFallBackToServer } from './onDeviceInference'

const FALLBACK_REASONS = {
  save_photos_opt_in: 'Photo saving is on, so the photo was analysed on the server and stored in your account.',
  unsupported: 'This browser cannot run the on-device models, so the photo was analysed on the server.',
  model_missing: 'The on-device models could not be downloaded, so the photo was analysed on the server.',
  model_integrity: 'The on-device model failed its integrity check, so the photo was analysed on the server.',
  timeout: 'On-device analysis took too long, so the photo was analysed on the server.',
}

export function describeAnalysisLocation(where) {
  if (!where) return null
  if (where.mode === 'on_device') {
    const engine = where.payload?.runtime?.webgpu ? 'WebGPU' : 'WebAssembly'
    return `Analysed on this device (${engine}, ${where.timings?.analyze_ms ?? '?'} ms). Your photo never left it.`
  }
  return FALLBACK_REASONS[where.reason] || 'The photo was analysed on the server.'
}

/**
 * Decide where a captured frame is analysed and, on-device, analyse it.
 *
 * @returns {Promise<{mode:'on_device', payload, overlays, timings} | {mode:'server', reason, landmarks}>}
 * Server mode carries the face landmarks (or null) so the upload can be cropped.
 * Throws (err.code 'no_face' | 'eye_too_small') when the user should retake instead.
 */
export async function analyzeCapturedFrame(task, canvas, lightingPreview, { savePhotos = false } = {}) {
  let landmarks = null
  try {
    landmarks = await lightingPreview.detectLandmarks(canvas)
  } catch (err) {
    console.warn('Face landmarks unavailable, using server:', err)
    return { mode: 'server', reason: savePhotos ? 'save_photos_opt_in' : 'inference_failed', landmarks: null }
  }
  if (savePhotos) return { mode: 'server', reason: 'save_photos_opt_in', landmarks }
  if (!onDeviceSupported()) return { mode: 'server', reason: 'unsupported', landmarks }
  if (!landmarks) {
    const err = new Error('No face found in the photo. Center your face with both eyes visible and try again.')
    err.code = 'no_face'
    throw err
  }
  try {
    const out = await analyzeOnDevice(task, canvas, landmarks)
    return { mode: 'on_device', payload: out.result, overlays: out.overlays, timings: out.timings }
  } catch (err) {
    if (!shouldFallBackToServer(err)) throw err
    console.warn('On-device analysis unavailable, using server:', err)
    return { mode: 'server', reason: err.code || 'inference_failed', landmarks }
  }
}
