/**
 * Garden Planner - Edit Module
 * Element-Bearbeitung (Edit-Panel, Vertex-Editing, Multiselect)
 *
 * Abhaengig von: garden-core.js, garden-canvas.js, garden-tools.js (window.GP)
 *
 * SECURITY NOTE: The innerHTML usage in renderAreaEditPanel/renderElementEditPanel
 * builds form controls from trusted internal data (surface type names, element names).
 * All dynamic values are escaped via GP.escapeText() before HTML insertion.
 */
(function () {
  'use strict';

  var GP = window.GP;

  // =====================================================
  // Edit Panel (#250)
  // =====================================================
  GP.openEditPanel = function (id, e) {
    var panel = document.getElementById('gardenEditPanel');
    if (!panel) return;

    GP.editingElementId = id;
    GP.editPanelOpen = true;
    GP.state.selectedElement = id;
    GP.renderAll();

    var area = GP.gardenData.layers.find(function (l) { return l.id === id; });
    var element = GP.gardenData.elements.find(function (el) { return el.id === id; });

    if (area) {
      GP.renderAreaEditPanel(area, panel);
    } else if (element) {
      GP.renderElementEditPanel(element, panel);
    } else {
      return;
    }

    GP.positionEditPanel(panel, e);
    panel.classList.add('visible');
  };

  GP.closeEditPanel = function () {
    var panel = document.getElementById('gardenEditPanel');
    if (panel) panel.classList.remove('visible');
    GP.editPanelOpen = false;
    GP.editingElementId = null;
    GP.vertexEditMode = false;
    GP.removeVertexHandles();
  };

  GP.positionEditPanel = function (panel, e) {
    var workspace = document.querySelector('.garden-workspace');
    if (!workspace) return;
    var rect = workspace.getBoundingClientRect();
    var x = e.clientX - rect.left + 12;
    var y = e.clientY - rect.top + 12;

    if (x + 280 > rect.width) x = rect.width - 290;
    if (y + 300 > rect.height) y = Math.max(10, rect.height - 310);
    if (x < 0) x = 10;
    if (y < 0) y = 10;

    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  };

  GP.renderAreaEditPanel = function (area, panel) {
    var surface = GP.getSurfaceType(area.surfaceType);
    var title = panel.querySelector('#editPanelTitle');
    title.textContent = surface.name + ' bearbeiten';

    var body = panel.querySelector('#editPanelBody');
    // Build form using DOM methods for safety
    while (body.firstChild) body.removeChild(body.firstChild);

    var surfaceLabel = document.createElement('label');
    surfaceLabel.setAttribute('for', 'editAreaSurface');
    surfaceLabel.textContent = 'Fl\u00e4chentyp';
    body.appendChild(surfaceLabel);

    var surfaceSelect = document.createElement('select');
    surfaceSelect.id = 'editAreaSurface';
    GP.SURFACE_TYPES.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.icon + ' ' + s.name;
      if (s.id === area.surfaceType) opt.selected = true;
      surfaceSelect.appendChild(opt);
    });
    body.appendChild(surfaceSelect);

    var notesLabel = document.createElement('label');
    notesLabel.setAttribute('for', 'editAreaNotes');
    notesLabel.textContent = 'Notizen / Label';
    body.appendChild(notesLabel);

    var notesArea = document.createElement('textarea');
    notesArea.id = 'editAreaNotes';
    notesArea.placeholder = 'Notizen eingeben...';
    notesArea.rows = 2;
    notesArea.textContent = area.notes || '';
    body.appendChild(notesArea);

    var vertexLabel = document.createElement('label');
    var vertexCheck = document.createElement('input');
    vertexCheck.type = 'checkbox';
    vertexCheck.id = 'editAreaVertices';
    if (GP.vertexEditMode) vertexCheck.checked = true;
    vertexLabel.appendChild(vertexCheck);
    vertexLabel.appendChild(document.createTextNode(' Eckpunkte bearbeiten'));
    body.appendChild(vertexLabel);

    var actions = panel.querySelector('#editPanelActions');
    while (actions.firstChild) actions.removeChild(actions.firstChild);

    var delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.id = 'editPanelDelete';
    delBtn.textContent = 'L\u00f6schen';
    actions.appendChild(delBtn);

    var applyBtn = document.createElement('button');
    applyBtn.className = 'primary';
    applyBtn.id = 'editPanelApply';
    applyBtn.textContent = '\u00dcbernehmen';
    actions.appendChild(applyBtn);

    // Events binden
    applyBtn.addEventListener('click', function () {
      GP.pushUndo();
      area.surfaceType = document.getElementById('editAreaSurface').value;
      area.notes = document.getElementById('editAreaNotes').value.trim();
      GP.renderAll();
      GP.autoSave();
      GP.setStatus('Fl\u00e4che aktualisiert');
    });

    delBtn.addEventListener('click', function () {
      GP.closeEditPanel();
      GP.deleteAreaById(area.id);
    });

    vertexCheck.addEventListener('change', function () {
      GP.vertexEditMode = this.checked;
      if (GP.vertexEditMode) {
        GP.showVertexHandles(area);
      } else {
        GP.removeVertexHandles();
      }
    });

    panel.querySelector('#editPanelClose').addEventListener('click', GP.closeEditPanel);
  };

  GP.renderElementEditPanel = function (element, panel) {
    var title = panel.querySelector('#editPanelTitle');
    title.textContent = (element.icon || '') + ' ' + element.name + ' bearbeiten';

    var body = panel.querySelector('#editPanelBody');
    // Build form using DOM methods for safety
    while (body.firstChild) body.removeChild(body.firstChild);

    var nameLabel = document.createElement('label');
    nameLabel.setAttribute('for', 'editElName');
    nameLabel.textContent = 'Name';
    body.appendChild(nameLabel);

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'editElName';
    nameInput.value = element.name;
    nameInput.maxLength = 60;
    body.appendChild(nameInput);

    var scaleLabel = document.createElement('label');
    scaleLabel.setAttribute('for', 'editElScale');
    scaleLabel.textContent = 'Gr\u00f6\u00dfe (Skalierung)';
    body.appendChild(scaleLabel);

    var scaleInput = document.createElement('input');
    scaleInput.type = 'number';
    scaleInput.id = 'editElScale';
    scaleInput.value = String(element.scale || 1);
    scaleInput.min = '0.5';
    scaleInput.max = '3';
    scaleInput.step = '0.1';
    body.appendChild(scaleInput);

    var notesLabel = document.createElement('label');
    notesLabel.setAttribute('for', 'editElNotes');
    notesLabel.textContent = 'Notizen / Label';
    body.appendChild(notesLabel);

    var notesArea = document.createElement('textarea');
    notesArea.id = 'editElNotes';
    notesArea.placeholder = 'Notizen eingeben...';
    notesArea.rows = 2;
    notesArea.textContent = element.notes || '';
    body.appendChild(notesArea);

    var actions = panel.querySelector('#editPanelActions');
    while (actions.firstChild) actions.removeChild(actions.firstChild);

    var delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.id = 'editPanelDelete';
    delBtn.textContent = 'L\u00f6schen';
    actions.appendChild(delBtn);

    var applyBtn = document.createElement('button');
    applyBtn.className = 'primary';
    applyBtn.id = 'editPanelApply';
    applyBtn.textContent = '\u00dcbernehmen';
    actions.appendChild(applyBtn);

    applyBtn.addEventListener('click', function () {
      GP.pushUndo();
      element.name = document.getElementById('editElName').value.trim() || element.name;
      element.scale = parseFloat(document.getElementById('editElScale').value) || 1;
      element.notes = document.getElementById('editElNotes').value.trim();
      GP.renderAll();
      GP.autoSave();
      GP.setStatus(element.name + ' aktualisiert');
    });

    delBtn.addEventListener('click', function () {
      GP.closeEditPanel();
      GP.deleteElementById(element.id);
    });

    panel.querySelector('#editPanelClose').addEventListener('click', GP.closeEditPanel);
  };

  // =====================================================
  // Vertex-Editing
  // =====================================================
  GP.showVertexHandles = function (area) {
    GP.removeVertexHandles();
    var layer = GP.dom.layerDrawing;
    if (!area.points || area.points.length < 3) return;

    area.points.forEach(function (pt, idx) {
      var handle = GP.createSVGElement('circle');
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
        GP.vertexDragState = {
          areaId: area.id,
          idx: idx,
          origPoint: [pt[0], pt[1]]
        };
        GP.pushUndo();
      });

      layer.appendChild(handle);
    });
  };

  GP.removeVertexHandles = function () {
    var layer = GP.dom.layerDrawing;
    if (!layer) return;
    var handles = layer.querySelectorAll('.vertex-handle');
    handles.forEach(function (h) { h.remove(); });
  };

  GP.handleVertexDrag = function (e) {
    if (!GP.vertexDragState) return;
    var area = GP.gardenData.layers.find(function (l) { return l.id === GP.vertexDragState.areaId; });
    if (!area) return;

    var pt = GP.mouseToSVG(e);
    var snapped = GP.snapToGrid(pt, e.shiftKey);
    area.points[GP.vertexDragState.idx] = [Math.round(snapped.x), Math.round(snapped.y)];
    GP.renderAreas();
    GP.showVertexHandles(area);
  };

  GP.endVertexDrag = function () {
    if (!GP.vertexDragState) return;
    GP.vertexDragState = null;
    GP.autoSave();
  };
})();
