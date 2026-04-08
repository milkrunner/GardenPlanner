# PWA-Konvertierung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den GardenPlanner in eine installierbare Progressive Web App mit vollem Offline-Support und automatischer Sync-Logik umwandeln.

**Architecture:** Service Worker mit Workbox Runtime-Only (kein Build-Tool), IndexedDB fuer Offline-Datenhaltung, Sync-Queue fuer ausstehende Aenderungen. Server erhaelt Konflikt-Erkennung via `updatedAt`-Vergleich.

**Tech Stack:** Workbox 7.x (lokal), IndexedDB (nativ), Service Worker API, Cache API

---

## File Structure

### Neue Dateien

| Datei | Zweck |
|-------|-------|
| `public/manifest.json` | Web App Manifest (Name, Icons, Display-Modus) |
| `public/sw.js` | Service Worker mit Workbox-Caching-Strategien |
| `public/offline.html` | Fallback-Seite wenn offline + Seite nicht im Cache |
| `public/vendor/workbox-v7.3.0/workbox-sw.js` | Workbox Runtime (lokal gehostet) |
| `public/icons/icon-192.png` | App-Icon 192x192 |
| `public/icons/icon-512.png` | App-Icon 512x512 |
| `public/icons/icon-192-maskable.png` | Maskable Icon 192x192 |
| `public/icons/icon-512-maskable.png` | Maskable Icon 512x512 |
| `public/icons/icon.svg` | Quell-SVG fuer alle Icons |
| `src/js/offline-store.js` | IndexedDB Wrapper (CRUD fuer Tasks + Sync-Queue) |
| `src/js/sync-manager.js` | Sync-Queue abarbeiten, Konflikt-Handling |
| `src/js/offline-ui.js` | Offline-Banner, Sync-Toasts, Install-Prompt |
| `src/js/pwa-register.js` | Service Worker Registration + Update-Handling |

### Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `public/dashboard.html` | Meta-Tags, manifest-Link, SW-Registration |
| `public/index.html` | Meta-Tags, manifest-Link, SW-Registration |
| `public/login.html` | Meta-Tags, manifest-Link, SW-Registration |
| `public/statistics.html` | Meta-Tags, manifest-Link, SW-Registration |
| `public/plants.html` | Meta-Tags, manifest-Link, SW-Registration |
| `public/garden.html` | Meta-Tags, manifest-Link, SW-Registration |
| `public/logs.html` | Meta-Tags, manifest-Link, SW-Registration |
| `public/admin.html` | Meta-Tags, manifest-Link, SW-Registration |
| `src/js/api.js` | Offline-Erkennung, IndexedDB-Spiegelung, Sync-Queue |
| `src/server/app.js` | Static-Serving fuer /vendor, SW no-cache Header |
| `src/server/storage/postgres-store.js` | `updatedAt` in rowToTask aufnehmen |
| `src/server/services/task-service.js` | Konflikt-Check bei Updates (409) |
| `src/server/routes/tasks.js` | 409-Response weiterleiten |
| `src/css/styles.css` | Offline-Banner, Sync-Badge CSS |
| `scripts/build.js` | Neue JS-Module in Bundles, offline.html + manifest + icons kopieren |
| `package.json` | Version bump 3.1.1 -> 3.2.0 |

---

### Task 1: App-Icons erstellen

**Files:**
- Create: `public/icons/icon.svg`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/icon-192-maskable.png`
- Create: `public/icons/icon-512-maskable.png`

- [ ] **Step 1: Icon-Verzeichnis anlegen**

Run: `mkdir -p public/icons`

- [ ] **Step 2: SVG-Icon erstellen**

Erstelle `public/icons/icon.svg` — Keimling-Emoji auf gruenem Kreis:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="256" fill="#365E3D"/>
  <text x="256" y="340" font-size="300" text-anchor="middle" font-family="sans-serif">🌱</text>
</svg>
```

- [ ] **Step 3: PNG-Icons generieren**

Da kein Bildtool installiert ist, erstelle die Icons als Canvas-generierte PNGs. Erstelle ein temporaeres Node-Script `scripts/generate-icons.js`:

```javascript
const fs = require('fs');
const path = require('path');

// Minimales PNG erstellen via Canvas-aehnlichem Ansatz.
// Da das Projekt kein sharp/canvas hat, verwende einen einfachen SVG-to-Data-URL Ansatz
// und dokumentiere, dass fuer Production die PNGs manuell erstellt werden sollten.
//
// Fuer jetzt: Erstelle Platzhalter-PNGs aus dem SVG
// Die SVG-Datei wird direkt als Icon verwendet (Browser unterstuetzen SVG-Icons im Manifest)

const sizes = [192, 512];
const svgTemplate = (size, padding = 0) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="256" fill="#365E3D"/>
  <text x="256" y="${340 - padding}" font-size="${300 - padding * 2}" text-anchor="middle" font-family="sans-serif">🌱</text>
</svg>`;

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Standard icons
for (const size of sizes) {
    fs.writeFileSync(path.join(iconsDir, `icon-${size}.svg`), svgTemplate(size));
}

// Maskable icons (more padding for safe zone)
for (const size of sizes) {
    fs.writeFileSync(path.join(iconsDir, `icon-${size}-maskable.svg`), svgTemplate(size, 40));
}

console.log('Icons generated (SVG format — browsers support SVG in manifests)');
```

Run: `node scripts/generate-icons.js`

Note: SVG wird direkt als Icon im Manifest verwendet. Browser unterstuetzen SVG-Icons nativ. Die manifest.json wird entsprechend `image/svg+xml` als type nutzen.

- [ ] **Step 4: Commit**

```bash
git add public/icons/ scripts/generate-icons.js
git commit -m "feat(pwa): App-Icons als SVG erstellen (#46)"
```

---

### Task 2: Web App Manifest erstellen

**Files:**
- Create: `public/manifest.json`

- [ ] **Step 1: manifest.json erstellen**

Erstelle `public/manifest.json`:

```json
{
  "name": "GardenPlanner",
  "short_name": "Garden",
  "description": "Gartenplaner - Aufgaben, Pflanzen und Gartenverwaltung",
  "start_url": "/dashboard",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#365E3D",
  "background_color": "#FBF9F4",
  "icons": [
    {
      "src": "/icons/icon-192.svg",
      "sizes": "192x192",
      "type": "image/svg+xml"
    },
    {
      "src": "/icons/icon-512.svg",
      "sizes": "512x512",
      "type": "image/svg+xml"
    },
    {
      "src": "/icons/icon-192-maskable.svg",
      "sizes": "192x192",
      "type": "image/svg+xml",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-512-maskable.svg",
      "sizes": "512x512",
      "type": "image/svg+xml",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add public/manifest.json
git commit -m "feat(pwa): Web App Manifest erstellen (#46)"
```

---

### Task 3: Meta-Tags und SW-Registration in alle HTML-Seiten einfuegen

**Files:**
- Modify: `public/dashboard.html:3-18` (head-Bereich)
- Modify: `public/index.html` (head-Bereich)
- Modify: `public/login.html` (head-Bereich)
- Modify: `public/statistics.html` (head-Bereich)
- Modify: `public/plants.html` (head-Bereich)
- Modify: `public/garden.html` (head-Bereich)
- Modify: `public/logs.html` (head-Bereich)
- Modify: `public/admin.html` (head-Bereich)
- Create: `src/js/pwa-register.js`

- [ ] **Step 1: pwa-register.js erstellen**

Erstelle `src/js/pwa-register.js`:

```javascript
// PWA Service Worker Registration
(function() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/sw.js')
                .then(function(registration) {
                    // Auf Updates pruefen
                    registration.addEventListener('updatefound', function() {
                        var newWorker = registration.installing;
                        newWorker.addEventListener('statechange', function() {
                            if (newWorker.state === 'activated') {
                                console.log('[PWA] Neuer Service Worker aktiviert');
                            }
                        });
                    });
                    console.log('[PWA] Service Worker registriert:', registration.scope);
                })
                .catch(function(error) {
                    console.warn('[PWA] Service Worker Registration fehlgeschlagen:', error);
                });
        });
    }
})();
```

- [ ] **Step 2: Meta-Tags in dashboard.html einfuegen**

In `public/dashboard.html`, nach der bestehenden Favicon-Zeile (Zeile 14) einfuegen:

```html
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#365E3D">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <link rel="apple-touch-icon" href="/icons/icon-192.svg">
```

Vor dem schliessenden `</body>` Tag einfuegen:

```html
    <script src="../src/js/pwa-register.js"></script>
```

- [ ] **Step 3: Gleiche Aenderungen in allen 7 anderen HTML-Seiten**

Dieselben Meta-Tags und das pwa-register.js Script in folgende Dateien einfuegen:
- `public/index.html`
- `public/login.html`
- `public/statistics.html`
- `public/plants.html`
- `public/garden.html`
- `public/logs.html`
- `public/admin.html`

Jede Datei hat die gleiche Struktur: Favicon-Link im Head, dann die neuen Meta-Tags danach. pwa-register.js vor `</body>`.

- [ ] **Step 4: Commit**

```bash
git add src/js/pwa-register.js public/*.html
git commit -m "feat(pwa): Meta-Tags und SW-Registration in alle Seiten (#46)"
```

---

### Task 4: Workbox lokal einbinden und Service Worker erstellen

**Files:**
- Create: `public/vendor/workbox-v7.3.0/workbox-sw.js` (Download)
- Create: `public/sw.js`

- [ ] **Step 1: Workbox herunterladen**

```bash
mkdir -p public/vendor/workbox-v7.3.0
curl -L -o public/vendor/workbox-v7.3.0/workbox-sw.js \
  "https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js"
```

- [ ] **Step 2: Service Worker erstellen**

Erstelle `public/sw.js`:

```javascript
// GardenPlanner Service Worker
// Workbox Runtime-Only (kein Build-Tool noetig)

const CACHE_VERSION = 'v1';

importScripts('/vendor/workbox-v7.3.0/workbox-sw.js');

// Workbox soll Module lokal laden (nicht von CDN)
workbox.setConfig({
    modulePathPrefix: '/vendor/workbox-v7.3.0/'
});

const { registerRoute, NavigationRoute, setDefaultHandler } = workbox.routing;
const { CacheFirst, NetworkFirst, StaleWhileRevalidate } = workbox.strategies;
const { CacheableResponsePlugin } = workbox.cacheableResponse;
const { ExpirationPlugin } = workbox.expiration;
const { precacheAndRoute, matchPrecache } = workbox.precaching;
const { BackgroundSyncPlugin } = workbox.backgroundSync;

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

// Icons und statische Bilder: Cache-First
registerRoute(
    function(routeData) { return routeData.url.pathname.startsWith('/icons/'); },
    new CacheFirst({
        cacheName: 'icons-' + CACHE_VERSION,
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] })
        ]
    })
);

// Pflanzen-API: Cache-First, 24h TTL (statische Daten)
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

// Auth-Status: Network-Only (nie cachen)
registerRoute(
    function(routeData) { return routeData.url.pathname.match(/^\/api(\/v1)?\/auth/); },
    new NetworkFirst({
        cacheName: 'auth-' + CACHE_VERSION,
        networkTimeoutSeconds: 3
    })
);

// Vendor-Dateien (Workbox etc.): Cache-First
registerRoute(
    function(routeData) { return routeData.url.pathname.startsWith('/vendor/'); },
    new CacheFirst({
        cacheName: 'vendor-' + CACHE_VERSION
    })
);

// --- Offline Fallback fuer Navigation ---

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

// Wenn Navigation fehlschlaegt und nichts im Cache: offline.html
self.addEventListener('fetch', function(event) {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(function() {
                return caches.match(event.request).then(function(cached) {
                    return cached || caches.match('/offline.html');
                });
            })
        );
    }
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
            // Nachricht an alle Clients senden, damit sie die Sync-Queue abarbeiten
            self.clients.matchAll().then(function(clients) {
                clients.forEach(function(client) {
                    client.postMessage({ type: 'SYNC_REQUESTED' });
                });
            })
        );
    }
});
```

- [ ] **Step 3: Pruefen ob Workbox-Module nachgeladen werden**

Workbox laedt Submodule automatisch nach (routing, strategies, etc.) wenn `modulePathPrefix` gesetzt ist. Diese muessen ebenfalls lokal verfuegbar sein.

```bash
cd public/vendor/workbox-v7.3.0
for module in workbox-routing workbox-strategies workbox-cacheable-response workbox-expiration workbox-precaching workbox-background-sync; do
    curl -L -o "${module}.prod.js" \
      "https://storage.googleapis.com/workbox-cdn/releases/7.3.0/${module}.prod.js"
done
cd ../../..
```

- [ ] **Step 4: Commit**

```bash
git add public/sw.js public/vendor/
git commit -m "feat(pwa): Service Worker mit Workbox-Caching-Strategien (#46)"
```

---

### Task 5: Offline-Fallback-Seite erstellen

**Files:**
- Create: `public/offline.html`

- [ ] **Step 1: offline.html erstellen**

Erstelle `public/offline.html` im gleichen Design wie die restliche App:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Offline - Gartenplaner</title>
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#365E3D">
    <link
      rel="icon"
      href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌱</text></svg>"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Nunito', system-ui, sans-serif;
        background: #FBF9F4;
        color: #1C1917;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 2rem;
      }
      .offline-container {
        text-align: center;
        max-width: 480px;
      }
      .offline-icon {
        font-size: 4rem;
        margin-bottom: 1.5rem;
      }
      .offline-title {
        font-family: 'DM Serif Display', serif;
        font-size: 1.75rem;
        color: #365E3D;
        margin-bottom: 0.75rem;
      }
      .offline-text {
        color: #78716C;
        line-height: 1.6;
        margin-bottom: 2rem;
      }
      .retry-btn {
        display: inline-block;
        background: #365E3D;
        color: white;
        border: none;
        padding: 0.75rem 2rem;
        border-radius: 8px;
        font-size: 1rem;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.2s;
      }
      .retry-btn:hover { background: #1B3D22; }
      .retry-btn:focus-visible {
        outline: 3px solid rgb(54 94 61 / 50%);
        outline-offset: 2px;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #0C0A09; color: #F5F5F4; }
        .offline-title { color: #A8D5BA; }
        .offline-text { color: #A8A29E; }
        .retry-btn { background: #A8D5BA; color: #0C0A09; }
        .retry-btn:hover { background: #7BC4A0; }
      }
    </style>
  </head>
  <body>
    <div class="offline-container">
      <div class="offline-icon" aria-hidden="true">📡</div>
      <h1 class="offline-title">Keine Internetverbindung</h1>
      <p class="offline-text">
        Diese Seite ist leider nicht im Offline-Cache verfuegbar.
        Pruefe deine Internetverbindung und versuche es erneut.
      </p>
      <button class="retry-btn" onclick="window.location.reload()">
        Erneut versuchen
      </button>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/offline.html
git commit -m "feat(pwa): Offline-Fallback-Seite erstellen (#46)"
```

---

### Task 6: IndexedDB Offline-Store erstellen

**Files:**
- Create: `src/js/offline-store.js`

- [ ] **Step 1: offline-store.js erstellen**

Erstelle `src/js/offline-store.js`:

```javascript
// IndexedDB Offline-Store fuer GardenPlanner
// Speichert Tasks lokal fuer Offline-Zugriff und verwaltet die Sync-Queue.

var OfflineStore = (function() {
    var DB_NAME = 'gardenplanner-offline';
    var DB_VERSION = 1;
    var TASKS_STORE = 'tasks';
    var SYNC_STORE = 'sync-queue';
    var db = null;

    function open() {
        if (db) return Promise.resolve(db);
        return new Promise(function(resolve, reject) {
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function(event) {
                var database = event.target.result;
                if (!database.objectStoreNames.contains(TASKS_STORE)) {
                    database.createObjectStore(TASKS_STORE, { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains(SYNC_STORE)) {
                    var syncStore = database.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
                    syncStore.createIndex('taskId', 'taskId', { unique: false });
                }
            };
            request.onsuccess = function(event) {
                db = event.target.result;
                resolve(db);
            };
            request.onerror = function(event) {
                console.error('[OfflineStore] IndexedDB Fehler:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    function transaction(storeName, mode) {
        return open().then(function(database) {
            return database.transaction(storeName, mode).objectStore(storeName);
        });
    }

    // --- Tasks ---

    function getAllTasks() {
        return transaction(TASKS_STORE, 'readonly').then(function(store) {
            return new Promise(function(resolve, reject) {
                var request = store.getAll();
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    function getTask(id) {
        return transaction(TASKS_STORE, 'readonly').then(function(store) {
            return new Promise(function(resolve, reject) {
                var request = store.get(id);
                request.onsuccess = function() { resolve(request.result || null); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    function putTask(task) {
        return transaction(TASKS_STORE, 'readwrite').then(function(store) {
            return new Promise(function(resolve, reject) {
                var request = store.put(task);
                request.onsuccess = function() { resolve(); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    function putAllTasks(tasks) {
        return open().then(function(database) {
            return new Promise(function(resolve, reject) {
                var tx = database.transaction(TASKS_STORE, 'readwrite');
                var store = tx.objectStore(TASKS_STORE);
                // Erst alle loeschen, dann neu schreiben
                store.clear();
                tasks.forEach(function(task) { store.put(task); });
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { reject(tx.error); };
            });
        });
    }

    function deleteTask(id) {
        return transaction(TASKS_STORE, 'readwrite').then(function(store) {
            return new Promise(function(resolve, reject) {
                var request = store.delete(id);
                request.onsuccess = function() { resolve(); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    // --- Sync Queue ---

    function addToSyncQueue(entry) {
        // entry: { type: 'create'|'update'|'delete', taskId: string, data: object, timestamp: string }
        return transaction(SYNC_STORE, 'readwrite').then(function(store) {
            return new Promise(function(resolve, reject) {
                var request = store.add(entry);
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    function getSyncQueue() {
        return transaction(SYNC_STORE, 'readonly').then(function(store) {
            return new Promise(function(resolve, reject) {
                var request = store.getAll();
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    function removeSyncEntry(id) {
        return transaction(SYNC_STORE, 'readwrite').then(function(store) {
            return new Promise(function(resolve, reject) {
                var request = store.delete(id);
                request.onsuccess = function() { resolve(); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    function clearSyncQueue() {
        return transaction(SYNC_STORE, 'readwrite').then(function(store) {
            return new Promise(function(resolve, reject) {
                var request = store.clear();
                request.onsuccess = function() { resolve(); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    function getSyncQueueCount() {
        return transaction(SYNC_STORE, 'readonly').then(function(store) {
            return new Promise(function(resolve, reject) {
                var request = store.count();
                request.onsuccess = function() { resolve(request.result); };
                request.onerror = function() { reject(request.error); };
            });
        });
    }

    return {
        open: open,
        getAllTasks: getAllTasks,
        getTask: getTask,
        putTask: putTask,
        putAllTasks: putAllTasks,
        deleteTask: deleteTask,
        addToSyncQueue: addToSyncQueue,
        getSyncQueue: getSyncQueue,
        removeSyncEntry: removeSyncEntry,
        clearSyncQueue: clearSyncQueue,
        getSyncQueueCount: getSyncQueueCount
    };
})();

window.OfflineStore = OfflineStore;
if (window.GP) window.GP.OfflineStore = OfflineStore;
```

- [ ] **Step 2: Commit**

```bash
git add src/js/offline-store.js
git commit -m "feat(pwa): IndexedDB Offline-Store erstellen (#46)"
```

---

### Task 7: Server-seitige Konflikt-Erkennung (409 Conflict)

**Files:**
- Modify: `src/server/storage/postgres-store.js:13-31` (rowToTask)
- Modify: `src/server/services/task-service.js:195-275` (updateTask)
- Modify: `src/server/routes/tasks.js:45-53` (PUT handler)
- Test: `tests/server.test.js`

- [ ] **Step 1: Failing Test fuer 409 Conflict schreiben**

In `tests/server.test.js`, am Ende der bestehenden Tests einfuegen:

```javascript
describe('PUT /api/tasks/:id - Conflict Detection', () => {
    test('returns 409 when lastKnownUpdate is older than server updatedAt', async () => {
        // Erst einen Task erstellen
        const createRes = await request(app)
            .post('/api/tasks')
            .set('Cookie', authCookie)
            .send({ title: 'Conflict Test', location: 'Garten' });

        const taskId = createRes.body.id;

        // Task updaten (setzt updatedAt auf jetzt)
        await request(app)
            .put(`/api/tasks/${taskId}`)
            .set('Cookie', authCookie)
            .send({ title: 'Updated Title' });

        // Jetzt mit altem Timestamp updaten -> 409
        const res = await request(app)
            .put(`/api/tasks/${taskId}`)
            .set('Cookie', authCookie)
            .send({
                title: 'Offline Change',
                lastKnownUpdate: '2020-01-01T00:00:00.000Z'
            });

        expect(res.status).toBe(409);
        expect(res.body.error).toBe(true);
        expect(res.body.serverTask).toBeDefined();
    });

    test('accepts update when lastKnownUpdate is not provided (non-PWA client)', async () => {
        const createRes = await request(app)
            .post('/api/tasks')
            .set('Cookie', authCookie)
            .send({ title: 'No Conflict', location: 'Garten' });

        const res = await request(app)
            .put(`/api/tasks/${createRes.body.id}`)
            .set('Cookie', authCookie)
            .send({ title: 'Updated Without Timestamp' });

        expect(res.status).toBe(200);
    });
});
```

- [ ] **Step 2: Test ausfuehren — muss fehlschlagen**

Run: `npm test`
Expected: Die neuen Tests schlagen fehl (409-Status wird noch nicht zurueckgegeben)

- [ ] **Step 3: updatedAt in rowToTask aufnehmen**

In `src/server/storage/postgres-store.js`, Zeile 29 (nach `createdAt`), einfuegen:

```javascript
        updatedAt: row.updated_at
```

So dass rowToTask jetzt auch `updatedAt` zurueckgibt.

- [ ] **Step 4: Konflikt-Check in task-service.js einfuegen**

In `src/server/services/task-service.js`, in der `updateTask`-Funktion nach Zeile 205 (nach dem 404-Check), einfuegen:

```javascript
    // Konflikt-Erkennung fuer Offline-Sync
    if (body.lastKnownUpdate) {
        const clientUpdate = new Date(body.lastKnownUpdate).getTime();
        const serverUpdate = new Date(existing.updatedAt).getTime();
        if (serverUpdate > clientUpdate) {
            return {
                error: true,
                status: 409,
                message: 'Task wurde zwischenzeitlich geaendert',
                serverTask: existing
            };
        }
    }
```

- [ ] **Step 5: 409-Response in Route weiterleiten**

In `src/server/routes/tasks.js`, Zeile 49 (im PUT-Handler), die Fehlerbehandlung erweitern. Ersetze den Block Zeile 48-50:

```javascript
    if (result.error) {
        if (result.status === 400) return res.status(400).json({ error: true, status: 400, message: 'Validation failed', errors: result.errors });
        if (result.status === 409) return res.status(409).json({ error: true, status: 409, message: result.message, serverTask: result.serverTask });
        return res.status(result.status).json({ error: true, status: result.status, message: result.message });
    }
```

- [ ] **Step 6: Tests ausfuehren — muessen bestehen**

Run: `npm test`
Expected: Alle Tests bestehen, insbesondere die neuen 409-Tests

- [ ] **Step 7: Commit**

```bash
git add src/server/storage/postgres-store.js src/server/services/task-service.js src/server/routes/tasks.js tests/server.test.js
git commit -m "feat(pwa): Server-seitige Konflikt-Erkennung 409 (#46)"
```

---

### Task 8: Sync-Manager erstellen

**Files:**
- Create: `src/js/sync-manager.js`

- [ ] **Step 1: sync-manager.js erstellen**

Erstelle `src/js/sync-manager.js`:

```javascript
// Sync-Manager: Arbeitet Offline-Aenderungen ab und handelt Konflikte
var SyncManager = (function() {
    var isSyncing = false;

    function sync() {
        if (isSyncing || !navigator.onLine) return Promise.resolve({ synced: 0, conflicts: [] });
        isSyncing = true;

        return OfflineStore.getSyncQueue()
            .then(function(queue) {
                if (queue.length === 0) {
                    isSyncing = false;
                    return { synced: 0, conflicts: [] };
                }

                var synced = 0;
                var conflicts = [];
                var chain = Promise.resolve();

                queue.forEach(function(entry) {
                    chain = chain.then(function() {
                        return processEntry(entry).then(function(result) {
                            if (result.conflict) {
                                conflicts.push(result);
                            } else {
                                synced++;
                            }
                            return OfflineStore.removeSyncEntry(entry.id);
                        }).catch(function(err) {
                            console.error('[SyncManager] Fehler bei Eintrag', entry.id, err);
                            // Bei Netzwerkfehler abbrechen
                            if (!navigator.onLine) throw err;
                        });
                    });
                });

                return chain.then(function() {
                    isSyncing = false;
                    return { synced: synced, conflicts: conflicts };
                }).catch(function() {
                    isSyncing = false;
                    return { synced: synced, conflicts: conflicts };
                });
            })
            .catch(function(err) {
                isSyncing = false;
                console.error('[SyncManager] Sync fehlgeschlagen:', err);
                return { synced: 0, conflicts: [] };
            });
    }

    function processEntry(entry) {
        switch (entry.type) {
            case 'create':
                return TaskAPI._fetch('/tasks', {
                    method: 'POST',
                    body: JSON.stringify(entry.data)
                }).then(function(task) {
                    // Lokale ID durch Server-ID ersetzen
                    if (entry.taskId !== task.id) {
                        return OfflineStore.deleteTask(entry.taskId)
                            .then(function() { return OfflineStore.putTask(task); })
                            .then(function() { return { conflict: false }; });
                    }
                    return OfflineStore.putTask(task).then(function() { return { conflict: false }; });
                });

            case 'update':
                return fetch(TaskAPI.baseUrl + '/tasks/' + encodeURIComponent(entry.taskId), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(Object.assign({}, entry.data, {
                        lastKnownUpdate: entry.timestamp
                    }))
                }).then(function(res) {
                    if (res.status === 409) {
                        return res.json().then(function(body) {
                            // Server-Stand uebernehmen
                            return OfflineStore.putTask(body.serverTask).then(function() {
                                return {
                                    conflict: true,
                                    taskId: entry.taskId,
                                    taskTitle: body.serverTask.title,
                                    localChanges: entry.data,
                                    serverTask: body.serverTask
                                };
                            });
                        });
                    }
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.json().then(function(task) {
                        return OfflineStore.putTask(task).then(function() { return { conflict: false }; });
                    });
                });

            case 'delete':
                return TaskAPI._fetch('/tasks/' + encodeURIComponent(entry.taskId), {
                    method: 'DELETE'
                }).then(function() {
                    return OfflineStore.deleteTask(entry.taskId);
                }).then(function() {
                    return { conflict: false };
                }).catch(function(err) {
                    // 404 = Task wurde schon geloescht, kein Fehler
                    if (err.message && err.message.includes('404')) return { conflict: false };
                    throw err;
                });

            default:
                console.warn('[SyncManager] Unbekannter Typ:', entry.type);
                return Promise.resolve({ conflict: false });
        }
    }

    function registerBackgroundSync() {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then(function(registration) {
                return registration.sync.register('gardenplanner-sync');
            }).catch(function(err) {
                console.warn('[SyncManager] Background Sync nicht verfuegbar:', err);
            });
        }
    }

    // Auf Sync-Nachrichten vom Service Worker hoeren
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'SYNC_REQUESTED') {
                sync();
            }
        });
    }

    return {
        sync: sync,
        registerBackgroundSync: registerBackgroundSync
    };
})();

window.SyncManager = SyncManager;
if (window.GP) window.GP.SyncManager = SyncManager;
```

- [ ] **Step 2: Commit**

```bash
git add src/js/sync-manager.js
git commit -m "feat(pwa): Sync-Manager mit Konflikt-Handling erstellen (#46)"
```

---

### Task 9: API-Client fuer Offline-Support erweitern

**Files:**
- Modify: `src/js/api.js`

- [ ] **Step 1: api.js erweitern**

Die bestehende `TaskAPI` in `src/js/api.js` wird erweitert. Ersetze den gesamten Inhalt:

```javascript
// API Client for Gartenplaner REST API — with Offline Support
var TaskAPI = {
    baseUrl: "/api/v1",

    async checkAuth() {
        var res = await fetch(this.baseUrl + '/auth/status', { credentials: 'same-origin' });
        return res.json();
    },

    async login(username, password) {
        var res = await fetch(this.baseUrl + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ username: username, password: password })
        });
        if (!res.ok) {
            var body = await res.json().catch(function() { return {}; });
            throw new Error(body.message || 'Login failed');
        }
        return res.json();
    },

    async logout() {
        await fetch(this.baseUrl + '/auth/logout', {
            method: 'POST',
            credentials: 'same-origin'
        });
        window.location.href = '/login';
    },

    async _fetch(url, options) {
        options = options || {};
        var res = await fetch(this.baseUrl + url, {
            headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
            credentials: 'same-origin',
            method: options.method || 'GET',
            body: options.body || undefined
        });
        if (res.status === 401) {
            window.location.href = '/login';
            throw new Error('Authentication required');
        }
        if (!res.ok) {
            var body = await res.json().catch(function() { return {}; });
            var msg = body.errors ? body.errors.join(', ') : body.message || 'HTTP ' + res.status;
            throw new Error(msg);
        }
        if (res.status === 204) return null;
        return res.json();
    },

    async getTasks(filters) {
        filters = filters || {};
        try {
            var params = new URLSearchParams();
            if (filters.status) params.set("status", filters.status);
            if (filters.employee) params.set("employee", filters.employee);
            if (filters.location) params.set("location", filters.location);
            var qs = params.toString();
            var tasks = await this._fetch('/tasks' + (qs ? '?' + qs : ''));

            // Erfolg: Tasks in IndexedDB spiegeln
            var taskArray = Array.isArray(tasks) ? tasks : (tasks && tasks.data ? tasks.data : []);
            if (window.OfflineStore && taskArray.length > 0) {
                OfflineStore.putAllTasks(taskArray).catch(function(e) {
                    console.warn('[API] IndexedDB Spiegelung fehlgeschlagen:', e);
                });
            }
            return tasks;
        } catch (err) {
            // Offline: Aus IndexedDB lesen
            if (!navigator.onLine && window.OfflineStore) {
                console.log('[API] Offline — lade Tasks aus IndexedDB');
                var cached = await OfflineStore.getAllTasks();
                // Client-seitig filtern
                if (filters.status) cached = cached.filter(function(t) { return t.status === filters.status; });
                if (filters.employee) cached = cached.filter(function(t) { return t.employee === filters.employee; });
                if (filters.location) cached = cached.filter(function(t) { return t.location === filters.location; });
                return cached;
            }
            throw err;
        }
    },

    async getTask(id) {
        try {
            var task = await this._fetch('/tasks/' + encodeURIComponent(id));
            if (window.OfflineStore && task) {
                OfflineStore.putTask(task).catch(function() {});
            }
            return task;
        } catch (err) {
            if (!navigator.onLine && window.OfflineStore) {
                return OfflineStore.getTask(id);
            }
            throw err;
        }
    },

    async createTask(taskData) {
        try {
            var task = await this._fetch("/tasks", { method: "POST", body: JSON.stringify(taskData) });
            if (window.OfflineStore && task) {
                OfflineStore.putTask(task).catch(function() {});
            }
            return task;
        } catch (err) {
            if (!navigator.onLine && window.OfflineStore) {
                // Offline: Lokal speichern mit temporaerer ID
                var offlineTask = Object.assign({}, taskData, {
                    id: 'offline-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    status: taskData.status || 'pending',
                    priority: taskData.priority || 'medium',
                    recurrence: taskData.recurrence || 'none',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    _pendingSync: true
                });
                await OfflineStore.putTask(offlineTask);
                await OfflineStore.addToSyncQueue({
                    type: 'create',
                    taskId: offlineTask.id,
                    data: taskData,
                    timestamp: new Date().toISOString()
                });
                if (window.SyncManager) SyncManager.registerBackgroundSync();
                return offlineTask;
            }
            throw err;
        }
    },

    async updateTask(id, taskData) {
        try {
            var task = await this._fetch('/tasks/' + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(taskData) });
            if (window.OfflineStore && task) {
                OfflineStore.putTask(task).catch(function() {});
            }
            return task;
        } catch (err) {
            if (!navigator.onLine && window.OfflineStore) {
                // Offline: Lokal aktualisieren und in Sync-Queue
                var existing = await OfflineStore.getTask(id);
                if (existing) {
                    var updated = Object.assign({}, existing, taskData, {
                        updatedAt: new Date().toISOString(),
                        _pendingSync: true
                    });
                    await OfflineStore.putTask(updated);
                }
                await OfflineStore.addToSyncQueue({
                    type: 'update',
                    taskId: id,
                    data: taskData,
                    timestamp: existing ? existing.updatedAt : new Date().toISOString()
                });
                if (window.SyncManager) SyncManager.registerBackgroundSync();
                return existing ? Object.assign({}, existing, taskData) : taskData;
            }
            throw err;
        }
    },

    async deleteTask(id) {
        try {
            var result = await this._fetch('/tasks/' + encodeURIComponent(id), { method: "DELETE" });
            if (window.OfflineStore) {
                OfflineStore.deleteTask(id).catch(function() {});
            }
            return result;
        } catch (err) {
            if (!navigator.onLine && window.OfflineStore) {
                await OfflineStore.deleteTask(id);
                await OfflineStore.addToSyncQueue({
                    type: 'delete',
                    taskId: id,
                    data: null,
                    timestamp: new Date().toISOString()
                });
                if (window.SyncManager) SyncManager.registerBackgroundSync();
                return null;
            }
            throw err;
        }
    },

    async archiveTask(id) {
        return this._fetch('/tasks/' + encodeURIComponent(id) + '/archive', { method: "POST" });
    },

    async unarchiveTask(id) {
        return this._fetch('/tasks/' + encodeURIComponent(id) + '/unarchive', { method: "POST" });
    },

    async getArchivedTasks() {
        return this._fetch("/archived-tasks");
    },

    async deleteArchivedTask(id) {
        return this._fetch('/archived-tasks/' + encodeURIComponent(id), { method: "DELETE" });
    }
};

window.TaskAPI = TaskAPI;
if (window.GP) window.GP.TaskAPI = TaskAPI;
```

- [ ] **Step 2: Bestehende Tests ausfuehren**

Run: `npm test`
Expected: Alle bestehenden Tests bestehen (Server-Tests nutzen den API-Client nicht direkt)

- [ ] **Step 3: Commit**

```bash
git add src/js/api.js
git commit -m "feat(pwa): API-Client mit Offline-Support erweitern (#46)"
```

---

### Task 10: Offline-UI erstellen (Banner, Toasts, Install-Prompt)

**Files:**
- Create: `src/js/offline-ui.js`
- Modify: `src/css/styles.css` (Offline-Banner + Sync-Badge Styles)

- [ ] **Step 1: offline-ui.js erstellen**

Erstelle `src/js/offline-ui.js`:

```javascript
// Offline-UI: Banner, Sync-Toasts, Install-Prompt
var OfflineUI = (function() {
    var banner = null;
    var installPromptEvent = null;
    var installHintShown = false;

    function init() {
        createBanner();
        setupOnlineOfflineListeners();
        setupInstallPrompt();

        // Initial-Status pruefen
        if (!navigator.onLine) {
            showOfflineBanner();
        }
    }

    function createBanner() {
        banner = document.createElement('div');
        banner.className = 'offline-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.innerHTML = '<span class="offline-banner-icon">📡</span> <span class="offline-banner-text">Du bist offline — Aenderungen werden synchronisiert sobald du wieder online bist</span>';
        banner.style.display = 'none';
        // Nach der Nav einfuegen, falls vorhanden
        var nav = document.querySelector('.nav-container') || document.querySelector('nav');
        if (nav && nav.parentNode) {
            nav.parentNode.insertBefore(banner, nav.nextSibling);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }
    }

    function showOfflineBanner() {
        if (banner) {
            banner.style.display = '';
            banner.classList.remove('offline-banner-success');
            banner.classList.add('offline-banner-warning');
        }
    }

    function hideOfflineBanner() {
        if (banner) {
            banner.style.display = 'none';
        }
    }

    function showSyncSuccessBanner(count) {
        if (banner) {
            banner.style.display = '';
            banner.classList.remove('offline-banner-warning');
            banner.classList.add('offline-banner-success');
            banner.querySelector('.offline-banner-text').textContent = count + ' Aenderung' + (count !== 1 ? 'en' : '') + ' synchronisiert';
            setTimeout(function() { hideOfflineBanner(); }, 4000);
        }
    }

    function showSyncConflictToast(conflict) {
        var toast = document.createElement('div');
        toast.className = 'offline-sync-toast';
        toast.setAttribute('role', 'alert');
        toast.innerHTML = '<div class="offline-sync-toast-content">' +
            '<strong>Sync-Konflikt</strong>' +
            '<p>Task "' + escapeForHtml(conflict.taskTitle) + '" wurde zwischenzeitlich geaendert. Der Server-Stand wurde uebernommen.</p>' +
            '<button class="offline-sync-toast-close" aria-label="Schliessen">\u00d7</button>' +
            '</div>';
        toast.querySelector('.offline-sync-toast-close').addEventListener('click', function() {
            toast.remove();
        });
        document.body.appendChild(toast);
        setTimeout(function() {
            toast.classList.add('offline-sync-toast-fade');
            setTimeout(function() { toast.remove(); }, 300);
        }, 10000);
    }

    function escapeForHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function setupOnlineOfflineListeners() {
        window.addEventListener('online', function() {
            hideOfflineBanner();
            // Sync starten
            if (window.SyncManager) {
                SyncManager.sync().then(function(result) {
                    if (result.synced > 0) {
                        showSyncSuccessBanner(result.synced);
                    }
                    result.conflicts.forEach(function(conflict) {
                        showSyncConflictToast(conflict);
                    });
                    // Tasks neu laden wenn Sync stattfand
                    if ((result.synced > 0 || result.conflicts.length > 0) && window.TaskState) {
                        TaskState.loadTasks();
                    }
                });
            }
        });

        window.addEventListener('offline', function() {
            showOfflineBanner();
        });
    }

    function setupInstallPrompt() {
        if (localStorage.getItem('install-hint-dismissed')) return;

        window.addEventListener('beforeinstallprompt', function(event) {
            event.preventDefault();
            installPromptEvent = event;
            if (!installHintShown) {
                showInstallHint();
                installHintShown = true;
            }
        });
    }

    function showInstallHint() {
        var hint = document.createElement('div');
        hint.className = 'install-hint';
        hint.setAttribute('role', 'status');
        hint.innerHTML = '<span>Tipp: Du kannst den GardenPlanner als App installieren!</span>' +
            '<button class="install-hint-btn">Installieren</button>' +
            '<button class="install-hint-dismiss" aria-label="Schliessen">\u00d7</button>';

        hint.querySelector('.install-hint-btn').addEventListener('click', function() {
            if (installPromptEvent) {
                installPromptEvent.prompt();
                installPromptEvent.userChoice.then(function() {
                    installPromptEvent = null;
                    hint.remove();
                });
            }
        });

        hint.querySelector('.install-hint-dismiss').addEventListener('click', function() {
            localStorage.setItem('install-hint-dismissed', 'true');
            hint.remove();
        });

        var main = document.querySelector('main') || document.querySelector('[role="main"]');
        if (main) {
            main.insertBefore(hint, main.firstChild);
        }
    }

    return { init: init };
})();

// Auto-init wenn DOM bereit
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { OfflineUI.init(); });
} else {
    OfflineUI.init();
}

window.OfflineUI = OfflineUI;
```

- [ ] **Step 2: CSS-Styles fuer Offline-Banner und Toasts hinzufuegen**

Am Ende von `src/css/styles.css` (vor der letzten schliessenden Klammer, falls vorhanden) folgende Styles anfuegen:

```css
/* --- PWA Offline UI --- */

.offline-banner {
  padding: var(--space-sm) var(--space-md);
  text-align: center;
  font-size: var(--text-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
}

.offline-banner-warning {
  background: var(--warning-light);
  color: var(--warning);
  border-bottom: 2px solid var(--warning);
}

.offline-banner-success {
  background: var(--success-light);
  color: var(--success);
  border-bottom: 2px solid var(--success);
}

.offline-sync-toast {
  position: fixed;
  top: var(--space-lg);
  right: var(--space-lg);
  max-width: 400px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-left: 4px solid var(--warning);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-md);
  z-index: 10000;
  animation: slideInRight var(--duration-normal) ease;
}

.offline-sync-toast-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  position: relative;
  padding-right: var(--space-lg);
}

.offline-sync-toast-content strong { color: var(--warning); }

.offline-sync-toast-content p {
  font-size: var(--text-sm);
  color: var(--text-light);
  margin: 0;
}

.offline-sync-toast-close {
  position: absolute;
  top: 0;
  right: 0;
  background: none;
  border: none;
  font-size: var(--text-lg);
  color: var(--text-light);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.offline-sync-toast-fade { opacity: 0; transition: opacity var(--duration-normal); }

@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.install-hint {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--info-light);
  color: var(--info);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-md);
  font-size: var(--text-sm);
}

.install-hint-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
  white-space: nowrap;
}

.install-hint-btn:hover { background: var(--primary-dark); }

.install-hint-dismiss {
  background: none;
  border: none;
  color: var(--info);
  font-size: var(--text-lg);
  cursor: pointer;
  padding: 0;
  margin-left: auto;
  line-height: 1;
}

/* Pending-Sync Badge auf Task-Cards */
.sync-pending-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--text-xs);
  color: var(--text-light);
  padding: 2px var(--space-xs);
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
}

@media (prefers-reduced-motion: reduce) {
  .offline-sync-toast { animation: none; }
  @keyframes slideInRight { from { opacity: 1; } to { opacity: 1; } }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/js/offline-ui.js src/css/styles.css
git commit -m "feat(pwa): Offline-UI mit Banner, Toasts und Install-Prompt (#46)"
```

---

### Task 11: Server Static-Serving fuer PWA-Dateien anpassen

**Files:**
- Modify: `src/server/app.js:73-89`

- [ ] **Step 1: Static-Serving erweitern**

In `src/server/app.js`, nach Zeile 80 (nach dem `/public` static serve), einfuegen:

```javascript
// Vendor-Dateien (Workbox etc.) — lang cachen, aendert sich nur bei Versionswechsel
app.use('/vendor', express.static(path.join(PROJECT_ROOT, 'public', 'vendor'), { maxAge: '30d' }));

// Icons
app.use('/icons', express.static(path.join(PROJECT_ROOT, 'public', 'icons'), { maxAge: '7d' }));
```

Dann nach dem `/public` static serve und vor dem HTML routing, den Service Worker und Manifest servieren. Vor Zeile 91 (`// HTML page routes`) einfuegen:

```javascript
// Service Worker: Muss vom Root serviert werden, kein Cache (damit Updates sofort greifen)
app.get('/sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(PROJECT_ROOT, 'public', 'sw.js'));
});

// Manifest vom Root servieren
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'public', 'manifest.json'));
});
```

- [ ] **Step 2: Tests ausfuehren**

Run: `npm test`
Expected: Alle bestehenden Tests bestehen weiterhin

- [ ] **Step 3: Commit**

```bash
git add src/server/app.js
git commit -m "feat(pwa): Server Static-Serving fuer SW, Manifest und Icons (#46)"
```

---

### Task 12: Build-Script fuer PWA-Dateien erweitern

**Files:**
- Modify: `scripts/build.js`

- [ ] **Step 1: Neue JS-Module in Bundles aufnehmen**

In `scripts/build.js`, die `sharedJs` Liste (Zeilen 62-70) erweitern. Am Ende des Arrays (nach `'src/js/api.js'`) hinzufuegen:

```javascript
    'src/js/offline-store.js',
    'src/js/sync-manager.js',
    'src/js/offline-ui.js'
```

In `jsBundles`, beim `garden-bundle.js` (Zeile 155-157), die PWA-Module hinzufuegen da dieser nur `garden-planner.js` enthaelt und kein sharedJs nutzt:

```javascript
    'garden-bundle.js': [
        'src/js/garden-planner.js',
        'src/js/offline-store.js',
        'src/js/sync-manager.js',
        'src/js/offline-ui.js'
    ]
```

- [ ] **Step 2: PWA-Dateien in dist/ kopieren**

Am Ende des Build-Prozesses (vor dem Summary-Block, Zeile 250), folgende Kopier-Logik hinzufuegen:

```javascript
// Copy PWA files to dist/
console.log('\nPWA files:');
const pwaFiles = [
    { src: 'public/sw.js', dest: 'sw.js' },
    { src: 'public/manifest.json', dest: 'manifest.json' },
    { src: 'public/offline.html', dest: 'offline.html' }
];
for (const file of pwaFiles) {
    const content = readSource(file.src);
    if (content) writeBundle(file.dest, content);
}

// Copy icons directory
const iconsSourceDir = path.join(ROOT, 'public', 'icons');
if (fs.existsSync(iconsSourceDir)) {
    ensureDir(path.join(DIST, 'icons'));
    const iconFiles = fs.readdirSync(iconsSourceDir);
    for (const iconFile of iconFiles) {
        const content = fs.readFileSync(path.join(iconsSourceDir, iconFile));
        fs.writeFileSync(path.join(DIST, 'icons', iconFile), content);
        console.log(`  icons/${iconFile}`);
    }
}

// Copy vendor directory
const vendorSourceDir = path.join(ROOT, 'public', 'vendor');
if (fs.existsSync(vendorSourceDir)) {
    const copyDir = (src, dest) => {
        ensureDir(dest);
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                copyDir(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
                console.log(`  vendor/${entry.name}`);
            }
        }
    };
    copyDir(vendorSourceDir, path.join(DIST, 'vendor'));
}

// Copy pwa-register.js (loaded separately like auth-check.js)
const pwaRegisterContent = readSource('src/js/pwa-register.js');
if (pwaRegisterContent) writeBundle(path.join('js', 'pwa-register.js'), pwaRegisterContent);
```

- [ ] **Step 3: HTML-Verarbeitung fuer pwa-register.js**

Im HTML-Processing-Block (Zeile 228-244), nach dem auth-check.js Replacement-Block, hinzufuegen:

```javascript
    // Replace pwa-register.js path for production
    html = html.replace(
        /(<script\s+src=")\.\.\/src\/js\/pwa-register\.js(">\s*<\/script>)/g,
        '$1/dist/js/pwa-register.js$2'
    );
```

- [ ] **Step 4: Build testen**

Run: `node scripts/build.js`
Expected: Keine Fehler, neue PWA-Dateien werden in dist/ aufgelistet

- [ ] **Step 5: Commit**

```bash
git add scripts/build.js
git commit -m "feat(pwa): Build-Script fuer PWA-Module und Assets erweitern (#46)"
```

---

### Task 13: Version Bump und finaler Test

**Files:**
- Modify: `package.json:3`

- [ ] **Step 1: Version in package.json hochsetzen**

In `package.json`, Zeile 3, Version aendern:

```json
  "version": "3.2.0",
```

- [ ] **Step 2: Alle Tests ausfuehren**

Run: `npm test`
Expected: Alle Tests bestehen

- [ ] **Step 3: Build ausfuehren**

Run: `node scripts/build.js`
Expected: Build laeuft durch ohne Fehler

- [ ] **Step 4: Server starten und manuell pruefen**

Run: `npm run dev`

Manuelle Checks:
1. `/manifest.json` ist erreichbar und valides JSON
2. `/sw.js` ist erreichbar
3. Chrome DevTools > Application > Service Workers zeigt registrierten SW
4. Chrome DevTools > Application > Manifest zeigt App-Name + Icons
5. Offline-Checkbox in DevTools aktivieren > Dashboard zeigt Offline-Banner
6. Lighthouse PWA-Audit ausfuehren

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "feat(pwa): Version bump 3.2.0 (#46)"
```
