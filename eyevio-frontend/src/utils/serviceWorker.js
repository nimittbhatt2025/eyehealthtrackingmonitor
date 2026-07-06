import { toast } from 'react-hot-toast'

// Register service worker for PWA functionality (production only)
export function registerServiceWorker() {
  if (import.meta.env.DEV) {
    // Service workers break Vite HMR in development
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister())
      })
    }
    return
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration)

          // Check for updates periodically
          setInterval(() => {
            registration.update()
          }, 60 * 60 * 1000) // Check every hour

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available — show a gentle, persistent in-app toast
                // instead of a native confirm() dialog. The user refreshes when ready.
                toast(
                  'A new version of EyeVio is available. Refresh the page to update.',
                  {
                    duration: 10000,
                    position: 'bottom-center',
                    icon: '🔄',
                    ariaProps: { role: 'status', 'aria-live': 'polite' },
                  }
                )
              }
            })
          })
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error)
        })
    })
  }
}

export function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister()
      })
      .catch((error) => {
        console.error('Service Worker unregistration failed:', error)
      })
  }
}

// Request notification permission
export async function requestNotificationPermission() {
  if ('Notification' in window && 'serviceWorker' in navigator) {
    const permission = await Notification.requestPermission()
    
    if (permission === 'granted') {
      console.log('Notification permission granted')
      
      // Subscribe to push notifications
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          // Replace with your VAPID public key
          'YOUR_VAPID_PUBLIC_KEY'
        )
      })
      
      console.log('Push subscription:', subscription)
      return subscription
    }
    
    return null
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Check if app is running as PWA
export function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true
}

// Background sync for offline actions
export async function registerBackgroundSync(tag) {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready
      await registration.sync.register(tag)
      console.log(`Background sync registered: ${tag}`)
    } catch (error) {
      console.error('Background sync registration failed:', error)
    }
  }
}
