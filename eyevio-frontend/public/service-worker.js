// Service Worker for EyeVio PWA
const CACHE_NAME = 'eyevio-v1'
const RUNTIME_CACHE = 'eyevio-runtime'

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
]

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Precaching assets')
        return cache.addAll(PRECACHE_ASSETS)
      })
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE
            })
            .map((cacheName) => {
              console.log('[Service Worker] Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            })
        )
      })
      .then(() => self.clients.claim())
  )
})

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip API calls from caching
  if (url.pathname.startsWith('/api/')) {
    return
  }

  // Network-first strategy for HTML
  if (request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          const responseClone = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse
              }
              // Return offline page
              return caches.match('/index.html')
            })
        })
    )
    return
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }

        return fetch(request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type === 'error') {
              return response
            }

            // Cache successful responses
            const responseClone = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })

            return response
          })
      })
  )
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag)
  
  if (event.tag === 'sync-vision-tests') {
    event.waitUntil(syncVisionTests())
  }
  
  if (event.tag === 'sync-lifestyle-logs') {
    event.waitUntil(syncLifestyleLogs())
  }
})

// Push notification handler
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from EyeVio',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View',
        icon: '/icons/checkmark.png'
      },
      {
        action: 'close',
        title: 'Dismiss',
        icon: '/icons/close.png'
      }
    ]
  }

  event.waitUntil(
    self.registration.showNotification('EyeVio', options)
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    )
  }
})

// Helper functions
async function syncVisionTests() {
  try {
    // Get pending vision tests from IndexedDB
    const pendingTests = await getPendingTests()
    
    for (const test of pendingTests) {
      try {
        const response = await fetch('/api/vision-test/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${test.token}`
          },
          body: JSON.stringify(test.data)
        })
        
        if (response.ok) {
          await removePendingTest(test.id)
        }
      } catch (error) {
        console.error('Failed to sync test:', error)
      }
    }
  } catch (error) {
    console.error('Sync failed:', error)
  }
}

async function syncLifestyleLogs() {
  try {
    const pendingLogs = await getPendingLogs()
    
    for (const log of pendingLogs) {
      try {
        const response = await fetch('/api/lifestyle/log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${log.token}`
          },
          body: JSON.stringify(log.data)
        })
        
        if (response.ok) {
          await removePendingLog(log.id)
        }
      } catch (error) {
        console.error('Failed to sync log:', error)
      }
    }
  } catch (error) {
    console.error('Sync failed:', error)
  }
}

// IndexedDB helpers (simplified)
function getPendingTests() {
  // Implementation would use IndexedDB
  return Promise.resolve([])
}

function removePendingTest(id) {
  return Promise.resolve()
}

function getPendingLogs() {
  return Promise.resolve([])
}

function removePendingLog(id) {
  return Promise.resolve()
}
