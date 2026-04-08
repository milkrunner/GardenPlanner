# Garden Planner Phase 1 — Grid, Massangaben, Loeschbestaetigung

**Issues:** #249, #248, #252
**Datum:** 2026-04-08

## Zusammenfassung

Der Garden Planner erhaelt ein sichtbares Linien-Raster mit Snap-to-Grid, Meter-Lineale am Canvas-Rand mit Hover-Tooltips fuer Flaecheninhalt/Umfang, und Loeschbestaetigungen fuer Gaerten und Flaechen.

---

## 1. Grid-System

### Visuelles Linien-Raster

- SVG-`<pattern>` im Canvas-Hintergrund mit hellen Linien (`rgba(0,0,0,0.07)`, Strichstaerke 0.5px)
- Linienabstand entspricht der konfigurierten Rastergroesse (siehe Konfiguration)
- Pattern skaliert mit dem Zoom (Linien bleiben proportional)
- Ein-/Ausschaltbar ueber Tastenkuerzel **G**
- Default: Grid sichtbar
- Zustand wird im Garden-State gespeichert (localStorage)

### Snap-to-Grid

- **Default: An.** Shift gedrueckt halten deaktiviert Snap temporaer.
- Snap-Fangbereich: halbe Rastergroesse
- Snap greift bei:
  - Polygon-Punkte setzen (Draw-Tool)
  - Pflanzen/Strukturen platzieren (Click-Placement)
  - Elemente verschieben (Move-Tool / Drag)
- Snap-Funktion: `snapToGrid(point)` — rundet x/y auf naechsten Rasterpunkt. Wenn `shiftKey` gedrueckt, wird der Punkt unveraendert zurueckgegeben.

### Konfiguration

- Neues `<select>`-Element in der Statusbar neben den Zoom-Controls
- Optionen: `0.25m` / `0.5m` (default) / `1m`
- Aenderung aktualisiert sofort:
  - Grid-Pattern-Groesse
  - Lineal-Ticks
  - Snap-Raster
  - Canvas-Groessenanzeige in Metern
- Wert wird in localStorage gespeichert (`gardenplanner_gridScale`)

### Pixel-zu-Meter Umrechnung

- Bei 0.5m Rastergroesse: 1 Rasterkachel = 50px = 0.5m → **1m = 100px**
- Bei 0.25m: 1 Rasterkachel = 50px = 0.25m → **1m = 200px**
- Bei 1m: 1 Rasterkachel = 50px = 1m → **1m = 50px**
- Zentrale Konstante `PIXELS_PER_GRID = 50` (Rastergroesse in Pixeln, fest)
- Umrechnungsfaktor: `pixelsPerMeter = PIXELS_PER_GRID / gridScaleMeters`

---

## 2. Massangaben & Lineale

### Lineale am Canvas-Rand

- **Oben** (horizontal) und **links** (vertikal), fest positioniert als HTML-Overlays ueber dem Canvas
- Hintergrund: `var(--primary)` (#365E3D, im Dark Mode: `var(--primary-light)`)
- Text: weiss
- Groesse: 24px Hoehe (oben), 32px Breite (links)
- Tick-Marks alle 1m (kleine Striche), Beschriftung alle 1m
- Bei hohem Zoom (>2x) und kleiner Rastergroesse: Beschriftung alle 0.5m
- Bei niedrigem Zoom (<0.5x): Beschriftung alle 2m oder 5m
- Lineale reagieren auf Zoom und Pan (Tick-Positionen verschieben sich synchron)
- Nullpunkt: oben links am Canvas
- Implementierung: Eigene `<canvas>`-Elemente (2D Context) fuer performantes Rendern bei Pan/Zoom. Kein SVG, da die Lineale bei jedem Pan-Event neu gezeichnet werden muessen.

### Hover-Tooltip auf Polygonen

- Erscheint beim Hovern ueber eine geschlossene Flaeche (nur im Select-Tool, nicht waehrend Zeichnen)
- Inhalt:
  - Zeile 1: Flaechentyp-Name (z.B. "Beet"), fett
  - Zeile 2: "Flaeche: X.X m²"
  - Zeile 3: "Umfang: X.X m"
- Design: `rgba(28,25,23,0.9)` Hintergrund, weisser Text, `border-radius: 6px`, `padding: 8px 12px`
- Positionierung: Folgt dem Mauszeiger mit 12px Offset nach rechts-unten
- Verschwindet sofort wenn Maus das Polygon verlaesst
- Wird nicht angezeigt wenn ein Element gedraggt wird

### Flaechenberechnung

- **Shoelace-Formel** fuer Polygonflaeche:
  ```
  A = 0.5 * |sum(x[i]*y[i+1] - x[i+1]*y[i])|
  ```
  Ergebnis in Pixel², dann umgerechnet mit `(1/pixelsPerMeter)²` zu m²
- **Umfang**: Summe aller Kantenlaengen in Pixel, umgerechnet zu Metern
- Werte auf 1 Dezimalstelle gerundet
- Berechnung erfolgt on-demand beim Hover (nicht gecacht, da Polygone verschoben werden koennen)

### Canvas-Groesse in der Statusbar

- Neue Anzeige in der Statusbar-Mitte: "12.0 x 8.0 m" (neben Flaechen/Elemente-Zaehler)
- Berechnet aus `canvasSize.width / pixelsPerMeter` x `canvasSize.height / pixelsPerMeter`
- Aktualisiert sich bei Aenderung der Rastergroesse

---

## 3. Loeschbestaetigung

### Confirm-Dialog

- Eigene leichtgewichtige Funktion `gardenConfirm(title, message)` im garden-planner.js
- Gibt `Promise<boolean>` zurueck
- Erzeugt ein Modal-Overlay dynamisch:
  - Halbtransparenter Hintergrund (`rgba(0,0,0,0.5)`)
  - Zentrierte Card mit Titel, Nachricht, zwei Buttons
  - "Abbrechen" Button (sekundaer) → resolve(false)
  - "Loeschen" Button (rot/danger, `var(--error)`) → resolve(true)
  - Escape-Taste → resolve(false)
  - Klick auf Overlay-Hintergrund → resolve(false)
- Gestylt in `garden.css` passend zum Garden-Design
- Focus-Trap: Tab wechselt zwischen den zwei Buttons

### Anwendungsfaelle

**Gaerten loeschen** (Sidebar → gespeicherter Garten → Delete-Button):
- Titel: "Garten loeschen"
- Nachricht: "Garten '[Name]' wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden."

**Flaechenpolygone loeschen** (Delete-Tool oder Delete/Backspace auf selektierte Flaeche):
- Titel: "Flaeche loeschen"
- Nachricht: "Flaeche '[Typ]' loeschen?"

**NICHT** fuer einzelne Pflanzen/Strukturen — diese sind schnell neu platziert und haben Undo.

---

## Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/js/garden-planner.js` | Grid-Pattern, Snap-Logik, Tooltip, Flaechenberechnung, Confirm-Dialog, Lineal-Rendering, Statusbar-Erweiterung |
| `src/css/garden.css` | Lineal-Styles, Tooltip-Styles, Confirm-Dialog-Styles, Grid-Scale-Select |
| `public/garden.html` | Lineal-Container-Elemente, Grid-Scale-Select in Statusbar |

## Keine neuen Dateien

Alles wird in den bestehenden Garden-Planner-Dateien ergaenzt, da die Features eng mit dem Canvas und dem State verzahnt sind.
