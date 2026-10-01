/**
 * Main-thread client for on-device eye-photo analysis.
 *
 * Default flow: the photo is analysed in a Web Worker and only per-eye scores
 * are sent to the API. Photos are uploaded only when the user opts in to
 * "save photos to my account" (the server path), or automatically when the
 * browser cannot run the models (no WebAssembly SIMD, model download failed).
 */

const SAVE_PHOTOS_KEY = 'eyevio.savePhotos'
const ANALYZE_TIMEOUT_MS = 90_000

let worker = null
let seq = 0
const pending = new Map()

// Smallest module using a v128 SIMD instruction.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
])

export function onDeviceSupported() {
  try {
    return (
      typeof Worker !== 'undefined' &&
      typeof WebAssembly === 'object' &&
      WebAssembly.validate(SIMD_PROBE) &&
      typeof crypto !== 'undefined' &&
      Boolean(crypto.subtle)
    )
  } catch {
    return false
  }
}

export function getSavePhotosPreference() {
  try {
    return localStorage.getItem(SAVE_PHOTOS_KEY) === '1'
  } catch {
    return false
  }
}

export function setSavePhotosPreference(value) {
  try {
    localStorage.setItem(SAVE_PHOTOS_KEY, value ? '1' : '0')
  } catch {
    /* private mode: preference lasts for this page only */
  }
}

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./eyeInference.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (event) => {
    const msg = event.data
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    clearTimeout(entry.timer)
    if (msg.type === 'error') {
      const err = new Error(msg.message)
      err.code = msg.code
      entry.reject(err)
    } else {
      entry.resolve(msg)
    }
  }
  worker.onerror = (event) => {
    const err = new Error(event.message || 'On-device worker failed')
    err.code = 'worker_crashed'
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(err)
    }
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

function call(message, transfer = []) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      const err = new Error('On-device analysis timed out')
      err.code = 'timeout'
      reject(err)
    }, ANALYZE_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    getWorker().postMessage({ ...message, id }, transfer)
  })
}

const TASK_MODELS = { redness: ['sclera_redness'], cataract: ['cataract_screen'] }

/** Start downloading / compiling the models for a task while the user frames the shot. */
export function warmOnDevice(task) {
  if (!onDeviceSupported()) return Promise.resolve(null)
  return call({ type: 'init', models: TASK_MODELS[task] || [] }).catch(() => null)
}

function rgbaToDataUrl({ width, height, data }, quality = 0.85) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer ?? data), width, height), 0, 0)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Analyse the frame currently drawn on `canvas`.
 * @param {'redness'|'cataract'} task
 * @param {HTMLCanvasElement} canvas  frame exactly as captured
 * @param {{x:number,y:number}[]} landmarks  Face Mesh landmarks for this frame (normalised)
 * @returns {Promise<{ result, overlays: {left?:string,right?:string}, timings }>}
 */
export async function analyzeOnDevice(task, canvas, landmarks, { withCam = true } = {}) {
  if (!onDeviceSupported()) {
    const err = new Error('This browser cannot run the on-device models')
    err.code = 'unsupported'
    throw err
  }
  const { width, height } = canvas
  const rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data
  const buffer = rgba.buffer.slice(0)
  const msg = await call(
    { type: 'analyze', task, frame: { width, height, buffer }, landmarks, withCam },
    [buffer],
  )
  const overlays = {}
  for (const [side, img] of Object.entries(msg.overlays || {})) overlays[side] = rgbaToDataUrl(img)
  return { result: msg.result, overlays, timings: msg.timings }
}

/** True when a failure means "use the server instead" rather than "retake the photo". */
export function shouldFallBackToServer(err) {
  return !['no_face', 'eye_too_small'].includes(err?.code)
}
