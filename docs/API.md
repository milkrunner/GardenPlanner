# API-Referenz

Die maschinenlesbare Beschreibung steht in [`openapi.json`](openapi.json) (OpenAPI 3). Sie wird in
`tests/openapi.test.js` gegen die tatsächlich registrierten Routen und echte Antworten geprüft:
Eine neue Route ohne Eintrag oder eine abweichende Antwort lässt den Test fehlschlagen.

Alle Beispiele nutzen `http://localhost:8080` (Docker Compose). Ohne Docker läuft der Server auf Port 3000.

## Grundlagen

- **Format:** JSON (`Content-Type: application/json`), UTF-8, Body-Limit 100 kB.
- **Authentifizierung:** Ist `API_KEY` gesetzt (in Produktion der Standard), braucht jeder Aufruf unter
  `/api` den Header `X-API-Key`. Ausgenommen ist nur `GET /api/auth/status`.
- **Rate-Limit:** 100 Anfragen je 15 Minuten und IP. Danach antwortet der Server mit `429` (Text, kein JSON)
  und den Headern `Retry-After` und `RateLimit-*`. n8n-Flows mit vielen Aufrufen sollten das einplanen.
- **IDs:** Aufgaben haben eine UUID v4. Eine ungültige ID ergibt `400`, eine unbekannte `404`.
- **Eine Instanz:** Der Server ist für genau eine Instanz ausgelegt, siehe [Architektur](ARCHITECTURE.md#betriebsgrenzen).

## Fehlerformate

| Status | Wann                                                      | Body                                                     |
| ------ | --------------------------------------------------------- | -------------------------------------------------------- |
| `400`  | Validierung von `POST`/`PUT /api/tasks` fehlgeschlagen    | `{"errors": ["Titel muss zwischen 1 und 200 …", …]}`     |
| `400`  | Ungültige ID, ungültiges JSON, nicht unterstützter Filter | `{"error": "…"}`                                         |
| `401`  | `X-API-Key` fehlt oder ist falsch                         | `{"error": "Unauthorized. Provide a valid X-API-Key …"}` |
| `404`  | Aufgabe, archivierte Aufgabe oder Pflanze unbekannt       | `{"error": "Task not found"}`                            |
| `413`  | Body größer als 100 kB                                    | `{"error": "request entity too large"}`                  |
| `429`  | Rate-Limit überschritten                                  | Text: `Too many requests, please try again later.`       |
| `500`  | Unerwarteter Serverfehler                                 | `{"error": "Internal server error"}`                     |

Unbekannte Pfade unter `/api` liefern Expresss Standard-`404` als HTML, nicht als JSON.

## Endpunkte

| Methode  | Pfad                        | Zweck                                          |
| -------- | --------------------------- | ---------------------------------------------- |
| `GET`    | `/api/auth/status`          | Ist ein API-Key nötig? (ohne Key erreichbar)   |
| `GET`    | `/api/tasks`                | Aufgaben auflisten (`status`, `page`, `limit`) |
| `POST`   | `/api/tasks`                | Aufgabe erstellen                              |
| `POST`   | `/api/tasks/search`         | Aufgaben nach Mitarbeiter/Standort/Status      |
| `GET`    | `/api/tasks/{id}`           | Aufgabe abrufen                                |
| `PUT`    | `/api/tasks/{id}`           | Aufgabe teilweise ändern                       |
| `DELETE` | `/api/tasks/{id}`           | Aufgabe löschen (`204`)                        |
| `POST`   | `/api/tasks/{id}/archive`   | Aufgabe archivieren                            |
| `POST`   | `/api/tasks/{id}/unarchive` | Aufgabe wiederherstellen                       |
| `GET`    | `/api/archived-tasks`       | Archiv auflisten                               |
| `DELETE` | `/api/archived-tasks/{id}`  | Archivierte Aufgabe endgültig löschen (`204`)  |
| `GET`    | `/api/plants`               | Pflanzenbibliothek (`category`, `search`)      |
| `GET`    | `/api/plants/{id}`          | Einzelne Pflanze                               |
| `GET`    | `/api/plant-categories`     | Kategorien der Pflanzenbibliothek              |

### Aufgabe

Pflichtfelder beim Erstellen sind `title` (1–200 Zeichen) und `location` (1–100). Optional sind `employee`
(max. 100), `description` (max. 2000), `notes` (max. 5000), `status` (`pending`, `in-progress`, `completed`),
`priority` (`low`, `medium`, `high`), `recurrence` (`none`, `daily`, `weekly`, `monthly`) und `subtasks`
(max. 50; Strings oder `{"text": "…", "completed": false}`). Der Server vergibt `id`, `createdAt`,
`sortOrder` und eine `history`. Bei `completed` setzt er `completedAt`. `recurrence` wird nur gespeichert,
der Server erzeugt keine Folgeaufgaben.

```bash
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  -d '{"title":"Tomaten gießen","employee":"Lisa","location":"Gewächshaus","priority":"high"}'
```

### Auflisten und Pagination

Ohne `page` und `limit` liefert `GET /api/tasks` ein reines Array. Mit mindestens einem der beiden kommt
ein Seitenobjekt `{"data": […], "total": 42, "page": 1, "limit": 50, "pages": 1}`. `limit` darf 1 bis 200
sein, sonst gilt 50. Ein unbekannter `status` wird ignoriert.

```bash
curl -H "X-API-Key: $API_KEY" "http://localhost:8080/api/tasks?status=pending&page=1&limit=20"
```

### Suche nach Mitarbeiter und Standort

`employee` und `location` stehen bewusst nicht in der URL, weil Query-Strings in Request-Logs landen.
`GET /api/tasks?employee=…` ergibt `400`. Stattdessen geht die Suche per Body; alle Felder sind optional,
verglichen wird exakt, mehrere Felder gelten gemeinsam. `page` und `limit` funktionieren wie oben.

```bash
curl -X POST http://localhost:8080/api/tasks/search \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  -d '{"employee":"Lisa","status":"pending"}'
```

### Archiv

`archive` verschiebt eine Aufgabe samt Historie ins Archiv und setzt `archivedAt`; `unarchive` macht das
rückgängig. `GET /api/archived-tasks` liefert immer ein Array ohne Pagination.

### Pflanzenbibliothek

`GET /api/plants` liefert ein Array. `category` vergleicht exakt, `search` sucht ohne Beachtung der
Groß-/Kleinschreibung in Name, Kategorie und Tipps. Eine Pflanze hat `id` (Slug, z. B. `tomato`), `name`,
`category`, `icon`, `difficulty`, `sun`, `water`, `season`, `spacing`, `germination`, `harvest`,
`companions`, `avoid` und `tips`. Die Standarddaten liegen in `src/server/defaults/default-plants.json`.

## Nicht Teil der API

- **Wetter:** Die Weboberfläche ruft Open-Meteo direkt im Browser auf (Geocoding und 7-Tage-Vorhersage).
  Der Server vermittelt das nicht.
- **Historie und Logs:** Die Historie einer Aufgabe steckt im Feld `history`. Die Logs-Seite zeigt das
  Browser-Log; es gibt keinen Log-Endpunkt.
- **Seiten und Dateien:** `/`, `/dashboard`, `/statistics`, `/plants`, `/logs`, `/public/*` und `/src/*`
  sind statische Auslieferung. `/docs/*` und `/tests/*` gibt es nur außerhalb der Produktion.
