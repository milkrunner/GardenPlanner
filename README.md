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
