import * as faceapi from '@vladmandic/face-api'

let modelsLoaded = false
let loadingPromise = null

const loadFaceAPIModels = async (baseUri = '/models') => {
  if (modelsLoaded) return
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      await faceapi.tf.setBackend('webgl')
      await faceapi.tf.ready()

      await faceapi.nets.tinyFaceDetector.loadFromUri(baseUri)
      await faceapi.nets.faceLandmark68Net.loadFromUri(baseUri)
      modelsLoaded = true
    } catch (err) {
      console.error('modelManager: failed to load faceapi models', err)
      loadingPromise = null
      throw err
    }
  })()

  return loadingPromise
}

const isLoaded = () => modelsLoaded

export default {
  loadFaceAPIModels,
  isLoaded
}
