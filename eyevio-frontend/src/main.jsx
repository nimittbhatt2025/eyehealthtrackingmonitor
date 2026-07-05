import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/mobile.css'
import { registerServiceWorker } from './utils/serviceWorker'
import { CalibrationProvider } from './context/CalibrationContext'

// Register service worker for PWA
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CalibrationProvider>
      <App />
    </CalibrationProvider>
  </React.StrictMode>,
)
