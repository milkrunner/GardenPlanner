# 🌱 Gartenplaner

Moderne Webanwendung zur Verwaltung von Gartenaufgaben mit REST API und n8n-Integration.

## Features

- ✅ **Aufgabenverwaltung** - Erstellen, bearbeiten, archivieren
- 👥 **Mitarbeiter & Standorte** - Zuweisungen und Verwaltung
- 🔍 **Filterung & Suche** - Schnelles Finden von Aufgaben
- 📊 **Statistiken & Diagramme** - Übersichten und Fortschritt
- 🔄 **Echtzeit-Sync** - Automatische Tab-Synchronisation
- 📄 **PDF-Export** - Aufgabenlisten exportieren
- 🎨 **Dark Mode** - Helles & dunkles Theme
- 🌱 **Pflanzenbibliothek** - Pflanzen mit Pflege-, Aussaat- und Nachbarschaftsinfos, per API abrufbar
- 🌤️ **Wetter** - 7-Tage-Vorhersage je Standort (Open-Meteo, direkt im Browser)
- 🕑 **Historie** - Änderungsverlauf je Aufgabe
- 🌐 **REST API** - Externe Integration via API (z.B. n8n), siehe [API-Referenz](docs/API.md)
- 🔑 **API-Key Auth** - Authentifizierung für externen Zugriff
- 💾 **Persistente Speicherung** - Serverseitiges JSON-Storage mit localStorage-Fallback
- 🔒 **XSS-Schutz** - Input-Validierung und HTML-Escaping
- 🛡️ **Error Handling** - Automatische Fehler-Recovery
- 📝 **Logging System** - Fehler-Tracking und Debug-Logs

## Schnellstart

### 🐳 Mit Docker (empfohlen)

```bash
# Container starten
docker compose up -d

# Öffnen: http://localhost:8080
```

### 💻 Ohne Docker

```bash
# Dependencies installieren
npm install

# Server starten
npm start

# Öffnen: http://localhost:3000
```

## REST API

Die API ermöglicht externe Integration, z.B. mit n8n, um Tasks
automatisiert zu erstellen und zu verwalten.

### Authentifizierung

Externe Anfragen (z.B. von n8n) benötigen einen API-Key im Header:

```http
X-API-Key: YOUR_API_KEY_HERE
```

Den API-Key konfiguriert man über die Umgebungsvariable `API_KEY` (siehe `.env.example`).
Ist `API_KEY` gesetzt, fragt auch die Weboberfläche beim ersten Öffnen nach dem Schlüssel
(Dialog „API-Key erforderlich") und speichert ihn im Browser (`localStorage`). Ein
abgelehnter Schlüssel wird erneut abgefragt. Bricht die Verbindung ab, zeigt die Oberfläche
die lokale Kopie mit deutlichem Hinweis; bei Auth- oder Serverfehlern erscheint eine Fehlerleiste
statt veralteter Daten. Ohne `API_KEY` auf dem Server ist keine Eingabe nötig.

### Endpoints

Die vollständige Referenz mit Fehlerformaten, Pagination und Beispielen steht in der
[API-Referenz](docs/API.md), maschinenlesbar in [`docs/openapi.json`](docs/openapi.json).

| Methode  | Endpoint                   | Beschreibung                                  |
| -------- | -------------------------- | --------------------------------------------- |
| `GET`    | `/api/auth/status`         | Ist ein API-Key nötig? (ohne Key erreichbar)  |
| `GET`    | `/api/tasks`               | Tasks auflisten (`status`, `page`, `limit`)   |
| `POST`   | `/api/tasks`               | Neuen Task erstellen                          |
| `POST`   | `/api/tasks/search`        | Tasks nach Mitarbeiter/Standort/Status suchen |
| `GET`    | `/api/tasks/:id`           | Einzelnen Task abrufen                        |
| `PUT`    | `/api/tasks/:id`           | Task aktualisieren                            |
| `DELETE` | `/api/tasks/:id`           | Task löschen                                  |
| `POST`   | `/api/tasks/:id/archive`   | Task archivieren                              |
| `POST`   | `/api/tasks/:id/unarchive` | Task wiederherstellen                         |
| `GET`    | `/api/archived-tasks`      | Archivierte Tasks auflisten                   |
| `DELETE` | `/api/archived-tasks/:id`  | Archivierten Task löschen                     |
| `GET`    | `/api/plants`              | Pflanzenbibliothek (`category`, `search`)     |
| `GET`    | `/api/plants/:id`          | Einzelne Pflanze                              |
| `GET`    | `/api/plant-categories`    | Kategorien der Pflanzenbibliothek             |

### Filter

`GET /api/tasks` unterstützt `?status=pending` / `in-progress` / `completed` sowie die Pagination
`?page=1&limit=50`. Filter nach Mitarbeiter oder Standort laufen bewusst nicht über die URL, weil
Query-Strings in Request-Logs landen. Dafür gibt es `POST /api/tasks/search` mit dem Filter im Body.
`GET /api/tasks?employee=…` oder `?location=…` wird mit `400` abgelehnt, damit n8n-Flows nicht
unbemerkt ungefilterte Listen bekommen:

```bash
curl -X POST http://localhost:8080/api/tasks/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"employee":"Max","location":"Garten","status":"pending"}'
```

### Beispiel: Task erstellen (cURL)

```bash
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"title":"Rasen mähen","employee":"Max","location":"Garten",
       "description":"Vorgarten und Hinterhof"}'
```

### Beispiel: n8n HTTP Request Node

- **Method:** POST
- **URL:** `http://gartenplaner:3000/api/tasks`
- **Headers:** `X-API-Key: YOUR_API_KEY_HERE`
- **Body (JSON):**

  ```json
  {
    "title": "Bewässerung prüfen",
    "employee": "Lisa",
    "location": "Gewächshaus 2",
    "description": "Tropfbewässerung kontrollieren"
  }
  ```

## Konfiguration

Umgebungsvariablen (siehe `.env.example`):

| Variable                | Beschreibung                                                                               | Standard             |
| ----------------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| `API_KEY`               | API-Key für externen Zugriff (Header `X-API-Key`)                                          | _(leer = kein Auth)_ |
| `ALLOW_UNAUTHENTICATED` | `true` erlaubt den Produktionsstart ohne `API_KEY` (bewusster Opt-out, nur hinter Gateway) | _(nicht gesetzt)_    |
| `PORT`                  | Server-Port                                                                                | `3000`               |

**Produktionsstart:** Mit `NODE_ENV=production` (Docker-Image-Standard) verweigert der Server den Start, wenn
`API_KEY` fehlt oder leer ist, und beendet sich mit Exit-Code 1 und einer Fehlermeldung. Ohne `NODE_ENV=production`
(lokale Entwicklung, `npm run dev`) bleibt die API ohne `API_KEY` offen und loggt nur eine Warnung. Wer
produktiv bewusst ohne Auth laufen will, setzt zusätzlich `ALLOW_UNAUTHENTICATED=true`.

**Betriebsgrenze:** Gartenplaner ist für genau **eine** Server-Instanz ausgelegt (JSON-Dateien, In-Process-Locks,
In-Memory-Rate-Limit). Siehe [Architektur](docs/ARCHITECTURE.md#betriebsgrenzen).

## Entwicklung und Coding Agents

Setup, Prüfungen und PR-Ablauf: [CONTRIBUTING.md](CONTRIBUTING.md).
Agent-Anleitung: [AGENTS.md](AGENTS.md).
Code-Einstiegspunkte: [Architektur](docs/ARCHITECTURE.md).
