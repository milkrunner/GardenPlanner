# Changelog

Alle wesentlichen Änderungen an diesem Projekt werden hier festgehalten. Das Format
orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die
Versionierung an [Semantic Versioning](https://semver.org/lang/de/). Der Ablauf eines
Releases steht in [docs/RELEASING.md](docs/RELEASING.md).

## [Unreleased]

### Hinzugefügt

- Release-Prozess: Workflow `release.yml` (Auslöser nur ein bewusst gepushter Tag
  `vX.Y.Z`), Docker-Tags `X.Y.Z`, `X.Y` und `latest` für `linux/amd64` und `linux/arm64`,
  automatische GitHub-Release-Notizen und Dependabot-Konfiguration (#333).
- Pflanzenbibliothek pflegen: Pflanzen lassen sich auf der Pflanzenseite hinzufügen, bearbeiten und
  nach Bestätigung löschen; Fehlermeldungen des Servers werden verständlich angezeigt (#330).
- API: optionales Fälligkeitsdatum `dueDate` (`YYYY-MM-DD`) je Aufgabe mit Filter
  (`dueFrom`, `dueTo`) und Sortierung (`sort=dueDate`); die Folgeaufgabe einer wiederholenden
  Aufgabe erhält ein neues `dueDate`, das Altfeld `nextDue` wird nicht mehr geschrieben (#344).

## Frühere Entwicklung

Die Änderungen vor der ersten offiziellen Version sind aus der Git-Historie und den
gemergten Pull Requests zusammengefasst. Zu diesen Ständen gibt es keine GitHub-Releases;
auf Docker Hub existieren nur `beta`-Tags. Die `version` in `package.json` ist `1.0.0`
und wird erst beim ersten Release angehoben.

### November 2026

- Qualitäts-Gates: ESLint, Prettier, isolierte Jest-Suites, jsdom-DOM-Tests und
  Chromium-Smoke inklusive Barrierefreiheitsprüfung (axe-core); reproduzierbare Installation
  mit `npm ci` (#308, #309, #312).
- Sicherheit und Abhängigkeiten: Dependency-Audit bereinigt (Express 4.22, `overrides`
  für `glob` und `minimatch`, siehe `docs/DEPENDENCIES.md`), sichere Betriebsgrenzen und
  Backend-Fehlerbehandlung (#313, #316, #317).
- Frontend: Darstellung nicht vertrauenswürdiger Texte über DOM-APIs, bedienbare Steuerelemente,
  AA-Kontrast im Dark-Theme, API-Key-Eingabe, korrigierter jsPDF-SRI-Hash, sichtbarer
  Offline-Fallback (#318, #321, #340).
- API: GET-Filter `employee` und `location` werden abgelehnt; API-Referenz
  (`docs/API.md`) und OpenAPI-Spezifikation (`docs/openapi.json`) ergänzt (#341).
- Dokumentation: Agent-Anleitung, Beitragsleitfaden, Docker-Hub-Beschreibung
  (`docs/DOCKERHUB.md`), stylelint-Konfiguration für CI (#307, #316, #319).

### April 2026

- Neue Ansichten und Funktionen: Display-Ansicht (Vollbild für Monitor oder TV),
  Saison-Ansicht und Pflanzkalender, Mehrfachauswahl, Aufgabenabhängigkeiten, Kommentare,
  Fotos an Aufgaben, mobile Ansicht mit Hamburger-Navigation.
- Pflanzenbibliothek mit Pflegeanleitungen, Sortierung und Favoriten.
- Docker-Image: mehrere CVE-Behebungen am Basis-Image und an npm-Paketen, Trivy-Scan in
  der CI (#265, #267, #295–#304).
- Refactoring: `garden-planner.js` und `styles.css` in Module aufgeteilt, Script-Bundling,
  CI-Workflows von sieben auf drei konsolidiert (#275, #280, #282, #231).

### März 2026

- Backend als Schichtenarchitektur (Routen, Services, Speicher), globaler Error-Handler mit
  geordnetem Herunterfahren, Cache und asynchrone Dateizugriffe, UUID- und
  Subtask-Validierung, Body-Größenlimit (#117, #120, #121, #111–#113).
- Sicherheit: zeitkonstanter API-Key-Vergleich, Sanitizing bei der Ausgabe statt bei der
  Eingabe, Sicherheits-Header, CSP mit Nonce, gestufte Rate-Limits pro IP und Schlüssel,
  vereinheitlichte Fehlerantworten ohne interne Details (#109, #110, #138–#141).
- REST API für n8n-Integration, Pagination, strukturiertes Logging mit Audit-Trail,
  Präfix `/api/v1` mit Rückwärtskompatibilität (#53, #82, #84, #156).
- Änderungsverlauf je Aufgabe, wetterbasierte Erinnerungen mit Offline-Fallback, Tab-Synchronisation
  per BroadcastChannel, Statistiken mit Zeitraum, Trends und CSV-Export (#42, #49, #107, #154, #155).
- Neues botanisches Design, Design-Tokens, Dark Mode, überarbeitete Navigation und Formulare,
  Barrierefreiheit (Skip-Links, ARIA-Modal, `prefers-reduced-motion`).
- Docker-Hub-Veröffentlichung der `beta`-Tags (`beta`, `X.Y.Z-beta`).

### November 2025

- Erste Version des Gartenplaners: Aufgaben anlegen, bearbeiten, archivieren und
  wiederherstellen, Sammelaktionen, Standortfilter und Suche, Wiederholungen,
  Unteraufgaben, Dashboard mit Diagrammen, PDF-Export, helles und dunkles Theme.
- Docker-Setup und erste Test-Suites.

[Unreleased]: https://github.com/milkrunner/GardenPlanner/commits/main
