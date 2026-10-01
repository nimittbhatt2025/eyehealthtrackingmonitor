/**
 * Safe construction of MediaPipe legacy solutions (Face Mesh, Hands).
 *
 * The emscripten runtime behind these solutions is not re-entrant:
 * - two instances initializing at the same time abort ("Module.arguments has been replaced…")
 * - closing an instance before initialize() settles leaves the next instance stuck forever
 *   ("still waiting on run dependencies: … face_mesh_solution_packed_assets.data")
 * React StrictMode's mount → unmount → mount in dev hits the second case on every camera page.
 *
 * Every instance created here initializes through one page-wide queue, sends wait for that
 * initialization, and close() is deferred until initialization has settled.
 */

import { FaceMesh } from '@mediapipe/face_mesh'

// Must match the installed package versions: the JS wrapper and the CDN wasm/data are a pair.
const FACE_MESH_VERSION = '0.4.1633559619'
const HANDS_VERSION = '0.4.1675469240'

const FACE_MESH_ASSETS = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FACE_MESH_VERSION}`
const HANDS_ASSETS = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${HANDS_VERSION}`

let initQueue = Promise.resolve()

function serialize(solution) {
  const rawInitialize = solution.initialize.bind(solution)
  const rawSend = solution.send.bind(solution)
  const rawClose = solution.close.bind(solution)
  let ready = null
  let closed = false

  solution.initialize = () => {
    if (!ready) {
      ready = initQueue.then(() => (closed ? undefined : rawInitialize()))
      initQueue = ready.catch(() => {})
    }
    return ready
  }

  solution.send = async (inputs, at) => {
    await solution.initialize()
    if (closed) return undefined
    return rawSend(inputs, at)
  }

  solution.close = async () => {
    if (closed) return
    closed = true
    if (ready) await ready.catch(() => {})
    await rawClose()
  }

  return solution
}

export function createFaceMesh(options) {
  const faceMesh = new FaceMesh({ locateFile: (file) => `${FACE_MESH_ASSETS}/${file}` })
  if (options) faceMesh.setOptions(options)
  return serialize(faceMesh)
}

export async function createHands(options) {
  const { Hands } = await import('@mediapipe/hands')
  const hands = new Hands({ locateFile: (file) => `${HANDS_ASSETS}/${file}` })
  if (options) hands.setOptions(options)
  return serialize(hands)
}
