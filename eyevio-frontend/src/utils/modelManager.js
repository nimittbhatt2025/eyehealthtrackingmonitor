import * as faceapi from '@vladmandic/face-api'

let modelsLoaded = false
let loadingPromise = null

const loadFaceAPIModels = async (baseUri = '/models') => {
  if (modelsLoaded) return
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      console.log('modelManager: Setting TensorFlow backend to webgl and loading faceapi models')
      await faceapi.tf.setBackend('webgl')
      await faceapi.tf.ready()

      await faceapi.nets.tinyFaceDetector.loadFromUri(baseUri)
      await faceapi.nets.faceLandmark68Net.loadFromUri(baseUri)
      // Optionally load other nets as needed by other components
      // await faceapi.nets.faceRecognitionNet.loadFromUri(baseUri)
      modelsLoaded = true
      console.log('modelManager: faceapi models loaded')
    } catch (err) {
      console.error('modelManager: failed to load faceapi models', err)
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
