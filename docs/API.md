# API-Referenz

Die maschinenlesbare Beschreibung steht in [`openapi.json`](openapi.json) (OpenAPI 3). Sie wird in
`tests/openapi.test.js` gegen die tatsächlich registrierten Routen und echte Antworten geprüft:
Eine neue Route ohne Eintrag oder eine abweichende Antwort lässt den Test fehlschlagen.

Alle Beispiele nutzen `http://localhost:8080` (Docker Compose). Ohne Docker läuft der Server auf Port 3000.

## Grundlagen

- **Format:** JSON (`Content-Type: application/json`), UTF-8, Body-Limit 100 kB (einzige Ausnahme: `POST /api/import` mit 5 MB).
- **Authentifizierung:** Ist `API_KEY` gesetzt (in Produktion der Standard), braucht jeder Aufruf unter
  `/api` den Header `X-API-Key`. Ausgenommen ist nur `GET /api/auth/status`.
- **Rate-Limit:** 100 Anfragen je 15 Minuten und IP. Danach antwortet der Server mit `429` (Text, kein JSON)
  und den Headern `Retry-After` und `RateLimit-*`. n8n-Flows mit vielen Aufrufen sollten das einplanen.
- **IDs:** Aufgaben haben eine UUID v4. Eine ungültige ID ergibt `400`, eine unbekannte `404`.
- **Eine Instanz:** Der Server ist für genau eine Instanz ausgelegt, siehe [Architektur](ARCHITECTURE.md#betriebsgrenzen).

## Fehlerformate

| Status | Wann                                                      | Body                                                     |
| ------ | --------------------------------------------------------- | -------------------------------------------------------- |
| `400`  | Validierung von `POST`/`PUT` auf Aufgaben oder Pflanzen   | `{"errors": ["Titel muss zwischen 1 und 200 …", …]}`     |
| `400`  | Ungültige ID, ungültiges JSON, nicht unterstützter Filter | `{"error": "…"}`                                         |
| `401`  | `X-API-Key` fehlt oder ist falsch                         | `{"error": "Unauthorized. Provide a valid X-API-Key …"}` |
| `404`  | Aufgabe, archivierte Aufgabe oder Pflanze unbekannt       | `{"error": "Task not found"}`                            |
| `409`  | `POST /api/import` in eine nicht leere Instanz            | `{"errors": ["Die Zielinstanz ist nicht leer. …"]}`      |
| `409`  | `POST /api/plants` mit einer bereits vergebenen ID        | `{"error": "Plant with ID \"tomato\" already exists"}`   |
| `413`  | Body größer als 100 kB (Import: 5 MB)                     | `{"error": "request entity too large"}`                  |
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
| `POST`   | `/api/plants`               | Pflanze anlegen                                |
| `GET`    | `/api/plants/{id}`          | Einzelne Pflanze                               |
| `PUT`    | `/api/plants/{id}`          | Pflanze teilweise ändern                       |
| `DELETE` | `/api/plants/{id}`          | Pflanze löschen (`204`)                        |
| `GET`    | `/api/plant-categories`     | Kategorien der Pflanzenbibliothek              |
| `GET`    | `/api/export`               | Gesamten Datenbestand als JSON-Bündel sichern  |
| `POST`   | `/api/import`               | Bündel importieren (`mode`, `confirm`)         |

### Aufgabe

Pflichtfelder beim Erstellen sind `title` (1–200 Zeichen) und `location` (1–100). Optional sind `employee`
(max. 100), `description` (max. 2000), `notes` (max. 5000), `status` (`pending`, `in-progress`, `completed`),
`priority` (`low`, `medium`, `high`), `recurrence` (`none`, `daily`, `weekly`, `monthly`) und `subtasks`
(max. 50; Strings oder `{"text": "…", "completed": false}`). Der Server vergibt `id`, `createdAt`,
`sortOrder` und eine `history`. Bei `completed` setzt er `completedAt`. Zu `recurrence` siehe
[Wiederholende Aufgaben](#wiederholende-aufgaben).

```bash
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  -d '{"title":"Tomaten gießen","employee":"Lisa","location":"Gewächshaus","priority":"high"}'
```

### Wiederholende Aufgaben

Wechselt eine Aufgabe per `PUT /api/tasks/{id}` auf `completed` und hat sie `recurrence` `daily`, `weekly`
oder `monthly`, legt der Server die Folgeaufgabe an (#327). Die Antwort bleibt die geänderte Aufgabe
(`200`); die Folgeaufgabe steht zusätzlich im Feld `followUp` (nur dann vorhanden).

- **Inhalt der Folgeaufgabe:** `title`, `employee`, `location`, `description`, `notes`, `priority` und
  `recurrence` der Vorlage, `status` `pending`, Unterpunkte wieder offen, eigene `id`, `createdAt` und eine
  neue `history` (`created`). Zusätzlich `recurrenceOf` (ID der Vorlage), `lastRecurrence` (Abschlusszeit)
  und `nextDue`. Die Vorlage erhält `followUpId`, und ihr `completed`-Historieneintrag nennt es in
  `details.followUpId`.
- **Fälligkeit `nextDue`:** Abschlusszeit plus Intervall in UTC: `daily` +1 Tag, `weekly` +7 Tage, `monthly`
  +1 Kalendermonat. Am Monatsende gilt der letzte Tag des Zielmonats: 31. Jan. + 1 Monat = 28. Feb.
  (29. Feb. im Schaltjahr), 31. Mär. + 1 Monat = 30. Apr.
- **Alles oder nichts:** Statusänderung und Folgeaufgabe entstehen im selben Sperr- und Schreibvorgang auf
  `tasks.json` (eine Datei, temporäre Datei plus Umbenennen). Schlägt das Schreiben fehl, antwortet der
  Server mit `500` und beides fehlt; ein erneutes PUT ist gefahrlos.
- **Idempotenz:** Nur der Übergang zu `completed` zählt. Ein weiteres PUT auf eine abgeschlossene Aufgabe
  (auch `completed` → `completed` mit weiteren Änderungen oder parallele Aufrufe) erzeugt keine zweite
  Folgeaufgabe und liefert kein `followUp`. Wird eine Aufgabe wieder geöffnet und erneut abgeschlossen,
  bleibt es bei der ersten Folgeaufgabe (`followUpId`). Auch eine im selben PUT gesetzte `recurrence`
  gilt; `none` erzeugt nichts. Beim Anlegen einer bereits `completed` erstellten Aufgabe entsteht keine
  Folgeaufgabe.
- Ältere Clients, die `followUp` ignorieren, sehen die Folgeaufgabe beim nächsten Laden der Liste.

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
`companions`, `avoid` und `tips`.

**Speicherung:** Die 20 Standardpflanzen liegen in `src/server/defaults/default-plants.json` und bleiben im
Repository unverändert. Existiert `DATA_DIR/plants.json`, ersetzt diese Datei die Standards vollständig. Der
erste Schreibzugriff (`POST`, `PUT` oder `DELETE`) übernimmt die Standardpflanzen in diese Datei und ändert
sie dort. Geschrieben wird atomar (temporäre Datei, dann Umbenennen) und unter einer Sperre. Jede Änderung
steht im Audit-Log (`plant_created`, `plant_updated`, `plant_deleted`, beim ersten Schreiben zusätzlich
`plant_library_initialized`). Auch Standardpflanzen lassen sich ändern und löschen, und die Bibliothek darf
leer werden: ein leeres `plants.json` (`[]`) bedeutet eine leere Bibliothek, nicht „Standards“.

**Zurücksetzen auf die Standards:** Die Datei `DATA_DIR/plants.json` löschen. Ein Neustart ist nicht nötig,
die Bibliothek wird bei jedem Lesen frisch aus der Datei geladen. Alle eigenen Pflanzen und Änderungen gehen
dabei verloren; sichern Sie die Datei vorher, wenn Sie sie behalten wollen. Es gibt dafür bewusst keinen
API-Endpunkt.

**Beschädigtes `plants.json`:** Ist die Datei kein gültiges JSON oder kein Array, liefern die Lese-Endpunkte
weiterhin die Standardpflanzen und der Server schreibt eine Warnung ins Log (einmal je Schadensfall, nicht bei
jeder Anfrage). Schreibende Aufrufe antworten mit `500` und lassen die Datei unangetastet. Reparieren oder
löschen Sie sie, dann geht es weiter.

**Anlegen (`POST /api/plants`):** Pflicht sind `name` (1–60 Zeichen) und `category` (1–40). Optional sind
`id` (Slug aus `a-z`, `0-9` und `-`, max. 40; ohne Angabe leitet der Server ihn aus dem Namen ab, Umlaute
werden transkribiert, z. B. „Süße Möhre“ → `susse-mohre`), `icon` (1–8 Zeichen, Standard 🌱), `difficulty`
(`easy`, `medium`, `hard`; Standard `medium`), `sun` (`full`, `partial`, `shade`; Standard `full`), `water`
(`low`, `medium`, `high`; Standard `medium`), `season` (Liste aus `spring`, `summer`, `autumn`, `winter`),
`spacing` (max. 30), `germination` (max. 40), `harvest` (max. 60), `companions` und `avoid` (je max. 30
Einträge mit 1–60 Zeichen) sowie `tips` (max. 1000). Text wird getrimmt und von Steuerzeichen befreit, doppelte
Listeneinträge entfallen, unbekannte Felder werden ignoriert. Die Zeichen `<` und `>` sind in allen Textfeldern
unzulässig (`400`). Eine vergebene ID ergibt `409`, auch wenn sie nur durch den Namen entsteht.

**Ändern (`PUT /api/plants/{id}`):** Wie bei Aufgaben ändern sich nur die gesendeten Felder. Eine abweichende
`id` im Body ergibt `400`, eine unbekannte Pflanze `404`.

```bash
curl -X POST http://localhost:8080/api/plants \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  -d '{"name":"Kohlrabi","category":"Gemüse","sun":"partial","season":["spring","autumn"]}'
```

### Export und Import

Details zu Sicherung und Wiederherstellung (auch Docker-Volume) stehen in [Backup](BACKUP.md).

`GET /api/export` liefert `{"formatVersion": 1, "app": "gartenplaner", "exportedAt": "…", "tasks": […],
"archivedTasks": […], "plants": null}` mit `Content-Disposition: attachment`. `plants` ist nur gesetzt, wenn die
Instanz eine eigene `plants.json` hat. Der Export enthält Aufgabendaten, aber nie den API-Key.

`POST /api/import` nimmt ein solches Bündel entgegen und überschreibt nie unbemerkt:

- Ohne `mode`: nur in eine leere Instanz, sonst `409` und keine Änderung. Eine vorhandene `plants.json` zählt nur,
  wenn das Bündel `plants` enthält.
- `?mode=merge`: ergänzt unbekannte IDs. Vorhandene IDs (Aufgaben und Archiv) bleiben unverändert und stehen in
  `skipped`.
- `?mode=replace&confirm=replace`: ersetzt Aufgaben und Archiv (und `plants.json`, wenn `plants` im Bündel steht).
  Vorher kopiert der Server die alten Dateien nach `backups/import-<Zeitstempel>-<Zufall>/` im Datenverzeichnis;
  der relative Pfad steht in `backup`. Ohne `confirm=replace` antwortet der Server mit `400`.

Das Bündel wird komplett geprüft, bevor geschrieben wird (`formatVersion` 1, UUID v4 als `id`, `createdAt` als
Datum, alle Aufgaben-Regeln von oben, keine doppelten IDs, unbekannte Felder werden verworfen). Fehler ergeben
`400` mit `{"errors": ["tasks[1]: …"]}` (höchstens 20 Meldungen) und lassen den Bestand unverändert. Der Body darf
5 MB groß sein, ein Bündel höchstens 10000 Aufgaben und 1000 Pflanzen, sonst `413`.
Erfolg: `{"mode": "merge", "imported": {"tasks": 1, "archivedTasks": 0, "plants": 0}, "skipped": {"tasks": [], …}, "backup": null}`.

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:8080/api/export -o export.json
curl -X POST "http://localhost:8080/api/import?mode=merge" \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" --data-binary @export.json
```

## Nicht Teil der API

- **Wetter:** Die Weboberfläche ruft Open-Meteo direkt im Browser auf (Geocoding und 7-Tage-Vorhersage).
  Der Server vermittelt das nicht.
- **Historie und Logs:** Die Historie einer Aufgabe steckt im Feld `history`. Die Logs-Seite zeigt das
  Browser-Log; es gibt keinen Log-Endpunkt.
- **Seiten und Dateien:** `/`, `/dashboard`, `/statistics`, `/plants`, `/logs`, `/public/*` und `/src/*`
  sind statische Auslieferung. `/docs/*` und `/tests/*` gibt es nur außerhalb der Produktion.
