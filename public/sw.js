// GardenPlanner Service Worker
// Workbox Runtime-Only (kein Build-Tool noetig)

const CACHE_VERSION = 'v1';

importScripts('/vendor/workbox-v7.3.0/workbox-sw.js');

workbox.setConfig({
    modulePathPrefix: '/vendor/workbox-v7.3.0/'
});

const { registerRoute, NavigationRoute } = workbox.routing;
const { CacheFirst, NetworkFirst } = workbox.strategies;
const { CacheableResponsePlugin } = workbox.cacheableResponse;
const { ExpirationPlugin } = workbox.expiration;
const { precacheAndRoute } = workbox.precaching;

// --- Precache (manuell gepflegte Liste) ---
precacheAndRoute([
    { url: '/dashboard', revision: CACHE_VERSION },
    { url: '/index', revision: CACHE_VERSION },
    { url: '/login', revision: CACHE_VERSION },
    { url: '/statistics', revision: CACHE_VERSION },
    { url: '/plants', revision: CACHE_VERSION },
    { url: '/garden', revision: CACHE_VERSION },
    { url: '/logs', revision: CACHE_VERSION },
    { url: '/admin', revision: CACHE_VERSION },
    { url: '/offline.html', revision: CACHE_VERSION },
    { url: '/manifest.json', revision: CACHE_VERSION }
]);

// --- Caching-Strategien ---

// Google Fonts: Cache-First, 30 Tage
registerRoute(
    function(routeData) {
        return routeData.url.origin === 'https://fonts.googleapis.com' ||
               routeData.url.origin === 'https://fonts.gstatic.com';
    },
    new CacheFirst({
        cacheName: 'google-fonts-' + CACHE_VERSION,
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 })
        ]
    })
);

// CSS/JS Bundles (dist/): Cache-First
registerRoute(
    function(routeData) { return routeData.url.pathname.startsWith('/dist/'); },
    new CacheFirst({
        cacheName: 'bundles-' + CACHE_VERSION,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60 })
        ]
    })
);

// CSS/JS Source (src/, public/): Cache-First
registerRoute(
    function(routeData) {
        var p = routeData.url.pathname;
        return (p.startsWith('/src/') || p.startsWith('/public/')) &&
               (p.endsWith('.js') || p.endsWith('.css'));
    },
    new CacheFirst({
        cacheName: 'static-assets-' + CACHE_VERSION,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60 })
        ]
    })
);

// Icons: Cache-First
registerRoute(
    function(routeData) { return routeData.url.pathname.startsWith('/icons/'); },
    new CacheFirst({
        cacheName: 'icons-' + CACHE_VERSION,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] })
        ]
    })
);

// Pflanzen-API: Cache-First, 24h TTL
registerRoute(
    function(routeData) {
        return routeData.url.pathname.match(/^\/api(\/v1)?\/plants/) ||
               routeData.url.pathname.match(/^\/api(\/v1)?\/plant-categories/);
    },
    new CacheFirst({
        cacheName: 'plants-api-' + CACHE_VERSION,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60 })
        ]
    })
);

// Wetter-API: Network-First, Fallback auf Stale-Cache
registerRoute(
    function(routeData) {
        return routeData.url.origin.includes('open-meteo.com');
    },
    new NetworkFirst({
        cacheName: 'weather-api-' + CACHE_VERSION,
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60 })
        ]
    })
);

// Task-API: Network-First, Fallback auf Cache
registerRoute(
    function(routeData) {
        return routeData.url.pathname.match(/^\/api(\/v1)?\/tasks/) &&
               routeData.request.method === 'GET';
    },
    new NetworkFirst({
        cacheName: 'tasks-api-' + CACHE_VERSION,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60 })
        ]
    })
);

// Auth-Status: Network-First with short timeout
registerRoute(
    function(routeData) { return routeData.url.pathname.match(/^\/api(\/v1)?\/auth/); },
    new NetworkFirst({
        cacheName: 'auth-' + CACHE_VERSION,
        networkTimeoutSeconds: 3
    })
);

// Vendor files (Workbox etc.): Cache-First
registerRoute(
    function(routeData) { return routeData.url.pathname.startsWith('/vendor/'); },
    new CacheFirst({
        cacheName: 'vendor-' + CACHE_VERSION
    })
);

// --- Offline Fallback for Navigation ---
var navigationHandler = new NetworkFirst({
    cacheName: 'pages-' + CACHE_VERSION,
    plugins: [
        new CacheableResponsePlugin({ statuses: [200] })
    ]
});

var navigationRoute = new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//]
});
registerRoute(navigationRoute);

// Fallback to offline.html when any navigation request fails
workbox.routing.setCatchHandler(function(params) {
    if (params.event.request.destination === 'document') {
        return caches.match('/offline.html');
    }
    return Response.error();
});

// --- Lifecycle ---
self.addEventListener('install', function() {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function(name) { return !name.endsWith(CACHE_VERSION); })
                    .map(function(name) { return caches.delete(name); })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// --- Background Sync ---
self.addEventListener('sync', function(event) {
    if (event.tag === 'gardenplanner-sync') {
        event.waitUntil(
            self.clients.matchAll().then(function(clients) {
                clients.forEach(function(client) {
                    client.postMessage({ type: 'SYNC_REQUESTED' });
                });
            })
        );
    }
});
