import { useEffect, useState } from 'react'
import cameraManager from '../utils/cameraManager.js'

export default function CameraPermissionBanner() {
  const [permission, setPermission] = useState('unknown')
  const [acquiring, setAcquiring] = useState(false)

  const check = async () => {
    try {
      const p = await cameraManager.queryPermission()
      setPermission(p)
    } catch (e) {
      setPermission('unknown')
    }
  }

  useEffect(() => {
    check()
    // Also listen to visibilitychange or focus to re-check after user changes settings
    const onFocus = () => setTimeout(check, 300)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const handleRetry = async () => {
    setAcquiring(true)
    try {
      await cameraManager.acquire({ video: true, audio: false })
      // Immediately release — the banner's purpose is to prompt permission only
      cameraManager.release()
      setPermission('granted')
    } catch (e) {
      console.error('CameraPermissionBanner: acquire failed', e)
      setPermission('denied')
    } finally {
      setAcquiring(false)
    }
  }

  if (permission === 'granted' || permission === 'unknown') return null

  // Show banner for 'prompt' or 'denied'
  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-3xl px-4">
      <div className="bg-yellow-800 text-yellow-50 rounded-xl p-3 flex items-center justify-between shadow-lg">
        <div>
          <div className="font-semibold">Camera permissions required</div>
          <div className="text-sm mt-1">This site needs camera access for many tests. Click Retry to prompt the browser.</div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg font-semibold"
            onClick={handleRetry}
            disabled={acquiring}
          >
            {acquiring ? 'Requesting...' : 'Retry'}
          </button>
          <button
            className="bg-transparent border border-yellow-600 text-yellow-50 px-3 py-2 rounded-lg"
            onClick={() => window.open('about:preferences#privacy', '_blank')}
          >
            Open Browser Settings
          </button>
        </div>
      </div>
    </div>
  )
}
