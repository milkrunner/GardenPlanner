/**
 * Garden Planner - Tools Module
 * Zeichnen (Polygon), Pflanzen-Platzierung, Strukturen,
 * Drag&Drop, Selection, Canvas Events, Mehrfach-Auswahl
 *
 * Abhaengig von: garden-core.js, garden-canvas.js (window.GP)
 */
(function () {
  'use strict';

  var GP = window.GP;

  // =====================================================
  // Mehrfach-Auswahl (#255)
  // =====================================================
  GP.toggleMultiSelect = function (id) {
    var idx = GP.state.multiSelected.indexOf(id);
    if (idx === -1) {
      GP.state.multiSelected.push(id);
    } else {
      GP.state.multiSelected.splice(idx, 1);
    }
  };

  GP.selectAll = function () {
    GP.state.multiSelected = [];
    GP.gardenData.elements.forEach(function (el) {
      GP.state.multiSelected.push(el.id);
    });
    GP.gardenData.layers.forEach(function (l) {
      GP.state.multiSelected.push(l.id);
    });
    GP.renderAll();
    GP.setStatus(GP.state.multiSelected.length + ' Elemente ausgewaehlt');
  };

  GP.deleteMultiSelected = function () {
    if (GP.state.multiSelected.length === 0) return;
    GP.gardenConfirm('Mehrere loeschen', GP.state.multiSelected.length + ' Elemente loeschen?').then(function (ok) {
      if (!ok) return;
      GP.pushUndo();
      var ids = GP.state.multiSelected.slice();
      GP.gardenData.elements = GP.gardenData.elements.filter(function (el) {
        return ids.indexOf(el.id) === -1;
      });
      GP.gardenData.layers = GP.gardenData.layers.filter(function (l) {
        return ids.indexOf(l.id) === -1;
      });
      GP.state.multiSelected = [];
      GP.state.selectedElement = null;
      GP.renderAll();
      GP.autoSave();
      GP.setStatus(ids.length + ' Elemente geloescht');
    });
  };

  GP.copyMultiSelected = function () {
    if (GP.state.multiSelected.length === 0) return;
    GP.pushUndo();
    var ids = GP.state.multiSelected.slice();
    var newIds = [];
    var offset = 30;

    ids.forEach(function (id) {
      var el = GP.gardenData.elements.find(function (e) { return e.id === id; });
      if (el) {
        var copy = GP.cloneData(el);
        copy.id = GP.generateId();
        copy.x += offset;
        copy.y += offset;
        GP.gardenData.elements.push(copy);
        newIds.push(copy.id);
      }
      var area = GP.gardenData.layers.find(function (l) { return l.id === id; });
      if (area) {
        var areaCopy = GP.cloneData(area);
        areaCopy.id = GP.generateId();
        areaCopy.points = areaCopy.points.map(function (p) {
          return [p[0] + offset, p[1] + offset];
        });
        GP.gardenData.layers.push(areaCopy);
        newIds.push(areaCopy.id);
      }
    });

    GP.state.multiSelected = newIds;
    GP.renderAll();
    GP.autoSave();
    GP.setStatus(newIds.length + ' Elemente dupliziert');
  };

  GP.moveMultiSelected = function (dx, dy) {
    if (GP.state.multiSelected.length === 0) return;
    var ids = GP.state.multiSelected;

    ids.forEach(function (id) {
      var el = GP.gardenData.elements.find(function (e) { return e.id === id; });
      if (el) {
        el.x += dx;
        el.y += dy;
      }
      var area = GP.gardenData.layers.find(function (l) { return l.id === id; });
      if (area) {
        area.points = area.points.map(function (p) {
          return [p[0] + dx, p[1] + dy];
        });
      }
    });
  };

  GP.selectElementsInRect = function (x1, y1, x2, y2) {
    var minX = Math.min(x1, x2);
    var minY = Math.min(y1, y2);
    var maxX = Math.max(x1, x2);
    var maxY = Math.max(y1, y2);

    GP.state.multiSelected = [];

    GP.gardenData.elements.forEach(function (el) {
      if (el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY) {
        GP.state.multiSelected.push(el.id);
      }
    });

    GP.gardenData.layers.forEach(function (area) {
      if (!area.points || area.points.length === 0) return;
      var cx = 0, cy = 0;
      area.points.forEach(function (p) { cx += p[0]; cy += p[1]; });
      cx /= area.points.length;
      cy /= area.points.length;
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
        GP.state.multiSelected.push(area.id);
      }
    });
  };

  // =====================================================
  // Canvas Events
  // =====================================================
  GP.onCanvasClick = function (e) {
    if (e.target === GP.dom.canvas || e.target.closest('#canvasContent') === GP.dom.canvasContent) {
      var pt = GP.mouseToSVG(e);

      if (GP.state.tool === 'draw') {
        GP.handleDrawClick(pt, e);
      } else if (GP.state.tool === 'select') {
        if (GP.state.selectedPlant) {
          GP.placePlant(pt);
        } else if (GP.state.selectedStructure) {
          GP.placeStructure(pt);
        } else {
          if (!e.target.closest('.area-polygon') && !e.target.closest('.element-group')) {
            if (!e.shiftKey && !e.ctrlKey) {
              GP.state.selectedElement = null;
              GP.state.multiSelected = [];
              if (GP.editPanelOpen) GP.closeEditPanel();
            }
            GP.renderAll();
          }
        }
      }
    }
  };

  GP.onCanvasMouseMove = function (e) {
    if (GP.state.tool === 'draw' && GP.drawPoints.length > 0) {
      GP.drawPreviewLine = GP.mouseToSVG(e);
      GP.renderDrawing();
    }

    if (GP.selectRectState) {
      var pt = GP.mouseToSVG(e);
      GP.renderSelectionRect(GP.selectRectState.startX, GP.selectRectState.startY, pt.x, pt.y);
      return;
    }

    if (GP.vertexDragState) {
      GP.handleVertexDrag(e);
      return;
    }

    if (GP.dragState) {
      GP.handleDrag(e);
    }
  };

  GP.onCanvasMouseUp = function (e) {
    if (GP.selectRectState) {
      var pt = GP.mouseToSVG(e);
      GP.selectElementsInRect(GP.selectRectState.startX, GP.selectRectState.startY, pt.x, pt.y);
      GP.selectRectState = null;
      GP.removeSelectionRect();
      GP.renderAll();
      if (GP.state.multiSelected.length > 0) {
        GP.setStatus(GP.state.multiSelected.length + ' Elemente ausgewaehlt');
      }
      return;
    }

    if (GP.vertexDragState) {
      GP.endVertexDrag();
    }
    if (GP.dragState) {
      GP.endDrag();
    }
  };

  GP.onCanvasMouseDown = function (e) {
    if (GP.state.tool !== 'select') return;
    if (GP.state.selectedPlant || GP.state.selectedStructure) return;
    if (e.target.closest('.area-polygon') || e.target.closest('.element-group')) return;
    if (e.button !== 0) return;

    var pt = GP.mouseToSVG(e);
    GP.selectRectState = {
      startX: pt.x,
      startY: pt.y
    };
  };

  GP.onCanvasDblClick = function (e) {
    if (GP.state.tool === 'draw' && GP.drawPoints.length >= 3) {
      GP.closePolygon();
      return;
    }

    var target = e.target.closest('.element-group');
    if (target) {
      e.stopPropagation();
      GP.openEditPanel(target.getAttribute('data-id'), e);
      return;
    }
    var areaPoly = e.target.closest('.area-polygon');
    if (areaPoly) {
      e.stopPropagation();
      GP.openEditPanel(areaPoly.getAttribute('data-id'), e);
      return;
    }
  };

  // =====================================================
  // Drawing
  // =====================================================
  GP.handleDrawClick = function (pt, e) {
    pt = GP.snapToGrid(pt, e.shiftKey);
    if (GP.drawPoints.length >= 3) {
      var first = GP.drawPoints[0];
      if (GP.dist(pt, first) < GP.CLOSE_POLYGON_DISTANCE / GP.state.zoom) {
        GP.closePolygon();
        return;
      }
    }

    GP.drawPoints.push(pt);
    GP.drawPreviewLine = null;
    GP.renderDrawing();

    if (GP.drawPoints.length === 1) {
      GP.setStatus('Punkt gesetzt. Weiter klicken f\u00fcr weitere Punkte. Mind. 3 Punkte f\u00fcr eine Fl\u00e4che.');
    } else {
      GP.setStatus(GP.drawPoints.length + ' Punkte. Doppelklick oder Klick auf Startpunkt zum Schlie\u00dfen.');
    }
  };

  GP.closePolygon = function () {
    if (GP.drawPoints.length < 3) return;

    GP.pushUndo();

    var area = {
      id: GP.generateId(),
      type: 'area',
      surfaceType: GP.state.selectedSurface,
      points: GP.drawPoints.map(function (p) { return [Math.round(p.x), Math.round(p.y)]; }),
      closed: true
    };

    GP.gardenData.layers.push(area);
    GP.drawPoints = [];
    GP.drawPreviewLine = null;

    GP.renderAll();
    GP.renderDrawing();
    GP.autoSave();

    GP.setStatus('Fl\u00e4che erstellt: ' + GP.getSurfaceType(area.surfaceType).name);
  };

  // =====================================================
  // Area Events
  // =====================================================
  GP.onAreaClick = function (e) {
    var id = this.getAttribute('data-id');

    if (GP.state.tool === 'draw') {
      return;
    }

    e.stopPropagation();

    if (GP.state.tool === 'delete') {
      GP.deleteAreaById(id);
    } else if (GP.state.tool === 'select') {
      if (GP.state.selectedPlant) {
        var pt = GP.mouseToSVG(e);
        pt = GP.snapToGrid(pt);
        GP.placePlant(pt);
        return;
      }
      if (GP.state.selectedStructure) {
        var pt2 = GP.mouseToSVG(e);
        pt2 = GP.snapToGrid(pt2);
        GP.placeStructure(pt2);
        return;
      }
      if (e.shiftKey) {
        GP.toggleMultiSelect(id);
        GP.state.selectedElement = null;
        GP.renderAll();
        GP.setStatus(GP.state.multiSelected.length + ' Elemente ausgewaehlt');
      } else {
        GP.state.multiSelected = [];
        GP.state.selectedElement = (GP.state.selectedElement === id) ? null : id;
        GP.renderAll();
      }
    }
  };

  GP.onAreaMouseDown = function (e) {
    if (GP.state.tool === 'draw') return;
    e.stopPropagation();
    var id = this.getAttribute('data-id');

    if (GP.state.tool === 'move') {
      if (GP.state.multiSelected.length > 1 && GP.state.multiSelected.indexOf(id) !== -1) {
        GP.startMultiDrag(e);
      } else {
        GP.startAreaDrag(e, id);
      }
    }
  };

  GP.deleteAreaById = function (id) {
    var area = GP.gardenData.layers.find(function (l) { return l.id === id; });
    var surfaceName = area ? GP.getSurfaceType(area.surfaceType).name : 'Fl\u00e4che';
    GP.gardenConfirm('Fl\u00e4che l\u00f6schen', 'Fl\u00e4che "' + surfaceName + '" l\u00f6schen?').then(function (ok) {
      if (!ok) return;
      GP.pushUndo();
      GP.gardenData.layers = GP.gardenData.layers.filter(function (l) { return l.id !== id; });
      GP.state.selectedElement = null;
      GP.renderAll();
      GP.autoSave();
      GP.setStatus('Fl\u00e4che gel\u00f6scht');
    });
  };

  // =====================================================
  // Element Events
  // =====================================================
  GP.onElementClick = function (e) {
    e.stopPropagation();
    var g = this.closest ? this : this.parentNode;
    var id = g.getAttribute('data-id');

    if (GP.state.tool === 'delete') {
      if (GP.state.multiSelected.length > 0 && GP.state.multiSelected.indexOf(id) !== -1) {
        GP.deleteMultiSelected();
      } else {
        GP.deleteElementById(id);
      }
    } else if (GP.state.tool === 'select') {
      if (e.shiftKey) {
        GP.toggleMultiSelect(id);
        GP.state.selectedElement = null;
        GP.renderAll();
        GP.setStatus(GP.state.multiSelected.length + ' Elemente ausgewaehlt');
      } else {
        GP.state.multiSelected = [];
        GP.state.selectedElement = (GP.state.selectedElement === id) ? null : id;
        GP.renderAll();
      }
    }
  };

  GP.onElementMouseDown = function (e) {
    e.stopPropagation();
    var g = this.closest ? this : this.parentNode;
    var id = g.getAttribute('data-id');

    if (GP.state.tool === 'move' || GP.state.tool === 'select') {
      if (GP.state.multiSelected.length > 1 && GP.state.multiSelected.indexOf(id) !== -1) {
        GP.startMultiDrag(e);
      } else {
        GP.startElementDrag(e, id);
      }
    }
  };

  GP.deleteElementById = function (id) {
    GP.pushUndo();
    GP.gardenData.elements = GP.gardenData.elements.filter(function (el) { return el.id !== id; });
    GP.state.selectedElement = null;
    GP.renderAll();
    GP.autoSave();
    GP.setStatus('Element gel\u00f6scht');
  };

  // =====================================================
  // Drag & Drop
  // =====================================================
  GP.startElementDrag = function (e, id) {
    var el = GP.gardenData.elements.find(function (el) { return el.id === id; });
    if (!el) return;

    var pt = GP.mouseToSVG(e);
    GP.dragState = {
      type: 'element',
      id: id,
      startX: pt.x,
      startY: pt.y,
      origX: el.x,
      origY: el.y
    };

    GP.state.selectedElement = id;
    GP.dom.canvasArea.classList.add('dragging');
    GP.renderAll();
  };

  GP.startAreaDrag = function (e, id) {
    var area = GP.gardenData.layers.find(function (l) { return l.id === id; });
    if (!area) return;

    var pt = GP.mouseToSVG(e);
    GP.dragState = {
      type: 'area',
      id: id,
      startX: pt.x,
      startY: pt.y,
      origPoints: area.points.map(function (p) { return [p[0], p[1]]; })
    };

    GP.state.selectedElement = id;
    GP.dom.canvasArea.classList.add('dragging');
    GP.renderAll();
  };

  GP.startMultiDrag = function (e) {
    var pt = GP.mouseToSVG(e);
    var origPositions = {};
    GP.state.multiSelected.forEach(function (id) {
      var el = GP.gardenData.elements.find(function (e) { return e.id === id; });
      if (el) origPositions[id] = { x: el.x, y: el.y };
      var area = GP.gardenData.layers.find(function (l) { return l.id === id; });
      if (area) origPositions[id] = { points: area.points.map(function (p) { return [p[0], p[1]]; }) };
    });

    GP.dragState = {
      type: 'multi',
      startX: pt.x,
      startY: pt.y,
      origPositions: origPositions
    };

    GP.dom.canvasArea.classList.add('dragging');
  };

  GP.handleDrag = function (e) {
    if (!GP.dragState) return;
    var pt = GP.mouseToSVG(e);
    var snapped = GP.snapToGrid(pt, false);
    var startSnapped = GP.snapToGrid({ x: GP.dragState.startX, y: GP.dragState.startY }, false);
    var dx = snapped.x - startSnapped.x;
    var dy = snapped.y - startSnapped.y;

    if (GP.dragState.type === 'element') {
      var el = GP.gardenData.elements.find(function (el) { return el.id === GP.dragState.id; });
      if (el) {
        el.x = Math.round(GP.dragState.origX + dx);
        el.y = Math.round(GP.dragState.origY + dy);
        GP.renderElements();
      }
    } else if (GP.dragState.type === 'area') {
      var area = GP.gardenData.layers.find(function (l) { return l.id === GP.dragState.id; });
      if (area) {
        area.points = GP.dragState.origPoints.map(function (p) {
          return [Math.round(p[0] + dx), Math.round(p[1] + dy)];
        });
        GP.renderAreas();
      }
    } else if (GP.dragState.type === 'multi') {
      Object.keys(GP.dragState.origPositions).forEach(function (id) {
        var orig = GP.dragState.origPositions[id];
        var elM = GP.gardenData.elements.find(function (e) { return e.id === id; });
        if (elM && orig.x !== undefined) {
          elM.x = Math.round(orig.x + dx);
          elM.y = Math.round(orig.y + dy);
        }
        var areaEl = GP.gardenData.layers.find(function (l) { return l.id === id; });
        if (areaEl && orig.points) {
          areaEl.points = orig.points.map(function (p) {
            return [Math.round(p[0] + dx), Math.round(p[1] + dy)];
          });
        }
      });
      GP.renderAll();
    }
  };

  GP.endDrag = function () {
    if (!GP.dragState) return;

    var hasMoved = false;
    if (GP.dragState.type === 'element') {
      var el = GP.gardenData.elements.find(function (el) { return el.id === GP.dragState.id; });
      if (el && (el.x !== GP.dragState.origX || el.y !== GP.dragState.origY)) {
        hasMoved = true;
      }
    } else if (GP.dragState.type === 'area') {
      hasMoved = true;
    } else if (GP.dragState.type === 'multi') {
      hasMoved = true;
    }

    if (hasMoved) {
      var undoData = GP.cloneData(GP.gardenData);
      if (GP.dragState.type === 'element') {
        var elUndo = undoData.elements.find(function (el) { return el.id === GP.dragState.id; });
        if (elUndo) {
          elUndo.x = GP.dragState.origX;
          elUndo.y = GP.dragState.origY;
        }
      } else if (GP.dragState.type === 'area') {
        var areaUndo = undoData.layers.find(function (l) { return l.id === GP.dragState.id; });
        if (areaUndo) {
          areaUndo.points = GP.dragState.origPoints;
        }
      } else if (GP.dragState.type === 'multi') {
        Object.keys(GP.dragState.origPositions).forEach(function (id) {
          var orig = GP.dragState.origPositions[id];
          var elU = undoData.elements.find(function (e) { return e.id === id; });
          if (elU && orig.x !== undefined) {
            elU.x = orig.x;
            elU.y = orig.y;
          }
          var areaU = undoData.layers.find(function (l) { return l.id === id; });
          if (areaU && orig.points) {
            areaU.points = orig.points;
          }
        });
      }
      GP.undoStack.push(undoData);
      if (GP.undoStack.length > GP.MAX_UNDO) GP.undoStack.shift();
      GP.redoStack = [];
      GP.updateUndoRedoButtons();
      GP.autoSave();
    }

    GP.dragState = null;
    GP.dom.canvasArea.classList.remove('dragging');
  };

  // =====================================================
  // Plant & Structure Placement
  // =====================================================
  GP.placePlant = function (pt) {
    if (!GP.state.selectedPlant) return;
    pt = GP.snapToGrid(pt);
    GP.pushUndo();

    var element = {
      id: GP.generateId(),
      type: 'plant',
      name: GP.state.selectedPlant.name,
      icon: GP.state.selectedPlant.icon,
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      color: GP.state.selectedPlant.color
    };

    GP.gardenData.elements.push(element);
    GP.renderAll();
    GP.autoSave();
    GP.setStatus(GP.state.selectedPlant.name + ' platziert');
  };

  GP.placeStructure = function (pt) {
    if (!GP.state.selectedStructure) return;
    pt = GP.snapToGrid(pt);
    GP.pushUndo();

    var element = {
      id: GP.generateId(),
      type: 'structure',
      name: GP.state.selectedStructure.name,
      icon: GP.state.selectedStructure.icon,
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      color: GP.state.selectedStructure.color
    };

    GP.gardenData.elements.push(element);
    GP.renderAll();
    GP.autoSave();
    GP.setStatus(GP.state.selectedStructure.name + ' platziert');
  };
})();
