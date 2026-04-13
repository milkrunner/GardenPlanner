/**
 * Display-Ansicht — TV/Monitor Vollbild
 *
 * Laedt offene Aufgaben von /api/v1/tasks und zeigt sie
 * als nicht-interaktive Cards in einem responsiven Grid.
 * Automatisches Refresh alle 5 Minuten.
 */
(function () {
  'use strict';

  // --- Konfiguration ---
  var API_URL = '/api/v1/tasks';
  var REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 Minuten
  var CLOCK_INTERVAL_MS = 1000;

  // --- DOM-Referenzen ---
  var tasksGrid = document.getElementById('tasksGrid');
  var emptyState = document.getElementById('emptyState');
  var taskCounter = document.getElementById('taskCounter');
  var clockEl = document.getElementById('clock');
  var lastUpdateEl = document.getElementById('lastUpdate');

  // --- Hilfsfunktionen ---

  /**
   * Gibt das heutige Datum als YYYY-MM-DD String zurueck (lokal).
   */
  function todayString() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  /**
   * Prüft ob ein Datum ueberfaellig ist.
   */
  function isOverdue(dueDate) {
    if (!dueDate) return false;
    return dueDate < todayString();
  }

  /**
   * Formatiert ein Datum als lesbaren deutschen String.
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      var parts = dateStr.split('-');
      return parts[2] + '.' + parts[1] + '.' + parts[0];
    } catch (e) {
      return dateStr;
    }
  }

  /**
   * Formatiert die aktuelle Uhrzeit als HH:MM:SS.
   */
  function formatTime() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  /**
   * Formatiert einen Timestamp fuer die letzte Aktualisierung.
   */
  function formatLastUpdate() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    return 'Letzte Aktualisierung: ' + h + ':' + m;
  }

  /**
   * Escapet HTML-Zeichen.
   */
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /**
   * Sortiert Tasks: Prioritaet (high > medium > low), dann Faelligkeitsdatum.
   */
  function sortTasks(tasks) {
    var priorityOrder = { high: 0, medium: 1, low: 2 };
    return tasks.slice().sort(function (a, b) {
      var pa = priorityOrder[a.priority] !== undefined ? priorityOrder[a.priority] : 3;
      var pb = priorityOrder[b.priority] !== undefined ? priorityOrder[b.priority] : 3;
      if (pa !== pb) return pa - pb;
      // Faelligkeitsdatum: fruehere zuerst, ohne Datum ans Ende
      var da = a.dueDate || '9999-12-31';
      var db = b.dueDate || '9999-12-31';
      return da.localeCompare(db);
    });
  }

  /**
   * Filtert nur offene Tasks (pending, in-progress).
   */
  function filterOpenTasks(tasks) {
    return tasks.filter(function (t) {
      return t.status === 'pending' || t.status === 'in-progress';
    });
  }

  // --- SVG Icons ---

  var iconLocation = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  var iconCalendar = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

  // --- Prioritaet & Status Labels ---

  var priorityLabels = {
    high: 'Hoch',
    medium: 'Mittel',
    low: 'Niedrig'
  };

  var statusLabels = {
    pending: 'Offen',
    'in-progress': 'In Bearbeitung'
  };

  // --- Card rendern ---

  /**
   * Erstellt das HTML fuer eine einzelne Task-Card.
   */
  function renderCard(task) {
    var priority = task.priority || 'low';
    var status = task.status || 'pending';
    var overdue = isOverdue(task.dueDate);

    var classes = ['display-card', 'display-card--priority-' + priority];
    if (overdue) classes.push('display-card--overdue');

    var html = '<article class="' + classes.join(' ') + '">';

    // Titel
    html += '<h2 class="display-card__title">' + escapeHtml(task.title) + '</h2>';

    // Badges
    html += '<div class="display-card__badges">';
    html += '<span class="display-badge display-badge--' + priority + '">' + escapeHtml(priorityLabels[priority] || priority) + '</span>';
    html += '<span class="display-badge display-badge--' + status + '">' + escapeHtml(statusLabels[status] || status) + '</span>';
    html += '</div>';

    // Meta (Standort, Datum)
    var hasMeta = task.location || task.dueDate;
    if (hasMeta) {
      html += '<div class="display-card__meta">';
      if (task.location) {
        html += '<span class="display-card__meta-item">' + iconLocation + ' ' + escapeHtml(task.location) + '</span>';
      }
      if (task.dueDate) {
        var dateClass = overdue ? ' display-card__meta-item--overdue' : '';
        html += '<span class="display-card__meta-item' + dateClass + '">' + iconCalendar + ' ' + escapeHtml(formatDate(task.dueDate)) + '</span>';
      }
      html += '</div>';
    }

    html += '</article>';
    return html;
  }

  // --- Daten laden und rendern ---

  /**
   * Laedt Tasks von der API und rendert das Grid.
   */
  function loadAndRender() {
    fetch(API_URL, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        // API kann { data: [...] } oder direkt [...] liefern
        var tasks = Array.isArray(data) ? data : (data.data || []);
        var openTasks = filterOpenTasks(tasks);
        var sorted = sortTasks(openTasks);

        // Counter aktualisieren
        taskCounter.textContent = sorted.length;

        if (sorted.length === 0) {
          tasksGrid.innerHTML = '';
          tasksGrid.style.display = 'none';
          emptyState.classList.add('visible');
        } else {
          emptyState.classList.remove('visible');
          tasksGrid.style.display = '';

          // Fade-Effekt
          tasksGrid.classList.add('display-fade-out');

          setTimeout(function () {
            var html = '';
            for (var i = 0; i < sorted.length; i++) {
              html += renderCard(sorted[i]);
            }
            tasksGrid.innerHTML = html;
            tasksGrid.classList.remove('display-fade-out');
            tasksGrid.classList.add('display-fade-in');

            setTimeout(function () {
              tasksGrid.classList.remove('display-fade-in');
            }, 500);
          }, 400);
        }

        // Letzte Aktualisierung
        lastUpdateEl.textContent = formatLastUpdate();
      })
      .catch(function (err) {
        console.error('Display: Fehler beim Laden der Aufgaben', err);
        // Bei Fehler bestehende Anzeige beibehalten, nur Timestamp aktualisieren
        lastUpdateEl.textContent = 'Fehler beim Laden — ' + formatTime();
      });
  }

  // --- Uhr aktualisieren ---
  function updateClock() {
    clockEl.textContent = formatTime();
  }

  // --- Initialisierung ---
  updateClock();
  setInterval(updateClock, CLOCK_INTERVAL_MS);

  // Erster Datenladen
  loadAndRender();

  // Auto-Refresh alle 5 Minuten
  setInterval(loadAndRender, REFRESH_INTERVAL_MS);
})();
