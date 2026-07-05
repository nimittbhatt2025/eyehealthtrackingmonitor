import React from 'react'
import { useCamera } from '../context/CameraContext'

const CameraIndicator = () => {
  const { active, stopPersistentCamera } = useCamera()

  if (!active) return null

  return (
    <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 9999 }}>
      <div className="flex items-center gap-3 bg-white/90 border border-gray-300 rounded-full px-4 py-2 shadow-lg">
        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        <div className="text-sm text-gray-800">Camera active</div>
        <button onClick={stopPersistentCamera} className="ml-2 px-3 py-1 bg-gray-100 rounded-full text-sm hover:bg-gray-200">Stop</button>
      </div>
    </div>
  )
}

export default CameraIndicator
