// Simple shared camera manager
// Provides acquire(constraints) -> Promise<MediaStream>, release() to stop when unused

let sharedStream = null
let refCount = 0
let persistent = false
let lastAcquireError = null

const isStreamLive = (stream) => {
  if (!stream) return false
  const tracks = stream.getVideoTracks()
  return tracks.length > 0 && tracks.some((track) => track.readyState === 'live')
}

const clearSharedStream = () => {
  try {
    if (sharedStream) {
      sharedStream.getTracks().forEach((track) => track.stop())
    }
  } catch (e) {
    console.warn('cameraManager: Error stopping tracks', e)
  }
  sharedStream = null
  refCount = 0
}

const acquire = async (constraints = { video: true, audio: false }) => {
  // Reuse only if the shared stream is still live
  if (sharedStream && isStreamLive(sharedStream)) {
    refCount += 1
    console.log('cameraManager: Reusing existing stream (refs=', refCount, ')')
    return sharedStream
  }

  // Drop stale/dead cached streams before acquiring a new one
  if (sharedStream) {
    console.warn('cameraManager: Cached stream is no longer live, re-acquiring')
    clearSharedStream()
  }

  // Try to acquire a new stream. Do not cache failed attempts as a stream.
  try {
    console.log('cameraManager: Acquiring new MediaStream...')
    lastAcquireError = null
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    sharedStream = stream
    refCount = 1
    console.log('cameraManager: Acquired stream (refs=1)')
    return sharedStream
  } catch (err) {
    // Record the error to help callers decide what to show, but don't keep a broken stream
    console.error('cameraManager: Failed to acquire MediaStream:', err)
    lastAcquireError = err
    throw err
  }
}

const getStream = () => sharedStream

const release = () => {
  if (!sharedStream) return
  refCount -= 1
  console.log('cameraManager: release called (refs=', refCount, ', persistent=', persistent, ')')
  if (refCount <= 0 && !persistent) {
    clearSharedStream()
    console.log('cameraManager: Stream stopped and cleared')
  }
}

const persist = (enable = true) => {
  persistent = !!enable
  console.log('cameraManager: persist set to', persistent)
}

const isPersistent = () => persistent

const reset = () => {
  // Force-clear any cached stream and error; useful after user updates permissions
  clearSharedStream()
  lastAcquireError = null
  console.log('cameraManager: reset completed')
}

const getLastError = () => lastAcquireError

const queryPermission = async () => {
  // Returns 'granted' | 'denied' | 'prompt' | 'unknown'
  if (!navigator.permissions || !navigator.permissions.query) return 'unknown'
  try {
    // Some browsers use 'camera', others 'microphone' combined; try camera first
    const status = await navigator.permissions.query({ name: 'camera' })
    return status.state
  } catch (e) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' })
      return status.state
    } catch (err) {
      return 'unknown'
    }
  }
}

export default {
  acquire,
  release,
  getStream,
  persist,
  isPersistent,
  reset,
  getLastError,
  queryPermission
}
