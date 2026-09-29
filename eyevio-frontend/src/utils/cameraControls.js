/**
 * MediaStreamTrack image controls. Support varies by browser and device
 * (mostly Chrome on Android), so every helper reports what it achieved.
 */

const videoTrack = (stream) => stream?.getVideoTracks?.()[0] || null

/** Freeze white balance and exposure at their current auto values. */
export async function lockCameraColour(stream) {
  const track = videoTrack(stream)
  const caps = track?.getCapabilities?.() || {}
  const advanced = {}
  if (caps.whiteBalanceMode?.includes('manual')) advanced.whiteBalanceMode = 'manual'
  if (caps.exposureMode?.includes('manual')) advanced.exposureMode = 'manual'
  if (!Object.keys(advanced).length) return { locked: false, reason: 'unsupported' }
  try {
    await track.applyConstraints({ advanced: [advanced] })
    return { locked: true, ...advanced }
  } catch (err) {
    return { locked: false, reason: String(err?.name || err) }
  }
}

export function torchSupported(stream) {
  const caps = videoTrack(stream)?.getCapabilities?.() || {}
  return caps.torch === true
}

export async function setTorch(stream, on) {
  const track = videoTrack(stream)
  if (!track) return false
  try {
    await track.applyConstraints({ advanced: [{ torch: Boolean(on) }] })
    return true
  } catch {
    return false
  }
}

/** 'environment' | 'user' | null — desktop webcams usually report nothing. */
export function cameraFacing(stream) {
  return videoTrack(stream)?.getSettings?.().facingMode || null
}
