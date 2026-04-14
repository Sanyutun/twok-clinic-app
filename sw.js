/**
 * Service Worker for TWOK Clinic App
 * Provides offline functionality, caching, and background sync
 */

const CACHE_NAME = 'twok-clinic-cache-v1';
const API_CACHE_NAME = 'twok-clinic-api-cache-v1';

// Static assets to cache
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './indexeddb.js',
    './manifest.json',
    './tv-view.html',
    './views/pharmacist-corner.html',
    './components/instruction-form.js',
    './components/expense-form.js'
];

// API endpoints that should be cached
const CACHEABLE_API_ENDPOINTS = [
    '/api/patients',
    '/api/doctors',
    '/api/appointments',
    '/api/instructions',
    '/api/expenses',
    '/api/labs',
    '/api/settings'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[Service Worker] Installation complete, skipping waiting');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Cache failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            return cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME;
                        })
                        .map((cacheName) => {
                            console.log('[Service Worker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('[Service Worker] Activation complete, claiming clients');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network with cache update
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip external requests
    if (url.origin !== self.location.origin) {
        return;
    }

    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleApiRequest(request));
        return;
    }

    // Handle static asset requests
    event.respondWith(handleStaticRequest(request));
});

/**
 * Handle static asset requests
 */
async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        console.log('[Service Worker] Serving from cache:', request.url);
        
        // Fetch from network in background to update cache
        fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, networkResponse);
                });
            }
        }).catch(() => {
            // Network failed, cached response is already returned
        });
        
        return cachedResponse;
    }

    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
            });
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[Service Worker] Fetch failed:', request.url, error);
        
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }
        
        throw error;
    }
}

/**
 * Handle API requests with cache-first strategy
 */
async function handleApiRequest(request) {
    const url = new URL(request.url);
    
    // Check if this is a cacheable endpoint
    const isCacheable = CACHEABLE_API_ENDPOINTS.some(endpoint => 
        url.pathname.startsWith(endpoint)
    );

    if (!isCacheable) {
        // Non-cacheable API request, fetch from network only
        try {
            return await fetch(request);
        } catch (error) {
            console.error('[Service Worker] API fetch failed:', request.url, error);
            throw error;
        }
    }

    // Cacheable API request - use cache-first strategy
    try {
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            console.log('[Service Worker] Serving API from cache:', request.url);
            
            // Update cache in background
            fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                    caches.open(API_CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse);
                    });
                }
            }).catch(() => {
                // Network failed, cached response is already returned
            });
            
            return cachedResponse;
        }

        // Not in cache, fetch from network
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
            });
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[Service Worker] API fetch failed:', request.url, error);
        
        // Try to return any cached version even if stale
        const staleCache = await caches.match(request);
        if (staleCache) {
            console.log('[Service Worker] Serving stale API cache:', request.url);
            return staleCache;
        }
        
        throw error;
    }
}

// Message event - handle cache operations from main thread
self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};

    if (type === 'SKIP_WAITING') {
        console.log('[Service Worker] Skip waiting requested');
        return self.skipWaiting();
    }

    if (type === 'CLEAR_CACHE') {
        console.log('[Service Worker] Cache clear requested');
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        return caches.delete(cacheName);
                    })
                );
            }).then(() => {
                return self.clients.matchAll().then((clients) => {
                    clients.forEach((client) => {
                        client.postMessage({ type: 'CACHE_CLEARED' });
                    });
                });
            })
        );
    }

    if (type === 'CACHE_URLS') {
        console.log('[Service Worker] Cache URLs requested:', payload.urls);
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(payload.urls);
            }).then(() => {
                event.ports[0].postMessage({ success: true });
            }).catch((error) => {
                event.ports[0].postMessage({ success: false, error: error.message });
            })
        );
    }

    if (type === 'GET_CACHE_STATUS') {
        event.waitUntil(
            Promise.all([
                caches.keys(),
                caches.open(CACHE_NAME).then(cache => cache.keys())
            ]).then(([cacheNames, cachedUrls]) => {
                event.ports[0].postMessage({
                    caches: cacheNames,
                    cachedUrls: cachedUrls.map(r => r.url),
                    cachedCount: cachedUrls.length
                });
            })
        );
    }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
    console.log('[Service Worker] Sync event:', event.tag);
    
    if (event.tag === 'sync-clinic-data') {
        event.waitUntil(
            syncClinicData()
        );
    }
});

/**
 * Sync clinic data with server
 */
async function syncClinicData() {
    console.log('[Service Worker] Syncing clinic data...');
    
    // Get all clients
    const clients = await self.clients.matchAll();
    
    // Notify clients that sync is starting
    clients.forEach(client => {
        client.postMessage({ type: 'SYNC_STARTING' });
    });

    try {
        // This will be handled by the main thread's syncManager
        // The service worker just triggers the sync
        clients.forEach(client => {
            client.postMessage({ 
                type: 'SYNC_TRIGGER',
                timestamp: Date.now()
            });
        });
    } catch (error) {
        console.error('[Service Worker] Sync failed:', error);
        clients.forEach(client => {
            client.postMessage({ 
                type: 'SYNC_ERROR',
                error: error.message
            });
        });
    }
}

// Push notifications
self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push received:', event);
    
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || 'New notification from TWOK Clinic',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: 1,
                url: data.url || '/'
            },
            actions: [
                {
                    action: 'open',
                    title: 'Open'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title || 'TWOK Clinic', options)
        );
    }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click:', event.action);
    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                const url = event.notification.data?.url || '/';
                
                // Focus existing window if available
                for (const client of clientList) {
                    if (client.url === url && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
    );
});
