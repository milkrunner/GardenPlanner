# 🌱 Gartenplaner

Moderne Webanwendung zur Verwaltung von Gartenaufgaben mit Echtzeit-Synchronisation.

## Features

- ✅ **Aufgabenverwaltung** - Erstellen, bearbeiten, archivieren
- 👥 **Mitarbeiter & Standorte** - Zuweisungen und Verwaltung
- 🔍 **Filterung & Suche** - Schnelles Finden von Aufgaben
- 📊 **Statistiken & Diagramme** - Übersichten und Fortschritt
- 🔄 **Echtzeit-Sync** - Automatische Tab-Synchronisation
- 📄 **PDF-Export** - Aufgabenlisten exportieren
- 🎨 **Dark Mode** - Helles & dunkles Theme
- 💾 **Offline-fähig** - Alles läuft im Browser
- 🔒 **XSS-Schutz** - Input-Validierung und HTML-Escaping
- 🛡️ **Error Handling** - Automatische Fehler-Recovery
- 📝 **Logging System** - Fehler-Tracking und Debug-Logs

## 📁 Projektstruktur

```file
GardenPlanner/
├── public/              # Haupt-HTML-Seiten
│   ├── index.html       # Hauptseite
│   ├── dashboard.html   # Dashboard-Ansicht
│   ├── statistics.html  # Statistiken
│   └── logs.html        # Log-Viewer
├── src/                 # Quellcode
│   ├── js/             # JavaScript-Module
│   │   ├── app.js      # Hauptlogik
│   │   ├── security.js # XSS-Schutz
│   │   ├── encryption.js # Verschlüsselung
│   │   ├── logger.js   # Logging-System
│   │   ├── error-handler.js # Fehlerbehandlung
│   │   ├── rate-limiter.js # Rate Limiting
│   │   └── collaboration.js # WebSocket-Client
│   └── css/            # Stylesheets
│       └── styles.css  # Haupt-Styles
├── docs/               # Dokumentation
│   ├── SECURITY.md     # Sicherheits-Dokumentation
│   ├── ERROR_HANDLING.md # Error Handling Guide
│   ├── ENCRYPTION.md   # Verschlüsselung Guide
│   └── LOGGING.md      # Logging System Doku
├── tests/              # Test-Seiten
│   ├── security-test.html
│   ├── encryption-test.html
│   ├── error-test.html
│   ├── rate-limit-test.html
│   └── storage-test.html
└── README.md           # Diese Datei
```

## Schnellstart

### 🐳 Mit Docker (empfohlen)

```bash
# Container starten
docker-compose up -d

# Öffnen: http://localhost:8080
```

**➡️ [Vollständige Docker-Dokumentation](DOCKER.md)**

### 💻 Ohne Docker

**Direkt im Browser:**

```bash
# Einfach public/index.html öffnen - kein Server nötig!
```

**Mit Python HTTP-Server:**

```bash
python -m http.server 8000
# Öffnen: http://localhost:8000/public/
```

Die Anwendung läuft komplett im Browser, alle Daten werden lokal im LocalStorage gespeichert.
