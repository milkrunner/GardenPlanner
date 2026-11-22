# ADR 0001: Mehrbenutzerbetrieb (Benutzer, Rollen, Mandanten)

- **Status:** Vorschlag – die Entscheidung liegt beim Eigentümer
- **Issue:** [#328](https://github.com/milkrunner/GardenPlanner/issues/328)
- **Betrifft:** Authentifizierung, Storage, Historie, Sicherheit

## Kontext

Der Gartenplaner kennt heute genau eine Identität: den gemeinsamen Schlüssel `API_KEY`. Das ist der
Stand von `main`, belegt im Code:

- **Auth:** `src/server/middleware/auth.js` vergleicht den Header `X-API-Key` zeitsicher mit einem einzigen
  Wert aus der Umgebung. Wer ihn kennt, darf alles lesen, ändern und löschen. Ohne `API_KEY` ist die API
  offen (in Produktion nur mit `ALLOW_UNAUTHENTICATED=true`). Es gibt keine Cookies, Sessions oder Passwörter
  ([Sicherheit](../SECURITY.md#backend-authentifizierung-und-csrf)).
- **Historie ohne Akteur:** Jede Aufgabe trägt eine `history` mit `timestamp`, `action` und `details`
  (`src/server/services/task-service.js`). Wer die Änderung ausgelöst hat, steht nirgends. Das Audit-Log
  (`audit(...)` in `src/server/logger.js`) kennt ebenfalls nur Aufgaben-ID und Titel, bei Fehlversuchen die IP.
- **`employee` ist keine Identität:** Das Feld ist ein frei wählbarer Text (max. 100 Zeichen) an der Aufgabe,
  also „zugewiesen an“. Jeder Client mit Schlüssel kann ihn setzen, wie er will. Er taugt weder als Akteur
  noch als Zugriffsgrenze.
- **Ein Datenbestand:** Aufgaben, Archiv und Pflanzen liegen als JSON unter `DATA_DIR`. Es gibt keine
  Trennung nach Garten, Gruppe oder Person. Der Browser hält eine Kopie in `localStorage`.
- **Single-Instance:** Schreibzugriffe sind durch In-Process-Locks geschützt, Cache und Rate-Limit leben im
  Prozess. Eine zweite Instanz auf denselben Daten verliert Änderungen
  ([Betriebsgrenzen](../ARCHITECTURE.md#betriebsgrenzen)). Mehr Last oder mehrere Mandanten auf einer
  gemeinsamen Datenbasis verlangen zuerst eine Datenbank. Das wäre eine eigene Architekturänderung.

Das Issue #286 (Passwortregeln) wurde zu Recht geschlossen, weil es einen Passwort-Login voraussetzte, den es
auf `main` nicht gibt. Diese ADR klärt, ob es ihn geben soll.

## Zu entscheiden

Braucht das Projekt Mehrbenutzerbetrieb – und wenn ja, in welcher Stufe: nur „wer hat geändert“, getrennte
Rechte, oder getrennte Gärten (Mandanten)? Das hängt davon ab, wer die Anwendung betreibt und nutzt. Das kann
der Code nicht beantworten, siehe [offene Fragen](#offene-fragen-an-den-eigentümer).

## Optionen

### Option A: Status quo (ein gemeinsamer Schlüssel)

Nichts ändert sich. Die Anwendung bleibt ein Werkzeug für einen Haushalt, einen Verein oder ein Team, das
sich vertraut, plus Automatisierung (n8n) mit demselben Schlüssel.

- **Storage:** unverändert (JSON, eine Instanz).
- **Auth:** unverändert. Das Entziehen des Zugriffs für eine Person heißt, den Schlüssel für alle zu ändern.
- **Locking:** unverändert.
- **Sicherheit:** Keine neue Angriffsfläche. Schwäche bleibt: Ein geleakter Schlüssel ist nicht von
  legitimer Nutzung zu unterscheiden, und es gibt keine Nachvollziehbarkeit.
- **Aufwand:** keiner. Mögliche Ergänzung ohne Code: die Betriebsgrenzen in der README deutlicher als
  Nicht-Ziel („kein Mehrbenutzerbetrieb“) benennen.

### Option B: Benannte API-Keys mit Akteur in der Historie (kleiner Schritt)

Statt eines Schlüssels kann der Betreiber mehrere benannte Schlüssel konfigurieren (z. B. `lisa`, `max`,
`n8n`). Die Middleware ordnet einem gültigen Schlüssel den Namen zu (`req.actor`). Dieser Name wird in
`history`-Einträgen (neues optionales Feld `actor`) und im Audit-Log mitgeschrieben. Alle benannten Schlüssel
haben weiterhin dieselben Rechte und sehen dieselben Daten. Der bisherige `API_KEY` bleibt als Alias mit einem
festen Akteursnamen gültig, sodass bestehende Installationen unverändert laufen.

- **Storage:** Keine Migration. Das neue Feld `actor` ist rein additiv; alte Einträge haben es nicht und
  werden als „unbekannt“ angezeigt. Dateiformat, Locks und Single-Instance bleiben.
- **Auth:** Schlüssel stehen weiter in der Umgebung (kein Schlüsselspeicher im Datenverzeichnis, kein
  Klartext in Dateien oder Logs). Der Vergleich bleibt zeitsicher und läuft über alle konfigurierten Schlüssel
  ohne frühen Abbruch. Einen Schlüssel entziehen heißt, ihn aus der Konfiguration zu entfernen und neu zu
  starten, ohne dass die anderen betroffen sind. Der Akteur kommt aus dem Schlüssel, nie aus dem Request-Body.
- **Locking:** unverändert.
- **Sicherheit:** Bessere Nachvollziehbarkeit und gezieltes Widerrufen, aber keine Autorisierung: Wer einen
  Schlüssel hat, darf alles. Jeder Name verlangt einen eigenen, ausreichend langen Zufallsschlüssel. Das
  Rate-Limit pro Akteur statt pro IP wäre möglich, hängt aber an #334 (`trust proxy`).
- **Aufwand:** klein. Ein Pull Request im Backend (Konfiguration, Middleware, Historie/Audit, Tests, OpenAPI und
  Doku), ein kleiner in der Oberfläche (Akteur in der Historie anzeigen). Die Frontend-Anmeldung per
  Schlüssel (`auth-gate.js`) ändert sich nicht.
- **Offene Grenze:** Mit einem Schlüssel je Person ist die Zuordnung nur so zuverlässig, wie die Schlüssel
  getrennt bleiben. Der Browser speichert den Schlüssel in `localStorage`
  (`src/js/api.js`), auf einem geteilten Gerät also für jeden Nutzer des Browsers lesbar.

### Option C: Echte Benutzer, Rollen und Mandanten (Datenbank-Wechsel)

Benutzerkonten mit Anmeldung (Passwort oder externer Identity-Provider), Rollen (z. B. Admin, Mitglied,
Nur-Lesen) und Mandanten (getrennte Gärten oder Gruppen, jede Aufgabe gehört zu genau einem).

- **Storage:** JSON-Dateien mit In-Process-Locks reichen dafür nicht. Mandantentrennung, Benutzerverwaltung
  und mehrere Instanzen verlangen eine Datenbank mit Transaktionen. Das widerspricht der Vorgabe in `AGENTS.md`, keine Datenbank
  beiläufig einzuführen, und ist selbst ein Migrationsprojekt (JSON → Schema, Daten der Bestandsinstallationen,
  Backup/Restore, siehe #329).
- **Auth:** Login, Sitzungen oder Tokens, Passwort-Hashing, Rücksetzen, Sperren. Sobald Cookies im Spiel
  sind, muss CSRF-Schutz zeitgleich ergänzt werden ([Sicherheit](../SECURITY.md#backend-authentifizierung-und-csrf)).
  Die API-Key-Anmeldung für Automatisierung müsste daneben bestehen.
- **Locking:** Wechsel von Prozess-Locks auf Datenbank-Transaktionen. Erst damit wäre Mehrinstanzbetrieb
  überhaupt denkbar.
- **Sicherheit:** Größte Angriffsfläche (Konten, Passwörter, Mandantenisolation als Fehlerquelle: jede
  Abfrage muss den Mandanten filtern). Dafür echte Autorisierung und Trennung.
- **Aufwand:** groß, mehrere zusammenhängende Teilprojekte (Datenbank, Migration, Auth, Rollen, Mandantenfilter in
  jedem Service, Benutzer-UI, Tests, Betriebsdoku). Realistisch ein eigener Meilenstein, kein Ticket.

## Vergleich

| Kriterium           | A: Status quo      | B: Benannte Keys      | C: Benutzer/Rollen/Mandanten |
| ------------------- | ------------------ | --------------------- | ---------------------------- |
| Wer hat geändert?   | nein               | ja (pro Schlüssel)    | ja (pro Konto)               |
| Zugriff entziehen   | Schlüssel für alle | einzelner Schlüssel   | einzelnes Konto              |
| Rechte/Rollen       | nein               | nein                  | ja                           |
| Getrennte Gärten    | nein               | nein                  | ja                           |
| Storage             | JSON               | JSON (Feld `actor`)   | Datenbank                    |
| Mehrere Instanzen   | nein               | nein                  | grundsätzlich möglich        |
| Neue Angriffsfläche | keine              | gering                | groß                         |
| Rückwärtskompatibel | ja                 | ja (`API_KEY` bleibt) | Migration nötig              |
| Aufwand             | keiner             | klein                 | groß                         |

## Empfehlung

**Option B**, sofern der Betrieb mit mehr als einer Person oder zusätzlich Automatisierung läuft; sonst
**Option A**. Option C erst, wenn eine der Fragen unten mit „ja“ beantwortet wird.

Begründung:

1. Die konkret belegte Lücke ist die fehlende Nachvollziehbarkeit („Historie ohne Akteur“), nicht eine fehlende
   Rechteverwaltung. Option B schließt genau diese Lücke ohne Datenbank, ohne Passwörter und ohne neue
   Angriffsfläche.
2. B ist additiv und rückwärtskompatibel: bestehende Installationen mit einem `API_KEY` laufen unverändert,
   alte Historie bleibt gültig. Es bleibt jederzeit möglich, bei A zu bleiben.
3. B verbaut Option C nicht. Das Feld `actor` und die Zuordnung „Schlüssel → Identität“ sind genau die
   Schnittstelle, die ein späteres Konto-Modell wieder bräuchte.
4. C verändert die Architekturgrenzen des Projekts (Datenbank, Sessions, CSRF, Mehrinstanzbetrieb). Ohne
   belegten Bedarf wäre das der größte Eingriff für den geringsten nachgewiesenen Nutzen.

Die Entscheidung trifft der Eigentümer. Bis dahin wird nichts umgesetzt.

## Folgen bei Option B (Skizze, nicht beschlossen)

Falls B gewählt wird, wären diese Teil-Issues nötig. Sie sind hier nur beschrieben:

1. Konfiguration benannter Schlüssel (Umgebungsvariable, Validierung beim Start, Alias für `API_KEY`,
   Mindestlänge, keine Schlüssel in Logs), Middleware setzt `req.actor`.
2. Akteur in `history` und Audit-Log, Anzeige in der Historie der Oberfläche, OpenAPI und `docs/API.md`.
3. Doku: Schlüssel anlegen, rotieren und entziehen (README, `.env.example`).

Jeder Schritt ist ein eigener, kleiner Pull Request mit Servertests (gültiger, ungültiger, fehlender
Schlüssel, Akteur in Historie und Audit, alter `API_KEY` unverändert).

## Offene Fragen an den Eigentümer

1. **Wer nutzt die Instanz?** Eine Person, ein Haushalt/Team, das sich vertraut, oder mehrere voneinander
   unabhängige Gruppen? Nur bei Letzterem ist Option C begründet.
2. **Ist „wer hat geändert“ gewünscht?** Genügt Nachvollziehbarkeit pro Schlüssel (B), oder müssen Rechte
   unterschieden werden (z. B. Nur-Lesen für Gäste)?
3. **Wie viele Personen und Systeme brauchen Zugang?** Wenige benannte Schlüssel in der Umgebung sind
   handhabbar. Viele wechselnde Personen sprechen für Konten.
4. **Muss `n8n` als eigener Akteur erscheinen?** Das wäre mit B direkt abgebildet.
5. **Wird mehr als eine Instanz oder ein gehosteter Betrieb für Dritte angestrebt?** Das setzt eine
   Datenbank voraus (siehe [Betriebsgrenzen](../ARCHITECTURE.md#betriebsgrenzen)) und wäre ein eigenes Projekt.
6. **Wie sollen Zugänge widerrufen werden?** Reicht Neustart mit geänderter Konfiguration?
7. **Datenschutz:** Ein Akteur in der Historie ist ein personenbezogenes Datum, sobald Schlüssel Personen
   zugeordnet sind. Gibt es Anforderungen an Aufbewahrung und Löschung?
