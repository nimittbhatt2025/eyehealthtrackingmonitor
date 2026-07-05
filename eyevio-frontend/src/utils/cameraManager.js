// Simple shared camera manager
// Provides acquire(constraints) -> Promise<MediaStream>, release() to stop when unused

let sharedStream = null
let refCount = 0
let persistent = false
let lastAcquireError = null

const acquire = async (constraints = { video: true, audio: false }) => {
  // If we already have a live stream, reuse it and increment ref count
  if (sharedStream) {
    refCount += 1
    console.log('cameraManager: Reusing existing stream (refs=', refCount, ')')
    return sharedStream
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
    try {
      sharedStream.getTracks().forEach(t => t.stop())
    } catch (e) {
      console.warn('cameraManager: Error stopping tracks', e)
    }
    sharedStream = null
    refCount = 0
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
  try {
    if (sharedStream) {
      sharedStream.getTracks().forEach(t => t.stop())
    }
  } catch (e) {
    console.warn('cameraManager.reset: error stopping tracks', e)
  }
  sharedStream = null
  refCount = 0
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
