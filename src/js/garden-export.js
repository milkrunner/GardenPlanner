/**
 * Garden Planner - Export Module
 * PNG/SVG Export, JSON Import/Export, Server-Sync,
 * Save/Load, Migration, Theme, Keyboard, Init
 *
 * Abhaengig von: garden-core.js, garden-canvas.js, garden-tools.js,
 *                garden-sidebar.js, garden-edit.js (window.GP)
 */
(function () {
  'use strict';

  var GP = window.GP;

  // =====================================================
  // Save / Load (mit Server-Sync #251)
  // =====================================================
  GP.getAllGardens = function () {
    try {
      var data = localStorage.getItem(GP.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  };

  GP.saveGardens = function (gardens) {
    localStorage.setItem(GP.STORAGE_KEY, JSON.stringify(gardens));
  };

  // Server-API Aufrufe (#251)
  GP.apiListGardens = async function () {
    try {
      var res = await fetch(GP.API_BASE + '/gardens', { credentials: 'same-origin' });
      if (!res.ok) return null;
      return res.json();
    } catch (e) { return null; }
  };

  GP.apiSaveGarden = async function (garden) {
    try {
      if (garden.serverId) {
        var res = await fetch(GP.API_BASE + '/gardens/' + garden.serverId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name: garden.name, data: garden.data })
        });
        if (res.ok) return res.json();
      }
      var postRes = await fetch(GP.API_BASE + '/gardens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: garden.name, data: garden.data })
      });
      if (postRes.ok || postRes.status === 201) return postRes.json();
      return null;
    } catch (e) { return null; }
  };

  GP.apiDeleteGarden = async function (serverId) {
    try {
      await fetch(GP.API_BASE + '/gardens/' + serverId, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
    } catch (e) { /* Offline-Tolerant */ }
  };

  GP.apiExportGarden = async function (serverId) {
    try {
      var res = await fetch(GP.API_BASE + '/gardens/' + serverId + '/export', { credentials: 'same-origin' });
      if (res.ok) return res.json();
      return null;
    } catch (e) { return null; }
  };

  GP.apiImportGarden = async function (gardenJson) {
    try {
      var res = await fetch(GP.API_BASE + '/gardens/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(gardenJson)
      });
      if (res.ok || res.status === 201) return res.json();
      return null;
    } catch (e) { return null; }
  };

  GP.saveCurrentGarden = function () {
    var gardens = GP.getAllGardens();
    var now = new Date().toISOString();

    GP.gardenData.name = GP.dom.gardenName.value.trim() || 'Mein Garten';

    if (GP.currentGardenId) {
      var idx = gardens.findIndex(function (g) { return g.id === GP.currentGardenId; });
      if (idx >= 0) {
        gardens[idx].data = GP.cloneData(GP.gardenData);
        gardens[idx].name = GP.gardenData.name;
        gardens[idx].updatedAt = now;
      } else {
        GP.currentGardenId = GP.generateId();
        gardens.push({
          id: GP.currentGardenId,
          name: GP.gardenData.name,
          data: GP.cloneData(GP.gardenData),
          createdAt: now,
          updatedAt: now
        });
      }
    } else {
      GP.currentGardenId = GP.generateId();
      gardens.push({
        id: GP.currentGardenId,
        name: GP.gardenData.name,
        data: GP.cloneData(GP.gardenData),
        createdAt: now,
        updatedAt: now
      });
    }

    GP.saveGardens(gardens);
    GP.renderSavedGardens();
    GP.setStatus('Garten "' + GP.gardenData.name + '" gespeichert');

    GP.syncGardenToServer(GP.currentGardenId);
  };

  GP.autoSave = function () {
    if (!GP.currentGardenId) return;

    var gardens = GP.getAllGardens();
    var now = new Date().toISOString();
    GP.gardenData.name = GP.dom.gardenName.value.trim() || 'Mein Garten';

    var idx = gardens.findIndex(function (g) { return g.id === GP.currentGardenId; });
    if (idx >= 0) {
      gardens[idx].data = GP.cloneData(GP.gardenData);
      gardens[idx].name = GP.gardenData.name;
      gardens[idx].updatedAt = now;
      GP.saveGardens(gardens);
    }

    if (GP.autoSaveTimer) clearTimeout(GP.autoSaveTimer);
    GP.autoSaveTimer = setTimeout(function () {
      GP.syncGardenToServer(GP.currentGardenId);
    }, GP.AUTO_SAVE_DELAY);
  };

  GP.syncGardenToServer = async function (localId) {
    if (!navigator.onLine) return;
    var gardens = GP.getAllGardens();
    var garden = gardens.find(function (g) { return g.id === localId; });
    if (!garden) return;

    var result = await GP.apiSaveGarden({
      serverId: garden.serverId || null,
      name: garden.name,
      data: garden.data
    });

    if (result && result.id) {
      garden.serverId = result.id;
      GP.serverGardenId = result.id;
      GP.saveGardens(gardens);
    }
  };

  GP.loadGarden = function (id) {
    var gardens = GP.getAllGardens();
    var garden = gardens.find(function (g) { return g.id === id; });
    if (!garden) return;

    var data = garden.data;
    if (!data.version || data.version === 1) {
      data = GP.migrateV1toV2(data);
      garden.data = data;
      GP.saveGardens(gardens);
    }

    GP.gardenData = GP.cloneData(data);
    GP.currentGardenId = id;
    GP.serverGardenId = garden.serverId || null;
    GP.dom.gardenName.value = GP.gardenData.name || 'Mein Garten';

    GP.state.selectedElement = null;
    if (GP.editPanelOpen) GP.closeEditPanel();
    GP.drawPoints = [];
    GP.drawPreviewLine = null;
    GP.undoStack = [];
    GP.redoStack = [];
    GP.updateUndoRedoButtons();

    GP.renderAll();
    GP.renderDrawing();
    GP.renderSavedGardens();
    GP.setStatus('Garten "' + GP.gardenData.name + '" geladen');
  };

  GP.deleteGarden = function (id) {
    var gardens = GP.getAllGardens();
    var garden = gardens.find(function (g) { return g.id === id; });

    if (garden && garden.serverId) {
      GP.apiDeleteGarden(garden.serverId);
    }

    gardens = gardens.filter(function (g) { return g.id !== id; });
    GP.saveGardens(gardens);

    if (GP.currentGardenId === id) {
      GP.currentGardenId = null;
      GP.serverGardenId = null;
      GP.gardenData = GP.createEmptyGarden();
      GP.dom.gardenName.value = GP.gardenData.name;
      GP.undoStack = [];
      GP.redoStack = [];
      GP.updateUndoRedoButtons();
      GP.renderAll();
    }

    GP.renderSavedGardens();
    GP.setStatus('Garten gel\u00f6scht');
  };

  GP.newGarden = function () {
    GP.currentGardenId = null;
    GP.serverGardenId = null;
    GP.gardenData = GP.createEmptyGarden();
    GP.dom.gardenName.value = GP.gardenData.name;
    GP.state.selectedElement = null;
    if (GP.editPanelOpen) GP.closeEditPanel();
    GP.drawPoints = [];
    GP.drawPreviewLine = null;
    GP.undoStack = [];
    GP.redoStack = [];
    GP.updateUndoRedoButtons();

    GP.renderAll();
    GP.renderDrawing();
    GP.renderSavedGardens();
    GP.setStatus('Neuer Garten erstellt');
  };

  GP.syncGardensFromServer = async function () {
    if (!navigator.onLine) return;
    var serverGardens = await GP.apiListGardens();
    if (!serverGardens || !Array.isArray(serverGardens)) return;

    var localGardens = GP.getAllGardens();

    serverGardens.forEach(function (sg) {
      var existing = localGardens.find(function (lg) { return lg.serverId === sg.id; });
      if (!existing) {
        fetch(GP.API_BASE + '/gardens/' + sg.id, { credentials: 'same-origin' })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (fullGarden) {
            if (!fullGarden) return;
            var gardens = GP.getAllGardens();
            gardens.push({
              id: GP.generateId(),
              serverId: fullGarden.id,
              name: fullGarden.name,
              data: fullGarden.data || {},
              createdAt: fullGarden.createdAt,
              updatedAt: fullGarden.updatedAt
            });
            GP.saveGardens(gardens);
            GP.renderSavedGardens();
          });
      }
    });

    localGardens.forEach(function (lg) {
      if (!lg.serverId) {
        GP.syncGardenToServer(lg.id);
      }
    });
  };

  // =====================================================
  // JSON-Export/Import (#251)
  // =====================================================
  GP.exportGardenJSON = function () {
    var exportData = {
      name: GP.gardenData.name,
      data: GP.cloneData(GP.gardenData),
      exportedAt: new Date().toISOString()
    };
    var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (GP.gardenData.name || 'garten') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    GP.setStatus('Garten als JSON exportiert');
  };

  GP.importGardenJSON = function () {
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

          GP.gardenData = GP.cloneData(data);
          GP.gardenData.name = name;
          GP.currentGardenId = null;
          GP.serverGardenId = null;
          GP.dom.gardenName.value = name;
          GP.saveCurrentGarden();
          GP.renderAll();
          GP.setStatus('Garten "' + name + '" importiert');

          GP.apiImportGarden({ name: name, data: data });
        } catch (err) {
          GP.setStatus('Import fehlgeschlagen: Ung\u00fcltige Datei');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  };

  // =====================================================
  // Migration v1 to v2
  // =====================================================
  GP.migrateV1toV2 = function (oldData) {
    var newData = GP.createEmptyGarden();
    newData.name = oldData.name || 'Migrierter Garten';

    if (oldData.cells && Array.isArray(oldData.cells)) {
      var cellSize = 48;
      oldData.cells.forEach(function (cell) {
        var element = {
          id: GP.generateId(),
          type: 'plant',
          name: cell.name || 'Element',
          icon: cell.icon || '\u{1F33F}',
          x: (cell.col || 0) * cellSize + cellSize / 2,
          y: (cell.row || 0) * cellSize + cellSize / 2,
          color: cell.color || '#E0E0E0'
        };
        newData.elements.push(element);
      });

      if (oldData.gridSize) {
        newData.canvasSize.width = Math.max(GP.DEFAULT_CANVAS.width, (oldData.gridSize.cols || 12) * cellSize + 100);
        newData.canvasSize.height = Math.max(GP.DEFAULT_CANVAS.height, (oldData.gridSize.rows || 12) * cellSize + 100);
      }
    }

    newData.version = 2;
    return newData;
  };

  // =====================================================
  // Export-Hilfsfunktionen
  // =====================================================
  GP.buildExportFilename = function (ext) {
    var name = (GP.gardenData.name || 'garten').replace(/[^a-zA-Z0-9\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df _-]/g, '');
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return name + '_' + y + '-' + m + '-' + d + '.' + ext;
  };

  GP.inlinePatternsIntoClone = function (svgClone) {
    var clonedDefs = svgClone.querySelector('#svgDefs') || svgClone.querySelector('defs');
    if (!clonedDefs) {
      clonedDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svgClone.insertBefore(clonedDefs, svgClone.firstChild);
    }
    var originalDefs = GP.dom.svgDefs;
    if (originalDefs) {
      var patterns = originalDefs.querySelectorAll('pattern');
      patterns.forEach(function (pattern) {
        var existing = clonedDefs.querySelector('#' + pattern.id);
        if (!existing) {
          clonedDefs.appendChild(pattern.cloneNode(true));
        }
      });
    }
  };

  // =====================================================
  // Export (PNG)
  // =====================================================
  GP.exportPNG = function () {
    GP.setStatus('Exportiere als PNG...');

    var svgClone = GP.dom.canvas.cloneNode(true);
    svgClone.setAttribute('viewBox', '0 0 ' + GP.gardenData.canvasSize.width + ' ' + GP.gardenData.canvasSize.height);
    svgClone.setAttribute('width', GP.gardenData.canvasSize.width);
    svgClone.setAttribute('height', GP.gardenData.canvasSize.height);

    var drawLayer = svgClone.querySelector('#layerDrawing');
    if (drawLayer) while (drawLayer.firstChild) drawLayer.removeChild(drawLayer.firstChild);

    GP.inlinePatternsIntoClone(svgClone);

    var svgData = new XMLSerializer().serializeToString(svgClone);
    var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(svgBlob);

    var filename = GP.buildExportFilename('png');
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = GP.gardenData.canvasSize.width;
      canvas.height = GP.gardenData.canvasSize.height;
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
        GP.setStatus('PNG exportiert: ' + filename);
      }, 'image/png');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      GP.setStatus('Export fehlgeschlagen');
    };
    img.src = url;
  };

  // =====================================================
  // Export (SVG)
  // =====================================================
  GP.exportSVG = function () {
    GP.setStatus('Exportiere als SVG...');

    var svgClone = GP.dom.canvas.cloneNode(true);
    svgClone.setAttribute('viewBox', '0 0 ' + GP.gardenData.canvasSize.width + ' ' + GP.gardenData.canvasSize.height);
    svgClone.setAttribute('width', GP.gardenData.canvasSize.width);
    svgClone.setAttribute('height', GP.gardenData.canvasSize.height);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    var drawLayer = svgClone.querySelector('#layerDrawing');
    if (drawLayer) while (drawLayer.firstChild) drawLayer.removeChild(drawLayer.firstChild);
    var gridLayer = svgClone.querySelector('#layerGrid');
    if (gridLayer) while (gridLayer.firstChild) gridLayer.removeChild(gridLayer.firstChild);

    GP.inlinePatternsIntoClone(svgClone);

    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', GP.gardenData.canvasSize.width);
    bg.setAttribute('height', GP.gardenData.canvasSize.height);
    bg.setAttribute('fill', '#F5F3EE');
    var content = svgClone.querySelector('#canvasContent');
    if (content) content.insertBefore(bg, content.firstChild);

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

    var filename = GP.buildExportFilename('svg');
    var svgData = new XMLSerializer().serializeToString(svgClone);
    var blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    GP.setStatus('SVG exportiert: ' + filename);
  };

  // =====================================================
  // Theme Toggle
  // =====================================================
  GP.initTheme = function () {
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
  };

  // =====================================================
  // Keyboard
  // =====================================================
  GP.initKeyboard = function () {
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      switch (e.key) {
        case 'v':
        case 'V':
          GP.setTool('select');
          break;
        case 'd':
        case 'D':
          GP.setTool('draw');
          break;
        case 'm':
        case 'M':
          GP.setTool('move');
          break;
        case 'x':
        case 'X':
          GP.setTool('delete');
          break;
        case 'Escape':
          if (GP.editPanelOpen) {
            GP.closeEditPanel();
          } else if (GP.drawPoints.length > 0) {
            GP.drawPoints = [];
            GP.drawPreviewLine = null;
            GP.renderDrawing();
            GP.setStatus('Zeichnung abgebrochen');
          } else {
            GP.state.selectedElement = null;
            GP.state.multiSelected = [];
            GP.deselectPlantStructure();
            GP.renderAll();
            GP.setStatus('Auswahl aufgehoben');
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (GP.state.multiSelected.length > 0) {
            GP.deleteMultiSelected();
          } else if (GP.state.selectedElement) {
            var isArea = GP.gardenData.layers.some(function (l) { return l.id === GP.state.selectedElement; });
            if (isArea) {
              GP.deleteAreaById(GP.state.selectedElement);
            } else {
              GP.deleteElementById(GP.state.selectedElement);
            }
          }
          break;
        case 'a':
        case 'A':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            GP.selectAll();
          }
          break;
        case 'c':
        case 'C':
          if ((e.ctrlKey || e.metaKey) && GP.state.multiSelected.length > 0) {
            e.preventDefault();
            GP.copyMultiSelected();
          }
          break;
        case 'z':
        case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              GP.redo();
            } else {
              GP.undo();
            }
          }
          break;
        case 'y':
        case 'Y':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            GP.redo();
          }
          break;
        case 's':
        case 'S':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            GP.saveCurrentGarden();
          }
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            GP.zoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            GP.zoomOut();
          }
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            GP.zoomReset();
          }
          break;
        case 'g':
        case 'G':
          GP.state.gridVisible = !GP.state.gridVisible;
          GP.renderAll();
          GP.setStatus('Raster ' + (GP.state.gridVisible ? 'eingeblendet' : 'ausgeblendet'));
          break;
        case '?':
          var helpOv = document.getElementById('gardenHelpOverlay');
          if (helpOv) {
            helpOv.style.display = helpOv.style.display === 'flex' ? 'none' : 'flex';
          }
          break;
      }
    });
  };

  // =====================================================
  // Sidebar Toggle (mobile)
  // =====================================================
  GP.initSidebarToggle = function () {
    var toggle = document.getElementById('sidebarToggle');
    if (!toggle) return;

    toggle.addEventListener('click', function () {
      GP.dom.sidebar.classList.toggle('open');
    });

    GP.dom.canvasArea.addEventListener('click', function (e) {
      if (GP.dom.sidebar.classList.contains('open') && window.innerWidth <= 900) {
        GP.dom.sidebar.classList.remove('open');
      }
    });
  };

  GP.initHamburgerNav = function () {
    var hamburger = document.getElementById('hamburgerBtn');
    var navContainer = document.querySelector('.garden-app .nav-container');
    if (!hamburger || !navContainer) return;

    hamburger.addEventListener('click', function () {
      navContainer.classList.toggle('nav-open');
      var expanded = navContainer.classList.contains('nav-open');
      hamburger.setAttribute('aria-expanded', expanded);
    });
  };

  // =====================================================
  // DOM Cache
  // =====================================================
  GP.cacheDom = function () {
    GP.dom.canvas = document.getElementById('gardenCanvas');
    GP.dom.canvasArea = document.getElementById('gardenCanvasArea');
    GP.dom.canvasContent = document.getElementById('canvasContent');
    GP.dom.svgDefs = document.getElementById('svgDefs');
    GP.dom.layerAreas = document.getElementById('layerAreas');
    GP.dom.layerElements = document.getElementById('layerElements');
    GP.dom.layerDrawing = document.getElementById('layerDrawing');
    GP.dom.gardenName = document.getElementById('gardenNameInput');
    GP.dom.sidebar = document.getElementById('gardenSidebar');
    GP.dom.surfacePalette = document.getElementById('surfacePalette');
    GP.dom.plantPalette = document.getElementById('plantPalette');
    GP.dom.structurePalette = document.getElementById('structurePalette');
    GP.dom.savedGardensList = document.getElementById('savedGardensList');
    GP.dom.plantSearch = document.getElementById('plantSearch');
    GP.dom.plantCategoryFilters = document.getElementById('plantCategoryFilters');
    GP.dom.plantFavoritesToggle = document.getElementById('plantFavoritesToggle');
    GP.dom.plantSeasonalToggle = document.getElementById('plantSeasonalToggle');
    GP.dom.seasonMonthSelect = document.getElementById('seasonMonthSelect');

    // Tooltip-Element fuer Pflanzen dynamisch erstellen
    var tooltipEl = document.createElement('div');
    tooltipEl.className = 'plant-tooltip';
    tooltipEl.id = 'gardenPlantTooltip';
    if (GP.dom.sidebar) {
      GP.dom.sidebar.style.position = 'relative';
      GP.dom.sidebar.appendChild(tooltipEl);
    }
    GP.dom.plantTooltip = tooltipEl;
    GP.dom.statusText = document.getElementById('statusText');
    GP.dom.statusAreas = document.getElementById('statusAreas');
    GP.dom.statusElements = document.getElementById('statusElements');
    GP.dom.zoomLevel = document.getElementById('zoomLevel');
    GP.dom.undoBtn = document.getElementById('undoBtn');
    GP.dom.redoBtn = document.getElementById('redoBtn');
    GP.dom.layerGrid = document.getElementById('layerGrid');
    GP.dom.rulerTop = document.getElementById('rulerTop');
    GP.dom.rulerLeft = document.getElementById('rulerLeft');
    GP.dom.rulerCorner = document.getElementById('rulerCorner');
    GP.dom.tooltip = document.getElementById('gardenTooltip');
    GP.dom.gridScaleSelect = document.getElementById('gridScaleSelect');
    GP.dom.statusCanvasSize = document.getElementById('statusCanvasSize');
    GP.dom.editPanel = document.getElementById('gardenEditPanel');
  };

  // =====================================================
  // Event Binding
  // =====================================================
  GP.bindEvents = function () {
    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        GP.setTool(btn.dataset.tool);
      });
    });

    // Canvas events
    GP.dom.canvasArea.addEventListener('click', GP.onCanvasClick);
    GP.dom.canvasArea.addEventListener('mousedown', GP.onCanvasMouseDown);
    GP.dom.canvasArea.addEventListener('mousemove', GP.onCanvasMouseMove);
    GP.dom.canvasArea.addEventListener('mouseup', GP.onCanvasMouseUp);
    GP.dom.canvasArea.addEventListener('dblclick', GP.onCanvasDblClick);
    GP.dom.canvasArea.addEventListener('wheel', GP.onCanvasWheel, { passive: false });

    GP.dom.canvasArea.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    // Header buttons
    GP.dom.undoBtn.addEventListener('click', GP.undo);
    GP.dom.redoBtn.addEventListener('click', GP.redo);
    document.getElementById('saveBtn').addEventListener('click', GP.saveCurrentGarden);

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
          if (this.dataset.format === 'png') GP.exportPNG();
          else if (this.dataset.format === 'svg') GP.exportSVG();
          else if (this.dataset.format === 'json') GP.exportGardenJSON();
          else if (this.dataset.format === 'import') GP.importGardenJSON();
        });
      });
      document.addEventListener('click', function () {
        exportMenu.style.display = 'none';
      });
    }

    // Zoom buttons
    document.getElementById('zoomIn').addEventListener('click', GP.zoomIn);
    document.getElementById('zoomOut').addEventListener('click', GP.zoomOut);
    document.getElementById('zoomReset').addEventListener('click', GP.zoomReset);

    // Plant search
    GP.dom.plantSearch.addEventListener('input', function () {
      GP.renderPlantPalette(this.value);
    });

    // Garden name auto-save
    GP.dom.gardenName.addEventListener('change', function () {
      GP.gardenData.name = this.value.trim() || 'Mein Garten';
      GP.autoSave();
      GP.renderSavedGardens();
    });

    // Grid scale change
    if (GP.dom.gridScaleSelect) {
      GP.dom.gridScaleSelect.value = String(GP.state.gridScale);
      GP.dom.gridScaleSelect.addEventListener('change', function () {
        GP.state.gridScale = parseFloat(this.value);
        localStorage.setItem('gardenplanner_gridScale', String(GP.state.gridScale));
        GP.initPatterns();
        GP.renderAll();
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
      if (GP.dragState) GP.endDrag();
    });
  };

  // =====================================================
  // Load Last Garden
  // =====================================================
  GP.loadLastGarden = function () {
    var gardens = GP.getAllGardens();
    if (gardens.length > 0) {
      gardens.sort(function (a, b) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
      GP.loadGarden(gardens[0].id);
    }
  };

  // =====================================================
  // Init
  // =====================================================
  GP.init = async function () {
    GP.cacheDom();

    // Restore grid scale
    var savedScale = localStorage.getItem('gardenplanner_gridScale');
    if (savedScale && GP.GRID_SCALES.indexOf(parseFloat(savedScale)) !== -1) {
      GP.state.gridScale = parseFloat(savedScale);
      if (GP.dom.gridScaleSelect) GP.dom.gridScaleSelect.value = String(GP.state.gridScale);
    }

    GP.initTheme();
    GP.initPatterns();
    GP.initKeyboard();
    GP.initSidebarToggle();
    GP.initHamburgerNav();
    GP.bindEvents();

    // Pflanzen von API laden
    await GP.loadPlantsFromApi();
    await GP.loadPlantCategoriesFromApi();

    // Favoriten-Toggle binden
    if (GP.dom.plantFavoritesToggle) {
      GP.dom.plantFavoritesToggle.addEventListener('click', function () {
        GP.showPlantFavoritesOnly = !GP.showPlantFavoritesOnly;
        GP.dom.plantFavoritesToggle.classList.toggle('active', GP.showPlantFavoritesOnly);
        GP.dom.plantFavoritesToggle.setAttribute('aria-pressed', String(GP.showPlantFavoritesOnly));
        GP.renderPlantPalette(GP.dom.plantSearch ? GP.dom.plantSearch.value : '');
      });
    }

    // Saisonaler Filter (#253)
    if (GP.dom.plantSeasonalToggle) {
      GP.dom.plantSeasonalToggle.addEventListener('click', function () {
        GP.showSeasonalOnly = !GP.showSeasonalOnly;
        GP.dom.plantSeasonalToggle.classList.toggle('active', GP.showSeasonalOnly);
        GP.dom.plantSeasonalToggle.setAttribute('aria-pressed', String(GP.showSeasonalOnly));
        GP.renderPlantPalette(GP.dom.plantSearch ? GP.dom.plantSearch.value : '');
      });
    }

    // Saisonwechsel-Dropdown (#253)
    if (GP.dom.seasonMonthSelect) {
      GP.dom.seasonMonthSelect.value = String(GP.selectedSeasonMonth);
      GP.dom.seasonMonthSelect.addEventListener('change', function () {
        GP.selectedSeasonMonth = parseInt(this.value, 10);
        GP.renderElements();
        GP.renderPlantPalette(GP.dom.plantSearch ? GP.dom.plantSearch.value : '');
      });
    }

    // Render sidebars
    GP.renderSurfacePalette();
    GP.renderPlantCategoryFilters();
    GP.renderPlantPalette();
    GP.renderStructurePalette();
    GP.renderSavedGardens();

    // Load last garden or show empty
    GP.loadLastGarden();
    window.addEventListener('resize', function () { GP.renderRulers(); });
    GP.renderAll();

    // Gaerten vom Server synchronisieren (#251)
    GP.syncGardensFromServer();

    GP.setStatus('Bereit \u2014 W\u00e4hle ein Werkzeug oder platziere Pflanzen');
  };

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', GP.init);
  } else {
    GP.init();
  }
})();
