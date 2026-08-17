import { toast } from 'react-hot-toast'
import { notificationsAPI } from '../services/api'

// Register service worker for PWA functionality
export function registerServiceWorker() {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_PUSH !== 'true') {
    // Service workers break Vite HMR in development unless push testing is enabled
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

          setInterval(() => {
            registration.update()
          }, 60 * 60 * 1000)

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                toast(
                  'A new version of EyeVio is available. Refresh the page to update.',
                  {
                    duration: 10000,
                    position: 'bottom-center',
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

async function ensureServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser')
  }

  let registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    registration = await navigator.serviceWorker.register('/service-worker.js')
  }
  await navigator.serviceWorker.ready
  return registration
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Request permission, subscribe to Web Push, and persist subscription on the API.
 */
export async function enablePushNotifications() {
  if (!('Notification' in window) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied')
  }

  const { data } = await notificationsAPI.getVapidPublicKey()
  const publicKey = data?.publicKey
  if (!publicKey) {
    throw new Error('Push is not configured on the server')
  }

  const registration = await ensureServiceWorkerRegistration()
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  await notificationsAPI.subscribePush(subscription.toJSON())
  return subscription
}

export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    await notificationsAPI.unsubscribePush()
    return
  }

  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await notificationsAPI.unsubscribePush({ endpoint })
  } else {
    await notificationsAPI.unsubscribePush()
  }
}

/** Legacy alias used by older call sites */
export async function requestNotificationPermission() {
  try {
    return await enablePushNotifications()
  } catch (error) {
    console.error(error)
    return null
  }
}

export function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true
}

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
