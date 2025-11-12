# 🌱 Garten Planner# 🌱 Garten Planner

Eine moderne Web-Anwendung zur Verwaltung von Gartenarbeiten, Aufgaben und Zeitplänen.Eine moderne Web-Anwendung zur Verwaltung von Gartenarbeiten, Aufgaben und Zeitplänen.

**Keine Installation erforderlich** - läuft direkt im Browser! 🚀## Features

## Features### 👷 Worker-Frontend

### 👷 Worker-Frontend- **Tagesübersicht**: Zeigt alle geplanten Aufgaben für den aktuellen Tag

- **Tagesübersicht**: Zeigt alle geplanten Aufgaben für den aktuellen Tag- **Zeitplan**: Detaillierter Zeitplan mit Start- und Endzeiten

- **Zeitplan**: Detaillierter Zeitplan mit Start- und Endzeiten- **Aufgabenübersicht**: Liste aller offenen Aufgaben mit Prioritäten

- **Aufgabenübersicht**: Liste aller offenen Aufgaben mit Prioritäten- **Responsive Design**: Optimiert für Tablets und Mobile Geräte

- **Responsive Design**: Optimiert für Tablets und Mobile Geräte

### 🛠️ Admin-Dashboard

- **Aufgabenverwaltung**: Erstellen, Bearbeiten und Löschen von Aufgaben- **Aufgabenverwaltung**: Erstellen, Bearbeiten und Löschen von Aufgaben

  - Titel, Beschreibung, Standort - Titel, Beschreibung, Standort

  - Priorität (Hoch, Mittel, Niedrig) - Priorität (Hoch, Mittel, Niedrig)

  - Status (Ausstehend, In Arbeit, Erledigt) - Status (Ausstehend, In Arbeit, Erledigt)

  - Geschätzte Arbeitsstunden - Geschätzte Arbeitsstunden

  - **Arbeiterverwaltung**: Verwaltung des Arbeitsteams

- **Arbeiterverwaltung**: Verwaltung des Arbeitsteams - Name und E-Mail

  - Name und E-Mail - Aktiv/Inaktiv Status

  - Aktiv/Inaktiv Status- **Zeitplanung**: Planung von Arbeitszeiten

    - Zuordnung von Aufgaben zu Arbeitern

- **Zeitplanung**: Planung von Arbeitszeiten - Datum und Uhrzeiten

  - Zuordnung von Aufgaben zu Arbeitern - Notizen für besondere Hinweise

  - Datum und Uhrzeiten

  - Notizen für besondere Hinweise## Technologie-Stack

## 🎯 Installation & Start- **React 18** mit TypeScript

- **Tailwind CSS** für modernes Styling

**Super einfach - keine npm Installation nötig!**- **React Router** für Navigation

- **Lucide React** für Icons

1. Öffnen Sie einfach die `index.html` Datei in Ihrem Browser:- **date-fns** für Datumsformatierung

   - **Doppelklick** auf die Datei, oder- **Vite** als Build-Tool

   - **Rechtsklick** → "Öffnen mit" → Ihr bevorzugter Browser

## Installation

Das war's! Die App läuft sofort. ✨

1. Abhängigkeiten installieren:

## Technologie-Stack

````bash

- **HTML5** - Moderne Web-Standardsnpm install

- **Tailwind CSS** (via CDN) - Modernes Styling```

- **Alpine.js** (via CDN) - Reaktive Interaktivität

- **Vanilla JavaScript** - Keine Build-Tools erforderlich1.1. Entwicklungsserver starten:



**Vorteile:**```bash

- ✅ Keine Installation erforderlichnpm run dev

- ✅ Keine Abhängigkeiten```

- ✅ Läuft offline (nach erstem Laden)

- ✅ Funktioniert auf jedem modernen Browser1.2. Im Browser öffnen: `http://localhost:5173`

- ✅ Einfach zu bearbeiten und anzupassen

## Verwendung

## Verwendung

### Worker-Ansicht

### Worker-Ansicht

- Standardansicht beim Öffnen der App- Standardansicht beim Öffnen der App

- Zeigt heutige Termine und alle offenen Aufgaben- Zeigt heutige Termine und alle offenen Aufgaben

- Über den Button oben rechts ins Admin-Dashboard wechseln- Über den Button oben rechts ins Admin-Dashboard wechseln



### Admin-Dashboard### Admin-Dashboard

- Über den Button "Admin Dashboard" erreichbar

- Drei Tabs: Aufgaben, Arbeiter, Zeitplan- Über den Button "Admin Dashboard" erreichbar

- "Neu"-Button zum Erstellen neuer Einträge- Drei Tabs: Aufgaben, Arbeiter, Zeitplan

- Bearbeiten-Icon (Stift) zum Ändern von Einträgen- "Neu"-Button zum Erstellen neuer Einträge

- Löschen-Icon (Mülleimer) zum Entfernen von Einträgen- Bearbeiten-Icon (Stift) zum Ändern von Einträgen

- Löschen-Icon (Mülleimer) zum Entfernen von Einträgen

## 💾 Daten-Speicherung

## Projektstruktur

Aktuell werden alle Daten im Browser-Speicher (JavaScript-Variablen) gehalten und gehen beim Schließen verloren.

```file

**Mögliche Erweiterungen:**src/

- LocalStorage für persistente Speicherung im Browser├── components/

- Backend-Integration (REST API / GraphQL)│   ├── WorkerView.tsx      # Worker-Frontend

- Datenbank-Anbindung (PostgreSQL, MongoDB, Firebase)│   └── AdminDashboard.tsx  # Admin-Dashboard

- Cloud-Sync zwischen Geräten├── context/

│   └── AppContext.tsx      # State Management

## 🚀 Weitere Entwicklungsmöglichkeiten├── data/

│   └── initialData.ts      # Beispieldaten

- **Daten-Persistenz**: LocalStorage oder Backend-Integration├── types/

- **Benutzer-Authentifizierung**: Login-System für verschiedene Nutzer│   └── index.ts            # TypeScript-Typen

- **Push-Benachrichtigungen**: Erinnerungen für anstehende Aufgaben├── App.tsx                 # Haupt-App-Komponente

- **Fortschritts-Tracking**: Zeiterfassung und Statistiken├── main.tsx                # Einstiegspunkt

- **Foto-Upload**: Bilder vor/nach der Arbeit hochladen└── index.css               # Globale Styles

- **Wetter-Integration**: Wettervorhersage für Arbeitsplanung```

- **Export-Funktionen**: PDF-Reports, Excel-Export

- **Kalender-Ansicht**: Monats- und Wochenansicht## Weitere Entwicklung

- **Mobile App**: Progressive Web App (PWA) für Installation

- **Offline-Modus**: ServiceWorker für vollständige Offline-FunktionalitätMögliche Erweiterungen:



## 📱 Browser-Kompatibilität- Backend-Integration (REST API / GraphQL)

- Datenbank-Anbindung (PostgreSQL, MongoDB)

Funktioniert mit allen modernen Browsern:- Benutzer-Authentifizierung

- ✅ Chrome / Edge (Chromium)- Push-Benachrichtigungen

- ✅ Firefox- Fortschritts-Tracking

- ✅ Safari- Foto-Upload für Aufgaben

- ✅ Opera- Wetter-Integration

- Export-Funktionen (PDF, Excel)

## 🤝 Anpassungen

An easy garden working planner to get things done wioth friends and family

Die gesamte App ist in einer einzigen `index.html` Datei. Öffnen Sie diese mit einem Text-Editor, um:
- Beispieldaten anzupassen
- Styling zu ändern
- Neue Funktionen hinzuzufügen
- Texte zu übersetzen

Alle JavaScript-Logik befindet sich im `<script>`-Tag am Ende der Datei.
````
