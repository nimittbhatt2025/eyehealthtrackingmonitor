/**
 * Live capture-quality pipeline: Face Mesh → anatomical features → stabilizers → advisory UI.
 * Final strict gate runs on the backend when the user captures.
 */

import { FaceMesh } from '@mediapipe/face_mesh'
import { QualityStabilizer } from './captureQualityStabilizer'
import { assessAnatomicalLighting, lightingUiFromStabilized } from './anatomicalLightingCheck'
import { assessEyewearProbability, eyewearUiFromStabilized } from './eyewearDetection'

let sharedFaceMesh = null
let meshInitPromise = null

function getFaceMesh() {
  if (sharedFaceMesh) return Promise.resolve(sharedFaceMesh)
  if (meshInitPromise) return meshInitPromise

  meshInitPromise = new Promise((resolve, reject) => {
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    })
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    faceMesh.initialize().then(() => {
      sharedFaceMesh = faceMesh
      resolve(faceMesh)
    }).catch(reject)
  })

  return meshInitPromise
}

function sampleFrame(video, canvas) {
  if (!video?.videoWidth) return null
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export class CaptureQualityEngine {
  constructor() {
    this.lightingStabilizer = new QualityStabilizer({
      enterThreshold: 0.72,
      exitThreshold: 0.50,
      alpha: 0.18,
      minPositiveFrames: 6,
      minNegativeFrames: 4,
      positiveState: 'positive',
      negativeState: 'negative',
      initialState: 'checking',
    })
    this.glassesStabilizer = new QualityStabilizer({
      enterThreshold: 0.68,
      exitThreshold: 0.42,
      alpha: 0.2,
      minPositiveFrames: 5,
      minNegativeFrames: 3,
      positiveState: 'likely',
      negativeState: 'clear',
      initialState: 'checking',
    })
    this.faceMesh = null
    this.lastLandmarks = null
    this._pendingResolve = null
    this.ready = false
  }

  async init() {
    this.faceMesh = await getFaceMesh()
    this.faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks?.[0]) {
        this.lastLandmarks = results.multiFaceLandmarks[0]
      }
      if (this._pendingResolve) {
        this._pendingResolve()
        this._pendingResolve = null
      }
    })
    this.ready = true
  }

  reset() {
    this.lightingStabilizer.reset()
    this.glassesStabilizer.reset()
    this.lastLandmarks = null
  }

  async sample(video, workCanvas) {
    if (!video?.videoWidth) {
      return { lighting: null, eyewear: null, faceDetected: false }
    }

    if (!this.faceMesh) {
      await this.init()
    }

    const imageData = sampleFrame(video, workCanvas)

    await new Promise((resolve) => {
      this._pendingResolve = resolve
      const timeout = setTimeout(() => {
        if (this._pendingResolve === resolve) {
          this._pendingResolve = null
          resolve()
        }
      }, 180)
      this.faceMesh.send({ image: video }).catch(() => {
        clearTimeout(timeout)
        resolve()
      })
    })

    const landmarks = this.lastLandmarks
    const rawLighting = assessAnatomicalLighting(imageData, landmarks)
    const lightingStable = this.lightingStabilizer.push(rawLighting.confidence)
    const lighting = lightingUiFromStabilized(lightingStable, rawLighting)

    const rawEyewear = assessEyewearProbability(imageData, landmarks)
    const eyewearStable = this.glassesStabilizer.push(rawEyewear.glassesProbability)
    const eyewear = eyewearUiFromStabilized(eyewearStable, rawEyewear)

    return { lighting, eyewear, faceDetected: !!landmarks }
  }
}

export default CaptureQualityEngine
