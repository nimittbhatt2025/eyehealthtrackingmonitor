import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/mobile.css'
import { registerServiceWorker } from './utils/serviceWorker'
import { CalibrationProvider } from './context/CalibrationContext'

// Remove stale service workers in dev — they cache old JS and break login
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister())
  })
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)))
  }
} else {
  registerServiceWorker()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CalibrationProvider>
      <App />
    </CalibrationProvider>
  </React.StrictMode>,
)
