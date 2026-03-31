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
- 🌐 **REST API** - Externe Integration via API (z.B. n8n)
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

Die API ermöglicht externe Integration, z.B. mit n8n, um Tasks automatisiert zu erstellen und zu verwalten.

### Authentifizierung

Externe Anfragen (z.B. von n8n) benötigen einen API-Key im Header:

```http
X-API-Key: YOUR_API_KEY_HERE
```

Den API-Key konfiguriert man über die Umgebungsvariable `API_KEY` (siehe `.env.example`).
Browser-Anfragen von der Anwendung selbst benötigen keinen API-Key.

### Endpoints

| Methode  | Endpoint                   | Beschreibung                |
| -------- | -------------------------- | --------------------------- |
| `GET`    | `/api/tasks`               | Alle Tasks auflisten        |
| `GET`    | `/api/tasks/:id`           | Einzelnen Task abrufen      |
| `POST`   | `/api/tasks`               | Neuen Task erstellen        |
| `PUT`    | `/api/tasks/:id`           | Task aktualisieren          |
| `DELETE` | `/api/tasks/:id`           | Task löschen                |
| `POST`   | `/api/tasks/:id/archive`   | Task archivieren            |
| `POST`   | `/api/tasks/:id/unarchive` | Task wiederherstellen       |
| `GET`    | `/api/archived-tasks`      | Archivierte Tasks auflisten |
| `DELETE` | `/api/archived-tasks/:id`  | Archivierten Task löschen   |

### Filter

`GET /api/tasks` unterstützt Query-Parameter:

- `?status=pending` / `in-progress` / `completed`
- `?employee=Max`
- `?location=Gewächshaus`

### Beispiel: Task erstellen (curl)

```bash
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"title":"Rasen mähen","employee":"Max","location":"Garten","description":"Vorgarten und Hinterhof"}'
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

| Variable  | Beschreibung                 | Standard             |
| --------- | ---------------------------- | -------------------- |
| `API_KEY` | API-Key für externen Zugriff | _(leer = kein Auth)_ |
| `PORT`    | Server-Port                  | `3000`               |
