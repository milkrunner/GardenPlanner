# Garten Planner 🌱

Eine Webanwendung zur Verwaltung von Gartenarbeiten, Arbeitern und Zeitplänen mit persistenter Datenspeicherung.

## Features

- ✅ **Worker-Ansicht**: Übersicht über den heutigen Zeitplan und offene Aufgaben
- ✅ **Admin-Dashboard**: Verwaltung von Aufgaben, Arbeitern und Zeitplänen
- ✅ **Persistente Datenspeicherung**: SQLite-Datenbank für dauerhafte Speicherung
- ✅ **REST API**: Vollständige API für alle CRUD-Operationen
- ✅ **Moderne UI**: Responsive Design mit Tailwind CSS

## Installation

### Voraussetzungen

- Node.js (Version 14 oder höher)
- npm oder yarn

### Setup

1. **Dependencies installieren:**

   ```bash
   npm install
   ```

2. **Server starten:**

   ```bash
   npm start
   ```

   Oder für Entwicklung mit Auto-Reload:

   ```bash
   npm run dev
   ```

3. **App öffnen:**
   <http://localhost:3000>

## Projektstruktur

```file
GardenPlanner/
├── server.js              # Express-Server und API-Endpoints
├── package.json           # Projekt-Dependencies
├── garden_planner.db      # SQLite-Datenbank (wird automatisch erstellt)
└── public/
    └── index.html         # Frontend-Anwendung
```

## API Endpoints

### Workers

- `GET /api/workers` - Alle Arbeiter abrufen
- `POST /api/workers` - Neuen Arbeiter erstellen
- `PUT /api/workers/:id` - Arbeiter aktualisieren
- `DELETE /api/workers/:id` - Arbeiter löschen

### Tasks

- `GET /api/tasks` - Alle Aufgaben abrufen
- `POST /api/tasks` - Neue Aufgabe erstellen
- `PUT /api/tasks/:id` - Aufgabe aktualisieren
- `DELETE /api/tasks/:id` - Aufgabe löschen

### Schedules

- `GET /api/schedules` - Alle Zeitpläne abrufen
- `POST /api/schedules` - Neuen Zeitplan erstellen
- `PUT /api/schedules/:id` - Zeitplan aktualisieren
- `DELETE /api/schedules/:id` - Zeitplan löschen

## Datenbank

Die Anwendung verwendet SQLite als Datenbank. Die Datenbankdatei `garden_planner.db` wird automatisch beim ersten Start erstellt und enthält:

- **workers** - Arbeiter-Informationen
- **tasks** - Aufgaben mit Details
- **task_assignments** - Zuordnung von Aufgaben zu Arbeitern
- **schedules** - Zeitplan-Einträge

Beim ersten Start werden automatisch Beispieldaten eingefügt.

## Technologie-Stack

- **Backend:**

  - Node.js
  - Express.js
  - SQLite3

- **Frontend:**
  - Alpine.js
  - Tailwind CSS
  - Vanilla JavaScript

## Deployment

Die Anwendung kann auf jedem Node.js-fähigen Server deployed werden:

1. Repository auf Server klonen
2. `npm install` ausführen
3. `npm start` ausführen
4. Optional: Process Manager wie PM2 verwenden

### Beispiel mit PM2

```bash
npm install -g pm2
pm2 start server.js --name garden-planner
pm2 save
```

## Umgebungsvariablen

- `PORT` - Server-Port (Standard: 3000)

Beispiel:

```bash
PORT=8080 npm start
```

## Lizenz

ISC
