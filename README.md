# 🌱 Gartenplaner Dashboard

Eine übersichtliche Webanwendung zur Optimierung der Gartenplanung und Koordination von Mitarbeitern.

## ✨ Features

### 📊 Dashboard-Übersicht

- **Statistiken auf einen Blick**: Offene Aufgaben, erledigte Aufgaben, aktive Mitarbeiter, Aufgaben mit hoher Priorität
- **Übersichtliche Aufgabenliste**: Alle Aufgaben sortiert nach Datum und Priorität
- **Kalenderansicht**: 14-Tage-Vorschau mit allen geplanten Aufgaben

### 📝 Aufgabenverwaltung

- **Aufgaben erstellen** mit folgenden Informationen:
  - Titel der Aufgabe
  - Zugewiesener Mitarbeiter
  - Datum und Uhrzeit
  - Priorität (Hoch, Mittel, Niedrig)
  - Ausführliche Beschreibung
- **Status-Verwaltung**: Aufgaben als "Erledigt" markieren oder reaktivieren
- **Aufgaben löschen**: Unwiderrufliches Entfernen von Aufgaben

### 🔍 Filter & Ansichten

- **Filter nach Mitarbeiter**: Zeige nur Aufgaben eines bestimmten Mitarbeiters
- **Filter nach Status**: Ausstehende oder erledigte Aufgaben
- **Filter nach Priorität**: Hoch, Mittel oder Niedrig
- **Listenansicht**: Detaillierte Aufgabenliste mit allen Informationen
- **Kalenderansicht**: Zeitliche Übersicht der nächsten 14 Tage

### 💾 Datenpersistenz

- **Automatisches Speichern**: Alle Änderungen werden sofort im Browser gespeichert (LocalStorage)
- **Daten exportieren**: Backup als JSON-Datei herunterladen
- **Daten importieren**: Backup-Dateien wiederherstellen
- **Daten löschen**: Alle Aufgaben auf einmal entfernen (mit Sicherheitsabfrage)

## 🚀 Installation & Verwendung

### Ohne Server (Einfachste Methode)

1. Alle drei Dateien (`index.html`, `styles.css`, `app.js`) in einem Ordner speichern
2. `index.html` im Browser öffnen (Doppelklick)
3. Die Anwendung ist sofort einsatzbereit!

**Vorteil**: Kein Server oder Installation erforderlich, funktioniert vollständig offline

### Mit lokalem Webserver (Optional)

Falls du einen lokalen Webserver verwenden möchtest:

#### Python (falls installiert)

```powershell
# Im Projektordner ausführen
python -m http.server 8000
```

Dann öffne: `http://localhost:8000`

#### Alternative: Live Server VS Code Extension

1. VS Code Extension "Live Server" installieren
2. Rechtsklick auf `index.html` → "Open with Live Server"

## 📖 Bedienungsanleitung

### Neue Aufgabe erstellen

1. Formular im oberen Bereich ausfüllen:
   - Aufgabentitel eingeben
   - Mitarbeiternamen eingeben
   - Datum und Uhrzeit wählen
   - Priorität festlegen
   - Optional: Beschreibung hinzufügen
2. Auf "Aufgabe hinzufügen" klicken
3. Die Aufgabe erscheint sofort in der Liste

### Aufgaben verwalten

- **Erledigt markieren**: Klick auf "Erledigt"-Button
- **Reaktivieren**: Klick auf "Reaktivieren"-Button bei erledigten Aufgaben
- **Löschen**: Klick auf "Löschen"-Button (mit Sicherheitsabfrage)

### Aufgaben filtern

- Wähle im Filter-Bereich einen Mitarbeiter aus dem Dropdown
- Filtere nach Status (Ausstehend/Erledigt)
- Filtere nach Priorität (Hoch/Mittel/Niedrig)
- Filter können kombiniert werden

### Ansicht wechseln

- **Listen-Ansicht**: Detaillierte Aufgabenliste mit allen Informationen
- **Kalender-Ansicht**: Zeitliche Übersicht der nächsten 14 Tage

### Daten sichern

- **Exportieren**: Klick auf "Daten exportieren" → JSON-Datei wird heruntergeladen
- **Importieren**: Klick auf "Daten importieren" → JSON-Datei auswählen
- **Löschen**: Klick auf "Alle Daten löschen" (2× bestätigen erforderlich)

## 🎨 Farb-Kodierung

### Prioritäten

- 🔴 **Rot**: Hohe Priorität
- 🟠 **Orange**: Mittlere Priorität
- 🔵 **Blau**: Niedrige Priorität

### Status

- **Volle Farbe**: Ausstehende Aufgaben
- **Ausgegraut**: Erledigte Aufgaben

## 💡 Technische Details

### Verwendete Technologien

- **HTML5**: Strukturierung der Webseite
- **CSS3**: Modernes, responsives Design mit Flexbox und Grid
- **Vanilla JavaScript (ES6+)**: Keine externen Abhängigkeiten
- **LocalStorage API**: Clientseitige Datenspeicherung

### Browser-Kompatibilität

- ✅ Chrome/Edge (empfohlen)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

### Datenspeicherung

- Alle Daten werden im **Browser LocalStorage** gespeichert
- Daten bleiben auch nach Schließen des Browsers erhalten
- Daten sind **nur auf diesem Gerät** verfügbar
- Maximale Speichergröße: ~5-10 MB (ausreichend für tausende Aufgaben)

### Sicherheit & Datenschutz

- ✅ Keine Server-Kommunikation erforderlich
- ✅ Alle Daten bleiben auf deinem Gerät
- ✅ Keine Cookies oder Tracking
- ✅ Funktioniert vollständig offline

## 📱 Responsive Design

Die Anwendung passt sich automatisch an verschiedene Bildschirmgrößen an:

- 💻 **Desktop**: Vollständige Ansicht mit allen Features
- 📱 **Tablet**: Optimiertes Layout
- 📱 **Smartphone**: Mobile-optimierte Ansicht

## 🔧 Anpassungen & Erweiterungen

### Farben anpassen

Öffne `styles.css` und ändere die CSS-Variablen im `:root` Block:

```css
:root {
  --primary-color: #2ecc71; /* Hauptfarbe */
  --secondary-color: #27ae60; /* Sekundärfarbe */
  /* ... weitere Farben */
}
```

### Funktionen erweitern

Die JavaScript-Klasse `GartenPlaner` in `app.js` kann einfach erweitert werden:

- Neue Methoden hinzufügen
- Bestehende Funktionen anpassen
- Weitere Filteroptionen implementieren

## ⚠️ Wichtige Hinweise

### Datensicherung

- Regelmäßig Backups erstellen (Daten exportieren)!
- LocalStorage kann bei Browser-Reset gelöscht werden
- Keine automatische Cloud-Synchronisation

### Browser-Daten löschen

Beim Löschen von Browser-Daten gehen die Aufgaben verloren!
**Vorher Export durchführen!**

### Mehrere Geräte

- Daten werden **nicht** zwischen Geräten synchronisiert
- Für mehrere Geräte: Export/Import verwenden
- Alternative: Auf einem Server hosten (siehe unten)

## 🚀 Erweiterte Optionen

### Server-basierte Lösung (Optional)

Für Multi-User-Zugriff und zentrale Datenspeicherung kann ein Backend hinzugefügt werden:

- Node.js + Express
- Python + Flask/FastAPI
- PHP Backend
- Datenbank: MySQL, PostgreSQL, MongoDB

### Cloud-Hosting

Die Anwendung kann auf folgenden Plattformen gehostet werden:

- GitHub Pages (kostenlos)
- Netlify (kostenlos)
- Vercel (kostenlos)
- Eigener Webserver

## 🐛 Fehlerbehebung

### Aufgaben werden nicht gespeichert

- Überprüfe, ob LocalStorage im Browser aktiviert ist
- Im Inkognito-Modus werden Daten nicht dauerhaft gespeichert
- Browser-Einstellungen für Cookies/LocalStorage prüfen

### Design wird nicht korrekt angezeigt

- Cache leeren (Strg + F5)
- Sicherstellen, dass `styles.css` im gleichen Ordner liegt
- Browser-Konsole auf Fehler prüfen (F12)

### JavaScript-Fehler

- Browser-Konsole öffnen (F12)
- Fehlermeldungen prüfen
- Sicherstellen, dass `app.js` im gleichen Ordner liegt

## 📄 Lizenz

Dieses Projekt steht zur freien Verfügung und kann beliebig angepasst werden.

## 🤝 Support

Bei Fragen oder Problemen:

1. Browser-Konsole auf Fehler prüfen (F12)
2. Sicherstellen, dass alle drei Dateien im gleichen Ordner sind
3. Kompatiblen Browser verwenden
