/**
 * Garden Planner - Interactive grid-based garden layout editor
 * MVP: localStorage-based save/load, vanilla JS
 */

(function () {
  'use strict';

  // =====================================================
  // Element Definitions
  // =====================================================
  const GARDEN_ELEMENTS = {
    beds: [
      { id: 'raised-bed', name: 'Hochbeet', icon: '\u{1F331}', color: '#8B7355' },
      { id: 'ground-bed', name: 'Bodenbeet', icon: '\u{1F33F}', color: '#6B8E23' },
      { id: 'herb-spiral', name: 'Kr\u00E4uterspirale', icon: '\u{1F300}', color: '#9ACD32' }
    ],
    paths: [
      { id: 'stone-path', name: 'Steinweg', icon: '\u{1FAA8}', color: '#A9A9A9' },
      { id: 'grass-path', name: 'Rasenweg', icon: '\u{1F7E9}', color: '#7CFC00' },
      { id: 'gravel', name: 'Kies', icon: '\u26AA', color: '#D3D3D3' }
    ],
    structures: [
      { id: 'greenhouse', name: 'Gew\u00E4chshaus', icon: '\u{1F3E0}', color: '#B0C4DE' },
      { id: 'compost', name: 'Kompost', icon: '\u267B\uFE0F', color: '#8B4513' },
      { id: 'water', name: 'Wasseranschluss', icon: '\u{1F6B0}', color: '#4169E1' },
      { id: 'fence', name: 'Zaun', icon: '\u{1F3D7}\uFE0F', color: '#DEB887' },
      { id: 'bench', name: 'Sitzbank', icon: '\u{1FA91}', color: '#D2691E' }
    ]
  };

  const CATEGORY_LABELS = {
    beds: 'Beete',
    paths: 'Wege',
    structures: 'Strukturen',
    plants: 'Pflanzen'
  };

  const GRID_SIZES = [
    { label: '8 x 8', rows: 8, cols: 8 },
    { label: '10 x 10', rows: 10, cols: 10 },
    { label: '12 x 12', rows: 12, cols: 12 },
    { label: '16 x 16', rows: 16, cols: 16 },
    { label: '20 x 20', rows: 20, cols: 20 }
  ];

  const STORAGE_KEY = 'gardenplanner_gardens';

  // =====================================================
  // State
  // =====================================================
  let gridSize = { rows: 12, cols: 12 };
  let gridState = []; // 2D array: null or { type, name, icon, color, id }
  let selectedElement = null;
  let isPainting = false;
  let zoomLevel = 1;
  let currentGardenId = null;
  let plantElements = [];

  // =====================================================
  // DOM References
  // =====================================================
  const dom = {};

  function cacheDom() {
    dom.gridSizeSelect = document.getElementById('gridSizeSelect');
    dom.gridContainer = document.getElementById('gardenGrid');
    dom.gridWrapper = document.getElementById('gardenGridWrapper');
    dom.palette = document.getElementById('gardenPalette');
    dom.infoText = document.getElementById('gardenInfoText');
    dom.zoomIn = document.getElementById('zoomIn');
    dom.zoomOut = document.getElementById('zoomOut');
    dom.zoomLevel = document.getElementById('zoomLevel');
    dom.saveBtn = document.getElementById('gardenSaveBtn');
    dom.loadBtn = document.getElementById('gardenLoadBtn');
    dom.clearBtn = document.getElementById('gardenClearBtn');
    dom.saveDialog = document.getElementById('gardenSaveDialog');
    dom.loadDialog = document.getElementById('gardenLoadDialog');
  }

  // =====================================================
  // Grid Management
  // =====================================================
  function initGrid() {
    gridState = [];
    for (let r = 0; r < gridSize.rows; r++) {
      gridState[r] = [];
      for (let c = 0; c < gridSize.cols; c++) {
        gridState[r][c] = null;
      }
    }
  }

  function renderGrid() {
    dom.gridContainer.innerHTML = '';
    dom.gridContainer.style.gridTemplateColumns = 'repeat(' + gridSize.cols + ', 1fr)';
    dom.gridContainer.style.gridTemplateRows = 'repeat(' + gridSize.rows + ', 1fr)';

    for (let r = 0; r < gridSize.rows; r++) {
      for (let c = 0; c < gridSize.cols; c++) {
        var cell = document.createElement('div');
        cell.className = 'garden-cell';
        cell.dataset.row = r;
        cell.dataset.col = c;

        var data = gridState[r][c];
        if (data) {
          cell.classList.add('garden-cell--occupied');
          cell.style.backgroundColor = data.color + '33'; // with alpha
          cell.title = data.name;
          var icon = document.createElement('span');
          icon.className = 'cell-icon';
          icon.textContent = data.icon;
          cell.appendChild(icon);
        }

        cell.addEventListener('mousedown', onCellMouseDown);
        cell.addEventListener('mouseenter', onCellMouseEnter);
        cell.addEventListener('touchstart', onCellTouchStart, { passive: false });
        cell.addEventListener('touchmove', onCellTouchMove, { passive: false });

        dom.gridContainer.appendChild(cell);
      }
    }
  }

  // =====================================================
  // Cell Interaction
  // =====================================================
  function onCellMouseDown(e) {
    e.preventDefault();
    isPainting = true;
    handleCellAction(this);
  }

  function onCellMouseEnter(e) {
    if (!isPainting) return;
    handleCellAction(this);
  }

  function onCellTouchStart(e) {
    e.preventDefault();
    isPainting = true;
    handleCellAction(this);
  }

  function onCellTouchMove(e) {
    e.preventDefault();
    var touch = e.touches[0];
    var el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.classList.contains('garden-cell')) {
      handleCellAction(el);
    }
  }

  function handleCellAction(cellEl) {
    var r = parseInt(cellEl.dataset.row);
    var c = parseInt(cellEl.dataset.col);
    var current = gridState[r][c];

    if (selectedElement) {
      // Place element
      gridState[r][c] = {
        type: selectedElement.type,
        id: selectedElement.id,
        name: selectedElement.name,
        icon: selectedElement.icon,
        color: selectedElement.color
      };
      updateCell(cellEl, gridState[r][c]);
      updateInfo('Platziert: ' + selectedElement.name + ' (' + r + ', ' + c + ')');
    } else if (current) {
      // Remove element
      gridState[r][c] = null;
      clearCell(cellEl);
      updateInfo('Entfernt: ' + current.name + ' (' + r + ', ' + c + ')');
    }
  }

  function updateCell(cellEl, data) {
    cellEl.className = 'garden-cell garden-cell--occupied';
    cellEl.style.backgroundColor = data.color + '33';
    cellEl.title = data.name;
    cellEl.innerHTML = '';
    var icon = document.createElement('span');
    icon.className = 'cell-icon';
    icon.textContent = data.icon;
    cellEl.appendChild(icon);
  }

  function clearCell(cellEl) {
    cellEl.className = 'garden-cell';
    cellEl.style.backgroundColor = '';
    cellEl.title = '';
    cellEl.innerHTML = '';
  }

  document.addEventListener('mouseup', function () {
    isPainting = false;
  });
  document.addEventListener('touchend', function () {
    isPainting = false;
  });

  // =====================================================
  // Palette
  // =====================================================
  function renderPalette() {
    dom.palette.innerHTML = '';

    // Static categories
    Object.keys(GARDEN_ELEMENTS).forEach(function (cat) {
      var section = createPaletteSection(CATEGORY_LABELS[cat], GARDEN_ELEMENTS[cat], cat);
      dom.palette.appendChild(section);
    });

    // Plants section (loaded from API)
    var plantSection = document.createElement('div');
    plantSection.className = 'palette-section';
    plantSection.id = 'palettePlants';

    var title = document.createElement('h4');
    title.className = 'palette-section-title';
    title.textContent = CATEGORY_LABELS.plants;
    plantSection.appendChild(title);

    var items = document.createElement('div');
    items.className = 'palette-items';
    items.id = 'palettePlantItems';

    var loading = document.createElement('div');
    loading.className = 'palette-loading';
    loading.textContent = 'Pflanzen laden...';
    loading.id = 'plantsLoading';
    items.appendChild(loading);

    plantSection.appendChild(items);
    dom.palette.appendChild(plantSection);

    loadPlants();
  }

  function createPaletteSection(label, items, category) {
    var section = document.createElement('div');
    section.className = 'palette-section';

    var title = document.createElement('h4');
    title.className = 'palette-section-title';
    title.textContent = label;
    section.appendChild(title);

    var container = document.createElement('div');
    container.className = 'palette-items';

    items.forEach(function (item) {
      var el = createPaletteItem(item, category);
      container.appendChild(el);
    });

    section.appendChild(container);
    return section;
  }

  function createPaletteItem(item, category) {
    var el = document.createElement('div');
    el.className = 'palette-item';
    el.dataset.id = item.id;
    el.dataset.type = category;

    var iconEl = document.createElement('span');
    iconEl.className = 'palette-item-icon';
    iconEl.style.backgroundColor = item.color + '33';
    iconEl.textContent = item.icon;
    el.appendChild(iconEl);

    var nameEl = document.createElement('span');
    nameEl.className = 'palette-item-name';
    nameEl.textContent = item.name;
    el.appendChild(nameEl);

    el.addEventListener('click', function () {
      selectPaletteItem(el, {
        type: category,
        id: item.id,
        name: item.name,
        icon: item.icon,
        color: item.color
      });
    });

    return el;
  }

  function selectPaletteItem(el, data) {
    // Deselect if clicking same item
    if (selectedElement && selectedElement.id === data.id && selectedElement.type === data.type) {
      selectedElement = null;
      el.classList.remove('palette-item--selected');
      updateInfo('Kein Element ausgew\u00E4hlt. Klicke auf eine Zelle, um ein Element zu entfernen.');
      return;
    }

    // Deselect all
    var allItems = dom.palette.querySelectorAll('.palette-item--selected');
    allItems.forEach(function (item) { item.classList.remove('palette-item--selected'); });

    selectedElement = data;
    el.classList.add('palette-item--selected');
    updateInfo('Ausgew\u00E4hlt: ' + data.icon + ' ' + data.name + ' \u2014 Klicke oder ziehe \u00FCber das Raster zum Platzieren.');
  }

  // =====================================================
  // Load Plants from API
  // =====================================================
  function loadPlants() {
    fetch('/api/v1/plants')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load plants');
        return res.json();
      })
      .then(function (data) {
        var plants = Array.isArray(data) ? data : (data.plants || []);
        var container = document.getElementById('palettePlantItems');
        var loading = document.getElementById('plantsLoading');
        if (loading) loading.remove();

        // Map API plants to palette items
        plantElements = plants.map(function (p) {
          return {
            id: 'plant-' + (p.id || p.name.toLowerCase().replace(/\s+/g, '-')),
            name: p.name,
            icon: p.icon || '\u{1F33F}',
            color: '#E8D5B7'
          };
        });

        if (plantElements.length === 0) {
          var empty = document.createElement('div');
          empty.className = 'palette-loading';
          empty.textContent = 'Keine Pflanzen vorhanden';
          container.appendChild(empty);
          return;
        }

        plantElements.forEach(function (item) {
          var el = createPaletteItem(item, 'plant');
          container.appendChild(el);
        });
      })
      .catch(function () {
        var loading = document.getElementById('plantsLoading');
        if (loading) {
          loading.textContent = 'Pflanzen konnten nicht geladen werden';
        }
      });
  }

  // =====================================================
  // Grid Size
  // =====================================================
  function onGridSizeChange() {
    var val = dom.gridSizeSelect.value;
    var parts = val.split('x');
    var newSize = { rows: parseInt(parts[0]), cols: parseInt(parts[1]) };

    // Check if grid has content
    var hasContent = gridState.some(function (row) {
      return row.some(function (cell) { return cell !== null; });
    });

    if (hasContent) {
      if (!confirm('Rastergr\u00F6\u00DFe \u00E4ndern? Inhalte au\u00DFerhalb des neuen Rasters gehen verloren.')) {
        dom.gridSizeSelect.value = gridSize.rows + 'x' + gridSize.cols;
        return;
      }
    }

    // Preserve existing cells that fit
    var oldState = gridState;
    gridSize = newSize;
    initGrid();

    for (var r = 0; r < Math.min(oldState.length, gridSize.rows); r++) {
      for (var c = 0; c < Math.min(oldState[r].length, gridSize.cols); c++) {
        gridState[r][c] = oldState[r][c];
      }
    }

    renderGrid();
    updateInfo('Rastergr\u00F6\u00DFe ge\u00E4ndert: ' + gridSize.rows + ' x ' + gridSize.cols);
  }

  // =====================================================
  // Zoom
  // =====================================================
  function setZoom(level) {
    zoomLevel = Math.max(0.5, Math.min(2, level));
    dom.gridWrapper.style.transform = 'scale(' + zoomLevel + ')';
    dom.zoomLevel.textContent = Math.round(zoomLevel * 100) + '%';
  }

  // =====================================================
  // Save / Load (localStorage)
  // =====================================================
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

  function serializeGrid() {
    var cells = [];
    for (var r = 0; r < gridSize.rows; r++) {
      for (var c = 0; c < gridSize.cols; c++) {
        if (gridState[r][c]) {
          cells.push({
            row: r,
            col: c,
            type: gridState[r][c].type,
            id: gridState[r][c].id,
            name: gridState[r][c].name,
            icon: gridState[r][c].icon,
            color: gridState[r][c].color
          });
        }
      }
    }
    return cells;
  }

  function deserializeGrid(gardenData) {
    gridSize = gardenData.gridSize;
    dom.gridSizeSelect.value = gridSize.rows + 'x' + gridSize.cols;
    initGrid();

    gardenData.cells.forEach(function (cell) {
      if (cell.row < gridSize.rows && cell.col < gridSize.cols) {
        gridState[cell.row][cell.col] = {
          type: cell.type,
          id: cell.id,
          name: cell.name,
          icon: cell.icon,
          color: cell.color
        };
      }
    });

    renderGrid();
  }

  function showSaveDialog() {
    dom.saveDialog.hidden = false;
    var nameInput = dom.saveDialog.querySelector('#gardenNameInput');
    var gardens = getAllGardens();

    // If editing existing garden, pre-fill name
    if (currentGardenId) {
      var existing = gardens.find(function (g) { return g.id === currentGardenId; });
      if (existing) {
        nameInput.value = existing.name;
      }
    } else {
      nameInput.value = '';
    }
    nameInput.focus();
  }

  function hideSaveDialog() {
    dom.saveDialog.hidden = true;
  }

  function doSave() {
    var nameInput = dom.saveDialog.querySelector('#gardenNameInput');
    var name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }

    var gardens = getAllGardens();
    var now = new Date().toISOString();
    var cells = serializeGrid();

    if (currentGardenId) {
      // Update existing
      var idx = gardens.findIndex(function (g) { return g.id === currentGardenId; });
      if (idx >= 0) {
        gardens[idx].name = name;
        gardens[idx].gridSize = { rows: gridSize.rows, cols: gridSize.cols };
        gardens[idx].cells = cells;
        gardens[idx].updatedAt = now;
      }
    } else {
      // New garden
      var garden = {
        id: 'garden_' + Date.now(),
        name: name,
        gridSize: { rows: gridSize.rows, cols: gridSize.cols },
        cells: cells,
        createdAt: now,
        updatedAt: now
      };
      currentGardenId = garden.id;
      gardens.push(garden);
    }

    saveGardens(gardens);
    hideSaveDialog();
    updateInfo('Garten "' + name + '" gespeichert.');
  }

  function showLoadDialog() {
    dom.loadDialog.hidden = false;
    renderLoadList();
  }

  function hideLoadDialog() {
    dom.loadDialog.hidden = true;
  }

  function renderLoadList() {
    var list = dom.loadDialog.querySelector('#gardenLoadList');
    list.innerHTML = '';
    var gardens = getAllGardens();

    if (gardens.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'garden-load-empty';
      empty.textContent = 'Keine gespeicherten G\u00E4rten vorhanden.';
      list.appendChild(empty);
      return;
    }

    gardens.forEach(function (garden) {
      var item = document.createElement('div');
      item.className = 'garden-load-item';

      var info = document.createElement('div');
      var nameLine = document.createElement('div');
      nameLine.className = 'garden-load-item-name';
      nameLine.textContent = garden.name;
      info.appendChild(nameLine);

      var meta = document.createElement('div');
      meta.className = 'garden-load-item-meta';
      meta.textContent = garden.gridSize.rows + 'x' + garden.gridSize.cols +
        ' | ' + garden.cells.length + ' Elemente' +
        ' | ' + new Date(garden.updatedAt).toLocaleDateString('de-DE');
      info.appendChild(meta);

      item.appendChild(info);

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'garden-load-item-delete';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'L\u00F6schen';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('Garten "' + garden.name + '" wirklich l\u00F6schen?')) {
          var gardens = getAllGardens().filter(function (g) { return g.id !== garden.id; });
          saveGardens(gardens);
          if (currentGardenId === garden.id) currentGardenId = null;
          renderLoadList();
        }
      });
      item.appendChild(deleteBtn);

      item.addEventListener('click', function () {
        currentGardenId = garden.id;
        deserializeGrid(garden);
        hideLoadDialog();
        updateInfo('Garten "' + garden.name + '" geladen.');
      });

      list.appendChild(item);
    });
  }

  // =====================================================
  // Clear
  // =====================================================
  function clearGrid() {
    if (!confirm('Gesamtes Raster l\u00F6schen? Alle platzierten Elemente werden entfernt.')) {
      return;
    }
    initGrid();
    renderGrid();
    currentGardenId = null;
    updateInfo('Raster gel\u00F6scht.');
  }

  // =====================================================
  // Info bar
  // =====================================================
  function updateInfo(text) {
    dom.infoText.innerHTML = '';
    var strong = document.createElement('strong');
    strong.textContent = text;
    dom.infoText.appendChild(strong);
  }

  // =====================================================
  // Theme toggle (reuse existing logic)
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
  // Keyboard shortcuts
  // =====================================================
  function initKeyboard() {
    document.addEventListener('keydown', function (e) {
      // Escape: deselect element or close dialogs
      if (e.key === 'Escape') {
        if (!dom.saveDialog.hidden) { hideSaveDialog(); return; }
        if (!dom.loadDialog.hidden) { hideLoadDialog(); return; }
        if (selectedElement) {
          selectedElement = null;
          var allItems = dom.palette.querySelectorAll('.palette-item--selected');
          allItems.forEach(function (item) { item.classList.remove('palette-item--selected'); });
          updateInfo('Auswahl aufgehoben.');
        }
      }
      // Ctrl+S: save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        showSaveDialog();
      }
    });
  }

  // =====================================================
  // Init
  // =====================================================
  function init() {
    cacheDom();
    initTheme();
    initKeyboard();

    // Grid size select
    GRID_SIZES.forEach(function (size) {
      var opt = document.createElement('option');
      opt.value = size.rows + 'x' + size.cols;
      opt.textContent = size.label;
      if (size.rows === gridSize.rows && size.cols === gridSize.cols) {
        opt.selected = true;
      }
      dom.gridSizeSelect.appendChild(opt);
    });
    dom.gridSizeSelect.addEventListener('change', onGridSizeChange);

    // Buttons
    dom.saveBtn.addEventListener('click', showSaveDialog);
    dom.loadBtn.addEventListener('click', showLoadDialog);
    dom.clearBtn.addEventListener('click', clearGrid);
    dom.zoomIn.addEventListener('click', function () { setZoom(zoomLevel + 0.1); });
    dom.zoomOut.addEventListener('click', function () { setZoom(zoomLevel - 0.1); });

    // Save dialog buttons
    dom.saveDialog.querySelector('#gardenSaveConfirm').addEventListener('click', doSave);
    dom.saveDialog.querySelector('#gardenSaveCancel').addEventListener('click', hideSaveDialog);
    dom.saveDialog.querySelector('#gardenNameInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doSave(); }
    });

    // Load dialog buttons
    dom.loadDialog.querySelector('#gardenLoadClose').addEventListener('click', hideLoadDialog);

    // Backdrop clicks close dialogs
    dom.saveDialog.addEventListener('click', function (e) {
      if (e.target === dom.saveDialog) hideSaveDialog();
    });
    dom.loadDialog.addEventListener('click', function (e) {
      if (e.target === dom.loadDialog) hideLoadDialog();
    });

    // Build grid and palette
    initGrid();
    renderGrid();
    renderPalette();

    updateInfo('W\u00E4hle ein Element aus der Seitenleiste und klicke auf das Raster zum Platzieren.');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
