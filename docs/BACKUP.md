# Backup, Export und Restore

Gartenplaner speichert alle Daten als JSON-Dateien im Datenverzeichnis (`DATA_DIR`, Standard `data/`).
Im Docker-Image ist das `/app/data`, in `docker-compose.yml` das benannte Volume `gartenplaner-data`.

| Datei                 | Inhalt                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `tasks.json`          | aktive Aufgaben                                                    |
| `archived-tasks.json` | archivierte Aufgaben                                               |
| `plants.json`         | eigene Pflanzenbibliothek (optional, sonst gilt die Standardliste) |
| `backups/`            | automatische Sicherungen vor einem `mode=replace`-Import           |

Es gibt drei Wege: den Datenbestand über die API exportieren, das Docker-Volume sichern oder die Dateien kopieren.
Beides ersetzt kein externes Backup: Sicherungen gehören auf einen anderen Datenträger oder Rechner.

## Variante 1: Export und Import über die API

Der Export ist ein einzelnes JSON-Dokument und der konsistenteste Weg bei laufendem Server, weil Aufgaben
und Archiv unter denselben Sperren gelesen werden wie bei jedem Schreibzugriff. Beide Endpunkte liegen
hinter dem API-Key (`X-API-Key`). Der Export enthält Aufgabendaten (Namen, Standorte, Notizen), aber nie den
API-Key. Die Datei also wie die Daten selbst behandeln.

```bash
# Sichern
curl -H "X-API-Key: $API_KEY" http://localhost:8080/api/export -o gartenplaner-export.json
```

Das Bündel hat diese Form (`plants` ist `null`, solange keine eigene `plants.json` existiert):

```json
{
  "formatVersion": 1,
  "app": "gartenplaner",
  "exportedAt": "2026-11-22T10:00:00.000Z",
  "tasks": [],
  "archivedTasks": [],
  "plants": null
}
```

### Importieren

Der Import überschreibt nie unbemerkt. Das Bündel wird vollständig geprüft (Format-Version, UUIDs, dieselben
Regeln wie bei `POST /api/tasks`, keine doppelten IDs), bevor die erste Datei geschrieben wird. Ein einziger
Fehler lässt den Bestand unverändert. Unbekannte Felder werden verworfen.

| Aufruf                                          | Wirkung                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /api/import`                              | nur in eine **leere** Instanz; sonst `409`, nichts wird geändert                                       |
| `POST /api/import?mode=merge`                   | ergänzt unbekannte IDs; vorhandene IDs (auch im Archiv) bleiben unverändert und stehen unter `skipped` |
| `POST /api/import?mode=replace&confirm=replace` | ersetzt Aufgaben und Archiv (und `plants.json`, wenn das Bündel `plants` enthält) nach einer Sicherung |

```bash
# In eine frische Instanz wiederherstellen
curl -X POST http://localhost:8080/api/import \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  --data-binary @gartenplaner-export.json

# Bestehende Daten ersetzen (die Antwort nennt das Sicherungsverzeichnis unter `backup`)
curl -X POST "http://localhost:8080/api/import?mode=replace&confirm=replace" \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  --data-binary @gartenplaner-export.json
```

Bei `mode=replace` kopiert der Server vorher `tasks.json`, `archived-tasks.json` und (falls das Bündel
Pflanzen enthält) `plants.json` nach `backups/import-<Zeitstempel>-<Zufall>/` im Datenverzeichnis. Scheitert
die Sicherung, wird nichts ersetzt. Alte Sicherungen räumt der Server nicht auf; bei Bedarf manuell löschen.
Schlägt später ein Schreibvorgang fehl, stellt der Server die schon geschriebenen Dateien wieder her und
antwortet mit `500`.

Grenzen: Der Import-Body darf 5 MB groß sein (alle anderen Routen: 100 kB), ein Bündel höchstens 10000
Aufgaben und 1000 Pflanzen (`413`). Jeder Import und jeder Export steht im Audit-Log
(`data_exported`, `data_imported`, `data_import_rejected`), ohne Aufgabentitel oder Namen.

Vollständige Antworten und Statuscodes: [API-Referenz](API.md#export-und-import).

## Variante 2: Docker-Volume sichern

Der Compose-Projektname (Standard: Name des Verzeichnisses) steht im Volume-Namen. Den tatsächlichen Namen
zeigt `docker volume ls`, meist `<projekt>_gartenplaner-data`.

Für eine **konsistente** Kopie den Server kurz anhalten. Die Dateien werden zwar atomar ersetzt, aber
`tasks.json` und `archived-tasks.json` sind zwei Dateien: Wird genau beim Kopieren archiviert, kann eine
Aufgabe in beiden stehen (nie in keiner). Läuft der Server, ist der Export aus Variante 1 vorzuziehen.

```bash
docker volume ls | grep gartenplaner-data
docker compose stop gartenplaner

# Volume in ein Archiv im aktuellen Verzeichnis sichern
docker run --rm -v gartenplaner_gartenplaner-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/gartenplaner-data-$(date +%F).tar.gz -C /data .

docker compose start gartenplaner
```

### Wiederherstellen aus dem Volume-Archiv

Den Server anhalten, das Archiv in das Volume entpacken und neu starten. Der Server hält Daten im
Arbeitsspeicher zwischen; Dateien, die man bei laufendem Server austauscht, werden erst nach einem Neustart
sichtbar und können vorher überschrieben werden.

```bash
docker compose stop gartenplaner
docker run --rm -v gartenplaner_gartenplaner-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -f /data/*.json && tar xzf /backup/gartenplaner-data-2026-11-22.tar.gz -C /data'
docker compose start gartenplaner
```

Auf einem neuen Rechner `docker compose up -d` einmal starten (legt das Volume an), dann wie oben anhalten,
entpacken und starten.

## Variante 3: Dateien direkt kopieren

Ohne Docker liegen die Dateien im Verzeichnis `data/` (oder `DATA_DIR`). Mit Docker Compose lassen sie sich
aus dem Container kopieren:

```bash
docker compose stop gartenplaner
docker compose cp gartenplaner:/app/data ./gartenplaner-backup
docker compose start gartenplaner
```

Zurückspielen (der Container darf dafür gestoppt sein, `docker compose cp` funktioniert auch dann):

```bash
docker compose stop gartenplaner
docker compose cp ./gartenplaner-backup/. gartenplaner:/app/data
docker compose start gartenplaner
```

Die JSON-Dateien sind einfacher Text und lassen sich mit jedem Editor prüfen. Eine beschädigte Datei lässt den
Server mit Fehler `500` antworten, statt sie zu überschreiben. Dann die Datei aus einer Sicherung ersetzen.

## Empfehlung

- Regelmäßig `GET /api/export` (z. B. per n8n-Flow oder Cron) an einen anderen Ort schreiben.
- Vor Updates und vor jedem `mode=replace` einen Export oder ein Volume-Archiv anlegen.
- Wiederherstellung einmal in einer leeren Testinstanz üben (`DATA_DIR` auf ein leeres Verzeichnis setzen).
