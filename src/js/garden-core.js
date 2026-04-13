/**
 * Garden Planner - Core Module
 * State, Konfiguration, Konstanten, Hilfsfunktionen
 *
 * Stellt window.GP als globales Namespace-Objekt bereit.
 */
(function () {
  'use strict';

  var GP = {};

  // =====================================================
  // Constants
  // =====================================================
  GP.STORAGE_KEY = 'gardenplanner_gardens';
  GP.MAX_UNDO = 20;
  GP.DEFAULT_CANVAS = { width: 1200, height: 800 };
  GP.SNAP_DISTANCE = 12;
  GP.CLOSE_POLYGON_DISTANCE = 14;
  GP.PIXELS_PER_GRID = 50;
  GP.GRID_SCALES = [0.25, 0.5, 1];
  GP.DEFAULT_GRID_SCALE = 0.5;
  GP.API_BASE = '/api/v1';
  GP.AUTO_SAVE_DELAY = 2000;

  GP.SURFACE_TYPES = [
    { id: 'bed', name: 'Beet', color: '#8B6F47', pattern: 'pattern-bed', icon: '\u{1F331}' },
    { id: 'lawn', name: 'Rasen', color: '#6BAF5B', pattern: 'pattern-lawn', icon: '\u{1F33F}' },
    { id: 'gravel', name: 'Kies', color: '#B0A896', pattern: 'pattern-gravel', icon: '\u2B21' },
    { id: 'path', name: 'Weg', color: '#A09080', pattern: 'pattern-path', icon: '\u{1F6B6}' },
    { id: 'water', name: 'Wasser', color: '#5B9BD5', pattern: 'pattern-water', icon: '\u{1F4A7}' },
    { id: 'terrace', name: 'Terrasse', color: '#8C7B6B', pattern: 'pattern-terrace', icon: '\u{1F3E1}' }
  ];

  GP.FALLBACK_PLANTS = [
    { id: 'tomate', name: 'Tomate', icon: '\u{1F345}', color: '#FFCDD2', info: 'Sonnig, Mai-Sep', category: 'Gem\u00fcse', difficulty: 'easy', sun: 'full', water: 'medium', season: ['spring', 'summer'] },
    { id: 'salat', name: 'Salat', icon: '\u{1F96C}', color: '#C8E6C9', info: 'Halbschatten, Mrz-Okt', category: 'Gem\u00fcse', difficulty: 'easy', sun: 'partial', water: 'medium', season: ['spring', 'summer', 'autumn'] },
    { id: 'sonnenblume', name: 'Sonnenblume', icon: '\u{1F33B}', color: '#FFE0B2', info: 'Sonnig, Apr-Sep', category: 'Blumen', difficulty: 'easy', sun: 'full', water: 'medium', season: ['spring', 'summer'] },
    { id: 'lavendel', name: 'Lavendel', icon: '\u{1F490}', color: '#D1C4E9', info: 'Sonnig, mehrj\u00e4hrig', category: 'Kr\u00e4uter', difficulty: 'easy', sun: 'full', water: 'low', season: ['spring', 'summer'] },
    { id: 'rose', name: 'Rose', icon: '\u{1F339}', color: '#FFCCBC', info: 'Sonnig, mehrj\u00e4hrig', category: 'Blumen', difficulty: 'medium', sun: 'full', water: 'medium', season: ['spring', 'summer'] },
    { id: 'gurke', name: 'Gurke', icon: '\u{1F952}', color: '#C5E1A5', info: 'Sonnig, Mai-Aug', category: 'Gem\u00fcse', difficulty: 'easy', sun: 'full', water: 'high', season: ['spring', 'summer'] },
    { id: 'blaubeere', name: 'Blaubeere', icon: '\u{1FAD0}', color: '#BBDEFB', info: 'Halbschatten, mehrj.', category: 'Obst', difficulty: 'medium', sun: 'partial', water: 'medium', season: ['spring', 'summer'] },
    { id: 'basilikum', name: 'Basilikum', icon: '\u{1F33F}', color: '#F0F4C3', info: 'Sonnig, Mai-Sep', category: 'Kr\u00e4uter', difficulty: 'easy', sun: 'full', water: 'medium', season: ['spring', 'summer'] },
    { id: 'erdbeere', name: 'Erdbeere', icon: '\u{1F353}', color: '#FFCDD2', info: 'Sonnig, Apr-Jul', category: 'Obst', difficulty: 'easy', sun: 'full', water: 'medium', season: ['spring', 'summer'] },
    { id: 'paprika', name: 'Paprika', icon: '\u{1FAD1}', color: '#C8E6C9', info: 'Sonnig, Mai-Sep', category: 'Gem\u00fcse', difficulty: 'medium', sun: 'full', water: 'medium', season: ['spring', 'summer'] },
    { id: 'karotte', name: 'Karotte', icon: '\u{1F955}', color: '#FFE0B2', info: 'Sonnig, Mrz-Okt', category: 'Gem\u00fcse', difficulty: 'easy', sun: 'full', water: 'low', season: ['spring', 'summer', 'autumn'] },
    { id: 'zucchini', name: 'Zucchini', icon: '\u{1F952}', color: '#C5E1A5', info: 'Sonnig, Mai-Aug', category: 'Gem\u00fcse', difficulty: 'easy', sun: 'full', water: 'medium', season: ['spring', 'summer'] }
  ];

  GP.STRUCTURES = [
    { id: 'bank', name: 'Gartenbank', icon: '\u{1FA91}', color: '#D7CCC8' },
    { id: 'zaun', name: 'Zaun', icon: '\u26E9', color: '#EFEBE9' },
    { id: 'kompost', name: 'Kompost', icon: '\u{1F5D1}', color: '#E0E0E0' },
    { id: 'schuppen', name: 'Schuppen', icon: '\u{1F3E0}', color: '#BCAAA4' },
    { id: 'brunnen', name: 'Brunnen', icon: '\u26F2', color: '#BBDEFB' }
  ];

  GP.MONTH_NAMES = ['Januar', 'Februar', 'M\u00e4rz', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  GP.SEASON_FOR_MONTH = [
    'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
    'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'
  ];

  // =====================================================
  // State (zentral, von allen Modulen erreichbar)
  // =====================================================
  GP.state = {
    tool: 'select',
    selectedSurface: 'bed',
    selectedPlant: null,
    selectedStructure: null,
    selectedElement: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    gridVisible: true,
    gridScale: GP.DEFAULT_GRID_SCALE,
    multiSelected: []
  };

  GP.gardenData = null;
  GP.currentGardenId = null;
  GP.serverGardenId = null;

  // Drawing state
  GP.drawPoints = [];
  GP.drawPreviewLine = null;

  // Drag state
  GP.dragState = null;

  // Mehrfach-Auswahl: Selektionsrechteck (#255)
  GP.selectRectState = null;

  // Edit panel state (#250)
  GP.editPanelOpen = false;
  GP.editingElementId = null;
  GP.vertexEditMode = false;
  GP.vertexDragState = null;

  // Undo/redo
  GP.undoStack = [];
  GP.redoStack = [];

  // DOM cache
  GP.dom = {};

  // Dynamisch geladene Pflanzen
  GP.PLANTS = GP.FALLBACK_PLANTS;
  GP.plantCategories = [];
  GP.currentPlantCategory = '';
  GP.showPlantFavoritesOnly = false;
  GP.showSeasonalOnly = false;
  GP.selectedSeasonMonth = new Date().getMonth();

  // Debounce-Timer fuer Auto-Save
  GP.autoSaveTimer = null;

  // Pan state
  GP.panState = null;

  // =====================================================
  // Helpers
  // =====================================================
  GP.generateId = function () {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  };

  GP.createEmptyGarden = function () {
    return {
      version: 2,
      name: 'Mein Garten',
      canvasSize: { width: GP.DEFAULT_CANVAS.width, height: GP.DEFAULT_CANVAS.height },
      layers: [],
      elements: []
    };
  };

  GP.cloneData = function (d) {
    return JSON.parse(JSON.stringify(d));
  };

  GP.svgNS = function () {
    return 'http://www.w3.org/2000/svg';
  };

  GP.createSVGElement = function (tag) {
    return document.createElementNS(GP.svgNS(), tag);
  };

  GP.getSurfaceType = function (id) {
    for (var i = 0; i < GP.SURFACE_TYPES.length; i++) {
      if (GP.SURFACE_TYPES[i].id === id) return GP.SURFACE_TYPES[i];
    }
    return GP.SURFACE_TYPES[0];
  };

  GP.mouseToSVG = function (e) {
    var svg = GP.dom.canvas;
    var pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    var ctm = svg.getScreenCTM();
    if (ctm) {
      var transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    var rect = svg.getBoundingClientRect();
    var x = (e.clientX - rect.left) / GP.state.zoom - GP.state.panX / GP.state.zoom;
    var y = (e.clientY - rect.top) / GP.state.zoom - GP.state.panY / GP.state.zoom;
    return { x: x, y: y };
  };

  GP.dist = function (a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  GP.pixelsPerMeter = function () {
    return GP.PIXELS_PER_GRID / GP.state.gridScale;
  };

  GP.pixelsToMeters = function (px) {
    return px / GP.pixelsPerMeter();
  };

  GP.snapToGrid = function (point, forceOff) {
    if (forceOff) return point;
    var step = GP.PIXELS_PER_GRID;
    return {
      x: Math.round(point.x / step) * step,
      y: Math.round(point.y / step) * step
    };
  };

  GP.calcPolygonArea = function (points) {
    var n = points.length;
    var area = 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      area += points[i][0] * points[j][1];
      area -= points[j][0] * points[i][1];
    }
    return Math.abs(area) / 2;
  };

  GP.calcPolygonCentroid = function (points) {
    var cx = 0, cy = 0;
    for (var i = 0; i < points.length; i++) {
      cx += points[i][0];
      cy += points[i][1];
    }
    return { x: cx / points.length, y: cy / points.length };
  };

  GP.calcPolygonPerimeter = function (points) {
    var perimeter = 0;
    for (var i = 0; i < points.length; i++) {
      var j = (i + 1) % points.length;
      var dx = points[j][0] - points[i][0];
      var dy = points[j][1] - points[i][1];
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  };

  GP.escapeText = function (str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // NOTE: showTooltip, hideTooltip, moveTooltip use innerHTML for trusted internal content only
  // (surface names, numeric values). No user-provided content is injected without escaping.
  GP.showTooltip = function (name, area, perimeter) {
    var tip = GP.dom.tooltip;
    if (!tip) return;
    tip.innerHTML = '<div class="garden-tooltip-title">' + name + '</div>' +
      '<div class="garden-tooltip-stat">Fl\u00e4che: ' + area + '</div>' +
      '<div class="garden-tooltip-stat">Umfang: ' + perimeter + '</div>';
    tip.style.display = 'block';
  };

  GP.hideTooltip = function () {
    if (GP.dom.tooltip) GP.dom.tooltip.style.display = 'none';
  };

  GP.moveTooltip = function (e) {
    var tip = GP.dom.tooltip;
    if (!tip || tip.style.display === 'none') return;
    var container = GP.dom.canvasArea.getBoundingClientRect();
    tip.style.left = (e.clientX - container.left + 12) + 'px';
    tip.style.top = (e.clientY - container.top + 12) + 'px';
  };

  GP.setStatus = function (text) {
    if (GP.dom.statusText) GP.dom.statusText.textContent = text;
  };

  // NOTE: gardenConfirm uses innerHTML for its own static UI chrome (buttons, layout).
  // The title/message parameters come from internal code strings, not user input.
  GP.gardenConfirm = function (title, message) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'garden-confirm-overlay';
      overlay.innerHTML = '<div class="garden-confirm-card">' +
        '<div class="garden-confirm-title">' + title + '</div>' +
        '<div class="garden-confirm-message">' + message + '</div>' +
        '<div class="garden-confirm-actions">' +
        '<button class="garden-confirm-cancel" type="button">Abbrechen</button>' +
        '<button class="garden-confirm-delete" type="button">L\u00f6schen</button>' +
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
  };

  // Saisonale Hilfsfunktionen (#253)
  GP.isPlantInSeason = function (plant, month) {
    if (!plant.season || plant.season.length === 0) return true;
    var season = GP.SEASON_FOR_MONTH[month];
    return plant.season.indexOf(season) !== -1;
  };

  GP.findPlantDef = function (el) {
    if (el.type !== 'plant') return null;
    for (var i = 0; i < GP.PLANTS.length; i++) {
      if (GP.PLANTS[i].name === el.name) return GP.PLANTS[i];
    }
    for (var j = 0; j < GP.FALLBACK_PLANTS.length; j++) {
      if (GP.FALLBACK_PLANTS[j].name === el.name) return GP.FALLBACK_PLANTS[j];
    }
    return null;
  };

  GP.isPointInRect = function (px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  };

  // =====================================================
  // Undo / Redo
  // =====================================================
  GP.pushUndo = function () {
    GP.undoStack.push(GP.cloneData(GP.gardenData));
    if (GP.undoStack.length > GP.MAX_UNDO) {
      GP.undoStack.shift();
    }
    GP.redoStack = [];
    GP.updateUndoRedoButtons();
  };

  GP.undo = function () {
    if (GP.undoStack.length === 0) return;
    GP.redoStack.push(GP.cloneData(GP.gardenData));
    GP.gardenData = GP.undoStack.pop();
    GP.renderAll();
    GP.autoSave();
    GP.updateUndoRedoButtons();
    GP.setStatus('R\u00fcckg\u00e4ngig');
  };

  GP.redo = function () {
    if (GP.redoStack.length === 0) return;
    GP.undoStack.push(GP.cloneData(GP.gardenData));
    GP.gardenData = GP.redoStack.pop();
    GP.renderAll();
    GP.autoSave();
    GP.updateUndoRedoButtons();
    GP.setStatus('Wiederholt');
  };

  GP.updateUndoRedoButtons = function () {
    if (GP.dom.undoBtn) GP.dom.undoBtn.disabled = GP.undoStack.length === 0;
    if (GP.dom.redoBtn) GP.dom.redoBtn.disabled = GP.redoStack.length === 0;
  };

  // =====================================================
  // Tool Management
  // =====================================================
  GP.setTool = function (tool) {
    GP.state.tool = tool;

    if (tool !== 'draw') {
      GP.drawPoints = [];
      GP.drawPreviewLine = null;
      GP.renderDrawing();
    }

    if (tool !== 'select') {
      GP.state.selectedElement = null;
      GP.state.multiSelected = [];
      GP.renderAll();
    }

    if (tool !== 'select') {
      GP.deselectPlantStructure();
    }

    var btns = document.querySelectorAll('.tool-btn');
    btns.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    GP.dom.canvasArea.setAttribute('data-tool', tool);
    GP.updateStatusForTool();
  };

  GP.updateStatusForTool = function () {
    switch (GP.state.tool) {
      case 'select':
        if (GP.state.selectedPlant) {
          GP.setStatus('Klicke auf den Canvas, um ' + GP.state.selectedPlant.name + ' zu platzieren');
        } else if (GP.state.selectedStructure) {
          GP.setStatus('Klicke auf den Canvas, um ' + GP.state.selectedStructure.name + ' zu platzieren');
        } else {
          GP.setStatus('Klicke auf ein Element zum Ausw\u00e4hlen');
        }
        break;
      case 'draw':
        GP.setStatus('Klicke, um Punkte zu setzen. Doppelklick oder Klick auf Startpunkt schlie\u00dft die Fl\u00e4che. Fl\u00e4che: ' + GP.getSurfaceType(GP.state.selectedSurface).name);
        break;
      case 'move':
        GP.setStatus('Ziehe Elemente zum Verschieben');
        break;
      case 'delete':
        GP.setStatus('Klicke auf ein Element zum L\u00f6schen');
        break;
    }
  };

  GP.deselectPlantStructure = function () {
    GP.state.selectedPlant = null;
    GP.state.selectedStructure = null;
    var items = document.querySelectorAll('.palette-element.active');
    items.forEach(function (el) { el.classList.remove('active'); });
  };

  // Initialisiere gardenData
  GP.gardenData = GP.createEmptyGarden();

  // Globale Referenz setzen
  window.GP = GP;
})();
