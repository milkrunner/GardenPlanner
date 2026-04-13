/**
 * Garden Planner - Canvas Module
 * SVG-Rendering, Patterns, Grid, Rulers, Zoom, Pan, renderAll()
 *
 * Abhaengig von: garden-core.js (window.GP)
 *
 * SECURITY NOTE: innerHTML usage in this module operates on trusted internal data only
 * (SVG pattern definitions, layer clearing, numeric coordinates from garden state).
 * No untrusted user input is injected via innerHTML. All user-facing text uses
 * textContent or GP.escapeText() for proper sanitization.
 */
(function () {
  'use strict';

  var GP = window.GP;

  // =====================================================
  // SVG Patterns
  // =====================================================
  GP.initPatterns = function () {
    var defs = GP.dom.svgDefs;
    // Clear existing pattern definitions (trusted SVG defs only)
    defs.innerHTML = '';

    // Grid pattern
    GP.addPattern(defs, 'pattern-grid', GP.PIXELS_PER_GRID, GP.PIXELS_PER_GRID, 'transparent', function (p) {
      var line1 = GP.createSVGElement('line');
      line1.setAttribute('x1', '0');
      line1.setAttribute('y1', '0');
      line1.setAttribute('x2', String(GP.PIXELS_PER_GRID));
      line1.setAttribute('y2', '0');
      line1.setAttribute('stroke', 'rgba(0,0,0,0.07)');
      line1.setAttribute('stroke-width', '0.5');
      p.appendChild(line1);
      var line2 = GP.createSVGElement('line');
      line2.setAttribute('x1', '0');
      line2.setAttribute('y1', '0');
      line2.setAttribute('x2', '0');
      line2.setAttribute('y2', String(GP.PIXELS_PER_GRID));
      line2.setAttribute('stroke', 'rgba(0,0,0,0.07)');
      line2.setAttribute('stroke-width', '0.5');
      p.appendChild(line2);
    });

    // Bed pattern - soil dots
    GP.addPattern(defs, 'pattern-bed', 12, 12, '#8B6F47', function (p) {
      var c1 = GP.createSVGElement('circle');
      c1.setAttribute('cx', '3');
      c1.setAttribute('cy', '3');
      c1.setAttribute('r', '1.2');
      c1.setAttribute('fill', '#7A5F3A');
      p.appendChild(c1);
      var c2 = GP.createSVGElement('circle');
      c2.setAttribute('cx', '9');
      c2.setAttribute('cy', '9');
      c2.setAttribute('r', '1');
      c2.setAttribute('fill', '#6B5030');
      p.appendChild(c2);
    });

    // Lawn pattern - grass lines
    GP.addPattern(defs, 'pattern-lawn', 10, 10, '#6BAF5B', function (p) {
      var l = GP.createSVGElement('line');
      l.setAttribute('x1', '2');
      l.setAttribute('y1', '8');
      l.setAttribute('x2', '3');
      l.setAttribute('y2', '2');
      l.setAttribute('stroke', '#5A9E4A');
      l.setAttribute('stroke-width', '1');
      p.appendChild(l);
      var l2 = GP.createSVGElement('line');
      l2.setAttribute('x1', '7');
      l2.setAttribute('y1', '9');
      l2.setAttribute('x2', '8');
      l2.setAttribute('y2', '4');
      l2.setAttribute('stroke', '#4E8E3E');
      l2.setAttribute('stroke-width', '0.8');
      p.appendChild(l2);
    });

    // Gravel pattern - small circles
    GP.addPattern(defs, 'pattern-gravel', 8, 8, '#B0A896', function (p) {
      var c1 = GP.createSVGElement('circle');
      c1.setAttribute('cx', '2');
      c1.setAttribute('cy', '2');
      c1.setAttribute('r', '1.5');
      c1.setAttribute('fill', '#A09886');
      p.appendChild(c1);
      var c2 = GP.createSVGElement('circle');
      c2.setAttribute('cx', '6');
      c2.setAttribute('cy', '6');
      c2.setAttribute('r', '1.2');
      c2.setAttribute('fill', '#C0B8A6');
      p.appendChild(c2);
    });

    // Path pattern - bricks
    GP.addPattern(defs, 'pattern-path', 16, 8, '#A09080', function (p) {
      var r1 = GP.createSVGElement('rect');
      r1.setAttribute('x', '0');
      r1.setAttribute('y', '0');
      r1.setAttribute('width', '7');
      r1.setAttribute('height', '3.5');
      r1.setAttribute('fill', '#B09E8E');
      r1.setAttribute('rx', '0.5');
      p.appendChild(r1);
      var r2 = GP.createSVGElement('rect');
      r2.setAttribute('x', '8');
      r2.setAttribute('y', '0');
      r2.setAttribute('width', '7');
      r2.setAttribute('height', '3.5');
      r2.setAttribute('fill', '#968474');
      r2.setAttribute('rx', '0.5');
      p.appendChild(r2);
      var r3 = GP.createSVGElement('rect');
      r3.setAttribute('x', '4');
      r3.setAttribute('y', '4.5');
      r3.setAttribute('width', '7');
      r3.setAttribute('height', '3.5');
      r3.setAttribute('fill', '#B09E8E');
      r3.setAttribute('rx', '0.5');
      p.appendChild(r3);
    });

    // Water pattern - waves
    GP.addPattern(defs, 'pattern-water', 20, 10, '#5B9BD5', function (p) {
      var path = GP.createSVGElement('path');
      path.setAttribute('d', 'M0 5 Q5 2, 10 5 T20 5');
      path.setAttribute('stroke', '#4A8AC4');
      path.setAttribute('stroke-width', '1.2');
      path.setAttribute('fill', 'none');
      p.appendChild(path);
    });

    // Terrace pattern - tiles
    GP.addPattern(defs, 'pattern-terrace', 14, 14, '#8C7B6B', function (p) {
      var r1 = GP.createSVGElement('rect');
      r1.setAttribute('x', '0.5');
      r1.setAttribute('y', '0.5');
      r1.setAttribute('width', '6');
      r1.setAttribute('height', '6');
      r1.setAttribute('fill', '#9C8B7B');
      r1.setAttribute('rx', '1');
      p.appendChild(r1);
      var r2 = GP.createSVGElement('rect');
      r2.setAttribute('x', '7.5');
      r2.setAttribute('y', '7.5');
      r2.setAttribute('width', '6');
      r2.setAttribute('height', '6');
      r2.setAttribute('fill', '#9C8B7B');
      r2.setAttribute('rx', '1');
      p.appendChild(r2);
    });
  };

  GP.addPattern = function (defs, id, w, h, bgColor, addChildren) {
    var pattern = GP.createSVGElement('pattern');
    pattern.setAttribute('id', id);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', w);
    pattern.setAttribute('height', h);

    var bg = GP.createSVGElement('rect');
    bg.setAttribute('width', w);
    bg.setAttribute('height', h);
    bg.setAttribute('fill', bgColor);
    pattern.appendChild(bg);

    addChildren(pattern);
    defs.appendChild(pattern);
  };

  // =====================================================
  // Grid Rendering
  // =====================================================
  GP.renderGrid = function () {
    var layer = GP.dom.layerGrid;
    if (!layer) return;
    // Clear grid layer (internal SVG elements only)
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    if (!GP.state.gridVisible) return;

    var w = GP.gardenData.canvasSize.width;
    var h = GP.gardenData.canvasSize.height;
    var rect = GP.createSVGElement('rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('fill', 'url(#pattern-grid)');
    layer.appendChild(rect);
  };

  // =====================================================
  // Rulers
  // =====================================================
  GP.renderRulers = function () {
    GP.renderRulerTop();
    GP.renderRulerLeft();
    GP.renderRulerCorner();
  };

  GP.renderRulerTop = function () {
    var canvas = GP.dom.rulerTop;
    if (!canvas) return;
    var parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.offsetWidth - 32;
    var ctx = canvas.getContext('2d');
    var h = canvas.height;
    var ppm = GP.pixelsPerMeter();

    ctx.fillStyle = '#365E3D';
    ctx.fillRect(0, 0, canvas.width, h);

    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';

    var offsetPx = GP.state.panX * GP.state.zoom;
    var meterStep = GP.getRulerStep();

    var startM = Math.floor(-offsetPx / (ppm * GP.state.zoom) / meterStep) * meterStep;
    var endM = Math.ceil((canvas.width - offsetPx) / (ppm * GP.state.zoom) / meterStep) * meterStep;

    for (var m = startM; m <= endM; m += meterStep) {
      var x = m * ppm * GP.state.zoom + offsetPx;
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
  };

  GP.renderRulerLeft = function () {
    var canvas = GP.dom.rulerLeft;
    if (!canvas) return;
    var parent = canvas.parentElement;
    if (!parent) return;
    canvas.height = parent.offsetHeight - 24;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var ppm = GP.pixelsPerMeter();

    ctx.fillStyle = '#365E3D';
    ctx.fillRect(0, 0, w, canvas.height);

    ctx.strokeStyle = 'white';
    ctx.fillStyle = 'white';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';

    var offsetPx = GP.state.panY * GP.state.zoom;
    var meterStep = GP.getRulerStep();

    var startM = Math.floor(-offsetPx / (ppm * GP.state.zoom) / meterStep) * meterStep;
    var endM = Math.ceil((canvas.height - offsetPx) / (ppm * GP.state.zoom) / meterStep) * meterStep;

    for (var m = startM; m <= endM; m += meterStep) {
      var y = m * ppm * GP.state.zoom + offsetPx;
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
  };

  GP.renderRulerCorner = function () {
    var canvas = GP.dom.rulerCorner;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#365E3D';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  GP.getRulerStep = function () {
    var ppm = GP.pixelsPerMeter();
    var pixelsPerMeterOnScreen = ppm * GP.state.zoom;
    if (pixelsPerMeterOnScreen > 150) return 0.5;
    if (pixelsPerMeterOnScreen > 40) return 1;
    if (pixelsPerMeterOnScreen > 20) return 2;
    return 5;
  };

  GP.updateCanvasSizeDisplay = function () {
    if (!GP.dom.statusCanvasSize) return;
    var wm = GP.pixelsToMeters(GP.gardenData.canvasSize.width).toFixed(1);
    var hm = GP.pixelsToMeters(GP.gardenData.canvasSize.height).toFixed(1);
    GP.dom.statusCanvasSize.textContent = wm + ' x ' + hm + ' m';
  };

  // =====================================================
  // Render All
  // =====================================================
  GP.renderAll = function () {
    GP.renderGrid();
    GP.renderAreas();
    GP.renderElements();
    GP.updateViewBox();
    GP.updateStats();
    GP.renderRulers();
    GP.updateCanvasSizeDisplay();
  };

  // =====================================================
  // Render Areas
  // =====================================================
  GP.renderAreas = function () {
    var layer = GP.dom.layerAreas;
    // Clear areas layer (internal SVG polygons only)
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    GP.gardenData.layers.forEach(function (area) {
      if (!area.points || area.points.length < 3) return;

      var polygon = GP.createSVGElement('polygon');
      var pointsStr = area.points.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
      polygon.setAttribute('points', pointsStr);
      polygon.setAttribute('class', 'area-polygon');
      polygon.setAttribute('data-id', area.id);

      var surface = GP.getSurfaceType(area.surfaceType);
      polygon.setAttribute('fill', 'url(#' + surface.pattern + ')');
      polygon.setAttribute('stroke', surface.color);
      polygon.setAttribute('fill-opacity', '0.85');

      if (GP.state.selectedElement === area.id) {
        polygon.classList.add('selected');
      }
      if (GP.state.multiSelected && GP.state.multiSelected.indexOf(area.id) !== -1) {
        polygon.classList.add('multi-selected');
      }

      // Notizen-Label fuer Flaeche (#250)
      if (area.notes) {
        var centroid = GP.calcPolygonCentroid(area.points);
        var noteLabel = GP.createSVGElement('text');
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

      polygon.addEventListener('mousedown', GP.onAreaMouseDown);
      polygon.addEventListener('click', GP.onAreaClick);
      (function(areaData) {
        polygon.addEventListener('mouseenter', function () {
          if (GP.state.tool !== 'select' || GP.dragState) return;
          var surf = GP.getSurfaceType(areaData.surfaceType);
          var areaPx = GP.calcPolygonArea(areaData.points);
          var areaM2 = areaPx / (GP.pixelsPerMeter() * GP.pixelsPerMeter());
          var perimPx = GP.calcPolygonPerimeter(areaData.points);
          var perimM = perimPx / GP.pixelsPerMeter();
          GP.showTooltip(surf.name, areaM2.toFixed(1) + ' m\u00B2', perimM.toFixed(1) + ' m');
        });
        polygon.addEventListener('mouseleave', function () {
          GP.hideTooltip();
        });
        polygon.addEventListener('mousemove', function (ev) {
          GP.moveTooltip(ev);
        });
      })(area);
      layer.appendChild(polygon);
    });
  };

  // =====================================================
  // Render Elements
  // =====================================================
  GP.renderElements = function () {
    var layer = GP.dom.layerElements;
    // Clear elements layer (internal SVG groups only)
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    GP.gardenData.elements.forEach(function (el) {
      var scale = el.scale || 1;
      var g = GP.createSVGElement('g');
      g.setAttribute('class', 'element-group');
      g.setAttribute('data-id', el.id);
      g.setAttribute('transform', 'translate(' + el.x + ',' + el.y + ') scale(' + scale + ')');

      if (GP.state.selectedElement === el.id) {
        g.classList.add('selected');
      }
      if (GP.state.multiSelected && GP.state.multiSelected.indexOf(el.id) !== -1) {
        g.classList.add('multi-selected');
      }

      var plantDef = GP.findPlantDef(el);
      var outOfSeason = plantDef && !GP.isPlantInSeason(plantDef, GP.selectedSeasonMonth);

      var radius = 18;
      var circle = GP.createSVGElement('circle');
      circle.setAttribute('cx', '0');
      circle.setAttribute('cy', '0');
      circle.setAttribute('r', String(radius));
      circle.setAttribute('fill', el.color || '#E0E0E0');
      circle.setAttribute('fill-opacity', outOfSeason ? '0.3' : '0.8');
      circle.setAttribute('stroke', outOfSeason ? '#999' : (el.color || '#BDBDBD'));
      circle.setAttribute('stroke-width', '1.5');
      circle.setAttribute('class', 'element-circle');
      if (outOfSeason) {
        circle.setAttribute('stroke-dasharray', '3 2');
      }
      g.appendChild(circle);

      var text = GP.createSVGElement('text');
      text.setAttribute('x', '0');
      text.setAttribute('y', '5');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '18');
      text.setAttribute('pointer-events', 'none');
      if (outOfSeason) text.setAttribute('opacity', '0.4');
      text.textContent = el.icon || '?';
      g.appendChild(text);

      var label = GP.createSVGElement('text');
      label.setAttribute('x', '0');
      label.setAttribute('y', '30');
      label.setAttribute('class', 'element-label');
      if (outOfSeason) label.setAttribute('opacity', '0.4');
      label.textContent = el.name;
      g.appendChild(label);

      // Notizen-Indikator (#250)
      if (el.notes) {
        var noteIndicator = GP.createSVGElement('circle');
        noteIndicator.setAttribute('cx', String(radius - 2));
        noteIndicator.setAttribute('cy', String(-radius + 2));
        noteIndicator.setAttribute('r', '4');
        noteIndicator.setAttribute('fill', '#FFC107');
        noteIndicator.setAttribute('stroke', 'white');
        noteIndicator.setAttribute('stroke-width', '1');
        noteIndicator.setAttribute('pointer-events', 'none');
        g.appendChild(noteIndicator);
      }

      g.addEventListener('mousedown', GP.onElementMouseDown);
      g.addEventListener('click', GP.onElementClick);

      // Tooltip mit Saisondetails (#253)
      // NOTE: Tooltip content uses GP.escapeText() for all user-visible text.
      // Month names come from trusted GP.MONTH_NAMES array.
      (function(element, pDef, oos) {
        g.addEventListener('mouseenter', function () {
          if (GP.state.tool !== 'select' || GP.dragState) return;
          // Build tooltip using DOM methods for safety
          var tip = GP.dom.tooltip;
          if (!tip) return;
          while (tip.firstChild) tip.removeChild(tip.firstChild);

          var titleDiv = document.createElement('div');
          titleDiv.className = 'garden-tooltip-title';
          titleDiv.textContent = element.name;
          tip.appendChild(titleDiv);

          if (pDef) {
            var seasonLabels = { spring: 'Fr\u00fchling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };
            if (pDef.season && pDef.season.length > 0) {
              var seasons = pDef.season.map(function (s) { return seasonLabels[s] || s; }).join(', ');
              var seasonDiv = document.createElement('div');
              seasonDiv.className = 'garden-tooltip-stat';
              seasonDiv.textContent = 'Saison: ' + seasons;
              tip.appendChild(seasonDiv);
            }
            if (pDef.germination) {
              var germDiv = document.createElement('div');
              germDiv.className = 'garden-tooltip-stat';
              germDiv.textContent = 'Keimung: ' + pDef.germination;
              tip.appendChild(germDiv);
            }
            if (pDef.harvest) {
              var harvDiv = document.createElement('div');
              harvDiv.className = 'garden-tooltip-stat';
              harvDiv.textContent = 'Ernte: ' + pDef.harvest;
              tip.appendChild(harvDiv);
            }
            if (oos) {
              var oosDiv = document.createElement('div');
              oosDiv.className = 'garden-tooltip-stat';
              oosDiv.style.color = '#ef4444';
              oosDiv.style.fontWeight = '600';
              oosDiv.textContent = 'Nicht in Saison (' + GP.MONTH_NAMES[GP.selectedSeasonMonth] + ')';
              tip.appendChild(oosDiv);
            } else if (pDef.season && pDef.season.length > 0) {
              var isDiv = document.createElement('div');
              isDiv.className = 'garden-tooltip-stat';
              isDiv.style.color = '#22c55e';
              isDiv.style.fontWeight = '600';
              isDiv.textContent = 'In Saison (' + GP.MONTH_NAMES[GP.selectedSeasonMonth] + ')';
              tip.appendChild(isDiv);
            }
          }
          tip.style.display = 'block';
        });
        g.addEventListener('mouseleave', GP.hideTooltip);
        g.addEventListener('mousemove', GP.moveTooltip);
      })(el, plantDef, outOfSeason);

      layer.appendChild(g);
    });
  };

  // =====================================================
  // Render Drawing (Preview)
  // =====================================================
  GP.renderDrawing = function () {
    var layer = GP.dom.layerDrawing;
    if (!layer) return;
    // Clear drawing layer (internal SVG preview elements only)
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    if (GP.drawPoints.length === 0) return;

    if (GP.drawPoints.length > 1) {
      var polyline = GP.createSVGElement('polyline');
      var pts = GP.drawPoints.map(function (p) { return p.x + ',' + p.y; }).join(' ');
      polyline.setAttribute('points', pts);
      polyline.setAttribute('class', 'draw-line');
      layer.appendChild(polyline);
    }

    GP.drawPoints.forEach(function (p, i) {
      var circle = GP.createSVGElement('circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', i === 0 ? 6 : 4);
      circle.setAttribute('class', 'draw-point');
      circle.setAttribute('fill', i === 0 ? 'var(--primary)' : 'var(--primary-light)');
      circle.setAttribute('stroke', 'white');
      circle.setAttribute('stroke-width', '2');
      layer.appendChild(circle);
    });

    if (GP.drawPreviewLine) {
      var lastPt = GP.drawPoints[GP.drawPoints.length - 1];
      var line = GP.createSVGElement('line');
      line.setAttribute('x1', lastPt.x);
      line.setAttribute('y1', lastPt.y);
      line.setAttribute('x2', GP.drawPreviewLine.x);
      line.setAttribute('y2', GP.drawPreviewLine.y);
      line.setAttribute('class', 'draw-preview-line');
      layer.appendChild(line);
    }
  };

  // =====================================================
  // ViewBox & Stats
  // =====================================================
  GP.updateViewBox = function () {
    var cw = GP.gardenData.canvasSize.width;
    var ch = GP.gardenData.canvasSize.height;

    var vbX = -GP.state.panX / GP.state.zoom;
    var vbY = -GP.state.panY / GP.state.zoom;
    var vbW = cw / GP.state.zoom;
    var vbH = ch / GP.state.zoom;

    GP.dom.canvas.setAttribute('viewBox', vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH);
  };

  GP.updateStats = function () {
    if (GP.dom.statusAreas) {
      GP.dom.statusAreas.textContent = GP.gardenData.layers.length + ' Fl\u00e4chen';
    }
    if (GP.dom.statusElements) {
      GP.dom.statusElements.textContent = GP.gardenData.elements.length + ' Elemente';
    }
  };

  // =====================================================
  // Zoom
  // =====================================================
  GP.setZoom = function (level) {
    GP.state.zoom = Math.max(0.25, Math.min(3, level));
    GP.updateViewBox();
    GP.dom.zoomLevel.textContent = Math.round(GP.state.zoom * 100) + '%';
    GP.renderRulers();
  };

  GP.zoomIn = function () {
    GP.setZoom(GP.state.zoom + 0.15);
  };

  GP.zoomOut = function () {
    GP.setZoom(GP.state.zoom - 0.15);
  };

  GP.zoomReset = function () {
    GP.state.zoom = 1;
    GP.state.panX = 0;
    GP.state.panY = 0;
    GP.updateViewBox();
    GP.dom.zoomLevel.textContent = '100%';
    GP.renderRulers();
  };

  // =====================================================
  // Pan (Wheel)
  // =====================================================
  GP.onCanvasWheel = function (e) {
    e.preventDefault();
    if (e.ctrlKey) {
      var delta = e.deltaY > 0 ? -0.1 : 0.1;
      GP.setZoom(GP.state.zoom + delta);
      GP.renderRulers();
    } else {
      GP.state.panX -= e.deltaX;
      GP.state.panY -= e.deltaY;
      GP.updateViewBox();
      GP.renderRulers();
    }
  };

  // =====================================================
  // Selection Rect Rendering (#255)
  // =====================================================
  GP.renderSelectionRect = function (x1, y1, x2, y2) {
    var old = document.getElementById('selectionRect');
    if (old) old.remove();

    var rect = GP.createSVGElement('rect');
    rect.setAttribute('id', 'selectionRect');
    rect.setAttribute('x', Math.min(x1, x2));
    rect.setAttribute('y', Math.min(y1, y2));
    rect.setAttribute('width', Math.abs(x2 - x1));
    rect.setAttribute('height', Math.abs(y2 - y1));
    rect.setAttribute('fill', 'rgba(54, 94, 61, 0.1)');
    rect.setAttribute('stroke', 'var(--primary, #365E3D)');
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('stroke-dasharray', '5 3');
    rect.setAttribute('pointer-events', 'none');
    GP.dom.layerDrawing.appendChild(rect);
  };

  GP.removeSelectionRect = function () {
    var old = document.getElementById('selectionRect');
    if (old) old.remove();
  };
})();
