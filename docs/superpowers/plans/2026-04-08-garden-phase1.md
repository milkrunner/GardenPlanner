# Garden Planner Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Garden Planner mit sichtbarem Linien-Raster, Snap-to-Grid, Meter-Linealen, Flaechenberechnung mit Hover-Tooltip und Loeschbestaetigung ausstatten.

**Architecture:** Alle Aenderungen innerhalb der bestehenden IIFE in `garden-planner.js`. Neue Konstanten und Hilfsfunktionen fuer Grid/Snap/Masse. HTML-Canvas-Elemente fuer Lineale (performanter als SVG bei Pan/Zoom). Confirm-Dialog als wiederverwendbare Promise-Funktion.

**Tech Stack:** Vanilla JS (IIFE Pattern), SVG Patterns, HTML5 Canvas (Lineale), CSS

---

## File Structure

### Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/js/garden-planner.js` | Grid-Pattern, Snap-Funktion, Lineal-Rendering, Tooltip, Flaechenberechnung, Confirm-Dialog, Keyboard G-Toggle, Statusbar-Erweiterung |
| `src/css/garden.css` | Lineal-Container, Tooltip, Confirm-Dialog, Grid-Scale-Select Styles |
| `public/garden.html` | Lineal-Container-Elemente, Grid-Scale-Select in Statusbar, Canvas-Groessen-Anzeige |

---

### Task 1: HTML-Struktur erweitern (Lineale, Scale-Select, Canvas-Groesse)

**Files:**
- Modify: `public/garden.html:144-175`

- [ ] **Step 1: Lineal-Container und Canvas-Bereich anpassen**

In `public/garden.html`, ersetze den Block ab Zeile 144 (`<!-- Canvas Area -->`) bis Zeile 156 (schliessendes `</div>` des canvas-area):

```html
        <!-- Canvas Area with Rulers -->
        <div class="garden-canvas-wrapper">
          <canvas class="garden-ruler-corner" id="rulerCorner" width="32" height="24"></canvas>
          <canvas class="garden-ruler-top" id="rulerTop" height="24"></canvas>
          <canvas class="garden-ruler-left" id="rulerLeft" width="32"></canvas>
          <div class="garden-canvas-area" id="gardenCanvasArea">
            <svg class="garden-canvas" id="gardenCanvas" xmlns="http://www.w3.org/2000/svg">
              <defs id="svgDefs">
                <!-- SVG Patterns defined by JS -->
              </defs>
              <g id="canvasContent">
                <g id="layerGrid"></g>
                <g id="layerAreas"></g>
                <g id="layerElements"></g>
                <g id="layerDrawing"></g>
              </g>
            </svg>
            <div class="garden-tooltip" id="gardenTooltip" role="tooltip"></div>
          </div>
        </div>
```

Beachte: Neuer `layerGrid` SVG-Gruppe VOR `layerAreas` (Grid wird unter allem gerendert). Neuer `garden-tooltip` Div. Lineal-Canvas-Elemente oben und links. Wrapper-Div fuer CSS-Grid-Layout.

- [ ] **Step 2: Statusbar erweitern — Scale-Select und Canvas-Groesse**

In `public/garden.html`, ersetze den Statusbar-Center Block (Zeile 164-168):

```html
        <div class="statusbar-center">
          <span class="status-stat" id="statusAreas">0 Flaechen</span>
          <span class="status-separator">|</span>
          <span class="status-stat" id="statusElements">0 Elemente</span>
          <span class="status-separator">|</span>
          <span class="status-stat" id="statusCanvasSize">12.0 x 8.0 m</span>
        </div>
```

In der Statusbar-Right (Zeile 169-174), vor den Zoom-Buttons einfuegen:

```html
          <select class="grid-scale-select" id="gridScaleSelect" aria-label="Rastergroesse" title="Rastergroesse">
            <option value="0.25">0.25m</option>
            <option value="0.5" selected>0.5m</option>
            <option value="1">1m</option>
          </select>
          <span class="header-separator"></span>
```

- [ ] **Step 3: Commit**

```bash
git add public/garden.html
git commit -m "feat(garden): HTML-Struktur fuer Lineale, Grid-Scale und Tooltip (#249, #248)"
```

---

### Task 2: CSS-Styles fuer Lineale, Tooltip, Confirm-Dialog und Grid-Select

**Files:**
- Modify: `src/css/garden.css` (am Ende anfuegen)

- [ ] **Step 1: CSS anfuegen**

Am Ende von `src/css/garden.css` folgende Styles anfuegen:

```css
/* =============================================
   Grid, Rulers, Tooltip, Confirm Dialog
   ============================================= */

/* Canvas Wrapper — CSS Grid fuer Lineale */
.garden-canvas-wrapper {
  display: grid;
  grid-template-columns: 32px 1fr;
  grid-template-rows: 24px 1fr;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.garden-ruler-corner {
  grid-column: 1;
  grid-row: 1;
  background: var(--primary);
  display: block;
}

.garden-ruler-top {
  grid-column: 2;
  grid-row: 1;
  background: var(--primary);
  display: block;
  width: 100%;
}

.garden-ruler-left {
  grid-column: 1;
  grid-row: 2;
  background: var(--primary);
  display: block;
  height: 100%;
}

.garden-canvas-area {
  grid-column: 2;
  grid-row: 2;
}

/* Tooltip */
.garden-tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(28, 25, 23, 0.9);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: var(--text-sm);
  line-height: 1.4;
  z-index: 100;
  display: none;
  white-space: nowrap;
  max-width: 240px;
}

.garden-tooltip-title {
  font-weight: 700;
  margin-bottom: 2px;
}

.garden-tooltip-stat {
  color: #A8A29E;
}

/* Confirm Dialog */
.garden-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn var(--duration-fast) ease;
}

.garden-confirm-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  max-width: 400px;
  width: 90%;
  box-shadow: var(--shadow-xl);
}

.garden-confirm-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  margin-bottom: var(--space-sm);
  color: var(--text);
}

.garden-confirm-message {
  color: var(--text-light);
  font-size: var(--text-sm);
  line-height: 1.5;
  margin-bottom: var(--space-lg);
}

.garden-confirm-actions {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}

.garden-confirm-cancel {
  padding: var(--space-xs) var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: var(--text-sm);
  cursor: pointer;
}

.garden-confirm-cancel:hover {
  background: var(--bg-tertiary);
}

.garden-confirm-delete {
  padding: var(--space-xs) var(--space-md);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--error);
  color: white;
  font-size: var(--text-sm);
  cursor: pointer;
}

.garden-confirm-delete:hover {
  opacity: 0.9;
}

.garden-confirm-cancel:focus-visible,
.garden-confirm-delete:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Grid Scale Select */
.grid-scale-select {
  padding: 2px 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text);
  font-size: 11px;
  cursor: pointer;
  height: 26px;
}

.grid-scale-select:focus-visible {
  outline: 2px solid var(--focus-ring);
}

/* Dark mode adjustments */
[data-theme="dark"] .garden-ruler-corner,
[data-theme="dark"] .garden-ruler-top,
[data-theme="dark"] .garden-ruler-left {
  background: var(--primary-light);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/css/garden.css
git commit -m "feat(garden): CSS fuer Lineale, Tooltip, Confirm-Dialog, Grid-Select (#249, #248, #252)"
```

---

### Task 3: Grid-Pattern und Snap-Logik in garden-planner.js

**Files:**
- Modify: `src/js/garden-planner.js`

- [ ] **Step 1: Neue Konstanten und State hinzufuegen**

In `src/js/garden-planner.js`, nach der bestehenden Konstante `CLOSE_POLYGON_DISTANCE = 14;` (Zeile 16), einfuegen:

```javascript
  var PIXELS_PER_GRID = 50;
  var GRID_SCALES = [0.25, 0.5, 1]; // Meter pro Raster-Kachel
  var DEFAULT_GRID_SCALE = 0.5;
```

Im `state` Objekt (Zeile 53-62), nach `panY: 0` einfuegen:

```javascript
    gridVisible: true,
    gridScale: DEFAULT_GRID_SCALE   // Meter pro Kachel
```

- [ ] **Step 2: Snap-Funktion und Pixel-zu-Meter Helfer hinzufuegen**

Nach dem `dist()` Helfer (Zeile 130), einfuegen:

```javascript
  function pixelsPerMeter() {
    return PIXELS_PER_GRID / state.gridScale;
  }

  function pixelsToMeters(px) {
    return px / pixelsPerMeter();
  }

  function snapToGrid(point, forceOff) {
    if (forceOff) return point;
    var step = PIXELS_PER_GRID;
    return {
      x: Math.round(point.x / step) * step,
      y: Math.round(point.y / step) * step
    };
  }
```

- [ ] **Step 3: Grid-Pattern in initPatterns() hinzufuegen**

In der `initPatterns()` Funktion (Zeile 135), nach `defs.innerHTML = '';` (Zeile 137), einfuegen:

```javascript
    // Grid pattern
    addPattern(defs, 'pattern-grid', PIXELS_PER_GRID, PIXELS_PER_GRID, 'transparent', function (p) {
      var line1 = createSVGElement('line');
      line1.setAttribute('x1', '0');
      line1.setAttribute('y1', '0');
      line1.setAttribute('x2', PIXELS_PER_GRID);
      line1.setAttribute('y2', '0');
      line1.setAttribute('stroke', 'rgba(0,0,0,0.07)');
      line1.setAttribute('stroke-width', '0.5');
      p.appendChild(line1);
      var line2 = createSVGElement('line');
      line2.setAttribute('x1', '0');
      line2.setAttribute('y1', '0');
      line2.setAttribute('x2', '0');
      line2.setAttribute('y2', PIXELS_PER_GRID);
      line2.setAttribute('stroke', 'rgba(0,0,0,0.07)');
      line2.setAttribute('stroke-width', '0.5');
      p.appendChild(line2);
    });
```

- [ ] **Step 4: Grid-Layer rendern in renderAll()**

Neue Funktion nach `renderAll()` (Zeile 271-276):

```javascript
  function renderGrid() {
    var layer = dom.layerGrid;
    layer.innerHTML = '';
    if (!state.gridVisible) return;

    var w = gardenData.canvasSize.width;
    var h = gardenData.canvasSize.height;
    var rect = createSVGElement('rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', 'url(#pattern-grid)');
    layer.appendChild(rect);
  }
```

In `renderAll()` (Zeile 271), `renderGrid();` als erste Zeile hinzufuegen:

```javascript
  function renderAll() {
    renderGrid();
    renderAreas();
    renderElements();
    updateViewBox();
    updateStats();
  }
```

- [ ] **Step 5: Snap in Zeichnen, Platzieren und Verschieben integrieren**

In `handleDrawClick()` (Zeile 575), nach `function handleDrawClick(pt, e) {` einfuegen:

```javascript
    pt = snapToGrid(pt, e.shiftKey);
```

In `placePlant()` (Zeile 794), nach `if (!state.selectedPlant) return;` einfuegen:

```javascript
    pt = snapToGrid(pt);
```

In `placeStructure()` (Zeile 814), nach `if (!state.selectedStructure) return;` einfuegen:

```javascript
    pt = snapToGrid(pt);
```

In `handleDrag()` (Zeile 728), den bestehenden dx/dy Code erweitern. Ersetze:

```javascript
    var dx = pt.x - dragState.startX;
    var dy = pt.y - dragState.startY;
```

mit:

```javascript
    var snapped = snapToGrid(pt, false);
    var startSnapped = snapToGrid({ x: dragState.startX, y: dragState.startY }, false);
    var dx = snapped.x - startSnapped.x;
    var dy = snapped.y - startSnapped.y;
```

- [ ] **Step 6: DOM-Cache und Init erweitern**

In `cacheDom()` (Zeile 1479), nach `dom.redoBtn` hinzufuegen:

```javascript
    dom.layerGrid = document.getElementById('layerGrid');
    dom.rulerTop = document.getElementById('rulerTop');
    dom.rulerLeft = document.getElementById('rulerLeft');
    dom.rulerCorner = document.getElementById('rulerCorner');
    dom.tooltip = document.getElementById('gardenTooltip');
    dom.gridScaleSelect = document.getElementById('gridScaleSelect');
    dom.statusCanvasSize = document.getElementById('statusCanvasSize');
```

In `bindEvents()` (Zeile 1502), nach dem Garden-Name Change-Handler (Zeile 1543), einfuegen:

```javascript
    // Grid scale change
    if (dom.gridScaleSelect) {
      dom.gridScaleSelect.value = state.gridScale;
      dom.gridScaleSelect.addEventListener('change', function () {
        state.gridScale = parseFloat(this.value);
        localStorage.setItem('gardenplanner_gridScale', state.gridScale);
        initPatterns();
        renderAll();
        renderRulers();
        updateCanvasSizeDisplay();
      });
    }
```

In `init()` (Zeile 1562), nach `cacheDom();` einfuegen:

```javascript
    // Restore grid scale
    var savedScale = localStorage.getItem('gardenplanner_gridScale');
    if (savedScale && GRID_SCALES.indexOf(parseFloat(savedScale)) !== -1) {
      state.gridScale = parseFloat(savedScale);
      if (dom.gridScaleSelect) dom.gridScaleSelect.value = state.gridScale;
    }
```

- [ ] **Step 7: Keyboard G-Toggle fuer Grid**

In `initKeyboard()` (Zeile 1344), im switch-Block nach dem `case '0':` Block (Zeile 1437), einfuegen:

```javascript
        case 'g':
        case 'G':
          state.gridVisible = !state.gridVisible;
          renderAll();
          setStatus('Raster ' + (state.gridVisible ? 'eingeblendet' : 'ausgeblendet'));
          break;
```

- [ ] **Step 8: Commit**

```bash
git add src/js/garden-planner.js
git commit -m "feat(garden): Grid-Pattern mit Snap-to-Grid und G-Toggle (#249)"
```

---

### Task 4: Lineal-Rendering und Canvas-Groessen-Anzeige

**Files:**
- Modify: `src/js/garden-planner.js`

- [ ] **Step 1: Lineal-Render-Funktion hinzufuegen**

Nach der neuen `renderGrid()` Funktion, einfuegen:

```javascript
  function renderRulers() {
    renderRulerTop();
    renderRulerLeft();
    renderRulerCorner();
  }

  function renderRulerTop() {
    var canvas = dom.rulerTop;
    if (!canvas) return;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    var ctx = canvas.getContext('2d');
    var h = canvas.height;
    var ppm = pixelsPerMeter();
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    ctx.fillStyle = isDark ? '#365E3D' : '#365E3D';
    ctx.fillRect(0, 0, canvas.width, h);

    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';

    // Calculate visible range
    var offsetPx = state.panX * state.zoom;
    var meterStep = getRulerStep();

    var startM = Math.floor(-offsetPx / (ppm * state.zoom) / meterStep) * meterStep;
    var endM = Math.ceil((canvas.width - offsetPx) / (ppm * state.zoom) / meterStep) * meterStep;

    for (var m = startM; m <= endM; m += meterStep) {
      var x = m * ppm * state.zoom + offsetPx;
      if (x < 0 || x > canvas.width) continue;

      ctx.beginPath();
      ctx.moveTo(x, h - 8);
      ctx.lineTo(x, h);
      ctx.lineWidth = 1;
      ctx.stroke();

      if (m >= 0) {
        ctx.fillText(m + 'm', x, h - 10);
      }
    }
  }

  function renderRulerLeft() {
    var canvas = dom.rulerLeft;
    if (!canvas) return;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.height = rect.height;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var ppm = pixelsPerMeter();
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    ctx.fillStyle = isDark ? '#365E3D' : '#365E3D';
    ctx.fillRect(0, 0, w, canvas.height);

    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';

    var offsetPx = state.panY * state.zoom;
    var meterStep = getRulerStep();

    var startM = Math.floor(-offsetPx / (ppm * state.zoom) / meterStep) * meterStep;
    var endM = Math.ceil((canvas.height - offsetPx) / (ppm * state.zoom) / meterStep) * meterStep;

    for (var m = startM; m <= endM; m += meterStep) {
      var y = m * ppm * state.zoom + offsetPx;
      if (y < 0 || y > canvas.height) continue;

      ctx.beginPath();
      ctx.moveTo(w - 8, y);
      ctx.lineTo(w, y);
      ctx.lineWidth = 1;
      ctx.stroke();

      if (m >= 0) {
        ctx.fillText(m + 'm', w - 10, y + 3);
      }
    }
  }

  function renderRulerCorner() {
    var canvas = dom.rulerCorner;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#365E3D';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function getRulerStep() {
    var ppm = pixelsPerMeter();
    var pixelsPerMeterOnScreen = ppm * state.zoom;
    if (pixelsPerMeterOnScreen > 150) return 0.5;
    if (pixelsPerMeterOnScreen > 40) return 1;
    if (pixelsPerMeterOnScreen > 20) return 2;
    return 5;
  }

  function updateCanvasSizeDisplay() {
    if (!dom.statusCanvasSize) return;
    var wm = pixelsToMeters(gardenData.canvasSize.width).toFixed(1);
    var hm = pixelsToMeters(gardenData.canvasSize.height).toFixed(1);
    dom.statusCanvasSize.textContent = wm + ' x ' + hm + ' m';
  }
```

- [ ] **Step 2: Lineale bei Pan/Zoom/Resize aktualisieren**

In `setZoom()` (Zeile 837), nach `dom.zoomLevel.textContent = ...` einfuegen:

```javascript
    renderRulers();
```

In `zoomReset()` (Zeile 851), nach `dom.zoomLevel.textContent = '100%';` einfuegen:

```javascript
    renderRulers();
```

In `onCanvasWheel()` — sowohl nach dem Zoom-Pfad (nach `setZoom(...)`) als auch nach dem Pan-Pfad (nach `updateViewBox();`) einfuegen:

```javascript
    renderRulers();
```

In `renderAll()`, `renderRulers();` und `updateCanvasSizeDisplay();` am Ende hinzufuegen:

```javascript
  function renderAll() {
    renderGrid();
    renderAreas();
    renderElements();
    updateViewBox();
    updateStats();
    renderRulers();
    updateCanvasSizeDisplay();
  }
```

Window-Resize Handler in `init()`, nach dem `loadLastGarden()` Aufruf:

```javascript
    window.addEventListener('resize', function () { renderRulers(); });
```

- [ ] **Step 3: Commit**

```bash
git add src/js/garden-planner.js
git commit -m "feat(garden): Meter-Lineale am Canvas-Rand mit Zoom/Pan-Sync (#248)"
```

---

### Task 5: Hover-Tooltip mit Flaechenberechnung

**Files:**
- Modify: `src/js/garden-planner.js`

- [ ] **Step 1: Flaechenberechnungs-Funktionen hinzufuegen**

Nach `pixelsToMeters()`, einfuegen:

```javascript
  function calcPolygonArea(points) {
    // Shoelace formula
    var n = points.length;
    var area = 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      area += points[i][0] * points[j][1];
      area -= points[j][0] * points[i][1];
    }
    return Math.abs(area) / 2;
  }

  function calcPolygonPerimeter(points) {
    var perimeter = 0;
    for (var i = 0; i < points.length; i++) {
      var j = (i + 1) % points.length;
      var dx = points[j][0] - points[i][0];
      var dy = points[j][1] - points[i][1];
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  }
```

- [ ] **Step 2: Tooltip-Anzeige bei Hover auf Polygone**

In `renderAreas()` (Zeile 278), nach dem bestehenden `polygon.addEventListener('click', onAreaClick);` (Zeile 301), einfuegen:

```javascript
      polygon.addEventListener('mouseenter', function () {
        if (state.tool !== 'select' || dragState) return;
        var surface = getSurfaceType(area.surfaceType);
        var areaPx = calcPolygonArea(area.points);
        var areaM2 = areaPx / (pixelsPerMeter() * pixelsPerMeter());
        var perimPx = calcPolygonPerimeter(area.points);
        var perimM = perimPx / pixelsPerMeter();
        showTooltip(surface.name, areaM2.toFixed(1) + ' m\u00B2', perimM.toFixed(1) + ' m');
      });
      polygon.addEventListener('mouseleave', function () {
        hideTooltip();
      });
      polygon.addEventListener('mousemove', function (ev) {
        moveTooltip(ev);
      });
```

- [ ] **Step 3: Tooltip Helfer-Funktionen**

Nach den Flaechenberechnungs-Funktionen, einfuegen:

```javascript
  function showTooltip(name, area, perimeter) {
    var tip = dom.tooltip;
    if (!tip) return;
    tip.innerHTML = '<div class="garden-tooltip-title">' + name + '</div>' +
      '<div class="garden-tooltip-stat">Flaeche: ' + area + '</div>' +
      '<div class="garden-tooltip-stat">Umfang: ' + perimeter + '</div>';
    tip.style.display = 'block';
  }

  function hideTooltip() {
    if (dom.tooltip) dom.tooltip.style.display = 'none';
  }

  function moveTooltip(e) {
    var tip = dom.tooltip;
    if (!tip || tip.style.display === 'none') return;
    var container = dom.canvasArea.getBoundingClientRect();
    tip.style.left = (e.clientX - container.left + 12) + 'px';
    tip.style.top = (e.clientY - container.top + 12) + 'px';
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/js/garden-planner.js
git commit -m "feat(garden): Hover-Tooltip mit Flaecheninhalt und Umfang (#248)"
```

---

### Task 6: Confirm-Dialog und Loeschbestaetigung

**Files:**
- Modify: `src/js/garden-planner.js`

- [ ] **Step 1: gardenConfirm() Funktion hinzufuegen**

Vor dem `// Save / Load` Abschnitt (Zeile 878), einfuegen:

```javascript
  // =====================================================
  // Confirm Dialog
  // =====================================================
  function gardenConfirm(title, message) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'garden-confirm-overlay';
      overlay.innerHTML = '<div class="garden-confirm-card">' +
        '<div class="garden-confirm-title">' + title + '</div>' +
        '<div class="garden-confirm-message">' + message + '</div>' +
        '<div class="garden-confirm-actions">' +
        '<button class="garden-confirm-cancel" type="button">Abbrechen</button>' +
        '<button class="garden-confirm-delete" type="button">Loeschen</button>' +
        '</div></div>';

      function close(result) {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') close(false);
      }

      overlay.querySelector('.garden-confirm-cancel').addEventListener('click', function () { close(false); });
      overlay.querySelector('.garden-confirm-delete').addEventListener('click', function () { close(true); });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(false);
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      overlay.querySelector('.garden-confirm-delete').focus();
    });
  }
```

- [ ] **Step 2: deleteAreaById() mit Confirm erweitern**

Ersetze die bestehende `deleteAreaById()` Funktion (Zeile 644-651):

```javascript
  function deleteAreaById(id) {
    var area = gardenData.layers.find(function (l) { return l.id === id; });
    var surfaceName = area ? getSurfaceType(area.surfaceType).name : 'Flaeche';
    gardenConfirm('Flaeche loeschen', 'Flaeche "' + surfaceName + '" loeschen?').then(function (ok) {
      if (!ok) return;
      pushUndo();
      gardenData.layers = gardenData.layers.filter(function (l) { return l.id !== id; });
      state.selectedElement = null;
      renderAll();
      autoSave();
      setStatus('Flaeche geloescht');
    });
  }
```

- [ ] **Step 3: deleteGarden() mit Confirm erweitern**

Ersetze in `renderSavedGardens()` (Zeile 1253), den Delete-Button Event-Handler. Finde den Block mit `if (confirm(` (Zeile 1291-1296) und ersetze:

```javascript
        deleteBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          gardenConfirm('Garten loeschen', 'Garten "' + (garden.name || 'Unbenannt') + '" wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.').then(function (ok) {
            if (ok) deleteGarden(garden.id);
          });
        });
```

- [ ] **Step 4: Commit**

```bash
git add src/js/garden-planner.js
git commit -m "feat(garden): Confirm-Dialog fuer Loeschbestaetigung (#252)"
```

---

### Task 7: Version Bump und Build

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Version bump**

In `package.json`, Version aendern:

```json
  "version": "3.4.0",
```

- [ ] **Step 2: Build ausfuehren**

Run: `node scripts/build.js`
Expected: Keine Fehler, garden-bundle.js enthaelt die neuen Funktionen

- [ ] **Step 3: Tests ausfuehren**

Run: `npm test`
Expected: Alle bestehenden Tests bestehen

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat(garden): Version bump 3.4.0 — Grid, Masse, Loeschbestaetigung (#249, #248, #252)"
```
