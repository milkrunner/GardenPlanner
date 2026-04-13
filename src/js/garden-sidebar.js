/**
 * Garden Planner - Sidebar Module
 * Pflanzenpalette, Kategorien-Filter, Favoriten, Saisonfilter,
 * Strukturen-Palette, Oberflaechen-Palette, Gespeicherte Gaerten
 *
 * Abhaengig von: garden-core.js, garden-canvas.js (window.GP)
 *
 * SECURITY NOTE: All user-facing text uses textContent or GP.escapeText().
 * The buildPlantTooltipHtml() function uses innerHTML with escaped plant data
 * from our own API/hardcoded fallbacks - all dynamic values pass through
 * GP.escapeText() before HTML insertion.
 */
(function () {
  'use strict';

  var GP = window.GP;

  // =====================================================
  // Pflanzen-API Integration (#247)
  // =====================================================
  GP.mapApiPlantToInternal = function (apiPlant) {
    var sunLabels = { full: 'Sonnig', partial: 'Halbschatten', shade: 'Schatten' };
    var seasonLabels = { spring: 'Fr\u00fchl.', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };
    var sunText = sunLabels[apiPlant.sun] || apiPlant.sun || '';
    var seasonText = (apiPlant.season || []).map(function (s) { return seasonLabels[s] || s; }).join(', ');
    var infoText = sunText + (seasonText ? ', ' + seasonText : '');

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
  };

  GP.loadPlantsFromApi = async function () {
    try {
      var res = await fetch(GP.API_BASE + '/plants');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('Keine Pflanzen');
      GP.PLANTS = data.map(GP.mapApiPlantToInternal);
    } catch (err) {
      console.warn('Pflanzen-API nicht erreichbar, verwende Fallback:', err.message);
      GP.PLANTS = GP.FALLBACK_PLANTS;
    }
  };

  GP.loadPlantCategoriesFromApi = async function () {
    try {
      var res = await fetch(GP.API_BASE + '/plant-categories');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (Array.isArray(data)) {
        GP.plantCategories = data;
      }
    } catch (err) {
      var cats = {};
      GP.PLANTS.forEach(function (p) {
        if (p.category) cats[p.category] = true;
      });
      GP.plantCategories = Object.keys(cats).sort();
    }
  };

  // =====================================================
  // Favoriten-System
  // =====================================================
  GP.getPlantFavorites = function () {
    try {
      var stored = localStorage.getItem('plant_favorites');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  };

  GP.savePlantFavorites = function (favorites) {
    localStorage.setItem('plant_favorites', JSON.stringify(favorites));
  };

  GP.togglePlantFavorite = function (plantId) {
    var favorites = GP.getPlantFavorites();
    var index = favorites.indexOf(plantId);
    if (index === -1) {
      favorites.push(plantId);
    } else {
      favorites.splice(index, 1);
    }
    GP.savePlantFavorites(favorites);
    return index === -1;
  };

  // =====================================================
  // Kategorie-Filter
  // =====================================================
  GP.renderPlantCategoryFilters = function () {
    var container = GP.dom.plantCategoryFilters;
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    var allBtn = document.createElement('button');
    allBtn.className = 'plant-category-btn' + (GP.currentPlantCategory === '' ? ' active' : '');
    allBtn.textContent = 'Alle';
    allBtn.addEventListener('click', function () {
      GP.currentPlantCategory = '';
      GP.renderPlantCategoryFilters();
      GP.renderPlantPalette(GP.dom.plantSearch ? GP.dom.plantSearch.value : '');
    });
    container.appendChild(allBtn);

    GP.plantCategories.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.className = 'plant-category-btn' + (GP.currentPlantCategory === cat ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', function () {
        GP.currentPlantCategory = cat;
        GP.renderPlantCategoryFilters();
        GP.renderPlantPalette(GP.dom.plantSearch ? GP.dom.plantSearch.value : '');
      });
      container.appendChild(btn);
    });
  };

  // =====================================================
  // Pflanzen-Tooltip
  // =====================================================
  GP.buildPlantTooltipHtml = function (plant) {
    var diffLabels = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwer' };
    var sunLabels = { full: 'Volle Sonne', partial: 'Halbschatten', shade: 'Schatten' };
    var waterLabels = { low: 'Wenig', medium: 'Mittel', high: 'Viel' };
    var seasonLabels = { spring: 'Fr\u00fchling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };

    // Build tooltip using DOM to avoid innerHTML with dynamic content
    var container = document.createElement('div');

    var titleEl = document.createElement('div');
    titleEl.className = 'plant-tooltip-title';
    titleEl.textContent = plant.name;
    container.appendChild(titleEl);

    var dl = document.createElement('dl');
    dl.className = 'plant-tooltip-props';

    function addProp(label, value) {
      var dt = document.createElement('dt');
      dt.textContent = label;
      dl.appendChild(dt);
      var dd = document.createElement('dd');
      dd.textContent = value;
      dl.appendChild(dd);
    }

    if (plant.category) addProp('Kategorie', plant.category);
    if (plant.difficulty) addProp('Schwierigkeit', diffLabels[plant.difficulty] || plant.difficulty);
    if (plant.sun) addProp('Sonne', sunLabels[plant.sun] || plant.sun);
    if (plant.water) addProp('Wasser', waterLabels[plant.water] || plant.water);
    if (plant.season && plant.season.length > 0) {
      var seasons = plant.season.map(function (s) { return seasonLabels[s] || s; }).join(', ');
      addProp('Saison', seasons);
    }
    if (plant.spacing) addProp('Abstand', plant.spacing);
    if (plant.companions && plant.companions.length > 0) {
      addProp('Gute Nachbarn', plant.companions.join(', '));
    }

    container.appendChild(dl);
    return container;
  };

  GP.showPlantTooltip = function (plant, referenceEl) {
    var tooltip = GP.dom.plantTooltip;
    if (!tooltip) return;
    while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
    tooltip.appendChild(GP.buildPlantTooltipHtml(plant));
    tooltip.classList.add('visible');

    var rect = referenceEl.getBoundingClientRect();
    var sidebarRect = GP.dom.sidebar ? GP.dom.sidebar.getBoundingClientRect() : { left: 0 };
    tooltip.style.left = (rect.right - sidebarRect.left + 8) + 'px';
    tooltip.style.top = (rect.top - sidebarRect.top) + 'px';
  };

  GP.hidePlantTooltip = function () {
    var tooltip = GP.dom.plantTooltip;
    if (tooltip) {
      tooltip.classList.remove('visible');
    }
  };

  // =====================================================
  // Pflanzen-Palette
  // =====================================================
  GP.renderPlantPalette = function (filter) {
    var container = GP.dom.plantPalette;
    while (container.firstChild) container.removeChild(container.firstChild);

    var filtered = GP.PLANTS;

    if (GP.currentPlantCategory) {
      filtered = filtered.filter(function (p) {
        return p.category === GP.currentPlantCategory;
      });
    }

    if (filter) {
      var f = filter.toLowerCase();
      filtered = filtered.filter(function (p) {
        return p.name.toLowerCase().indexOf(f) !== -1 ||
               (p.category && p.category.toLowerCase().indexOf(f) !== -1);
      });
    }

    if (GP.showPlantFavoritesOnly) {
      var favs = GP.getPlantFavorites();
      filtered = filtered.filter(function (p) {
        return favs.indexOf(p.id) !== -1;
      });
    }

    if (GP.showSeasonalOnly) {
      filtered = filtered.filter(function (p) {
        return GP.isPlantInSeason(p, GP.selectedSeasonMonth);
      });
    }

    if (filtered.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'saved-gardens-empty';
      empty.textContent = 'Keine Pflanzen gefunden';
      container.appendChild(empty);
      return;
    }

    var favorites = GP.getPlantFavorites();

    filtered.forEach(function (plant) {
      var el = document.createElement('div');
      el.className = 'palette-element';
      if (GP.state.selectedPlant && GP.state.selectedPlant.id === plant.id) {
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
      favBtn.textContent = '\u2765';
      favBtn.title = isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzuf\u00fcgen';
      favBtn.setAttribute('aria-label', favBtn.title);
      favBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var nowFav = GP.togglePlantFavorite(plant.id);
        favBtn.classList.toggle('active', nowFav);
        favBtn.title = nowFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzuf\u00fcgen';
        favBtn.setAttribute('aria-label', favBtn.title);
        if (GP.showPlantFavoritesOnly && !nowFav) {
          GP.renderPlantPalette(GP.dom.plantSearch ? GP.dom.plantSearch.value : '');
        }
      });
      el.appendChild(favBtn);

      el.addEventListener('mouseenter', function () {
        GP.showPlantTooltip(plant, el);
      });
      el.addEventListener('mouseleave', function () {
        GP.hidePlantTooltip();
      });

      el.addEventListener('click', function () {
        if (GP.state.selectedPlant && GP.state.selectedPlant.id === plant.id) {
          GP.deselectPlantStructure();
          GP.updateStatusForTool();
          return;
        }
        GP.deselectPlantStructure();
        GP.state.selectedPlant = plant;
        el.classList.add('active');
        GP.setTool('select');
        GP.setStatus('Klicke auf den Canvas, um ' + plant.name + ' zu platzieren');
      });

      container.appendChild(el);
    });
  };

  // =====================================================
  // Strukturen-Palette
  // =====================================================
  GP.renderStructurePalette = function () {
    var container = GP.dom.structurePalette;
    while (container.firstChild) container.removeChild(container.firstChild);

    GP.STRUCTURES.forEach(function (structure) {
      var el = document.createElement('div');
      el.className = 'palette-element';
      if (GP.state.selectedStructure && GP.state.selectedStructure.id === structure.id) {
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
        if (GP.state.selectedStructure && GP.state.selectedStructure.id === structure.id) {
          GP.deselectPlantStructure();
          GP.updateStatusForTool();
          return;
        }
        GP.deselectPlantStructure();
        GP.state.selectedStructure = structure;
        el.classList.add('active');
        GP.setTool('select');
        GP.setStatus('Klicke auf den Canvas, um ' + structure.name + ' zu platzieren');
      });

      container.appendChild(el);
    });
  };

  // =====================================================
  // Oberflaechen-Palette
  // =====================================================
  GP.renderSurfacePalette = function () {
    var container = GP.dom.surfacePalette;
    while (container.firstChild) container.removeChild(container.firstChild);

    GP.SURFACE_TYPES.forEach(function (surface) {
      var item = document.createElement('div');
      item.className = 'surface-item';
      if (GP.state.selectedSurface === surface.id) {
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
        GP.state.selectedSurface = surface.id;
        GP.renderSurfacePalette();

        if (GP.state.tool !== 'draw') {
          GP.setTool('draw');
        }
        GP.updateStatusForTool();
      });

      container.appendChild(item);
    });
  };

  // =====================================================
  // Gespeicherte Gaerten
  // =====================================================
  GP.renderSavedGardens = function () {
    var container = GP.dom.savedGardensList;
    while (container.firstChild) container.removeChild(container.firstChild);

    var gardens = GP.getAllGardens();

    if (gardens.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'saved-gardens-empty';
      empty.textContent = 'Keine gespeicherten G\u00e4rten';
      container.appendChild(empty);
    } else {
      gardens.forEach(function (garden) {
        var item = document.createElement('div');
        item.className = 'saved-garden-item';
        if (GP.currentGardenId === garden.id) {
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
        deleteBtn.textContent = '\u00d7';
        deleteBtn.title = 'L\u00f6schen';
        deleteBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          GP.gardenConfirm('Garten l\u00f6schen', 'Garten "' + (garden.name || 'Unbenannt') + '" wirklich l\u00f6schen? Diese Aktion kann nicht r\u00fcckg\u00e4ngig gemacht werden.').then(function (ok) {
            if (ok) GP.deleteGarden(garden.id);
          });
        });
        item.appendChild(deleteBtn);

        item.addEventListener('click', function () {
          GP.loadGarden(garden.id);
        });

        container.appendChild(item);
      });
    }

    var newBtn = document.createElement('button');
    newBtn.className = 'saved-garden-new-btn';
    newBtn.textContent = '+ Neuer Garten';
    newBtn.addEventListener('click', function () {
      GP.newGarden();
    });
    container.appendChild(newBtn);
  };
})();
