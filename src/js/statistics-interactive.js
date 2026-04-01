// Statistics Interactive Features (#107)
// Time range filtering, trend indicators, hover tooltips, CSV export

(function () {
	'use strict';

	// --- State ---
	var currentRangeDays = 30; // default: 30 Tage

	// --- Helpers ---
	function getDaysAgo(days) {
		var d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - days);
		return d;
	}

	function filterTasksByRange(tasks, rangeDays) {
		if (rangeDays === 'all') return tasks.slice();
		var cutoff = getDaysAgo(rangeDays);
		return tasks.filter(function (t) {
			return new Date(t.createdAt) >= cutoff;
		});
	}

	function getPreviousPeriodTasks(tasks, rangeDays) {
		if (rangeDays === 'all') return [];
		var periodStart = getDaysAgo(rangeDays * 2);
		var periodEnd = getDaysAgo(rangeDays);
		return tasks.filter(function (t) {
			var d = new Date(t.createdAt);
			return d >= periodStart && d < periodEnd;
		});
	}

	function calcTrendPercent(current, previous) {
		if (previous === 0 && current === 0) return { percent: 0, direction: 'neutral' };
		if (previous === 0) return { percent: 100, direction: 'up' };
		var change = ((current - previous) / previous) * 100;
		return {
			percent: Math.abs(Math.round(change)),
			direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
		};
	}

	// --- Trend Indicator Rendering ---
	function renderTrendIndicator(elementId, trend, isPositiveGood) {
		var el = document.getElementById(elementId);
		if (!el) return;

		if (trend.direction === 'neutral' || currentRangeDays === 'all') {
			el.innerHTML = '';
			el.className = 'trend-indicator';
			return;
		}

		var arrow = trend.direction === 'up' ? '\u2191' : '\u2193';
		var isGood = isPositiveGood
			? trend.direction === 'up'
			: trend.direction === 'down';

		el.textContent = arrow + ' ' + trend.percent + '%';
		el.className = 'trend-indicator ' + (isGood ? 'trend-good' : 'trend-bad');
	}

	// --- Tooltip Rendering ---
	function setTooltipContent(tooltipId, html) {
		var el = document.getElementById(tooltipId);
		if (el) el.innerHTML = html;
	}

	// --- CSV Export ---
	function exportCsv(planer) {
		var tasks = planer.tasks.concat(planer.archivedTasks);
		var filtered = filterTasksByRange(tasks, currentRangeDays);

		var pending = filtered.filter(function (t) { return t.status === 'pending'; }).length;
		var completed = filtered.filter(function (t) { return t.status === 'completed'; }).length;
		var total = filtered.length;
		var employees = new Set(filtered.map(function (t) { return t.employee; })).size;
		var locations = new Set(filtered.filter(function (t) { return t.location; }).map(function (t) { return t.location; })).size;
		var completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

		var rangeLabel = currentRangeDays === 'all' ? 'Alle' : currentRangeDays + ' Tage';

		var rows = [
			['Kennzahl', 'Wert', 'Zeitraum'],
			['Gesamt Aufgaben', total, rangeLabel],
			['Offene Aufgaben', pending, rangeLabel],
			['Erledigte Aufgaben', completed, rangeLabel],
			['Abschlussrate (%)', completionRate, rangeLabel],
			['Aktive Mitarbeiter', employees, rangeLabel],
			['Aktive Standorte', locations, rangeLabel]
		];

		// Add per-employee breakdown
		var employeeCounts = {};
		filtered.forEach(function (t) {
			if (!employeeCounts[t.employee]) {
				employeeCounts[t.employee] = { total: 0, completed: 0, pending: 0 };
			}
			employeeCounts[t.employee].total++;
			if (t.status === 'completed') employeeCounts[t.employee].completed++;
			else employeeCounts[t.employee].pending++;
		});

		rows.push([]);
		rows.push(['Mitarbeiter', 'Gesamt', 'Erledigt', 'Offen']);
		Object.keys(employeeCounts).sort().forEach(function (name) {
			var c = employeeCounts[name];
			rows.push([name, c.total, c.completed, c.pending]);
		});

		// BOM for Excel UTF-8 compatibility
		var bom = '\uFEFF';
		var csvContent = bom + rows.map(function (row) {
			return row.map(function (cell) {
				var str = String(cell === undefined ? '' : cell);
				if (str.indexOf(',') >= 0 || str.indexOf('"') >= 0 || str.indexOf('\n') >= 0) {
					return '"' + str.replace(/"/g, '""') + '"';
				}
				return str;
			}).join(',');
		}).join('\r\n');

		var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		var url = URL.createObjectURL(blob);
		var link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute('download', 'statistiken_' + rangeLabel.replace(/\s/g, '_') + '_' + new Date().toISOString().split('T')[0] + '.csv');
		link.style.display = 'none';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	// --- Main Update Function ---
	function updateInteractiveStats(planer) {
		var allTasks = planer.tasks.concat(planer.archivedTasks);

		// Filter tasks by current range
		var currentTasks = filterTasksByRange(allTasks, currentRangeDays);
		var previousTasks = getPreviousPeriodTasks(allTasks, currentRangeDays);

		// Current period stats
		var pending = currentTasks.filter(function (t) { return t.status === 'pending'; }).length;
		var completed = currentTasks.filter(function (t) { return t.status === 'completed'; }).length;
		var total = currentTasks.length;
		var employees = new Set(currentTasks.map(function (t) { return t.employee; })).size;

		// Previous period stats
		var prevPending = previousTasks.filter(function (t) { return t.status === 'pending'; }).length;
		var prevCompleted = previousTasks.filter(function (t) { return t.status === 'completed'; }).length;
		var prevEmployees = new Set(previousTasks.map(function (t) { return t.employee; })).size;

		// Update stat numbers
		var statPending = document.getElementById('statPending');
		var statCompleted = document.getElementById('statCompleted');
		var statEmployees = document.getElementById('statEmployees');

		if (statPending) statPending.textContent = pending;
		if (statCompleted) statCompleted.textContent = completed;
		if (statEmployees) statEmployees.textContent = employees;

		// Update progress bars
		if (typeof planer.updateProgressBars === 'function') {
			planer.updateProgressBars(pending, completed, total, employees);
		}

		// Trend indicators (pending going down is good, completed going up is good, employees up is good)
		renderTrendIndicator('trendPending', calcTrendPercent(pending, prevPending), false);
		renderTrendIndicator('trendCompleted', calcTrendPercent(completed, prevCompleted), true);
		renderTrendIndicator('trendEmployees', calcTrendPercent(employees, prevEmployees), true);

		// Tooltips
		var completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
		setTooltipContent('tooltipPending', pending + ' von ' + total + ' Aufgaben offen');
		setTooltipContent('tooltipCompleted', completed + ' von ' + total + ' Aufgaben abgeschlossen (' + completionRate + '%)');
		setTooltipContent('tooltipEmployees', employees + ' Mitarbeiter mit insgesamt ' + total + ' Aufgaben');
	}

	// --- Initialization ---
	function initInteractiveStatistics() {
		var planer = window.gartenPlaner;
		if (!planer) return;

		// Time range buttons
		var btns = document.querySelectorAll('.time-range-btn');
		btns.forEach(function (btn) {
			btn.addEventListener('click', function () {
				btns.forEach(function (b) { b.classList.remove('active'); });
				btn.classList.add('active');

				var range = btn.getAttribute('data-range');
				currentRangeDays = range === 'all' ? 'all' : parseInt(range, 10);

				updateInteractiveStats(planer);
				// Also update charts and additional stats with filtered view
				if (typeof planer.updateCharts === 'function') planer.updateCharts();
				if (typeof planer.updateAdditionalStats === 'function') planer.updateAdditionalStats();
			});
		});

		// CSV Export button
		var exportBtn = document.getElementById('exportCsvBtn');
		if (exportBtn) {
			exportBtn.addEventListener('click', function () {
				exportCsv(planer);
			});
		}

		// Initial update
		updateInteractiveStats(planer);
	}

	// Expose for statistics-init.js
	window.initInteractiveStatistics = initInteractiveStatistics;
	window.updateInteractiveStats = updateInteractiveStats;
})();
