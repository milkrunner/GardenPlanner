# Gartenplaner

Webanwendung zur Verwaltung von Gartenaufgaben mit REST API (Node.js/Express,
JSON-Speicherung, keine externe Datenbank).

Quellcode, Issues und Dokumentation: <https://github.com/milkrunner/GardenPlanner>

## Funktionen

- Aufgabenverwaltung: erstellen, bearbeiten, archivieren, wiederherstellen
- Mitarbeiter und Standorte, Filterung und Suche
- Pflanzenbibliothek, Dashboard, Statistiken und Log-Viewer als eigene Seiten
- PDF-Export von Aufgabenlisten, helles und dunkles Theme
- REST API unter `/api/` (z. B. für n8n), optional mit API-Key (`X-API-Key`)

## Verfügbare Tags

| Tag          | Bedeutung                                |
| ------------ | ---------------------------------------- |
| `beta`       | Aktueller Beta-Stand                     |
| `X.Y.Z-beta` | Feste Beta-Version, z. B. `3.11.11-beta` |

Es gibt derzeit **keinen** `latest`-Tag und keine stabilen `X.Y.Z`-Tags. Das
Image ist nur für `linux/amd64` veröffentlicht. Für reproduzierbare Setups einen
festen `X.Y.Z-beta`-Tag verwenden.

## Schnellstart

```bash
docker run -d --name gartenplaner -p 8080:3000 \
  -e API_KEY=ein-geheimer-schluessel \
  -v gartenplaner-data:/app/data \
  milkrunner/gardenplanner:beta
```

Danach ist die Anwendung unter <http://localhost:8080> erreichbar.

### Docker Compose

```yaml
services:
  gartenplaner:
    image: milkrunner/gardenplanner:beta
    container_name: gartenplaner
    ports:
      - '8080:3000'
    restart: unless-stopped
    environment:
      - TZ=Europe/Berlin
      - API_KEY=${API_KEY}
    volumes:
      - gartenplaner-data:/app/data

volumes:
  gartenplaner-data:
```

## Umgebungsvariablen

| Variable       | Beschreibung                                         | Standard             |
| -------------- | ---------------------------------------------------- | -------------------- |
| `API_KEY`      | API-Key für externen Zugriff                         | _(leer = kein Auth)_ |
| `PORT`         | Server-Port im Container                             | `3000`               |
| `DATA_DIR`     | Verzeichnis für Aufgaben-, Archiv- und Pflanzendaten | `/app/data`          |
| `LOG_DIR`      | Verzeichnis für Server-Logs                          | `/app/data/logs`     |
| `LOG_LEVEL`    | Log-Level                                            | `info`               |
| `MAX_LOG_SIZE` | Größe der Logdatei in Bytes, ab der rotiert wird     | `10485760`           |
| `TZ`           | Zeitzone des Containers                              | _(Systemstandard)_   |

Ohne `API_KEY` ist die API ohne Authentifizierung erreichbar. Daten liegen als
JSON-Dateien im Volume `/app/data` und sind für den Betrieb einer einzelnen
Instanz gedacht.

## API-Beispiel

```bash
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"title":"Rasen mähen","employee":"Max","location":"Garten"}'
```

Der Container enthält einen Healthcheck auf `/api/auth/status` und läuft als
Nicht-Root-Benutzer (`node`).

## Weitere Informationen

- Dokumentation und API-Übersicht: <https://github.com/milkrunner/GardenPlanner#readme>
- Fehler melden: <https://github.com/milkrunner/GardenPlanner/issues>
