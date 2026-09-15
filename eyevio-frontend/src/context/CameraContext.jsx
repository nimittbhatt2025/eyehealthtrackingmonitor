import React, { createContext, useContext, useState } from 'react'
import cameraManager from '../utils/cameraManager'

const CameraContext = createContext(null)

export const useCamera = () => useContext(CameraContext)

/** Camera stream helpers. Face models are MediaPipe/on-demand — no eager face-api preload. */
export const CameraProvider = ({ children }) => {
  const [active, setActive] = useState(false)

  const startPersistentCamera = async (constraints = { video: true }) => {
    try {
      cameraManager.persist(true)
      await cameraManager.acquire(constraints)
      setActive(true)
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
    } catch (err) {
      console.warn('CameraProvider: error stopping camera', err)
    }
  }

  const startTemporaryCamera = async (constraints = { video: true }) => {
    try {
      return await cameraManager.acquire(constraints)
    } catch (err) {
      console.error('CameraProvider: failed to acquire temporary camera', err)
      throw err
    }
  }

  const value = {
    active,
    loadingModels: false,
    startPersistentCamera,
    stopPersistentCamera,
    startTemporaryCamera,
  }

  return (
    <CameraContext.Provider value={value}>
      {children}
    </CameraContext.Provider>
  )
}

export default CameraContext
