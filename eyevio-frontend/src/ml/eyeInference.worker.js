/**
 * Eye-photo inference off the main thread: ONNX Runtime Web (WASM SIMD, WebGPU
 * for fp32 models when available) + the ported preprocessing in ocularAnalysis.js.
 *
 * Protocol (postMessage):
 *   { type: 'init', models }                       → { type: 'ready', backend, models }
 *   { type: 'analyze', id, task, frame, landmarks, withCam }
 *        frame = { width, height, buffer }  (RGBA, transferred)
 *                                                  → { type: 'result', id, result, overlays, timings }
 *   any failure                                    → { type: 'error', id, code, message }
 */

import { rgbaToRgb } from './imageOps.js'
import { OnDeviceError, analyzeCataractFrame, analyzeRednessFrame } from './ocularAnalysis.js'

const MODEL_BASE = '/models/'
const CACHE_NAME = 'eyevio-onnx-v1'
const TASK_MODELS = { redness: ['sclera_redness'], cataract: ['cataract_screen'] }

let ortPromise = null
let manifestPromise = null
const sessions = new Map()
let backendInfo = null

function hasWebGpu() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

async function loadOrt() {
  if (!ortPromise) {
    ortPromise = (async () => {
      const webgpu = hasWebGpu() && (await navigator.gpu.requestAdapter().catch(() => null))
      const ort = webgpu ? await import('onnxruntime-web') : await import('onnxruntime-web/wasm')
      const threads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
      ort.env.wasm.numThreads = threads
      backendInfo = { webgpu: Boolean(webgpu), wasmThreads: threads, ortVersion: ort.env.versions?.web }
      return ort
    })()
  }
  return ortPromise
}

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${MODEL_BASE}manifest.json`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new OnDeviceError('manifest_missing', 'On-device model manifest not found')
      return r.json()
    })
  }
  return manifestPromise
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Models are content-addressed by sha256, so a cached copy is valid until the manifest changes.
async function fetchModel(fileInfo) {
  const url = `${MODEL_BASE}${fileInfo.file}`
  const cacheKey = `${url}?sha256=${fileInfo.sha256}`
  const cache = typeof caches !== 'undefined' ? await caches.open(CACHE_NAME).catch(() => null) : null
  let response = cache ? await cache.match(cacheKey) : null
  const fromCache = Boolean(response)
  if (!response) {
    response = await fetch(url)
    if (!response.ok) throw new OnDeviceError('model_missing', `Model file ${fileInfo.file} not found`)
  }
  const buffer = await response.arrayBuffer()
  if ((await sha256Hex(buffer)) !== fileInfo.sha256) {
    if (cache) await cache.delete(cacheKey)
    throw new OnDeviceError('model_integrity', `Model ${fileInfo.file} failed its integrity check`)
  }
  if (cache && !fromCache) await cache.put(cacheKey, new Response(buffer)).catch(() => {})
  return buffer
}

async function getSession(name) {
  if (sessions.has(name)) return sessions.get(name)
  const promise = (async () => {
    const [ort, manifest] = await Promise.all([loadOrt(), loadManifest()])
    const entry = manifest[name]
    if (!entry) throw new OnDeviceError('model_missing', `No manifest entry for ${name}`)
    const variant = entry.browser_variant
    const fileInfo = entry.files[variant]
    const buffer = await fetchModel(fileInfo)
    // QDQ int8 graphs run best on the WASM kernels; fp32 graphs can use WebGPU.
    const providers = variant === 'fp32' && backendInfo.webgpu ? ['webgpu', 'wasm'] : ['wasm']
    const session = await ort.InferenceSession.create(buffer, {
      executionProviders: providers,
      graphOptimizationLevel: 'all',
    })
    return { session, ort, variant, sha256: fileInfo.sha256, providers }
  })()
  sessions.set(name, promise)
  promise.catch(() => sessions.delete(name))
  return promise
}

async function runModel(name, tensorData) {
  const { session, ort } = await getSession(name)
  const input = new ort.Tensor('float32', tensorData, [1, 3, 224, 224])
  const outputs = await session.run({ [session.inputNames[0]]: input })
  const plain = {}
  for (const [key, t] of Object.entries(outputs)) plain[key] = { data: t.data, dims: t.dims }
  return plain
}

async function modelInfo(names) {
  const info = {}
  for (const name of names) {
    const s = await getSession(name)
    info[name] = { variant: s.variant, sha256: s.sha256, providers: s.providers }
  }
  return info
}

async function handleAnalyze({ id, task, frame, landmarks, withCam }) {
  const models = TASK_MODELS[task]
  if (!models) throw new OnDeviceError('bad_task', `Unknown task ${task}`)
  if (!landmarks?.length) throw new OnDeviceError('no_face', 'No face detected in this frame')
  const t0 = performance.now()
  const manifest = await loadManifest()
  const info = await modelInfo(models)
  const t1 = performance.now()
  const rgb = rgbaToRgb(new Uint8ClampedArray(frame.buffer), frame.width, frame.height)
  const ctx = { runModel, manifest, withCam }
  let result
  let overlays = {}
  if (task === 'redness') {
    result = await analyzeRednessFrame(rgb, landmarks, ctx)
  } else {
    const out = await analyzeCataractFrame(rgb, landmarks, ctx)
    result = out.result
    overlays = out.overlays
  }
  const t2 = performance.now()
  result.runtime = {
    engine: 'onnxruntime-web',
    ort_version: backendInfo?.ortVersion,
    webgpu: backendInfo?.webgpu,
    wasm_threads: backendInfo?.wasmThreads,
    models: info,
  }
  const transfer = Object.values(overlays).map((o) => o.data.buffer)
  self.postMessage(
    {
      type: 'result',
      id,
      result,
      overlays,
      timings: { load_ms: Math.round(t1 - t0), analyze_ms: Math.round(t2 - t1) },
    },
    transfer,
  )
}

self.onmessage = async (event) => {
  const msg = event.data
  try {
    if (msg.type === 'init') {
      await loadOrt()
      const info = await modelInfo(msg.models || [])
      self.postMessage({ type: 'ready', id: msg.id, backend: backendInfo, models: info })
    } else if (msg.type === 'analyze') {
      await handleAnalyze(msg)
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: msg.id,
      code: err?.code || 'inference_failed',
      message: err?.message || String(err),
    })
  }
}
