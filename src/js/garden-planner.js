/**
 * Garden Planner - SVG-based freehand garden layout editor
 * Version 2: Polygon drawing, plant placement, drag-move, undo/redo
 */

(function () {
  'use strict';

  // =====================================================
  // Constants
  // =====================================================
  var STORAGE_KEY = 'gardenplanner_gardens';
  var MAX_UNDO = 20;
  var DEFAULT_CANVAS = { width: 1200, height: 800 };
  var SNAP_DISTANCE = 12;
  var CLOSE_POLYGON_DISTANCE = 14;
  var PIXELS_PER_GRID = 50;
  var GRID_SCALES = [0.25, 0.5, 1];
  var DEFAULT_GRID_SCALE = 0.5;

  var SURFACE_TYPES = [
    { id: 'bed', name: 'Beet', color: '#8B6F47', pattern: 'pattern-bed', icon: '🌱' },
    { id: 'lawn', name: 'Rasen', color: '#6BAF5B', pattern: 'pattern-lawn', icon: '🌿' },
    { id: 'gravel', name: 'Kies', color: '#B0A896', pattern: 'pattern-gravel', icon: '⬡' },
    { id: 'path', name: 'Weg', color: '#A09080', pattern: 'pattern-path', icon: '🚶' },
    { id: 'water', name: 'Wasser', color: '#5B9BD5', pattern: 'pattern-water', icon: '💧' },
    { id: 'terrace', name: 'Terrasse', color: '#8C7B6B', pattern: 'pattern-terrace', icon: '🏡' }
  ];

  // Hardcodierte Pflanzen als Offline-Fallback
  var FALLBACK_PLANTS = [
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

  // Dynamisch geladene Pflanzen (wird beim Init von der API befuellt)
  var PLANTS = FALLBACK_PLANTS;
  var plantCategories = [];
  var currentPlantCategory = '';
  var showPlantFavoritesOnly = false;
  var API_BASE = '/api/v1';

  var STRUCTURES = [
    { id: 'bank', name: 'Gartenbank', icon: '\u{1FA91}', color: '#D7CCC8' },
    { id: 'zaun', name: 'Zaun', icon: '\u26E9', color: '#EFEBE9' },
    { id: 'kompost', name: 'Kompost', icon: '\u{1F5D1}', color: '#E0E0E0' },
    { id: 'schuppen', name: 'Schuppen', icon: '\u{1F3E0}', color: '#BCAAA4' },
    { id: 'brunnen', name: 'Brunnen', icon: '\u26F2', color: '#BBDEFB' }
  ];

  // =====================================================
  // State
  // =====================================================
  var state = {
    tool: 'select',           // select | draw | move | delete
    selectedSurface: 'bed',   // which surface type for drawing
    selectedPlant: null,      // plant to place (click mode)
    selectedStructure: null,  // structure to place
    selectedElement: null,    // currently selected element ID
    zoom: 1,
    panX: 0,
    panY: 0,
    gridVisible: true,
    gridScale: DEFAULT_GRID_SCALE
  };

  var gardenData = createEmptyGarden();
  var currentGardenId = null;
  var serverGardenId = null; // Server-seitige ID fuer API-Sync (#251)

  // Drawing state
  var drawPoints = [];
  var drawPreviewLine = null;

  // Drag state
  var dragState = null;

  // Edit panel state (#250)
  var editPanelOpen = false;
  var editingElementId = null;
  var vertexEditMode = false;
  var vertexDragState = null;

  // Undo/redo
  var undoStack = [];
  var redoStack = [];

  // DOM cache
  var dom = {};

  // =====================================================
  // Helpers
  // =====================================================
  function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  function createEmptyGarden() {
    return {
      version: 2,
      name: 'Mein Garten',
      canvasSize: { width: DEFAULT_CANVAS.width, height: DEFAULT_CANVAS.height },
      layers: [],
      elements: []
    };
  }

  function cloneData(d) {
    return JSON.parse(JSON.stringify(d));
  }

  function svgNS() {
    return 'http://www.w3.org/2000/svg';
  }

  function createSVGElement(tag) {
    return document.createElementNS(svgNS(), tag);
  }

  function getSurfaceType(id) {
    for (var i = 0; i < SURFACE_TYPES.length; i++) {
      if (SURFACE_TYPES[i].id === id) return SURFACE_TYPES[i];
    }
    return SURFACE_TYPES[0];
  }

  // Convert mouse event to SVG coordinates
  function mouseToSVG(e) {
    var svg = dom.canvas;
    var pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    var ctm = svg.getScreenCTM();
    if (ctm) {
      var transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    // Fallback
    var rect = svg.getBoundingClientRect();
    var x = (e.clientX - rect.left) / state.zoom - state.panX / state.zoom;
    var y = (e.clientY - rect.top) / state.zoom - state.panY / state.zoom;
    return { x: x, y: y };
  }

  function dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

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

  function calcPolygonArea(points) {
    var n = points.length;
    var area = 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      area += points[i][0] * points[j][1];
      area -= points[j][0] * points[i][1];
    }
    return Math.abs(area) / 2;
  }

  function calcPolygonCentroid(points) {
    var cx = 0, cy = 0;
    for (var i = 0; i < points.length; i++) {
      cx += points[i][0];
      cy += points[i][1];
    }
    return { x: cx / points.length, y: cy / points.length };
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

  function showTooltip(name, area, perimeter) {
    var tip = dom.tooltip;
    if (!tip) return;
    tip.innerHTML = '<div class="garden-tooltip-title">' + name + '</div>' +
      '<div class="garden-tooltip-stat">Fl\u00e4che: ' + area + '</div>' +
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

  // =====================================================
  // SVG Patterns
  // =====================================================
  function initPatterns() {
    var defs = dom.svgDefs;
    defs.innerHTML = '';

    // Grid pattern
    addPattern(defs, 'pattern-grid', PIXELS_PER_GRID, PIXELS_PER_GRID, 'transparent', function (p) {
      var line1 = createSVGElement('line');
      line1.setAttribute('x1', '0');
      line1.setAttribute('y1', '0');
      line1.setAttribute('x2', String(PIXELS_PER_GRID));
      line1.setAttribute('y2', '0');
      line1.setAttribute('stroke', 'rgba(0,0,0,0.07)');
      line1.setAttribute('stroke-width', '0.5');
      p.appendChild(line1);
      var line2 = createSVGElement('line');
      line2.setAttribute('x1', '0');
      line2.setAttribute('y1', '0');
      line2.setAttribute('x2', '0');
      line2.setAttribute('y2', String(PIXELS_PER_GRID));
      line2.setAttribute('stroke', 'rgba(0,0,0,0.07)');
      line2.setAttribute('stroke-width', '0.5');
      p.appendChild(line2);
    });

    // Bed pattern - soil dots
    addPattern(defs, 'pattern-bed', 12, 12, '#8B6F47', function (p) {
      var c1 = createSVGElement('circle');
      c1.setAttribute('cx', '3');
      c1.setAttribute('cy', '3');
      c1.setAttribute('r', '1.2');
      c1.setAttribute('fill', '#7A5F3A');
      p.appendChild(c1);
      var c2 = createSVGElement('circle');
      c2.setAttribute('cx', '9');
      c2.setAttribute('cy', '9');
      c2.setAttribute('r', '1');
      c2.setAttribute('fill', '#6B5030');
      p.appendChild(c2);
    });

    // Lawn pattern - grass lines
    addPattern(defs, 'pattern-lawn', 10, 10, '#6BAF5B', function (p) {
      var l = createSVGElement('line');
      l.setAttribute('x1', '2');
      l.setAttribute('y1', '8');
      l.setAttribute('x2', '3');
      l.setAttribute('y2', '2');
      l.setAttribute('stroke', '#5A9E4A');
      l.setAttribute('stroke-width', '1');
      p.appendChild(l);
      var l2 = createSVGElement('line');
      l2.setAttribute('x1', '7');
      l2.setAttribute('y1', '9');
      l2.setAttribute('x2', '8');
      l2.setAttribute('y2', '4');
      l2.setAttribute('stroke', '#4E8E3E');
      l2.setAttribute('stroke-width', '0.8');
      p.appendChild(l2);
    });

    // Gravel pattern - small circles
    addPattern(defs, 'pattern-gravel', 8, 8, '#B0A896', function (p) {
      var c1 = createSVGElement('circle');
      c1.setAttribute('cx', '2');
      c1.setAttribute('cy', '2');
      c1.setAttribute('r', '1.5');
      c1.setAttribute('fill', '#A09886');
      p.appendChild(c1);
      var c2 = createSVGElement('circle');
      c2.setAttribute('cx', '6');
      c2.setAttribute('cy', '6');
      c2.setAttribute('r', '1.2');
      c2.setAttribute('fill', '#C0B8A6');
      p.appendChild(c2);
    });

    // Path pattern - bricks
    addPattern(defs, 'pattern-path', 16, 8, '#A09080', function (p) {
      var r1 = createSVGElement('rect');
      r1.setAttribute('x', '0');
      r1.setAttribute('y', '0');
      r1.setAttribute('width', '7');
      r1.setAttribute('height', '3.5');
      r1.setAttribute('fill', '#B09E8E');
      r1.setAttribute('rx', '0.5');
      p.appendChild(r1);
      var r2 = createSVGElement('rect');
      r2.setAttribute('x', '8');
      r2.setAttribute('y', '0');
      r2.setAttribute('width', '7');
      r2.setAttribute('height', '3.5');
      r2.setAttribute('fill', '#968474');
      r2.setAttribute('rx', '0.5');
      p.appendChild(r2);
      var r3 = createSVGElement('rect');
      r3.setAttribute('x', '4');
      r3.setAttribute('y', '4.5');
      r3.setAttribute('width', '7');
      r3.setAttribute('height', '3.5');
      r3.setAttribute('fill', '#B09E8E');
      r3.setAttribute('rx', '0.5');
      p.appendChild(r3);
    });

    // Water pattern - waves
    addPattern(defs, 'pattern-water', 20, 10, '#5B9BD5', function (p) {
      var path = createSVGElement('path');
      path.setAttribute('d', 'M0 5 Q5 2, 10 5 T20 5');
      path.setAttribute('stroke', '#4A8AC4');
      path.setAttribute('stroke-width', '1.2');
      path.setAttribute('fill', 'none');
      p.appendChild(path);
    });

    // Terrace pattern - tiles
    addPattern(defs, 'pattern-terrace', 14, 14, '#8C7B6B', function (p) {
      var r1 = createSVGElement('rect');
      r1.setAttribute('x', '0.5');
      r1.setAttribute('y', '0.5');
      r1.setAttribute('width', '6');
      r1.setAttribute('height', '6');
      r1.setAttribute('fill', '#9C8B7B');
      r1.setAttribute('rx', '1');
      p.appendChild(r1);
      var r2 = createSVGElement('rect');
      r2.setAttribute('x', '7.5');
      r2.setAttribute('y', '7.5');
      r2.setAttribute('width', '6');
      r2.setAttribute('height', '6');
      r2.setAttribute('fill', '#9C8B7B');
      r2.setAttribute('rx', '1');
      p.appendChild(r2);
    });
  }

  function addPattern(defs, id, w, h, bgColor, addChildren) {
    var pattern = createSVGElement('pattern');
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', w);
    pattern.setAttribute('height', h);

    // Background
    var bg = createSVGElement('rect');
    bg.setAttribute('width', w);
    bg.setAttribute('height', h);
    bg.setAttribute('fill', bgColor);
    pattern.appendChild(bg);

    addChildren(pattern);
    defs.appendChild(pattern);
  }

  // =====================================================
  // Render
  // =====================================================
  function renderGrid() {
    var layer = dom.layerGrid;
    if (!layer) return;
    layer.innerHTML = '';
    if (!state.gridVisible) return;

    var w = gardenData.canvasSize.width;
    var h = gardenData.canvasSize.height;
    var rect = createSVGElement('rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('fill', 'url(#pattern-grid)');
    layer.appendChild(rect);
  }

  function renderRulers() {
    renderRulerTop();
    renderRulerLeft();
    renderRulerCorner();
  }

  function renderRulerTop() {
    var canvas = dom.rulerTop;
    if (!canvas) return;
    var parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.offsetWidth - 32;
    var ctx = canvas.getContext('2d');
    var h = canvas.height;
    var ppm = pixelsPerMeter();

    ctx.fillStyle = '#365E3D';
    ctx.fillRect(0, 0, canvas.width, h);

    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';

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
    var parent = canvas.parentElement;
    if (!parent) return;
    canvas.height = parent.offsetHeight - 24;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var ppm = pixelsPerMeter();

    ctx.fillStyle = '#365E3D';
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

  function renderAll() {
    renderGrid();
    renderAreas();
    renderElements();
    updateViewBox();
    updateStats();
    renderRulers();
    updateCanvasSizeDisplay();
  }

  function renderAreas() {
    var layer = dom.layerAreas;
    layer.innerHTML = '';

    gardenData.layers.forEach(function (area) {
      if (!area.points || area.points.length < 3) return;

      var polygon = createSVGElement('polygon');
      var pointsStr = area.points.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
      polygon.setAttribute('points', pointsStr);
      polygon.setAttribute('class', 'area-polygon');
      polygon.setAttribute('data-id', area.id);

      var surface = getSurfaceType(area.surfaceType);
      polygon.setAttribute('fill', 'url(#' + surface.pattern + ')');
      polygon.setAttribute('stroke', surface.color);
      polygon.setAttribute('fill-opacity', '0.85');

      if (state.selectedElement === area.id) {
        polygon.classList.add('selected');
      }

      // Notizen-Label fuer Flaeche (#250)
      if (area.notes) {
        var centroid = calcPolygonCentroid(area.points);
        var noteLabel = createSVGElement('text');
        noteLabel.setAttribute('x', String(centroid.x));
        noteLabel.setAttribute('y', String(centroid.y));
        noteLabel.setAttribute('text-anchor', 'middle');
        noteLabel.setAttribute('font-size', '11');
        noteLabel.setAttribute('fill', 'rgba(0,0,0,0.6)');
        noteLabel.setAttribute('pointer-events', 'none');
        noteLabel.setAttribute('class', 'element-label');
        noteLabel.textContent = area.notes.length > 20 ? area.notes.substring(0, 20) + '...' : area.notes;
        layer.appendChild(noteLabel);
      }

      polygon.addEventListener('mousedown', onAreaMouseDown);
      polygon.addEventListener('click', onAreaClick);
      (function(areaData) {
        polygon.addEventListener('mouseenter', function () {
          if (state.tool !== 'select' || dragState) return;
          var surface = getSurfaceType(areaData.surfaceType);
          var areaPx = calcPolygonArea(areaData.points);
          var areaM2 = areaPx / (pixelsPerMeter() * pixelsPerMeter());
          var perimPx = calcPolygonPerimeter(areaData.points);
          var perimM = perimPx / pixelsPerMeter();
          showTooltip(surface.name, areaM2.toFixed(1) + ' m\u00B2', perimM.toFixed(1) + ' m');
        });
        polygon.addEventListener('mouseleave', function () {
          hideTooltip();
        });
        polygon.addEventListener('mousemove', function (ev) {
          moveTooltip(ev);
        });
      })(area);
      layer.appendChild(polygon);
    });
  }

  function renderElements() {
    var layer = dom.layerElements;
    layer.innerHTML = '';

    gardenData.elements.forEach(function (el) {
      var scale = el.scale || 1;
      var g = createSVGElement('g');
      g.setAttribute('class', 'element-group');
      g.setAttribute('data-id', el.id);
      g.setAttribute('transform', 'translate(' + el.x + ',' + el.y + ') scale(' + scale + ')');

      if (state.selectedElement === el.id) {
        g.classList.add('selected');
      }

      var radius = 18;
      var circle = createSVGElement('circle');
      circle.setAttribute('cx', '0');
      circle.setAttribute('cy', '0');
      circle.setAttribute('r', String(radius));
      circle.setAttribute('fill', el.color || '#E0E0E0');
      circle.setAttribute('fill-opacity', '0.8');
      circle.setAttribute('stroke', el.color || '#BDBDBD');
      circle.setAttribute('stroke-width', '1.5');
      circle.setAttribute('class', 'element-circle');
      g.appendChild(circle);

      var text = createSVGElement('text');
      text.setAttribute('x', '0');
      text.setAttribute('y', '5');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '18');
      text.setAttribute('pointer-events', 'none');
      text.textContent = el.icon || '?';
      g.appendChild(text);

      // Name label below
      var label = createSVGElement('text');
      label.setAttribute('x', '0');
      label.setAttribute('y', '30');
      label.setAttribute('class', 'element-label');
      label.textContent = el.name;
      g.appendChild(label);

      // Notizen-Indikator (#250)
      if (el.notes) {
        var noteIndicator = createSVGElement('circle');
        noteIndicator.setAttribute('cx', String(radius - 2));
        noteIndicator.setAttribute('cy', String(-radius + 2));
        noteIndicator.setAttribute('r', '4');
        noteIndicator.setAttribute('fill', '#FFC107');
        noteIndicator.setAttribute('stroke', 'white');
        noteIndicator.setAttribute('stroke-width', '1');
        noteIndicator.setAttribute('pointer-events', 'none');
        g.appendChild(noteIndicator);
      }

      g.addEventListener('mousedown', onElementMouseDown);
      g.addEventListener('click', onElementClick);
      layer.appendChild(g);
    });
  }

  function renderDrawing() {
    var layer = dom.layerDrawing;
    layer.innerHTML = '';

    if (drawPoints.length === 0) return;

    // Draw existing lines
    if (drawPoints.length > 1) {
      var polyline = createSVGElement('polyline');
      var pts = drawPoints.map(function (p) { return p.x + ',' + p.y; }).join(' ');
      polyline.setAttribute('points', pts);
      polyline.setAttribute('class', 'draw-line');
      layer.appendChild(polyline);
    }

    // Draw points
    drawPoints.forEach(function (p, i) {
      var circle = createSVGElement('circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', i === 0 ? 6 : 4);
      circle.setAttribute('class', 'draw-point');
      circle.setAttribute('fill', i === 0 ? 'var(--primary)' : 'var(--primary-light)');
      circle.setAttribute('stroke', 'white');
      circle.setAttribute('stroke-width', '2');
      layer.appendChild(circle);
    });

    // Preview line to mouse
    if (drawPreviewLine) {
      var lastPt = drawPoints[drawPoints.length - 1];
      var line = createSVGElement('line');
      line.setAttribute('x1', lastPt.x);
      line.setAttribute('y1', lastPt.y);
      line.setAttribute('x2', drawPreviewLine.x);
      line.setAttribute('y2', drawPreviewLine.y);
      line.setAttribute('class', 'draw-preview-line');
      layer.appendChild(line);
    }
  }

  function updateViewBox() {
    var cw = gardenData.canvasSize.width;
    var ch = gardenData.canvasSize.height;

    var vbX = -state.panX / state.zoom;
    var vbY = -state.panY / state.zoom;
    var vbW = cw / state.zoom;
    var vbH = ch / state.zoom;

    dom.canvas.setAttribute('viewBox', vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH);
  }

  function updateStats() {
    if (dom.statusAreas) {
      dom.statusAreas.textContent = gardenData.layers.length + ' Flächen';
    }
    if (dom.statusElements) {
      dom.statusElements.textContent = gardenData.elements.length + ' Elemente';
    }
  }

  // =====================================================
  // Undo / Redo
  // =====================================================
  function pushUndo() {
    undoStack.push(cloneData(gardenData));
    if (undoStack.length > MAX_UNDO) {
      undoStack.shift();
    }
    redoStack = [];
    updateUndoRedoButtons();
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(cloneData(gardenData));
    gardenData = undoStack.pop();
    renderAll();
    autoSave();
    updateUndoRedoButtons();
    setStatus('Rückgängig');
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(cloneData(gardenData));
    gardenData = redoStack.pop();
    renderAll();
    autoSave();
    updateUndoRedoButtons();
    setStatus('Wiederholt');
  }

  function updateUndoRedoButtons() {
    if (dom.undoBtn) dom.undoBtn.disabled = undoStack.length === 0;
    if (dom.redoBtn) dom.redoBtn.disabled = redoStack.length === 0;
  }

  // =====================================================
  // Tool Management
  // =====================================================
  function setTool(tool) {
    state.tool = tool;

    // Clear drawing state when leaving draw mode
    if (tool !== 'draw') {
      drawPoints = [];
      drawPreviewLine = null;
      renderDrawing();
    }

    // Deselect element when changing tools
    if (tool !== 'select') {
      state.selectedElement = null;
      renderAll();
    }

    // Deselect plant/structure when changing to non-place tool
    if (tool !== 'select') {
      deselectPlantStructure();
    }

    // Update toolbar buttons
    var btns = document.querySelectorAll('.tool-btn');
    btns.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Update canvas cursor
    dom.canvasArea.setAttribute('data-tool', tool);

    updateStatusForTool();
  }

  function updateStatusForTool() {
    switch (state.tool) {
      case 'select':
        if (state.selectedPlant) {
          setStatus('Klicke auf den Canvas, um ' + state.selectedPlant.name + ' zu platzieren');
        } else if (state.selectedStructure) {
          setStatus('Klicke auf den Canvas, um ' + state.selectedStructure.name + ' zu platzieren');
        } else {
          setStatus('Klicke auf ein Element zum Auswählen');
        }
        break;
      case 'draw':
        setStatus('Klicke, um Punkte zu setzen. Doppelklick oder Klick auf Startpunkt schließt die Fläche. Fläche: ' + getSurfaceType(state.selectedSurface).name);
        break;
      case 'move':
        setStatus('Ziehe Elemente zum Verschieben');
        break;
      case 'delete':
        setStatus('Klicke auf ein Element zum Löschen');
        break;
    }
  }

  function setStatus(text) {
    if (dom.statusText) dom.statusText.textContent = text;
  }

  function deselectPlantStructure() {
    state.selectedPlant = null;
    state.selectedStructure = null;
    var items = document.querySelectorAll('.palette-element.active');
    items.forEach(function (el) { el.classList.remove('active'); });
  }

  // =====================================================
  // Canvas Events
  // =====================================================
  function onCanvasClick(e) {
    if (e.target === dom.canvas || e.target.closest('#canvasContent') === dom.canvasContent) {
      var pt = mouseToSVG(e);

      if (state.tool === 'draw') {
        handleDrawClick(pt, e);
      } else if (state.tool === 'select') {
        // Place plant/structure if one is selected
        if (state.selectedPlant) {
          placePlant(pt);
        } else if (state.selectedStructure) {
          placeStructure(pt);
        } else {
          // Deselect if clicking empty canvas
          if (!e.target.closest('.area-polygon') && !e.target.closest('.element-group')) {
            state.selectedElement = null;
            if (editPanelOpen) closeEditPanel();
            renderAll();
          }
        }
      }
    }
  }

  function onCanvasMouseMove(e) {
    if (state.tool === 'draw' && drawPoints.length > 0) {
      drawPreviewLine = mouseToSVG(e);
      renderDrawing();
    }

    // Vertex-Drag (#250)
    if (vertexDragState) {
      handleVertexDrag(e);
      return;
    }

    if (dragState) {
      handleDrag(e);
    }
  }

  function onCanvasMouseUp() {
    if (vertexDragState) {
      endVertexDrag();
    }
    if (dragState) {
      endDrag();
    }
  }

  function onCanvasDblClick(e) {
    if (state.tool === 'draw' && drawPoints.length >= 3) {
      closePolygon();
      return;
    }

    // Doppelklick auf Element oder Flaeche oeffnet Edit-Panel (#250)
    var target = e.target.closest('.element-group');
    if (target) {
      e.stopPropagation();
      openEditPanel(target.getAttribute('data-id'), e);
      return;
    }
    var areaPoly = e.target.closest('.area-polygon');
    if (areaPoly) {
      e.stopPropagation();
      openEditPanel(areaPoly.getAttribute('data-id'), e);
      return;
    }
  }

  // =====================================================
  // Drawing
  // =====================================================
  function handleDrawClick(pt, e) {
    pt = snapToGrid(pt, e.shiftKey);
    // Check if clicking close to first point to close polygon
    if (drawPoints.length >= 3) {
      var first = drawPoints[0];
      if (dist(pt, first) < CLOSE_POLYGON_DISTANCE / state.zoom) {
        closePolygon();
        return;
      }
    }

    drawPoints.push(pt);
    drawPreviewLine = null;
    renderDrawing();

    if (drawPoints.length === 1) {
      setStatus('Punkt gesetzt. Weiter klicken für weitere Punkte. Mind. 3 Punkte für eine Fläche.');
    } else {
      setStatus(drawPoints.length + ' Punkte. Doppelklick oder Klick auf Startpunkt zum Schließen.');
    }
  }

  function closePolygon() {
    if (drawPoints.length < 3) return;

    pushUndo();

    var area = {
      id: generateId(),
      type: 'area',
      surfaceType: state.selectedSurface,
      points: drawPoints.map(function (p) { return [Math.round(p.x), Math.round(p.y)]; }),
      closed: true
    };

    gardenData.layers.push(area);
    drawPoints = [];
    drawPreviewLine = null;

    renderAll();
    renderDrawing();
    autoSave();

    setStatus('Fläche erstellt: ' + getSurfaceType(area.surfaceType).name);
  }

  // =====================================================
  // Area Events
  // =====================================================
  function onAreaClick(e) {
    var id = this.getAttribute('data-id');

    if (state.tool === 'draw') {
      // Im Zeichenmodus: Click durchlassen damit onCanvasClick Punkte setzen kann
      return;
    }

    e.stopPropagation();

    if (state.tool === 'delete') {
      deleteAreaById(id);
    } else if (state.tool === 'select') {
      // Pflanzen/Strukturen platzieren geht auch auf Flaechen
      if (state.selectedPlant) {
        var pt = mouseToSVG(e);
        pt = snapToGrid(pt);
        placePlant(pt);
        return;
      }
      if (state.selectedStructure) {
        var pt2 = mouseToSVG(e);
        pt2 = snapToGrid(pt2);
        placeStructure(pt2);
        return;
      }
      state.selectedElement = (state.selectedElement === id) ? null : id;
      renderAll();
    }
  }

  function onAreaMouseDown(e) {
    if (state.tool === 'draw') return; // Im Zeichenmodus: durchlassen
    e.stopPropagation();
    var id = this.getAttribute('data-id');

    if (state.tool === 'move') {
      startAreaDrag(e, id);
    }
  }

  function deleteAreaById(id) {
    var area = gardenData.layers.find(function (l) { return l.id === id; });
    var surfaceName = area ? getSurfaceType(area.surfaceType).name : 'Fl\u00e4che';
    gardenConfirm('Fl\u00e4che l\u00f6schen', 'Fl\u00e4che "' + surfaceName + '" l\u00f6schen?').then(function (ok) {
      if (!ok) return;
      pushUndo();
      gardenData.layers = gardenData.layers.filter(function (l) { return l.id !== id; });
      state.selectedElement = null;
      renderAll();
      autoSave();
      setStatus('Fl\u00e4che gel\u00f6scht');
    });
  }

  // =====================================================
  // Element Events
  // =====================================================
  function onElementClick(e) {
    e.stopPropagation();
    var g = this.closest ? this : this.parentNode;
    var id = g.getAttribute('data-id');

    if (state.tool === 'delete') {
      deleteElementById(id);
    } else if (state.tool === 'select') {
      state.selectedElement = (state.selectedElement === id) ? null : id;
      renderAll();
    }
  }

  function onElementMouseDown(e) {
    e.stopPropagation();
    var g = this.closest ? this : this.parentNode;
    var id = g.getAttribute('data-id');

    if (state.tool === 'move' || state.tool === 'select') {
      startElementDrag(e, id);
    }
  }

  function deleteElementById(id) {
    pushUndo();
    gardenData.elements = gardenData.elements.filter(function (el) { return el.id !== id; });
    state.selectedElement = null;
    renderAll();
    autoSave();
    setStatus('Element gelöscht');
  }

  // =====================================================
  // Drag & Drop
  // =====================================================
  function startElementDrag(e, id) {
    var el = gardenData.elements.find(function (el) { return el.id === id; });
    if (!el) return;

    var pt = mouseToSVG(e);
    dragState = {
      type: 'element',
      id: id,
      startX: pt.x,
      startY: pt.y,
      origX: el.x,
      origY: el.y
    };

    state.selectedElement = id;
    dom.canvasArea.classList.add('dragging');
    renderAll();
  }

  function startAreaDrag(e, id) {
    var area = gardenData.layers.find(function (l) { return l.id === id; });
    if (!area) return;

    var pt = mouseToSVG(e);
    dragState = {
      type: 'area',
      id: id,
      startX: pt.x,
      startY: pt.y,
      origPoints: area.points.map(function (p) { return [p[0], p[1]]; })
    };

    state.selectedElement = id;
    dom.canvasArea.classList.add('dragging');
    renderAll();
  }

  function handleDrag(e) {
    if (!dragState) return;
    var pt = mouseToSVG(e);
    var snapped = snapToGrid(pt, false);
    var startSnapped = snapToGrid({ x: dragState.startX, y: dragState.startY }, false);
    var dx = snapped.x - startSnapped.x;
    var dy = snapped.y - startSnapped.y;

    if (dragState.type === 'element') {
      var el = gardenData.elements.find(function (el) { return el.id === dragState.id; });
      if (el) {
        el.x = Math.round(dragState.origX + dx);
        el.y = Math.round(dragState.origY + dy);
        renderElements();
      }
    } else if (dragState.type === 'area') {
      var area = gardenData.layers.find(function (l) { return l.id === dragState.id; });
      if (area) {
        area.points = dragState.origPoints.map(function (p) {
          return [Math.round(p[0] + dx), Math.round(p[1] + dy)];
        });
        renderAreas();
      }
    }
  }

  function endDrag() {
    if (!dragState) return;

    var hasMoved = false;
    if (dragState.type === 'element') {
      var el = gardenData.elements.find(function (el) { return el.id === dragState.id; });
      if (el && (el.x !== dragState.origX || el.y !== dragState.origY)) {
        hasMoved = true;
      }
    } else if (dragState.type === 'area') {
      hasMoved = true; // simplification
    }

    if (hasMoved) {
      // Insert undo BEFORE the drag started
      var undoData = cloneData(gardenData);
      if (dragState.type === 'element') {
        var elUndo = undoData.elements.find(function (el) { return el.id === dragState.id; });
        if (elUndo) {
          elUndo.x = dragState.origX;
          elUndo.y = dragState.origY;
        }
      } else if (dragState.type === 'area') {
        var areaUndo = undoData.layers.find(function (l) { return l.id === dragState.id; });
        if (areaUndo) {
          areaUndo.points = dragState.origPoints;
        }
      }
      undoStack.push(undoData);
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      redoStack = [];
      updateUndoRedoButtons();
      autoSave();
    }

    dragState = null;
    dom.canvasArea.classList.remove('dragging');
  }

  // =====================================================
  // Plant & Structure Placement
  // =====================================================
  function placePlant(pt) {
    if (!state.selectedPlant) return;
    pt = snapToGrid(pt);
    pushUndo();

    var element = {
      id: generateId(),
      type: 'plant',
      name: state.selectedPlant.name,
      icon: state.selectedPlant.icon,
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      color: state.selectedPlant.color
    };

    gardenData.elements.push(element);
    renderAll();
    autoSave();
    setStatus(state.selectedPlant.name + ' platziert');
  }

  function placeStructure(pt) {
    if (!state.selectedStructure) return;
    pt = snapToGrid(pt);
    pushUndo();

    var element = {
      id: generateId(),
      type: 'structure',
      name: state.selectedStructure.name,
      icon: state.selectedStructure.icon,
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      color: state.selectedStructure.color
    };

    gardenData.elements.push(element);
    renderAll();
    autoSave();
    setStatus(state.selectedStructure.name + ' platziert');
  }

  // =====================================================
  // Zoom
  // =====================================================
  function setZoom(level) {
    state.zoom = Math.max(0.25, Math.min(3, level));
    updateViewBox();
    dom.zoomLevel.textContent = Math.round(state.zoom * 100) + '%';
    renderRulers();
  }

  function zoomIn() {
    setZoom(state.zoom + 0.15);
  }

  function zoomOut() {
    setZoom(state.zoom - 0.15);
  }

  function zoomReset() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    updateViewBox();
    dom.zoomLevel.textContent = '100%';
    renderRulers();
  }

  // =====================================================
  // Pan (middle mouse / touch)
  // =====================================================
  var panState = null;

  function onCanvasWheel(e) {
    e.preventDefault();
    if (e.ctrlKey) {
      // Zoom
      var delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(state.zoom + delta);
      renderRulers();
    } else {
      // Pan
      state.panX -= e.deltaX;
      state.panY -= e.deltaY;
      updateViewBox();
      renderRulers();
    }
  }

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
  }

  // =====================================================
  // Edit Panel (#250)
  // =====================================================
  function openEditPanel(id, e) {
    var panel = document.getElementById('gardenEditPanel');
    if (!panel) return;

    editingElementId = id;
    editPanelOpen = true;
    state.selectedElement = id;
    renderAll();

    // Bestimme ob es eine Flaeche oder ein Element ist
    var area = gardenData.layers.find(function (l) { return l.id === id; });
    var element = gardenData.elements.find(function (el) { return el.id === id; });

    if (area) {
      renderAreaEditPanel(area, panel);
    } else if (element) {
      renderElementEditPanel(element, panel);
    } else {
      return;
    }

    // Panel positionieren
    positionEditPanel(panel, e);
    panel.classList.add('visible');
  }

  function closeEditPanel() {
    var panel = document.getElementById('gardenEditPanel');
    if (panel) panel.classList.remove('visible');
    editPanelOpen = false;
    editingElementId = null;
    vertexEditMode = false;
    removeVertexHandles();
  }

  function positionEditPanel(panel, e) {
    var workspace = document.querySelector('.garden-workspace');
    if (!workspace) return;
    var rect = workspace.getBoundingClientRect();
    var x = e.clientX - rect.left + 12;
    var y = e.clientY - rect.top + 12;

    // Sicherstellen, dass Panel im sichtbaren Bereich bleibt
    var panelRect = panel.getBoundingClientRect();
    if (x + 280 > rect.width) x = rect.width - 290;
    if (y + 300 > rect.height) y = Math.max(10, rect.height - 310);
    if (x < 0) x = 10;
    if (y < 0) y = 10;

    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  function renderAreaEditPanel(area, panel) {
    var surface = getSurfaceType(area.surfaceType);
    var title = panel.querySelector('#editPanelTitle');
    title.textContent = surface.name + ' bearbeiten';

    var body = panel.querySelector('#editPanelBody');
    var surfaceOptions = SURFACE_TYPES.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === area.surfaceType ? ' selected' : '') + '>' + s.icon + ' ' + s.name + '</option>';
    }).join('');

    body.innerHTML =
      '<label for="editAreaSurface">Fl\u00e4chentyp</label>' +
      '<select id="editAreaSurface">' + surfaceOptions + '</select>' +
      '<label for="editAreaNotes">Notizen / Label</label>' +
      '<textarea id="editAreaNotes" placeholder="Notizen eingeben..." rows="2">' + escapeText(area.notes || '') + '</textarea>' +
      '<label><input type="checkbox" id="editAreaVertices" ' + (vertexEditMode ? 'checked' : '') + '> Eckpunkte bearbeiten</label>';

    var actions = panel.querySelector('#editPanelActions');
    actions.innerHTML =
      '<button class="danger" id="editPanelDelete">L\u00f6schen</button>' +
      '<button class="primary" id="editPanelApply">\u00dcbernehmen</button>';

    // Events binden
    document.getElementById('editPanelApply').addEventListener('click', function () {
      pushUndo();
      area.surfaceType = document.getElementById('editAreaSurface').value;
      area.notes = document.getElementById('editAreaNotes').value.trim();
      renderAll();
      autoSave();
      setStatus('Fl\u00e4che aktualisiert');
    });

    document.getElementById('editPanelDelete').addEventListener('click', function () {
      closeEditPanel();
      deleteAreaById(area.id);
    });

    document.getElementById('editAreaVertices').addEventListener('change', function () {
      vertexEditMode = this.checked;
      if (vertexEditMode) {
        showVertexHandles(area);
      } else {
        removeVertexHandles();
      }
    });

    panel.querySelector('#editPanelClose').addEventListener('click', closeEditPanel);
  }

  function renderElementEditPanel(element, panel) {
    var title = panel.querySelector('#editPanelTitle');
    title.textContent = (element.icon || '') + ' ' + element.name + ' bearbeiten';

    var body = panel.querySelector('#editPanelBody');
    var scale = element.scale || 1;

    body.innerHTML =
      '<label for="editElName">Name</label>' +
      '<input type="text" id="editElName" value="' + escapeText(element.name) + '" maxlength="60" />' +
      '<label for="editElScale">Gr\u00f6\u00dfe (Skalierung)</label>' +
      '<input type="number" id="editElScale" value="' + scale + '" min="0.5" max="3" step="0.1" />' +
      '<label for="editElNotes">Notizen / Label</label>' +
      '<textarea id="editElNotes" placeholder="Notizen eingeben..." rows="2">' + escapeText(element.notes || '') + '</textarea>';

    var actions = panel.querySelector('#editPanelActions');
    actions.innerHTML =
      '<button class="danger" id="editPanelDelete">L\u00f6schen</button>' +
      '<button class="primary" id="editPanelApply">\u00dcbernehmen</button>';

    document.getElementById('editPanelApply').addEventListener('click', function () {
      pushUndo();
      element.name = document.getElementById('editElName').value.trim() || element.name;
      element.scale = parseFloat(document.getElementById('editElScale').value) || 1;
      element.notes = document.getElementById('editElNotes').value.trim();
      renderAll();
      autoSave();
      setStatus(element.name + ' aktualisiert');
    });

    document.getElementById('editPanelDelete').addEventListener('click', function () {
      closeEditPanel();
      deleteElementById(element.id);
    });

    panel.querySelector('#editPanelClose').addEventListener('click', closeEditPanel);
  }

  // Vertex-Editing: Eckpunkte anzeigen und verschiebbar machen
  function showVertexHandles(area) {
    removeVertexHandles();
    var layer = dom.layerDrawing;
    if (!area.points || area.points.length < 3) return;

    area.points.forEach(function (pt, idx) {
      var handle = createSVGElement('circle');
      handle.setAttribute('cx', pt[0]);
      handle.setAttribute('cy', pt[1]);
      handle.setAttribute('r', '5');
      handle.setAttribute('fill', 'var(--primary)');
      handle.setAttribute('stroke', 'white');
      handle.setAttribute('stroke-width', '2');
      handle.setAttribute('class', 'vertex-handle');
      handle.setAttribute('data-area-id', area.id);
      handle.setAttribute('data-vertex-idx', idx);

      handle.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        e.preventDefault();
        vertexDragState = {
          areaId: area.id,
          idx: idx,
          origPoint: [pt[0], pt[1]]
        };
        pushUndo();
      });

      layer.appendChild(handle);
    });
  }

  function removeVertexHandles() {
    var layer = dom.layerDrawing;
    if (!layer) return;
    var handles = layer.querySelectorAll('.vertex-handle');
    handles.forEach(function (h) { h.remove(); });
  }

  function handleVertexDrag(e) {
    if (!vertexDragState) return;
    var area = gardenData.layers.find(function (l) { return l.id === vertexDragState.areaId; });
    if (!area) return;

    var pt = mouseToSVG(e);
    var snapped = snapToGrid(pt, e.shiftKey);
    area.points[vertexDragState.idx] = [Math.round(snapped.x), Math.round(snapped.y)];
    renderAreas();
    showVertexHandles(area);
  }

  function endVertexDrag() {
    if (!vertexDragState) return;
    vertexDragState = null;
    autoSave();
  }

  // =====================================================
  // Save / Load (mit Server-Sync #251)
  // =====================================================

  // Debounce-Timer fuer Auto-Save
  var autoSaveTimer = null;
  var AUTO_SAVE_DELAY = 2000;

  function getAllGardens() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveGardens(gardens) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gardens));
  }

  // Server-API Aufrufe (#251)
  async function apiListGardens() {
    try {
      var res = await fetch(API_BASE + '/gardens', { credentials: 'same-origin' });
      if (!res.ok) return null;
      return res.json();
    } catch (e) { return null; }
  }

  async function apiSaveGarden(garden) {
    try {
      if (garden.serverId) {
        var res = await fetch(API_BASE + '/gardens/' + garden.serverId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name: garden.name, data: garden.data })
        });
        if (res.ok) return res.json();
      }
      // Kein serverId oder PUT fehlgeschlagen: POST
      var postRes = await fetch(API_BASE + '/gardens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: garden.name, data: garden.data })
      });
      if (postRes.ok || postRes.status === 201) return postRes.json();
      return null;
    } catch (e) { return null; }
  }

  async function apiDeleteGarden(serverId) {
    try {
      await fetch(API_BASE + '/gardens/' + serverId, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
    } catch (e) { /* Offline-Tolerant */ }
  }

  async function apiExportGarden(serverId) {
    try {
      var res = await fetch(API_BASE + '/gardens/' + serverId + '/export', { credentials: 'same-origin' });
      if (res.ok) return res.json();
      return null;
    } catch (e) { return null; }
  }

  async function apiImportGarden(gardenJson) {
    try {
      var res = await fetch(API_BASE + '/gardens/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(gardenJson)
      });
      if (res.ok || res.status === 201) return res.json();
      return null;
    } catch (e) { return null; }
  }

  function saveCurrentGarden() {
    var gardens = getAllGardens();
    var now = new Date().toISOString();

    gardenData.name = dom.gardenName.value.trim() || 'Mein Garten';

    if (currentGardenId) {
      var idx = gardens.findIndex(function (g) { return g.id === currentGardenId; });
      if (idx >= 0) {
        gardens[idx].data = cloneData(gardenData);
        gardens[idx].name = gardenData.name;
        gardens[idx].updatedAt = now;
      } else {
        currentGardenId = generateId();
        gardens.push({
          id: currentGardenId,
          name: gardenData.name,
          data: cloneData(gardenData),
          createdAt: now,
          updatedAt: now
        });
      }
    } else {
      currentGardenId = generateId();
      gardens.push({
        id: currentGardenId,
        name: gardenData.name,
        data: cloneData(gardenData),
        createdAt: now,
        updatedAt: now
      });
    }

    saveGardens(gardens);
    renderSavedGardens();
    setStatus('Garten "' + gardenData.name + '" gespeichert');

    // Server-Sync im Hintergrund (#251)
    syncGardenToServer(currentGardenId);
  }

  function autoSave() {
    if (!currentGardenId) return;

    // Sofortiges localStorage-Speichern
    var gardens = getAllGardens();
    var now = new Date().toISOString();
    gardenData.name = dom.gardenName.value.trim() || 'Mein Garten';

    var idx = gardens.findIndex(function (g) { return g.id === currentGardenId; });
    if (idx >= 0) {
      gardens[idx].data = cloneData(gardenData);
      gardens[idx].name = gardenData.name;
      gardens[idx].updatedAt = now;
      saveGardens(gardens);
    }

    // Debounced Server-Sync (#251)
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () {
      syncGardenToServer(currentGardenId);
    }, AUTO_SAVE_DELAY);
  }

  async function syncGardenToServer(localId) {
    if (!navigator.onLine) return;
    var gardens = getAllGardens();
    var garden = gardens.find(function (g) { return g.id === localId; });
    if (!garden) return;

    var result = await apiSaveGarden({
      serverId: garden.serverId || null,
      name: garden.name,
      data: garden.data
    });

    if (result && result.id) {
      // Server-ID lokal merken
      garden.serverId = result.id;
      serverGardenId = result.id;
      saveGardens(gardens);
    }
  }

  function loadGarden(id) {
    var gardens = getAllGardens();
    var garden = gardens.find(function (g) { return g.id === id; });
    if (!garden) return;

    var data = garden.data;
    if (!data.version || data.version === 1) {
      data = migrateV1toV2(data);
      garden.data = data;
      saveGardens(gardens);
    }

    gardenData = cloneData(data);
    currentGardenId = id;
    serverGardenId = garden.serverId || null;
    dom.gardenName.value = gardenData.name || 'Mein Garten';

    state.selectedElement = null;
    if (editPanelOpen) closeEditPanel();
    drawPoints = [];
    drawPreviewLine = null;
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();

    renderAll();
    renderDrawing();
    renderSavedGardens();
    setStatus('Garten "' + gardenData.name + '" geladen');
  }

  function deleteGarden(id) {
    var gardens = getAllGardens();
    var garden = gardens.find(function (g) { return g.id === id; });

    // Server-Loeschung (#251)
    if (garden && garden.serverId) {
      apiDeleteGarden(garden.serverId);
    }

    gardens = gardens.filter(function (g) { return g.id !== id; });
    saveGardens(gardens);

    if (currentGardenId === id) {
      currentGardenId = null;
      serverGardenId = null;
      gardenData = createEmptyGarden();
      dom.gardenName.value = gardenData.name;
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      renderAll();
    }

    renderSavedGardens();
    setStatus('Garten gel\u00f6scht');
  }

  function newGarden() {
    currentGardenId = null;
    serverGardenId = null;
    gardenData = createEmptyGarden();
    dom.gardenName.value = gardenData.name;
    state.selectedElement = null;
    if (editPanelOpen) closeEditPanel();
    drawPoints = [];
    drawPreviewLine = null;
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();

    renderAll();
    renderDrawing();
    renderSavedGardens();
    setStatus('Neuer Garten erstellt');
  }

  // Server-Gaerten mit localStorage synchronisieren (#251)
  async function syncGardensFromServer() {
    if (!navigator.onLine) return;
    var serverGardens = await apiListGardens();
    if (!serverGardens || !Array.isArray(serverGardens)) return;

    var localGardens = getAllGardens();
    var changed = false;

    // Server-Gaerten die lokal fehlen hinzufuegen
    serverGardens.forEach(function (sg) {
      var existing = localGardens.find(function (lg) { return lg.serverId === sg.id; });
      if (!existing) {
        // Volle Daten vom Server laden
        fetch(API_BASE + '/gardens/' + sg.id, { credentials: 'same-origin' })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (fullGarden) {
            if (!fullGarden) return;
            var gardens = getAllGardens();
            gardens.push({
              id: generateId(),
              serverId: fullGarden.id,
              name: fullGarden.name,
              data: fullGarden.data || {},
              createdAt: fullGarden.createdAt,
              updatedAt: fullGarden.updatedAt
            });
            saveGardens(gardens);
            renderSavedGardens();
          });
      }
    });

    // Lokale Gaerten ohne serverId zum Server hochladen
    localGardens.forEach(function (lg) {
      if (!lg.serverId) {
        syncGardenToServer(lg.id);
      }
    });
  }

  // JSON-Export/Import Funktionen (#251)
  function exportGardenJSON() {
    var exportData = {
      name: gardenData.name,
      data: cloneData(gardenData),
      exportedAt: new Date().toISOString()
    };
    var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (gardenData.name || 'garten') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('Garten als JSON exportiert');
  }

  function importGardenJSON() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var importedData = JSON.parse(ev.target.result);
          var name = importedData.name || 'Importierter Garten';
          var data = importedData.data || importedData;
          if (!data.version) data.version = 2;

          gardenData = cloneData(data);
          gardenData.name = name;
          currentGardenId = null;
          serverGardenId = null;
          dom.gardenName.value = name;
          saveCurrentGarden();
          renderAll();
          setStatus('Garten "' + name + '" importiert');

          // Server-Import (#251)
          apiImportGarden({ name: name, data: data });
        } catch (err) {
          setStatus('Import fehlgeschlagen: Ung\u00fcltige Datei');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // =====================================================
  // Migration v1 (grid) to v2 (SVG)
  // =====================================================
  function migrateV1toV2(oldData) {
    var newData = createEmptyGarden();
    newData.name = oldData.name || 'Migrierter Garten';

    // Grid data: cells array with { row, col, type, id, name, icon, color }
    if (oldData.cells && Array.isArray(oldData.cells)) {
      var cellSize = 48;
      oldData.cells.forEach(function (cell) {
        var element = {
          id: generateId(),
          type: 'plant',
          name: cell.name || 'Element',
          icon: cell.icon || '🌿',
          x: (cell.col || 0) * cellSize + cellSize / 2,
          y: (cell.row || 0) * cellSize + cellSize / 2,
          color: cell.color || '#E0E0E0'
        };
        newData.elements.push(element);
      });

      // Adjust canvas size based on grid
      if (oldData.gridSize) {
        newData.canvasSize.width = Math.max(DEFAULT_CANVAS.width, (oldData.gridSize.cols || 12) * cellSize + 100);
        newData.canvasSize.height = Math.max(DEFAULT_CANVAS.height, (oldData.gridSize.rows || 12) * cellSize + 100);
      }
    }

    newData.version = 2;
    return newData;
  }

  // =====================================================
  // Export-Hilfsfunktionen
  // =====================================================

  /**
   * Erzeugt einen Dateinamen mit Gartenname und aktuellem Datum.
   * Format: Gartenname_YYYY-MM-DD.ext
   */
  function buildExportFilename(ext) {
    var name = (gardenData.name || 'garten').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '');
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return name + '_' + y + '-' + m + '-' + d + '.' + ext;
  }

  /**
   * Kopiert alle <pattern>-Definitionen inline in den SVG-Klon,
   * damit die SVG-Datei ohne externe Referenzen funktioniert.
   */
  function inlinePatternsIntoClone(svgClone) {
    var clonedDefs = svgClone.querySelector('#svgDefs') || svgClone.querySelector('defs');
    if (!clonedDefs) {
      clonedDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svgClone.insertBefore(clonedDefs, svgClone.firstChild);
    }
    // Kopiere Pattern-Definitionen aus dem Original-SVG
    var originalDefs = dom.svgDefs;
    if (originalDefs) {
      var patterns = originalDefs.querySelectorAll('pattern');
      patterns.forEach(function (pattern) {
        var existing = clonedDefs.querySelector('#' + pattern.id);
        if (!existing) {
          clonedDefs.appendChild(pattern.cloneNode(true));
        }
      });
    }
  }

  // =====================================================
  // Export (SVG to PNG)
  // =====================================================
  function exportPNG() {
    setStatus('Exportiere als PNG...');

    var svgClone = dom.canvas.cloneNode(true);
    // Reset viewBox to full canvas
    svgClone.setAttribute('viewBox', '0 0 ' + gardenData.canvasSize.width + ' ' + gardenData.canvasSize.height);
    svgClone.setAttribute('width', gardenData.canvasSize.width);
    svgClone.setAttribute('height', gardenData.canvasSize.height);

    // Remove drawing layer from clone
    var drawLayer = svgClone.querySelector('#layerDrawing');
    if (drawLayer) drawLayer.innerHTML = '';

    // Inline patterns for correct rendering
    inlinePatternsIntoClone(svgClone);

    // Inline styles for export
    var allElements = svgClone.querySelectorAll('*');
    allElements.forEach(function (el) {
      var cs = window.getComputedStyle(el);
      if (el.tagName === 'polygon' || el.tagName === 'circle' || el.tagName === 'line' || el.tagName === 'rect' || el.tagName === 'text' || el.tagName === 'path') {
        // These elements need computed fills and strokes
      }
    });

    var svgData = new XMLSerializer().serializeToString(svgClone);
    var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(svgBlob);

    var filename = buildExportFilename('png');
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = gardenData.canvasSize.width;
      canvas.height = gardenData.canvasSize.height;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#F5F3EE';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        setStatus('PNG exportiert: ' + filename);
      }, 'image/png');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setStatus('Export fehlgeschlagen');
    };
    img.src = url;
  }

  // =====================================================
  // Export (SVG)
  // =====================================================
  function exportSVG() {
    setStatus('Exportiere als SVG...');

    var svgClone = dom.canvas.cloneNode(true);
    svgClone.setAttribute('viewBox', '0 0 ' + gardenData.canvasSize.width + ' ' + gardenData.canvasSize.height);
    svgClone.setAttribute('width', gardenData.canvasSize.width);
    svgClone.setAttribute('height', gardenData.canvasSize.height);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Remove drawing layer and grid layer from clone
    var drawLayer = svgClone.querySelector('#layerDrawing');
    if (drawLayer) drawLayer.innerHTML = '';
    var gridLayer = svgClone.querySelector('#layerGrid');
    if (gridLayer) gridLayer.innerHTML = '';

    // Inline alle Pattern-Definitionen fuer saubere SVG-Ausgabe
    inlinePatternsIntoClone(svgClone);

    // Add background rect
    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', gardenData.canvasSize.width);
    bg.setAttribute('height', gardenData.canvasSize.height);
    bg.setAttribute('fill', '#F5F3EE');
    var content = svgClone.querySelector('#canvasContent');
    if (content) content.insertBefore(bg, content.firstChild);

    // Inline styles for clean SVG output
    var allElements = svgClone.querySelectorAll('*');
    allElements.forEach(function (el) {
      var cs = window.getComputedStyle(el);
      if (el.tagName === 'polygon' || el.tagName === 'circle' || el.tagName === 'line' || el.tagName === 'rect' || el.tagName === 'text' || el.tagName === 'path') {
        if (cs.fill && cs.fill !== 'none') el.setAttribute('fill', cs.fill);
        if (cs.stroke && cs.stroke !== 'none') el.setAttribute('stroke', cs.stroke);
        if (cs.strokeWidth) el.setAttribute('stroke-width', cs.strokeWidth);
        if (cs.fontSize) el.setAttribute('font-size', cs.fontSize);
        if (cs.fontFamily) el.setAttribute('font-family', cs.fontFamily);
        if (cs.textAnchor) el.setAttribute('text-anchor', cs.textAnchor);
      }
    });

    var filename = buildExportFilename('svg');
    var svgData = new XMLSerializer().serializeToString(svgClone);
    var blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('SVG exportiert: ' + filename);
  }

  // =====================================================
  // Sidebar Rendering
  // =====================================================
  function renderSurfacePalette() {
    var container = dom.surfacePalette;
    container.innerHTML = '';

    SURFACE_TYPES.forEach(function (surface) {
      var item = document.createElement('div');
      item.className = 'surface-item';
      if (state.selectedSurface === surface.id) {
        item.classList.add('active');
      }
      item.dataset.surface = surface.id;

      var swatch = document.createElement('span');
      swatch.className = 'surface-swatch';
      swatch.style.backgroundColor = surface.color;
      item.appendChild(swatch);

      var label = document.createElement('span');
      label.className = 'surface-label';
      label.textContent = surface.name;
      item.appendChild(label);

      item.addEventListener('click', function () {
        state.selectedSurface = surface.id;
        renderSurfacePalette();

        // Auto-switch to draw tool
        if (state.tool !== 'draw') {
          setTool('draw');
        }
        updateStatusForTool();
      });

      container.appendChild(item);
    });
  }

  // =====================================================
  // Pflanzen-API Integration (#247)
  // =====================================================

  /**
   * Mappt eine API-Pflanze auf das interne Format fuer die Palette.
   * Felder wie color und info werden aus den API-Daten generiert.
   */
  function mapApiPlantToInternal(apiPlant) {
    var sunLabels = { full: 'Sonnig', partial: 'Halbschatten', shade: 'Schatten' };
    var seasonLabels = { spring: 'Fr\u00fchl.', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };
    var sunText = sunLabels[apiPlant.sun] || apiPlant.sun || '';
    var seasonText = (apiPlant.season || []).map(function (s) { return seasonLabels[s] || s; }).join(', ');
    var infoText = sunText + (seasonText ? ', ' + seasonText : '');

    // Farbe aus Kategorie oder Difficulty ableiten
    var colorMap = {
      'Gem\u00fcse': '#C8E6C9',
      'Kr\u00e4uter': '#F0F4C3',
      'Obst': '#FFCDD2',
      'Blumen': '#FFE0B2',
      'Stauden': '#D1C4E9',
      'B\u00e4ume': '#BCAAA4'
    };
    var color = colorMap[apiPlant.category] || '#E0E0E0';

    return {
      id: apiPlant.id,
      name: apiPlant.name,
      icon: apiPlant.icon || '\u{1F33F}',
      color: color,
      info: infoText,
      category: apiPlant.category || '',
      difficulty: apiPlant.difficulty || '',
      sun: apiPlant.sun || '',
      water: apiPlant.water || '',
      season: apiPlant.season || [],
      spacing: apiPlant.spacing || '',
      companions: apiPlant.companions || [],
      avoid: apiPlant.avoid || [],
      tips: apiPlant.tips || ''
    };
  }

  /**
   * Laedt Pflanzen von der API. Bei Fehler wird der Fallback verwendet.
   */
  async function loadPlantsFromApi() {
    try {
      var res = await fetch(API_BASE + '/plants');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('Keine Pflanzen');
      PLANTS = data.map(mapApiPlantToInternal);
    } catch (err) {
      console.warn('Pflanzen-API nicht erreichbar, verwende Fallback:', err.message);
      PLANTS = FALLBACK_PLANTS;
    }
  }

  /**
   * Laedt Kategorien von der API.
   */
  async function loadPlantCategoriesFromApi() {
    try {
      var res = await fetch(API_BASE + '/plant-categories');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (Array.isArray(data)) {
        plantCategories = data;
      }
    } catch (err) {
      // Kategorien aus den geladenen Pflanzen ableiten
      var cats = {};
      PLANTS.forEach(function (p) {
        if (p.category) cats[p.category] = true;
      });
      plantCategories = Object.keys(cats).sort();
    }
  }

  // Favoriten-System (kompatibel mit plants.js)
  function getPlantFavorites() {
    try {
      var stored = localStorage.getItem('plant_favorites');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  function savePlantFavorites(favorites) {
    localStorage.setItem('plant_favorites', JSON.stringify(favorites));
  }

  function togglePlantFavorite(plantId) {
    var favorites = getPlantFavorites();
    var index = favorites.indexOf(plantId);
    if (index === -1) {
      favorites.push(plantId);
    } else {
      favorites.splice(index, 1);
    }
    savePlantFavorites(favorites);
    return index === -1; // true wenn jetzt Favorit
  }

  /**
   * Rendert die Kategorie-Filter-Buttons.
   */
  function renderPlantCategoryFilters() {
    var container = dom.plantCategoryFilters;
    if (!container) return;
    container.innerHTML = '';

    // Alle-Button
    var allBtn = document.createElement('button');
    allBtn.className = 'plant-category-btn' + (currentPlantCategory === '' ? ' active' : '');
    allBtn.textContent = 'Alle';
    allBtn.addEventListener('click', function () {
      currentPlantCategory = '';
      renderPlantCategoryFilters();
      renderPlantPalette(dom.plantSearch ? dom.plantSearch.value : '');
    });
    container.appendChild(allBtn);

    plantCategories.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.className = 'plant-category-btn' + (currentPlantCategory === cat ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', function () {
        currentPlantCategory = cat;
        renderPlantCategoryFilters();
        renderPlantPalette(dom.plantSearch ? dom.plantSearch.value : '');
      });
      container.appendChild(btn);
    });
  }

  /**
   * Baut den Tooltip-Text fuer eine Pflanze zusammen.
   */
  function buildPlantTooltipHtml(plant) {
    var diffLabels = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwer' };
    var sunLabels = { full: 'Volle Sonne', partial: 'Halbschatten', shade: 'Schatten' };
    var waterLabels = { low: 'Wenig', medium: 'Mittel', high: 'Viel' };
    var seasonLabels = { spring: 'Fr\u00fchling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };

    var html = '<div class="plant-tooltip-title">' + escapeText(plant.name) + '</div>';
    html += '<dl class="plant-tooltip-props">';
    if (plant.category) {
      html += '<dt>Kategorie</dt><dd>' + escapeText(plant.category) + '</dd>';
    }
    if (plant.difficulty) {
      html += '<dt>Schwierigkeit</dt><dd>' + escapeText(diffLabels[plant.difficulty] || plant.difficulty) + '</dd>';
    }
    if (plant.sun) {
      html += '<dt>Sonne</dt><dd>' + escapeText(sunLabels[plant.sun] || plant.sun) + '</dd>';
    }
    if (plant.water) {
      html += '<dt>Wasser</dt><dd>' + escapeText(waterLabels[plant.water] || plant.water) + '</dd>';
    }
    if (plant.season && plant.season.length > 0) {
      var seasons = plant.season.map(function (s) { return seasonLabels[s] || s; }).join(', ');
      html += '<dt>Saison</dt><dd>' + escapeText(seasons) + '</dd>';
    }
    if (plant.spacing) {
      html += '<dt>Abstand</dt><dd>' + escapeText(plant.spacing) + '</dd>';
    }
    if (plant.companions && plant.companions.length > 0) {
      html += '<dt>Gute Nachbarn</dt><dd>' + escapeText(plant.companions.join(', ')) + '</dd>';
    }
    html += '</dl>';
    return html;
  }

  /**
   * Einfaches HTML-Escaping fuer Tooltip-Texte.
   */
  function escapeText(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Zeigt den Pflanzen-Tooltip an einer bestimmten Position.
   */
  function showPlantTooltip(plant, referenceEl) {
    var tooltip = dom.plantTooltip;
    if (!tooltip) return;
    tooltip.innerHTML = buildPlantTooltipHtml(plant);
    tooltip.classList.add('visible');

    // Position relativ zum Element
    var rect = referenceEl.getBoundingClientRect();
    var sidebarRect = dom.sidebar ? dom.sidebar.getBoundingClientRect() : { left: 0 };
    tooltip.style.left = (rect.right - sidebarRect.left + 8) + 'px';
    tooltip.style.top = (rect.top - sidebarRect.top) + 'px';
  }

  function hidePlantTooltip() {
    var tooltip = dom.plantTooltip;
    if (tooltip) {
      tooltip.classList.remove('visible');
    }
  }

  function renderPlantPalette(filter) {
    var container = dom.plantPalette;
    container.innerHTML = '';

    var filtered = PLANTS;

    // Kategorie-Filter
    if (currentPlantCategory) {
      filtered = filtered.filter(function (p) {
        return p.category === currentPlantCategory;
      });
    }

    // Text-Suche
    if (filter) {
      var f = filter.toLowerCase();
      filtered = filtered.filter(function (p) {
        return p.name.toLowerCase().indexOf(f) !== -1 ||
               (p.category && p.category.toLowerCase().indexOf(f) !== -1);
      });
    }

    // Favoriten-Filter
    if (showPlantFavoritesOnly) {
      var favs = getPlantFavorites();
      filtered = filtered.filter(function (p) {
        return favs.indexOf(p.id) !== -1;
      });
    }

    if (filtered.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'saved-gardens-empty';
      empty.textContent = 'Keine Pflanzen gefunden';
      container.appendChild(empty);
      return;
    }

    var favorites = getPlantFavorites();

    filtered.forEach(function (plant) {
      var el = document.createElement('div');
      el.className = 'palette-element';
      if (state.selectedPlant && state.selectedPlant.id === plant.id) {
        el.classList.add('active');
      }

      var icon = document.createElement('span');
      icon.className = 'palette-element-icon';
      icon.style.backgroundColor = plant.color;
      icon.textContent = plant.icon;
      el.appendChild(icon);

      var info = document.createElement('div');
      info.className = 'palette-element-info';

      var name = document.createElement('span');
      name.className = 'palette-element-name';
      name.textContent = plant.name;
      info.appendChild(name);

      var detail = document.createElement('span');
      detail.className = 'palette-element-detail';
      detail.textContent = plant.info;
      info.appendChild(detail);

      el.appendChild(info);

      // Favoriten-Button
      var isFav = favorites.indexOf(plant.id) !== -1;
      var favBtn = document.createElement('button');
      favBtn.className = 'palette-element-fav' + (isFav ? ' active' : '');
      favBtn.innerHTML = '&#9829;';
      favBtn.title = isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzuf\u00fcgen';
      favBtn.setAttribute('aria-label', favBtn.title);
      favBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var nowFav = togglePlantFavorite(plant.id);
        favBtn.classList.toggle('active', nowFav);
        favBtn.title = nowFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzuf\u00fcgen';
        favBtn.setAttribute('aria-label', favBtn.title);
        // Wenn Favoriten-Filter aktiv und gerade entfernt: Palette neu rendern
        if (showPlantFavoritesOnly && !nowFav) {
          renderPlantPalette(dom.plantSearch ? dom.plantSearch.value : '');
        }
      });
      el.appendChild(favBtn);

      // Tooltip bei Hover
      el.addEventListener('mouseenter', function () {
        showPlantTooltip(plant, el);
      });
      el.addEventListener('mouseleave', function () {
        hidePlantTooltip();
      });

      el.addEventListener('click', function () {
        if (state.selectedPlant && state.selectedPlant.id === plant.id) {
          deselectPlantStructure();
          updateStatusForTool();
          return;
        }
        deselectPlantStructure();
        state.selectedPlant = plant;
        el.classList.add('active');
        setTool('select');
        setStatus('Klicke auf den Canvas, um ' + plant.name + ' zu platzieren');
      });

      container.appendChild(el);
    });
  }

  function renderStructurePalette() {
    var container = dom.structurePalette;
    container.innerHTML = '';

    STRUCTURES.forEach(function (structure) {
      var el = document.createElement('div');
      el.className = 'palette-element';
      if (state.selectedStructure && state.selectedStructure.id === structure.id) {
        el.classList.add('active');
      }

      var icon = document.createElement('span');
      icon.className = 'palette-element-icon';
      icon.style.backgroundColor = structure.color;
      icon.textContent = structure.icon;
      el.appendChild(icon);

      var info = document.createElement('div');
      info.className = 'palette-element-info';

      var name = document.createElement('span');
      name.className = 'palette-element-name';
      name.textContent = structure.name;
      info.appendChild(name);

      el.appendChild(info);

      el.addEventListener('click', function () {
        if (state.selectedStructure && state.selectedStructure.id === structure.id) {
          deselectPlantStructure();
          updateStatusForTool();
          return;
        }
        deselectPlantStructure();
        state.selectedStructure = structure;
        el.classList.add('active');
        setTool('select');
        setStatus('Klicke auf den Canvas, um ' + structure.name + ' zu platzieren');
      });

      container.appendChild(el);
    });
  }

  function renderSavedGardens() {
    var container = dom.savedGardensList;
    container.innerHTML = '';

    var gardens = getAllGardens();

    if (gardens.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'saved-gardens-empty';
      empty.textContent = 'Keine gespeicherten Gärten';
      container.appendChild(empty);
    } else {
      gardens.forEach(function (garden) {
        var item = document.createElement('div');
        item.className = 'saved-garden-item';
        if (currentGardenId === garden.id) {
          item.classList.add('active');
        }

        var infoDiv = document.createElement('div');
        infoDiv.style.minWidth = '0';

        var nameDiv = document.createElement('div');
        nameDiv.className = 'saved-garden-name';
        nameDiv.textContent = garden.name || 'Unbenannt';
        infoDiv.appendChild(nameDiv);

        var metaDiv = document.createElement('div');
        metaDiv.className = 'saved-garden-meta';
        metaDiv.textContent = new Date(garden.updatedAt).toLocaleDateString('de-DE');
        infoDiv.appendChild(metaDiv);

        item.appendChild(infoDiv);

        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'saved-garden-delete';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Löschen';
        deleteBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          gardenConfirm('Garten l\u00f6schen', 'Garten "' + (garden.name || 'Unbenannt') + '" wirklich l\u00f6schen? Diese Aktion kann nicht r\u00fcckg\u00e4ngig gemacht werden.').then(function (ok) {
            if (ok) deleteGarden(garden.id);
          });
        });
        item.appendChild(deleteBtn);

        item.addEventListener('click', function () {
          loadGarden(garden.id);
        });

        container.appendChild(item);
      });
    }

    // New garden button
    var newBtn = document.createElement('button');
    newBtn.className = 'saved-garden-new-btn';
    newBtn.textContent = '+ Neuer Garten';
    newBtn.addEventListener('click', function () {
      newGarden();
    });
    container.appendChild(newBtn);
  }

  // =====================================================
  // Theme Toggle
  // =====================================================
  function initTheme() {
    var themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    var savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    themeToggle.addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
      }
    });
  }

  // =====================================================
  // Keyboard
  // =====================================================
  function initKeyboard() {
    document.addEventListener('keydown', function (e) {
      // Don't handle when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      switch (e.key) {
        case 'v':
        case 'V':
          setTool('select');
          break;
        case 'd':
        case 'D':
          setTool('draw');
          break;
        case 'm':
        case 'M':
          setTool('move');
          break;
        case 'x':
        case 'X':
          setTool('delete');
          break;
        case 'Escape':
          if (editPanelOpen) {
            closeEditPanel();
          } else if (drawPoints.length > 0) {
            drawPoints = [];
            drawPreviewLine = null;
            renderDrawing();
            setStatus('Zeichnung abgebrochen');
          } else {
            state.selectedElement = null;
            deselectPlantStructure();
            renderAll();
            setStatus('Auswahl aufgehoben');
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (state.selectedElement) {
            // Delete selected element
            var isArea = gardenData.layers.some(function (l) { return l.id === state.selectedElement; });
            if (isArea) {
              deleteAreaById(state.selectedElement);
            } else {
              deleteElementById(state.selectedElement);
            }
          }
          break;
        case 'z':
        case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;
        case 'y':
        case 'Y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            redo();
          }
          break;
        case 's':
        case 'S':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            saveCurrentGarden();
          }
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomReset();
          }
          break;
        case 'g':
        case 'G':
          state.gridVisible = !state.gridVisible;
          renderAll();
          setStatus('Raster ' + (state.gridVisible ? 'eingeblendet' : 'ausgeblendet'));
          break;
        case '?':
          var helpOv = document.getElementById('gardenHelpOverlay');
          if (helpOv) {
            helpOv.style.display = helpOv.style.display === 'flex' ? 'none' : 'flex';
          }
          break;
      }
    });
  }

  // =====================================================
  // Sidebar Toggle (mobile)
  // =====================================================
  function initSidebarToggle() {
    var toggle = document.getElementById('sidebarToggle');
    if (!toggle) return;

    toggle.addEventListener('click', function () {
      dom.sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking canvas on mobile
    dom.canvasArea.addEventListener('click', function (e) {
      if (dom.sidebar.classList.contains('open') && window.innerWidth <= 900) {
        dom.sidebar.classList.remove('open');
      }
    });
  }

  // Hamburger nav toggle
  function initHamburgerNav() {
    var hamburger = document.getElementById('hamburgerBtn');
    var navContainer = document.querySelector('.garden-app .nav-container');
    if (!hamburger || !navContainer) return;

    hamburger.addEventListener('click', function () {
      navContainer.classList.toggle('nav-open');
      var expanded = navContainer.classList.contains('nav-open');
      hamburger.setAttribute('aria-expanded', expanded);
    });
  }

  // =====================================================
  // Init
  // =====================================================
  function cacheDom() {
    dom.canvas = document.getElementById('gardenCanvas');
    dom.canvasArea = document.getElementById('gardenCanvasArea');
    dom.canvasContent = document.getElementById('canvasContent');
    dom.svgDefs = document.getElementById('svgDefs');
    dom.layerAreas = document.getElementById('layerAreas');
    dom.layerElements = document.getElementById('layerElements');
    dom.layerDrawing = document.getElementById('layerDrawing');
    dom.gardenName = document.getElementById('gardenNameInput');
    dom.sidebar = document.getElementById('gardenSidebar');
    dom.surfacePalette = document.getElementById('surfacePalette');
    dom.plantPalette = document.getElementById('plantPalette');
    dom.structurePalette = document.getElementById('structurePalette');
    dom.savedGardensList = document.getElementById('savedGardensList');
    dom.plantSearch = document.getElementById('plantSearch');
    dom.plantCategoryFilters = document.getElementById('plantCategoryFilters');
    dom.plantFavoritesToggle = document.getElementById('plantFavoritesToggle');

    // Tooltip-Element fuer Pflanzen dynamisch erstellen
    var tooltipEl = document.createElement('div');
    tooltipEl.className = 'plant-tooltip';
    tooltipEl.id = 'gardenPlantTooltip';
    if (dom.sidebar) {
      dom.sidebar.style.position = 'relative';
      dom.sidebar.appendChild(tooltipEl);
    }
    dom.plantTooltip = tooltipEl;
    dom.statusText = document.getElementById('statusText');
    dom.statusAreas = document.getElementById('statusAreas');
    dom.statusElements = document.getElementById('statusElements');
    dom.zoomLevel = document.getElementById('zoomLevel');
    dom.undoBtn = document.getElementById('undoBtn');
    dom.redoBtn = document.getElementById('redoBtn');
    dom.layerGrid = document.getElementById('layerGrid');
    dom.rulerTop = document.getElementById('rulerTop');
    dom.rulerLeft = document.getElementById('rulerLeft');
    dom.rulerCorner = document.getElementById('rulerCorner');
    dom.tooltip = document.getElementById('gardenTooltip');
    dom.gridScaleSelect = document.getElementById('gridScaleSelect');
    dom.statusCanvasSize = document.getElementById('statusCanvasSize');
    dom.editPanel = document.getElementById('gardenEditPanel');
  }

  function bindEvents() {
    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTool(btn.dataset.tool);
      });
    });

    // Canvas events
    dom.canvasArea.addEventListener('click', onCanvasClick);
    dom.canvasArea.addEventListener('mousemove', onCanvasMouseMove);
    dom.canvasArea.addEventListener('mouseup', onCanvasMouseUp);
    dom.canvasArea.addEventListener('dblclick', onCanvasDblClick);
    dom.canvasArea.addEventListener('wheel', onCanvasWheel, { passive: false });

    // Prevent context menu on canvas
    dom.canvasArea.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    // Header buttons
    dom.undoBtn.addEventListener('click', undo);
    dom.redoBtn.addEventListener('click', redo);
    document.getElementById('saveBtn').addEventListener('click', saveCurrentGarden);
    // Export dropdown
    var exportBtn = document.getElementById('exportBtn');
    var exportMenu = document.getElementById('exportMenu');
    if (exportBtn && exportMenu) {
      exportBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
      });
      exportMenu.querySelectorAll('.export-menu-item').forEach(function (item) {
        item.addEventListener('click', function () {
          exportMenu.style.display = 'none';
          if (this.dataset.format === 'png') exportPNG();
          else if (this.dataset.format === 'svg') exportSVG();
          else if (this.dataset.format === 'json') exportGardenJSON();
          else if (this.dataset.format === 'import') importGardenJSON();
        });
      });
      // Close menu on outside click
      document.addEventListener('click', function () {
        exportMenu.style.display = 'none';
      });
    }

    // Zoom buttons
    document.getElementById('zoomIn').addEventListener('click', zoomIn);
    document.getElementById('zoomOut').addEventListener('click', zoomOut);
    document.getElementById('zoomReset').addEventListener('click', zoomReset);

    // Plant search
    dom.plantSearch.addEventListener('input', function () {
      renderPlantPalette(this.value);
    });

    // Garden name auto-save
    dom.gardenName.addEventListener('change', function () {
      gardenData.name = this.value.trim() || 'Mein Garten';
      autoSave();
      renderSavedGardens();
    });

    // Grid scale change
    if (dom.gridScaleSelect) {
      dom.gridScaleSelect.value = String(state.gridScale);
      dom.gridScaleSelect.addEventListener('change', function () {
        state.gridScale = parseFloat(this.value);
        localStorage.setItem('gardenplanner_gridScale', String(state.gridScale));
        initPatterns();
        renderAll();
      });
    }

    // Help button
    var helpBtn = document.getElementById('helpBtn');
    var helpOverlay = document.getElementById('gardenHelpOverlay');
    var helpCloseBtn = document.getElementById('helpCloseBtn');
    if (helpBtn && helpOverlay) {
      helpBtn.addEventListener('click', function () {
        helpOverlay.style.display = 'flex';
      });
      helpCloseBtn.addEventListener('click', function () {
        helpOverlay.style.display = 'none';
      });
      helpOverlay.addEventListener('click', function (e) {
        if (e.target === helpOverlay) helpOverlay.style.display = 'none';
      });
    }

    // Global mouseup for drag end
    document.addEventListener('mouseup', function () {
      if (dragState) endDrag();
    });
  }

  function loadLastGarden() {
    var gardens = getAllGardens();
    if (gardens.length > 0) {
      // Load most recently updated
      gardens.sort(function (a, b) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
      loadGarden(gardens[0].id);
    }
  }

  async function init() {
    cacheDom();

    // Restore grid scale
    var savedScale = localStorage.getItem('gardenplanner_gridScale');
    if (savedScale && GRID_SCALES.indexOf(parseFloat(savedScale)) !== -1) {
      state.gridScale = parseFloat(savedScale);
      if (dom.gridScaleSelect) dom.gridScaleSelect.value = String(state.gridScale);
    }

    initTheme();
    initPatterns();
    initKeyboard();
    initSidebarToggle();
    initHamburgerNav();
    bindEvents();

    // Pflanzen von API laden (mit Fallback auf hardcodierte Liste)
    await loadPlantsFromApi();
    await loadPlantCategoriesFromApi();

    // Favoriten-Toggle binden
    if (dom.plantFavoritesToggle) {
      dom.plantFavoritesToggle.addEventListener('click', function () {
        showPlantFavoritesOnly = !showPlantFavoritesOnly;
        dom.plantFavoritesToggle.classList.toggle('active', showPlantFavoritesOnly);
        dom.plantFavoritesToggle.setAttribute('aria-pressed', String(showPlantFavoritesOnly));
        renderPlantPalette(dom.plantSearch ? dom.plantSearch.value : '');
      });
    }

    // Render sidebars
    renderSurfacePalette();
    renderPlantCategoryFilters();
    renderPlantPalette();
    renderStructurePalette();
    renderSavedGardens();

    // Load last garden or show empty
    loadLastGarden();
    window.addEventListener('resize', function () { renderRulers(); });
    renderAll();

    // Gaerten vom Server synchronisieren (#251)
    syncGardensFromServer();

    setStatus('Bereit \u2014 W\u00e4hle ein Werkzeug oder platziere Pflanzen');
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
