# PWA-Konvertierung — Design Spec

**Issue:** #46 — Convert Application to Progressive Web App (PWA)  
**Datum:** 2026-04-08  
**Ansatz:** Workbox Runtime-Only (ohne Build-Tool)

## Zusammenfassung

Der GardenPlanner wird zu einer Progressive Web App konvertiert mit vollem Offline-Support. Nutzer koennen die App auf dem Homescreen installieren und alle Features (Tasks, Pflanzen, Gartenplaner, Statistiken) offline nutzen. Offline-Aenderungen werden bei Reconnect automatisch mit dem Server synchronisiert (Server-Wins bei Konflikten, mit Warnung).

## 1. App-Shell & Manifest

### manifest.json

Abgelegt in `/public/manifest.json`:

```json
{
  "name": "GardenPlanner",
  "short_name": "Garden",
  "start_url": "/dashboard",
  "display": "standalone",
  "theme_color": "<Hauptgruen aus CSS-Variablen>",
  "background_color": "<Hintergrundfarbe der App>",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Icons

- SVG-basiertes Keimling-Icon (basierend auf dem bestehenden Inline-SVG-Favicon) auf gruenem Kreis-Hintergrund
- Exportiert als PNG in 192x192 und 512x512
- Maskable-Varianten mit mehr Padding fuer adaptive Icons
- Abgelegt in `/public/icons/`

### Meta-Tags

Folgende Tags werden in alle 8 HTML-Seiten eingefuegt:

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="...">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

### Service Worker Registration

Kleines Inline-Script am Ende jeder HTML-Seite (oder im bestehenden Bundle):

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

## 2. Service Worker — Caching-Strategien

### Workbox Runtime-Import

Workbox wird lokal als Datei abgelegt (nicht von CDN geladen), damit der Service Worker selbst offline funktioniert. Import im `sw.js` via `importScripts('/vendor/workbox-sw.js')`.

### Caching-Strategien pro Ressource

| Ressource | Strategie | TTL | Begruendung |
|-----------|-----------|-----|-------------|
| HTML-Seiten (8x) | Network-First, Fallback Cache | - | Immer aktuellste Version, offline verfuegbar |
| CSS/JS Bundles (`/dist`) | Cache-First | - | Versioniert, aendert sich selten |
| CSS/JS Source (`/public`, `/src`) | Cache-First | - | Fuer Dev-Modus |
| Pflanzen-API (`/api/plants`) | Cache-First | 24h | Statische Daten |
| Task-API (`/api/tasks`, `/api/v1/*`) | Network-First, Fallback Cache | - | Dynamische Daten, offline letzte Version |
| Google Fonts | Cache-First | 30d | Aendern sich nie |
| Wetter-API | Network-First, Fallback Stale-Cache | - | Ergaenzt bestehenden localStorage-Fallback |
| Icons/Images | Cache-First | - | Statisch |

### Precache-Liste (manuell gepflegt)

- Alle 8 HTML-Seiten: login.html, dashboard.html, index.html, statistics.html, plants.html, garden.html, logs.html, admin.html
- manifest.json
- App-Icons (192, 512, maskable Varianten)
- offline.html (Fallback-Seite)
- Workbox Runtime-Library

### Offline-Fallback

Wenn eine HTML-Seite nicht im Cache ist und kein Netz besteht, wird eine dedizierte `offline.html` angezeigt mit:
- App-Design-konformes Layout
- Nachricht: "Seite nicht verfuegbar — kein Internet"
- Retry-Button der die Seite neu laedt

## 3. Offline-Datenhaltung & Sync

### IndexedDB als Offline-Store

Statt nur localStorage wird IndexedDB genutzt (besser fuer strukturierte Daten und groessere Mengen).

- **Datenbank-Name**: `gardenplanner-offline`
- **Object Stores**:
  - `tasks` — Alle Tasks gecached, Key: `id`
  - `sync-queue` — Ausstehende Offline-Aenderungen mit Feldern: `id`, `type` (create/update/delete), `taskId`, `data`, `timestamp`

### Online-Ablauf

1. API-Response kommt -> Daten normal anzeigen UND in IndexedDB spiegeln
2. User erstellt/bearbeitet Task -> API-Call, bei Erfolg IndexedDB aktualisieren

### Offline-Ablauf

1. App erkennt `navigator.onLine === false` (+ `offline`-Event)
2. Daten werden aus IndexedDB gelesen und angezeigt
3. User erstellt/bearbeitet Task -> Aenderung in `sync-queue` schreiben, lokale IndexedDB sofort aktualisieren
4. UI zeigt dezenten "Offline"-Banner

### Sync bei Reconnect

1. `online`-Event feuert -> Sync-Queue abarbeiten (FIFO)
2. Fuer jeden Eintrag: API-Call ausfuehren
3. **Konflikt-Erkennung**: Server antwortet mit `409 Conflict` wenn `updatedAt` des Tasks neuer ist als der Offline-Zeitstempel
4. **Server-Wins mit Warnung**: Server-Stand wird uebernommen, User sieht Toast-Notification mit Details der eigenen Offline-Aenderung
5. Bei Erfolg: Eintrag aus Sync-Queue entfernen

### Background Sync

Falls der Browser es unterstuetzt (`'SyncManager' in window`), registriert der Service Worker einen Background-Sync-Tag (`gardenplanner-sync`). So werden Aenderungen auch synchronisiert wenn die App geschlossen ist und Netz zurueckkommt.

### Konflikt-Handling auf dem Server

Neues Feld `updatedAt` (Timestamp) auf Tasks. Bei PUT-Requests wird ein optionaler `If-Unmodified-Since`-artiger Check durchgefuehrt:
- Request enthaelt `lastKnownUpdate` Timestamp
- Server vergleicht mit aktuellem `updatedAt`
- Bei Mismatch: `409 Conflict` Response mit dem aktuellen Server-Stand

## 4. UI-Anpassungen & Offline-Feedback

### Offline-Banner

- Schmaler Banner direkt unter der Navigation
- Text: "Du bist offline — Aenderungen werden synchronisiert sobald du wieder online bist"
- Farbe: Orange/Gelb wenn offline, Gruen bei erfolgreichem Sync
- Verschwindet automatisch bei Reconnect nach erfolgreichem Sync

### Sync-Feedback

- Toast-Notification nach Sync: "X Aenderungen synchronisiert"
- Bei Konflikten: Toast mit Details und Link zum betroffenen Task

### Install-Prompt

- Kein eigener Install-Button
- Dezenter Hinweis im Dashboard beim ersten Besuch: "Tipp: Du kannst den GardenPlanner als App installieren"
- Nutzt `beforeinstallprompt`-Event
- Hinweis nur einmal zeigen (localStorage-Flag `install-hint-dismissed`)

### Offline-Kennzeichnung

- Tasks die nur lokal existieren (noch nicht synchronisiert) bekommen ein kleines Cloud-Icon mit Pfeil (pending sync)
- Ansonsten soll sich die App offline genauso anfuehlen wie online

### offline.html Fallback-Seite

- Einfache Seite im App-Design
- Nachricht: "Seite nicht verfuegbar — kein Internet"
- Retry-Button der die Seite neu laedt
- Wird nur gezeigt wenn eine Seite angefragt wird die nicht im Cache ist

## 5. Testing & Rollout

### Manuelle Tests

- Chrome DevTools -> Application Tab: Service Worker Status, Cache Storage, IndexedDB inspizieren
- "Offline" Checkbox in DevTools zum Simulieren
- Testfall: App laden -> Offline gehen -> Tasks erstellen/bearbeiten -> Online gehen -> Sync pruefen
- Testfall: Konflikt provozieren -> Warnung pruefen

### Automatisierte Tests

Im ersten Schritt keine automatisierten Service Worker Tests. Kann spaeter in Issue #239 (Test-Coverage erweitern) abgedeckt werden.

### Rollout-Strategie

- Service Worker mit `CACHE_VERSION` Konstante
- Bei neuem Deploy: Neuer Service Worker aktiviert sich, alte Caches werden geloescht
- `skipWaiting()` + `clients.claim()` fuer sofortige Aktivierung

### Lighthouse-Check

Nach Implementierung Lighthouse PWA-Audit laufen lassen. Ziel: PWA-Badge (installierbar, offline-faehig, alle Kriterien gruen).

## Neue Dateien

| Datei | Zweck |
|-------|-------|
| `public/manifest.json` | Web App Manifest |
| `public/sw.js` | Service Worker |
| `public/offline.html` | Offline-Fallback-Seite |
| `public/icons/icon-192.png` | App-Icon 192x192 |
| `public/icons/icon-512.png` | App-Icon 512x512 |
| `public/icons/icon-192-maskable.png` | Maskable Icon 192x192 |
| `public/icons/icon-512-maskable.png` | Maskable Icon 512x512 |
| `public/vendor/workbox-sw.js` | Workbox Runtime (lokal) |
| `src/offline-store.js` | IndexedDB Wrapper (Offline-Datenhaltung) |
| `src/sync-manager.js` | Sync-Queue & Konflikt-Handling |
| `src/offline-ui.js` | Offline-Banner, Sync-Toasts, Install-Prompt |

## Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| Alle 8 HTML-Seiten | Meta-Tags + SW-Registration + offline-ui.js einbinden |
| `app.js` (Server) | Static-Serving fuer neue Dateien, `409 Conflict` Response bei Task-Updates |
| `src/app.js` (Frontend) | IndexedDB-Spiegelung bei API-Calls, Offline-Erkennung |
| Task-API Route | `updatedAt`-Feld und Konflikt-Check |
| `scripts/bundle.js` | Neue JS-Module in Bundles aufnehmen |
