/**
 * Pflanzkalender - Saisonaler Kalender mit Gantt-Darstellung (#245)
 * Laedt Pflanzen von /api/v1/plants und zeigt Aussaat/Pflege/Ernte-Phasen.
 */
(function () {
  'use strict';

  var API_BASE = '/api/v1';
  var plants = [];
  var categories = [];
  var currentCategory = '';
  var searchQuery = '';
  var currentMonth = new Date().getMonth(); // 0-11

  var MONTH_NAMES = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  var MONTH_SHORT = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  // Saison-zu-Monat Mapping
  var SEASON_MONTHS = {
    spring: [2, 3, 4],    // Maerz-Mai
    summer: [5, 6, 7],    // Juni-August
    autumn: [8, 9, 10],   // September-November
    winter: [11, 0, 1]    // Dezember-Februar
  };

  /**
   * Berechnet die Phasen (Aussaat, Pflege, Ernte) fuer eine Pflanze
   * basierend auf den season/germination/harvest-Feldern.
   */
  function calculatePhases(plant) {
    var phases = { sow: [], care: [], harvest: [] };
    if (!plant.season || plant.season.length === 0) return phases;

    // Alle Monate in denen die Pflanze Saison hat
    var seasonMonths = [];
    plant.season.forEach(function (s) {
      var months = SEASON_MONTHS[s];
      if (months) {
        months.forEach(function (m) {
          if (seasonMonths.indexOf(m) === -1) seasonMonths.push(m);
        });
      }
    });
    seasonMonths.sort(function (a, b) { return a - b; });

    if (seasonMonths.length === 0) return phases;

    // Aussaat: Erste Haelfte der Saisonmonate
    var sowLen = Math.max(1, Math.ceil(seasonMonths.length / 3));
    phases.sow = seasonMonths.slice(0, sowLen);

    // Pflege: Mittlerer Teil
    var careStart = sowLen;
    var careLen = Math.max(1, Math.ceil(seasonMonths.length / 3));
    phases.care = seasonMonths.slice(careStart, careStart + careLen);

    // Ernte: Letzter Teil
    var harvestStart = careStart + careLen;
    phases.harvest = seasonMonths.slice(harvestStart);

    // Falls Ernte leer (bei kurzer Saison), letzte Monate nutzen
    if (phases.harvest.length === 0 && seasonMonths.length >= 2) {
      phases.harvest = [seasonMonths[seasonMonths.length - 1]];
    }

    return phases;
  }

  /**
   * Bestimmt die aktuelle Phase fuer eine Pflanze im gegebenen Monat.
   */
  function getCurrentPhase(plant, month) {
    var phases = calculatePhases(plant);
    if (phases.harvest.indexOf(month) !== -1) return 'harvest';
    if (phases.care.indexOf(month) !== -1) return 'care';
    if (phases.sow.indexOf(month) !== -1) return 'sow';
    return null;
  }

  var PHASE_LABELS = {
    sow: 'Aussaat',
    care: 'Pflege',
    harvest: 'Ernte'
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // =====================================================
  // Data Loading
  // =====================================================

  async function loadPlants() {
    try {
      var res = await fetch(API_BASE + '/plants');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        plants = data;
      }
    } catch (err) {
      console.warn('Pflanzen-API nicht erreichbar:', err.message);
      plants = [];
    }
  }

  async function loadCategories() {
    try {
      var res = await fetch(API_BASE + '/plant-categories');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (Array.isArray(data)) {
        categories = data;
      }
    } catch (err) {
      // Aus Pflanzen ableiten
      var cats = {};
      plants.forEach(function (p) {
        if (p.category) cats[p.category] = true;
      });
      categories = Object.keys(cats).sort();
    }
  }

  // =====================================================
  // Filtering
  // =====================================================

  function getFilteredPlants() {
    var filtered = plants;

    if (currentCategory) {
      filtered = filtered.filter(function (p) {
        return p.category === currentCategory;
      });
    }

    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      filtered = filtered.filter(function (p) {
        return p.name.toLowerCase().indexOf(q) !== -1 ||
               (p.category && p.category.toLowerCase().indexOf(q) !== -1);
      });
    }

    return filtered;
  }

  // =====================================================
  // Recommendations
  // =====================================================

  function renderRecommendations() {
    var container = document.getElementById('recommendationList');
    var monthLabel = document.getElementById('currentMonthName');
    if (!container) return;

    if (monthLabel) monthLabel.textContent = MONTH_NAMES[currentMonth];

    // Pflanzen die im aktuellen Monat aktiv sind
    var recommendations = plants.filter(function (plant) {
      return getCurrentPhase(plant, currentMonth) !== null;
    }).slice(0, 6); // Max 6 anzeigen

    if (recommendations.length === 0) {
      container.innerHTML = '<div class="recommendation-empty">Keine Empfehlungen fuer ' + MONTH_NAMES[currentMonth] + ' verfuegbar.</div>';
      return;
    }

    container.innerHTML = recommendations.map(function (plant) {
      var phase = getCurrentPhase(plant, currentMonth);
      var phaseLabel = PHASE_LABELS[phase] || '';
      var phaseClass = 'recommendation-phase--' + phase;

      var details = [];
      if (plant.sun) {
        var sunLabels = { full: 'Volle Sonne', partial: 'Halbschatten', shade: 'Schatten' };
        details.push(sunLabels[plant.sun] || plant.sun);
      }
      if (plant.water) {
        var waterLabels = { low: 'Wenig Wasser', medium: 'Mittel Wasser', high: 'Viel Wasser' };
        details.push(waterLabels[plant.water] || plant.water);
      }
      if (plant.spacing) details.push('Abstand: ' + escapeHtml(plant.spacing));

      var taskTitle = '';
      if (phase === 'sow') taskTitle = escapeHtml(plant.name) + ' aussaeen';
      else if (phase === 'care') taskTitle = escapeHtml(plant.name) + ' pflegen';
      else if (phase === 'harvest') taskTitle = escapeHtml(plant.name) + ' ernten';

      return '<div class="recommendation-card">' +
        '<div class="recommendation-header">' +
          '<span class="recommendation-icon">' + escapeHtml(plant.icon || '') + '</span>' +
          '<span class="recommendation-name">' + escapeHtml(plant.name) + '</span>' +
          '<span class="recommendation-phase ' + phaseClass + '">' + phaseLabel + '</span>' +
        '</div>' +
        '<div class="recommendation-details">' +
          (details.length > 0 ? details.join(' &middot; ') : '') +
          (plant.tips ? '<br>' + escapeHtml(plant.tips.substring(0, 100)) + (plant.tips.length > 100 ? '...' : '') : '') +
        '</div>' +
        '<button class="recommendation-action" data-task-title="' + escapeHtml(taskTitle) + '" data-plant="' + escapeHtml(plant.name) + '" title="Als Aufgabe uebernehmen">' +
          '&#10010; Aufgabe erstellen' +
        '</button>' +
      '</div>';
    }).join('');

    // Klick-Handler fuer "Aufgabe erstellen"
    container.querySelectorAll('.recommendation-action').forEach(function (btn) {
      btn.addEventListener('click', function () {
        createTaskFromRecommendation(btn.dataset.taskTitle, btn.dataset.plant);
      });
    });
  }

  /**
   * Erstellt eine Aufgabe aus einer Empfehlung via API oder leitet
   * zur Aufgaben-Erstellungsseite weiter.
   */
  async function createTaskFromRecommendation(title, plantName) {
    try {
      var res = await fetch(API_BASE + '/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          location: 'Garten',
          description: 'Automatisch vorgeschlagen aus dem Pflanzkalender fuer ' + plantName + ' (' + MONTH_NAMES[currentMonth] + ').',
          priority: 'medium'
        })
      });
      if (res.ok) {
        showNotification('Aufgabe "' + title + '" erstellt!');
      } else {
        // Fallback: Zur Aufgaben-Seite weiterleiten
        window.location.href = '/index?title=' + encodeURIComponent(title);
      }
    } catch (err) {
      window.location.href = '/index?title=' + encodeURIComponent(title);
    }
  }

  function showNotification(message) {
    var existing = document.querySelector('.calendar-notification');
    if (existing) existing.remove();

    var note = document.createElement('div');
    note.className = 'calendar-notification';
    note.textContent = message;
    note.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--primary);color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:fadeIn 0.3s ease';
    document.body.appendChild(note);
    setTimeout(function () { note.remove(); }, 3000);
  }

  // =====================================================
  // Timeline/Gantt Rendering
  // =====================================================

  function renderTimeline() {
    var body = document.getElementById('timelineBody');
    if (!body) return;

    var filtered = getFilteredPlants();

    // Aktuellen Monat in Header markieren
    var headerMonths = document.querySelectorAll('.timeline-months span');
    headerMonths.forEach(function (span, idx) {
      span.classList.toggle('current-month', idx === currentMonth);
    });

    if (filtered.length === 0) {
      body.innerHTML = '<div class="timeline-empty">Keine Pflanzen gefunden.</div>';
      return;
    }

    body.innerHTML = filtered.map(function (plant) {
      var phases = calculatePhases(plant);

      var cells = '';
      for (var m = 0; m < 12; m++) {
        var isCurrent = m === currentMonth;
        var bar = '';
        if (phases.sow.indexOf(m) !== -1) {
          bar = '<div class="timeline-bar timeline-bar--sow" title="Aussaat"></div>';
        } else if (phases.care.indexOf(m) !== -1) {
          bar = '<div class="timeline-bar timeline-bar--care" title="Pflege"></div>';
        } else if (phases.harvest.indexOf(m) !== -1) {
          bar = '<div class="timeline-bar timeline-bar--harvest" title="Ernte"></div>';
        }
        cells += '<div class="timeline-cell' + (isCurrent ? ' current-month' : '') + '">' + bar + '</div>';
      }

      return '<div class="timeline-row">' +
        '<div class="timeline-row-plant">' +
          '<span class="timeline-row-icon">' + escapeHtml(plant.icon || '') + '</span>' +
          '<span class="timeline-row-name">' + escapeHtml(plant.name) + '</span>' +
        '</div>' +
        '<div class="timeline-row-bars">' + cells + '</div>' +
      '</div>';
    }).join('');
  }

  // =====================================================
  // Category Filter
  // =====================================================

  function renderCategoryFilter() {
    var select = document.getElementById('calendarCategoryFilter');
    if (!select) return;

    select.innerHTML = '<option value="">Alle</option>' +
      categories.map(function (cat) {
        return '<option value="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</option>';
      }).join('');
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
  // Version Display
  // =====================================================

  async function loadVersion() {
    try {
      var res = await fetch(API_BASE + '/version');
      if (res.ok) {
        var data = await res.json();
        var el = document.getElementById('appVersion');
        if (el && data.version) el.textContent = 'v' + data.version;
      }
    } catch (e) { /* ignore */ }
  }

  // =====================================================
  // Init
  // =====================================================

  async function init() {
    initTheme();

    await loadPlants();
    await loadCategories();

    renderCategoryFilter();
    renderRecommendations();
    renderTimeline();
    loadVersion();

    // Event-Listener
    var categoryFilter = document.getElementById('calendarCategoryFilter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', function () {
        currentCategory = this.value;
        renderTimeline();
      });
    }

    var searchInput = document.getElementById('calendarSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = this.value.trim();
        renderTimeline();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
