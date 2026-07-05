import React, { createContext, useContext, useState, useEffect } from 'react'
import cameraManager from '../utils/cameraManager'
import modelManager from '../utils/modelManager'

const CameraContext = createContext(null)

export const useCamera = () => useContext(CameraContext)

export const CameraProvider = ({ children, eagerModels = true }) => {
  const [active, setActive] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => {
    let mounted = true
    if (eagerModels) {
      setLoadingModels(true)
      modelManager.loadFaceAPIModels('/models')
        .catch(err => console.warn('CameraProvider: model preload failed', err))
        .finally(() => { if (mounted) setLoadingModels(false) })
    }

    return () => { mounted = false }
  }, [eagerModels])

  const startPersistentCamera = async (constraints = { video: true }) => {
    try {
      cameraManager.persist(true)
      await cameraManager.acquire(constraints)
      setActive(true)
      console.log('CameraProvider: persistent camera started')
      return cameraManager.getStream()
    } catch (err) {
      console.error('CameraProvider: failed to start persistent camera', err)
      throw err
    }
  }

  const stopPersistentCamera = () => {
    try {
      cameraManager.persist(false)
      cameraManager.release()
      setActive(false)
      console.log('CameraProvider: persistent camera stopped')
    } catch (err) {
      console.warn('CameraProvider: error stopping camera', err)
    }
  }

  const startTemporaryCamera = async (constraints = { video: true }) => {
    try {
      const s = await cameraManager.acquire(constraints)
      console.log('CameraProvider: temporary camera acquired')
      return s
    } catch (err) {
      console.error('CameraProvider: failed to acquire temporary camera', err)
      throw err
    }
  }

  const value = {
    active,
    loadingModels,
    startPersistentCamera,
    stopPersistentCamera,
    startTemporaryCamera
  }

  return (
    <CameraContext.Provider value={value}>
      {children}
    </CameraContext.Provider>
  )
}

export default CameraContext
