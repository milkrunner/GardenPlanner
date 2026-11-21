// task-renderer.js - DOM Rendering for GartenPlaner
// Extends GartenPlaner.prototype - must be loaded AFTER app.js defines the class.
// Do NOT add defer or async to script tags.

// DOM-Helfer (#288): reine Texte immer per textContent setzen, nie per innerHTML.
// innerHTML bleibt nur für bewusst gerendertes Markup mit Security.escapeHtml
// (z. B. createTaskCard) bzw. für statische, vertrauenswürdige SVG-Konstanten.
GartenPlaner.prototype._el = (tag, className, text) => {
	var el = document.createElement(tag);
	if (className) el.className = className;
	if (text !== undefined && text !== null) el.textContent = text;
	return el;
};

// Dekoratives Icon neben sichtbarem Text bzw. in Buttons mit aria-label (#287)
GartenPlaner.prototype._decorativeIcon = (svgMarkup) => {
	var holder = document.createElement("template");
	holder.innerHTML = svgMarkup;
	var svg = holder.content.firstElementChild;
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("focusable", "false");
	return svg;
};

GartenPlaner.prototype._renderEmptyState = function (container, options) {
	var box = this._el("div", "empty-state");
	var icon = this._el("div", "empty-state-icon", options.icon);
	icon.setAttribute("aria-hidden", "true");
	box.appendChild(icon);
	box.appendChild(this._el("h3", "", options.title));
	box.appendChild(this._el("p", "", options.message));
	if (options.actionHref) {
		var link = this._el(
			"a",
			"btn btn-primary empty-state-btn",
			options.actionText,
		);
		link.href = options.actionHref;
		box.appendChild(link);
	}
	container.replaceChildren(box);
};

GartenPlaner.prototype._renderChartEmpty = function (container) {
	container.replaceChildren(
		this._el("div", "chart-empty", "Noch keine Daten verfügbar"),
	);
};

GartenPlaner.prototype._renderBarChart = function (container, entries) {
	var maxCount = Math.max(...entries.map((entry) => entry[1]));
	container.replaceChildren(
		...entries.map(([name, count]) => {
			var item = this._el("div", "chart-bar-item");
			var label = this._el("div", "chart-bar-label", name);
			label.title = name;
			var fill = this._el("div", "chart-bar-fill");
			fill.style.width = `${(count / maxCount) * 100}%`;
			fill.appendChild(this._el("span", "chart-bar-value", count));
			var barContainer = this._el("div", "chart-bar-container");
			barContainer.appendChild(fill);
			item.append(
				label,
				barContainer,
				this._el("div", "chart-bar-count", count),
			);
			return item;
		}),
	);
};

GartenPlaner.prototype._fillSelect = function (select, allLabel, values) {
	select.replaceChildren(
		new Option(allLabel, ""),
		...values.map((value) => new Option(value, value)),
	);
};

GartenPlaner.prototype.renderTasks = function () {
	var filteredTasks = this.getFilteredTasks();
	var tasksList = document.getElementById("tasksList");

	// Wenn tasksList nicht existiert (z.B. auf index.html), nicht rendern
	if (!tasksList) {
		return;
	}

	if (filteredTasks.length === 0) {
		this._renderEmptyState(
			tasksList,
			this.showArchive
				? {
						icon: "📦",
						title: "Archiv ist leer",
						message: "Hier werden archivierte Aufgaben angezeigt.",
					}
				: {
						icon: "🌱",
						title: "Noch keine Aufgaben vorhanden",
						message: "Beginnen Sie mit Ihrer Gartenplanung!",
						actionHref: "index.html",
						actionText: "➕ Erste Aufgabe erstellen",
					},
		);
		return;
	}

	// Sortieren nach manueller Reihenfolge (sortOrder) oder Erstellungsdatum
	filteredTasks.sort((a, b) => {
		// Wenn sortOrder vorhanden ist, nutze diese, sonst Erstellungsdatum
		var orderA =
			a.sortOrder !== undefined ? a.sortOrder : this.tasks.indexOf(a);
		var orderB =
			b.sortOrder !== undefined ? b.sortOrder : this.tasks.indexOf(b);
		return orderA - orderB;
	});

	tasksList.innerHTML = filteredTasks
		.map((task) => this.createTaskCard(task))
		.join("");

	// Event Listeners für Buttons und Drag & Drop
	filteredTasks.forEach((task) => {
		var card = document.querySelector(`[data-task-id="${task.id}"]`);
		if (card) {
			// Checkbox Event Listener
			var checkbox = card.querySelector(".task-select-checkbox");
			if (checkbox) {
				checkbox.addEventListener("change", (e) => {
					e.stopPropagation();
					this.toggleTaskSelection(task.id);
				});
			}

			// Button Event Listeners
			card.querySelector(".edit-btn")?.addEventListener("click", () => {
				this.openEditModal(task.id);
			});
			card
				.querySelector(".complete-btn, .uncomplete-btn")
				?.addEventListener("click", () => {
					this.toggleTaskStatus(task.id);
				});
			card.querySelector(".archive-btn")?.addEventListener("click", () => {
				this.archiveTask(task.id);
			});
			card.querySelector(".unarchive-btn")?.addEventListener("click", () => {
				this.unarchiveTask(task.id);
			});
			card.querySelector(".delete-btn")?.addEventListener("click", () => {
				if (this.showArchive) {
					this.deleteArchivedTask(task.id);
				} else {
					this.deleteTask(task.id);
				}
			});

			// Drag & Drop Event Listeners (nur für aktive Aufgaben und nicht auf mobilen Geräten)
			var isMobile = window.innerWidth <= 768;
			if (!isMobile) {
				card.addEventListener("dragstart", (e) =>
					this.handleDragStart(e, task.id),
				);
				card.addEventListener("dragend", (e) => this.handleDragEnd(e));
				card.addEventListener("dragover", (e) => this.handleDragOver(e));
				card.addEventListener("drop", (e) => this.handleDrop(e, task.id));
				card.addEventListener("dragenter", (e) => this.handleDragEnter(e));
				card.addEventListener("dragleave", (e) => this.handleDragLeave(e));
			} else {
				// Auf mobilen Geräten Drag & Drop deaktivieren
				card.setAttribute("draggable", "false");
			}
		}
	});

	// Bulk-Toolbar aktualisieren
	this.updateBulkToolbar();
};

GartenPlaner.prototype.createTaskCard = function (task) {
	var isCompleted = task.status === "completed";
	var isSelected = this.selectedTasks.has(task.id);
	var isArchived = this.showArchive;

	// Sanitize all user inputs for XSS protection
	var safeTitle = Security.escapeHtml(task.title);
	var safeEmployee = Security.escapeHtml(task.employee);
	var safeLocation = Security.escapeHtml(task.location || "Kein Standort");
	var safeDescription = task.description
		? Security.escapeHtml(task.description)
		: "";

	return `
        <div class="task-card ${isCompleted ? "completed" : ""} ${isSelected ? "selected" : ""} ${isArchived ? "archived" : ""}"
             data-task-id="${task.id}"
             draggable="${!isArchived}"
             role="article"
             aria-label="Aufgabe: ${safeTitle}"
             tabindex="0">
            ${
							this.bulkMode && !isArchived
								? `
                <div class="task-checkbox">
                    <input type="checkbox" class="task-select-checkbox" ${isSelected ? "checked" : ""} aria-label="Aufgabe auswählen: ${safeTitle}">
                </div>
            `
								: ""
						}
            <div class="task-info">
                <div class="task-header">
                    ${!isArchived ? '<span class="drag-handle"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>' : ""}
                    <span class="task-title">${safeTitle}</span>
                    ${task.recurrence && task.recurrence !== "none" ? this.getRecurrenceBadge(task.recurrence) : ""}
                    ${isArchived && task.archivedAt ? `<span class="archived-badge"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;" aria-hidden="true" focusable="false"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Archiviert am ${new Date(task.archivedAt).toLocaleDateString("de-DE")}</span>` : ""}
                </div>
                <div class="task-meta">
                    <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;" aria-hidden="true" focusable="false"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr-only">Mitarbeiter: </span>${safeEmployee}</span>
                    <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;" aria-hidden="true" focusable="false"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr-only">Standort: </span>${safeLocation}</span>
                </div>
                ${safeDescription ? `<div class="task-description">${safeDescription}</div>` : ""}
                ${this.renderSubtasksProgress(task)}
            </div>
            <div class="task-actions" role="group" aria-label="Aufgaben-Aktionen">
                ${
									!isArchived
										? `
                    <button class="task-btn task-btn-icon edit-btn" aria-label="Aufgabe bearbeiten" title="Bearbeiten"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                    ${
											isCompleted
												? '<button class="task-btn task-btn-icon uncomplete-btn" aria-label="Aufgabe reaktivieren" title="Reaktivieren"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 4v4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
												: '<button class="task-btn task-btn-icon complete-btn" aria-label="Als erledigt markieren" title="Erledigt"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
										}
                    <button class="task-btn task-btn-icon archive-btn" aria-label="Aufgabe archivieren" title="Archivieren"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                    <button class="task-btn task-btn-icon delete-btn" aria-label="Aufgabe löschen" title="Löschen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                `
										: `
                    <button class="task-btn task-btn-icon unarchive-btn" aria-label="Aufgabe wiederherstellen" title="Wiederherstellen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 4v4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                    <button class="task-btn task-btn-icon delete-btn" aria-label="Aufgabe endgültig löschen" title="Endgültig löschen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                `
								}
            </div>
        </div>
    `;
};

GartenPlaner.prototype.switchView = function () {
	var listView = document.getElementById("tasksList");
	var calendarView = document.getElementById("tasksCalendar");

	if (!listView || !calendarView) {
		return;
	}

	if (this.currentView === "list") {
		listView.style.display = "flex";
		calendarView.style.display = "none";
	} else {
		listView.style.display = "none";
		calendarView.style.display = "block";
		this.renderCalendar();
	}
};

GartenPlaner.prototype.renderCalendar = function () {
	var calendarDiv = document.getElementById("calendarView");
	if (!calendarDiv) {
		return;
	}

	this._renderEmptyState(calendarDiv, {
		icon: "📅",
		title: "Kalenderansicht nicht verfügbar",
		message:
			"Die Kalenderansicht ist deaktiviert, da Aufgaben keine Datumsinformationen enthalten.",
	});
};

GartenPlaner.prototype.updateEmployeeFilter = function () {
	var filterSelect = document.getElementById("filterEmployee");
	if (!filterSelect) {
		return;
	}

	var employees = [...new Set(this.tasks.map((task) => task.employee))].sort();
	var currentValue = filterSelect.value;

	// Option-Texte werden über textContent/value gesetzt (kein HTML-Parsing)
	this._fillSelect(filterSelect, "Alle Mitarbeiter", employees);

	filterSelect.value = currentValue;
};

GartenPlaner.prototype.updateLocationFilter = function () {
	var filterSelect = document.getElementById("filterLocation");
	if (!filterSelect) {
		return;
	}

	var locations = [
		...new Set(this.tasks.map((task) => task.location).filter((loc) => loc)),
	].sort();
	var currentValue = filterSelect.value;

	// Option-Texte werden über textContent/value gesetzt (kein HTML-Parsing)
	this._fillSelect(filterSelect, "Alle Standorte", locations);

	filterSelect.value = currentValue;
};

GartenPlaner.prototype.updateStatistics = function () {
	if (this.showArchive) {
		// Archiv-Statistiken
		var archivedCount = this.archivedTasks.length;
		var archivedCompleted = this.archivedTasks.filter(
			(t) => t.status === "completed",
		).length;
		var archivedPending = this.archivedTasks.filter(
			(t) => t.status === "pending",
		).length;

		const statPending = document.getElementById("statPending");
		const statCompleted = document.getElementById("statCompleted");
		const statEmployees = document.getElementById("statEmployees");

		if (statPending) statPending.textContent = archivedPending;
		if (statCompleted) statCompleted.textContent = archivedCompleted;
		if (statEmployees) statEmployees.textContent = archivedCount;
	} else {
		// Aktive Aufgaben-Statistiken
		var pending = this.tasks.filter((t) => t.status === "pending").length;
		var completed = this.tasks.filter((t) => t.status === "completed").length;
		var total = this.tasks.length;
		var employees = new Set(this.tasks.map((t) => t.employee)).size;

		const statPending = document.getElementById("statPending");
		const statCompleted = document.getElementById("statCompleted");
		const statEmployees = document.getElementById("statEmployees");

		if (statPending) statPending.textContent = pending;
		if (statCompleted) statCompleted.textContent = completed;
		if (statEmployees) statEmployees.textContent = employees;

		// Fortschrittsbalken aktualisieren
		this.updateProgressBars(pending, completed, total, employees);
	}

	// Diagramme aktualisieren (nur auf Statistiken-Seite)
	if (window.location.pathname.includes("statistics")) {
		this.updateCharts();
	}
};

GartenPlaner.prototype.updateProgressBars = (
	pending,
	completed,
	total,
	employees,
) => {
	var progressPending = document.getElementById("progressPending");
	var progressCompleted = document.getElementById("progressCompleted");
	var progressEmployees = document.getElementById("progressEmployees");
	var totalTasks = document.getElementById("totalTasks");
	var completionRate = document.getElementById("completionRate");
	var avgTasksPerEmployee = document.getElementById("avgTasksPerEmployee");

	if (progressPending && total > 0) {
		var pendingPercent = (pending / total) * 100;
		progressPending.style.width = `${pendingPercent}%`;
	}

	if (progressCompleted && total > 0) {
		var completedPercent = (completed / total) * 100;
		progressCompleted.style.width = `${completedPercent}%`;
		if (completionRate)
			completionRate.textContent = Math.round(completedPercent);
	}

	if (progressEmployees && employees > 0) {
		var employeePercent = Math.min((employees / 10) * 100, 100); // Max 10 als 100%
		progressEmployees.style.width = `${employeePercent}%`;
	}

	if (totalTasks) totalTasks.textContent = total;
	if (avgTasksPerEmployee && employees > 0) {
		avgTasksPerEmployee.textContent = (total / employees).toFixed(1);
	}
};

GartenPlaner.prototype.updateCharts = function () {
	this.updateEmployeeChart();
	this.updateLocationChart();
	this.updateActivityChart();
	this.updateCompletionTrendChart();
};

GartenPlaner.prototype.updateEmployeeChart = function () {
	var employeeChart = document.getElementById("employeeChart");
	if (!employeeChart) return;

	var employeeCounts = {};
	this.tasks.forEach((task) => {
		employeeCounts[task.employee] = (employeeCounts[task.employee] || 0) + 1;
	});

	var sortedEmployees = Object.entries(employeeCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10); // Top 10

	if (sortedEmployees.length === 0) {
		this._renderChartEmpty(employeeChart);
		return;
	}

	// Namen werden als Text gerendert (kein HTML-Parsing)
	this._renderBarChart(employeeChart, sortedEmployees);
};

GartenPlaner.prototype.updateLocationChart = function () {
	var locationChart = document.getElementById("locationChart");
	if (!locationChart) return;

	var locationCounts = {};
	this.tasks.forEach((task) => {
		if (task.location) {
			locationCounts[task.location] = (locationCounts[task.location] || 0) + 1;
		}
	});

	var sortedLocations = Object.entries(locationCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10); // Top 10

	if (sortedLocations.length === 0) {
		this._renderChartEmpty(locationChart);
		return;
	}

	// Namen werden als Text gerendert (kein HTML-Parsing)
	this._renderBarChart(locationChart, sortedLocations);
};

GartenPlaner.prototype.updateActivityChart = function () {
	var activityChart = document.getElementById("activityChart");
	if (!activityChart) return;

	// Letzte 7 Tage
	var days = [];
	var today = new Date();
	for (var i = 6; i >= 0; i--) {
		var date = new Date(today);
		date.setDate(date.getDate() - i);
		days.push(date);
	}

	var dayCounts = days.map((day) => {
		var dayStr = day.toISOString().split("T")[0];
		return {
			date: day,
			label: day.toLocaleDateString("de-DE", { weekday: "short" }),
			count: this.tasks.filter((task) => {
				var taskDate = new Date(task.createdAt).toISOString().split("T")[0];
				return taskDate === dayStr;
			}).length,
		};
	});

	var maxCount = Math.max(...dayCounts.map((d) => d.count), 1);

	activityChart.innerHTML = dayCounts
		.map((day) => {
			var height = (day.count / maxCount) * 100;
			return `
            <div class="timeline-bar" style="height: ${height}%" title="${day.count} Aufgaben">
                ${day.count > 0 ? `<div class="timeline-bar-value">${day.count}</div>` : ""}
                <div class="timeline-bar-label">${day.label}</div>
            </div>
        `;
		})
		.join("");
};

GartenPlaner.prototype.updateCompletionTrendChart = function () {
	var chartEl = document.getElementById("completionTrendChart");
	if (!chartEl) return;

	// Last 30 days
	var days = [];
	var today = new Date();
	for (var i = 29; i >= 0; i--) {
		var date = new Date(today);
		date.setDate(date.getDate() - i);
		days.push(date);
	}

	// Collect all completed tasks (active + archived)
	const allTasks = this.tasks.concat(this.archivedTasks);

	var dayCounts = days.map((day) => {
		var dayStr = day.toISOString().split("T")[0];
		return {
			date: day,
			label: day.toLocaleDateString("de-DE", {
				day: "2-digit",
				month: "2-digit",
			}),
			count: allTasks.filter((task) => {
				if (!task.completedAt) return false;
				var completedDate = new Date(task.completedAt)
					.toISOString()
					.split("T")[0];
				return completedDate === dayStr;
			}).length,
		};
	});

	var maxCount = Math.max(...dayCounts.map((d) => d.count), 1);
	var totalCompleted = dayCounts.reduce((sum, d) => sum + d.count, 0);

	if (totalCompleted === 0) {
		chartEl.innerHTML =
			'<div class="chart-empty">Noch keine erledigten Aufgaben in den letzten 30 Tagen</div>';
		return;
	}

	chartEl.innerHTML = dayCounts
		.map((day) => {
			var height = (day.count / maxCount) * 100;
			return `
				<div class="timeline-bar completion-bar" style="height: ${height}%" title="${day.count} erledigt am ${day.label}">
					${day.count > 0 ? `<div class="timeline-bar-value">${day.count}</div>` : ""}
					<div class="timeline-bar-label">${day.label}</div>
				</div>
			`;
		})
		.join("");
};

GartenPlaner.prototype.updateAdditionalStats = function () {
	var statArchived = document.getElementById("statArchived");
	var statLocations = document.getElementById("statLocations");
	var statToday = document.getElementById("statToday");
	var statThisWeek = document.getElementById("statThisWeek");

	if (statArchived) {
		statArchived.textContent = this.archivedTasks.length;
	}

	if (statLocations) {
		var locations = new Set(
			this.tasks.filter((t) => t.location).map((t) => t.location),
		);
		statLocations.textContent = locations.size;
	}

	if (statToday) {
		var today = new Date().toISOString().split("T")[0];
		var todayTasks = this.tasks.filter((task) => {
			var taskDate = new Date(task.createdAt).toISOString().split("T")[0];
			return taskDate === today;
		});
		statToday.textContent = todayTasks.length;
	}

	if (statThisWeek) {
		const weekAgo = new Date();
		weekAgo.setDate(weekAgo.getDate() - 7);
		var weekTasks = this.tasks.filter((task) => {
			return new Date(task.createdAt) >= weekAgo;
		});
		statThisWeek.textContent = weekTasks.length;
	}

	// Completed this week
	var statCompletedThisWeek = document.getElementById("statCompletedThisWeek");
	if (statCompletedThisWeek) {
		const weekAgo = new Date();
		weekAgo.setDate(weekAgo.getDate() - 7);
		const allTasks = this.tasks.concat(this.archivedTasks);
		var completedThisWeek = allTasks.filter((task) => {
			return task.completedAt && new Date(task.completedAt) >= weekAgo;
		});
		statCompletedThisWeek.textContent = completedThisWeek.length;
	}

	// Average completion time
	var statAvgCompletionTime = document.getElementById("statAvgCompletionTime");
	if (statAvgCompletionTime) {
		const allTasks = this.tasks.concat(this.archivedTasks);
		var completedWithTime = allTasks.filter(
			(t) => t.completedAt && t.createdAt,
		);
		if (completedWithTime.length > 0) {
			var totalHours = completedWithTime.reduce((sum, t) => {
				var diff = new Date(t.completedAt) - new Date(t.createdAt);
				return sum + diff / (1000 * 60 * 60);
			}, 0);
			var avgHours = totalHours / completedWithTime.length;
			if (avgHours < 1) {
				statAvgCompletionTime.textContent = Math.round(avgHours * 60) + " Min.";
			} else if (avgHours < 24) {
				statAvgCompletionTime.textContent = avgHours.toFixed(1) + " Std.";
			} else {
				statAvgCompletionTime.textContent =
					(avgHours / 24).toFixed(1) + " Tage";
			}
		} else {
			statAvgCompletionTime.textContent = "-";
		}
	}

	// History-Timeline rendern
	this.renderHistory();
};

GartenPlaner.prototype.renderHistory = function () {
	var historyTimeline = document.getElementById("historyTimeline");
	if (!historyTimeline) return;

	var allHistory = this.getAllHistory();

	if (allHistory.length === 0) {
		this._renderEmptyState(historyTimeline, {
			icon: "📜",
			title: "Noch keine Historie vorhanden",
			message: "Änderungen an Aufgaben werden hier angezeigt.",
		});
		return;
	}

	// Limit auf 50 neueste Einträge
	var recentHistory = allHistory.slice(0, 50);

	// Alle Task-Daten (Titel, Mitarbeiter, Details) sind untrusted und werden
	// ausschließlich per textContent gerendert.
	historyTimeline.replaceChildren(
		...recentHistory.map((entry) => {
			var date = new Date(entry.timestamp);
			var formattedDate = date.toLocaleString("de-DE", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
			var actionInfo = this.getActionInfo(entry.action);

			var icon = this._el("div", "history-icon", actionInfo.icon);
			icon.style.background = actionInfo.color;
			icon.setAttribute("aria-hidden", "true");

			var header = this._el("div", "history-header");
			header.append(
				this._el("strong", "", actionInfo.label),
				" ",
				this._el("span", "history-task-title", `"${entry.taskTitle}"`),
			);

			var time = this._el("span", "history-time", this.getTimeAgo(date));
			time.title = formattedDate;
			var meta = this._el("div", "history-meta");
			meta.append(
				this._el("span", "history-employee", entry.taskEmployee),
				time,
			);

			var content = this._el("div", "history-content");
			content.append(header, meta);

			var detailLines = this.getHistoryDetailLines(entry);
			if (detailLines.length > 0) {
				var details = this._el("div", "history-details");
				detailLines.forEach((line, index) => {
					if (index > 0) details.appendChild(document.createElement("br"));
					details.appendChild(document.createTextNode(line));
				});
				content.appendChild(details);
			}

			var item = this._el("div", "history-item");
			item.append(icon, content);
			return item;
		}),
	);
};

GartenPlaner.prototype.getActionInfo = (action) => {
	var actions = {
		created: { icon: "➕", label: "Erstellt", color: "#27ae60" },
		edited: { icon: "✏️", label: "Bearbeitet", color: "#3498db" },
		completed: { icon: "✅", label: "Erledigt", color: "#2ecc71" },
		reopened: { icon: "🔄", label: "Wiedereröffnet", color: "#f39c12" },
		archived: { icon: "📦", label: "Archiviert", color: "#95a5a6" },
		unarchived: { icon: "↻", label: "Wiederhergestellt", color: "#9b59b6" },
		deleted: { icon: "🗑️", label: "Gelöscht", color: "#e74c3c" },
	};

	return actions[action] || { icon: "📝", label: action, color: "#7f8c8d" };
};

GartenPlaner.prototype.getHistoryDetailLines = (entry) => {
	if (!entry.details) return [];

	if (entry.action === "created") {
		return [
			`Mitarbeiter: ${entry.details.employee}, Standort: ${entry.details.location}`,
		];
	}

	if (entry.action === "edited" && Array.isArray(entry.details.changes)) {
		return entry.details.changes.map(String);
	}

	return [];
};

GartenPlaner.prototype.getTimeAgo = (date) => {
	var seconds = Math.floor((new Date() - date) / 1000);

	if (seconds < 60) return "Gerade eben";
	if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
	if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`;
	if (seconds < 604800) return `vor ${Math.floor(seconds / 86400)} Tag(en)`;

	return date.toLocaleDateString("de-DE");
};

GartenPlaner.prototype.getRecurrenceBadge = (recurrence) => {
	var labels = {
		daily: "Täglich",
		weekly: "Wöchentlich",
		monthly: "Monatlich",
	};

	var icons = {
		daily:
			'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
		weekly:
			'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/></svg>',
		monthly:
			'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
	};

	return `<span class="recurrence-badge" title="Diese Aufgabe wiederholt sich ${labels[recurrence].toLowerCase()}">${icons[recurrence] || ""}${labels[recurrence] || recurrence}</span>`;
};

// Statische, vertrauenswürdige Icon-Konstante (kein User-Input)
GartenPlaner.prototype._ICON_CLOSE_16 =
	'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

GartenPlaner.prototype._buildSubtaskItem = function (
	subtask,
	checkboxClass,
	deleteClass,
	onToggle,
	onDelete,
) {
	var item = this._el(
		"div",
		"subtask-item" + (subtask.completed ? " completed" : ""),
	);

	var checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.className = checkboxClass;
	checkbox.checked = !!subtask.completed;
	checkbox.dataset.subtaskId = subtask.id;
	checkbox.setAttribute("aria-label", `Teilaufgabe erledigt: ${subtask.text}`);
	checkbox.addEventListener("change", () => onToggle(subtask.id));

	var button = this._el("button", deleteClass);
	button.type = "button";
	button.dataset.subtaskId = subtask.id;
	button.title = "Teilaufgabe löschen";
	button.setAttribute("aria-label", `Teilaufgabe löschen: ${subtask.text}`);
	button.appendChild(this._decorativeIcon(this._ICON_CLOSE_16));
	button.addEventListener("click", () => onDelete(subtask.id));

	item.append(checkbox, this._el("span", "subtask-text", subtask.text), button);
	return item;
};

GartenPlaner.prototype.renderSubtasksInModal = function (task) {
	var subtasksList = document.getElementById("subtasksList");
	if (!subtasksList) return;

	if (!task.subtasks || task.subtasks.length === 0) {
		subtasksList.replaceChildren(
			this._el("p", "no-subtasks", "Keine Teilaufgaben vorhanden"),
		);
		return;
	}

	// Subtask-Text ist untrusted und wird per textContent/aria-label gesetzt
	subtasksList.replaceChildren(
		...task.subtasks.map((subtask) =>
			this._buildSubtaskItem(
				subtask,
				"subtask-checkbox",
				"btn-delete-subtask",
				(id) => this.toggleSubtask(task, parseInt(id)),
				(id) => this.deleteSubtask(task, parseInt(id)),
			),
		),
	);
};

GartenPlaner.prototype.renderCreateSubtasksList = function () {
	var subtasksList = document.getElementById("subtasksListCreate");
	if (!subtasksList) return;

	if (this.tempSubtasks.length === 0) {
		subtasksList.replaceChildren(
			this._el("p", "no-subtasks", "Keine Teilaufgaben vorhanden"),
		);
		return;
	}

	// Subtask-Text ist untrusted und wird per textContent/aria-label gesetzt
	subtasksList.replaceChildren(
		...this.tempSubtasks.map((subtask) =>
			this._buildSubtaskItem(
				subtask,
				"subtask-checkbox-create",
				"btn-delete-subtask-create",
				(id) => this.toggleCreateSubtask(parseInt(id)),
				(id) => this.deleteCreateSubtask(parseInt(id)),
			),
		),
	);
};

GartenPlaner.prototype.getSubtaskProgress = (task) => {
	if (!task.subtasks || task.subtasks.length === 0) {
		return { completed: 0, total: 0, percentage: 0 };
	}

	var completed = task.subtasks.filter((st) => st.completed).length;
	var total = task.subtasks.length;
	var percentage = Math.round((completed / total) * 100);

	return { completed, total, percentage };
};

GartenPlaner.prototype.renderSubtasksProgress = function (task) {
	if (!task.subtasks || task.subtasks.length === 0) {
		return "";
	}

	var progress = this.getSubtaskProgress(task);
	var allCompleted = progress.completed === progress.total;

	return `
        <div class="subtasks-progress">
            <div class="subtasks-progress-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;" aria-hidden="true" focusable="false">
                    <path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="subtasks-progress-text ${allCompleted ? "completed" : ""}">
                    ${progress.completed}/${progress.total} Teilaufgaben erledigt
                </span>
            </div>
            <div class="subtasks-progress-bar">
                <div class="subtasks-progress-fill" style="width: ${progress.percentage}%"></div>
            </div>
        </div>
    `;
};

GartenPlaner.prototype.updateBulkToolbar = function () {
	var toolbar = document.getElementById("bulkToolbar");
	var countSpan = document.getElementById("bulkCount");

	if (toolbar && countSpan) {
		toolbar.style.display = this.bulkMode ? "flex" : "none";
		countSpan.textContent = this.selectedTasks.size;
	}
};

GartenPlaner.prototype.showNotification = (message, type) => {
	var config = (window.APP_CONFIG && window.APP_CONFIG.ui) || {};
	var isError = type === "error" || message.startsWith("❌");
	var duration = isError
		? config.errorNotificationDuration || 15000
		: config.successNotificationDuration || 5000;
	var bgColor = isError ? "#e74c3c" : "#2ecc71";

	var notification = document.createElement("div");
	notification.setAttribute("role", "status");
	notification.setAttribute("aria-live", "polite");
	notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 600;
        animation: slideIn 0.3s ease;
        cursor: pointer;
    `;
	notification.textContent = message;
	notification.title = "Klicken zum Schließen";

	if (!document.querySelector("#notification-style")) {
		var style = document.createElement("style");
		style.id = "notification-style";
		style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
		document.head.appendChild(style);
	}

	document.body.appendChild(notification);

	notification.addEventListener("click", () => {
		notification.style.animation = "slideIn 0.3s ease reverse";
		setTimeout(() => notification.remove(), 300);
	});

	setTimeout(() => {
		if (notification.parentElement) {
			notification.style.animation = "slideIn 0.3s ease reverse";
			setTimeout(() => notification.remove(), 300);
		}
	}, duration);
};

GartenPlaner.prototype.announce = (message) => {
	var announcer = window.announcer;
	if (announcer) {
		announcer.textContent = "";
		setTimeout(() => {
			announcer.textContent = message;
		}, 100);
	}
};

GartenPlaner.prototype.showConfirm = function (options) {
	return new Promise((resolve) => {
		var modal = document.getElementById("confirmModal");
		var title = document.getElementById("confirmModalTitle");
		var icon = document.getElementById("confirmModalIcon");
		var message = document.getElementById("confirmModalMessage");
		var okBtn = document.getElementById("confirmOkBtn");
		var cancelBtn = document.getElementById("confirmCancelBtn");

		// Speichere vorher fokussiertes Element
		var previouslyFocused = document.activeElement;

		// Setze Inhalte
		title.textContent = options.title || "Bestätigung erforderlich";
		icon.textContent = options.icon || "⚠️";
		// Nachricht als Text rendern; \n wird zu <br> (kein HTML-Parsing)
		message.replaceChildren();
		(options.message || "Möchten Sie fortfahren?")
			.split("\n")
			.forEach((line, index) => {
				if (index > 0) message.appendChild(document.createElement("br"));
				message.appendChild(document.createTextNode(line));
			});
		okBtn.textContent = options.confirmText || "Bestätigen";
		cancelBtn.textContent = options.cancelText || "Abbrechen";

		// Verstecke Cancel-Button wenn kein Text vorhanden
		if (!options.cancelText) {
			cancelBtn.style.display = "none";
		} else {
			cancelBtn.style.display = "block";
		}

		// Setze Button-Stil
		if (options.danger) {
			okBtn.classList.add("btn-danger");
		} else {
			okBtn.classList.remove("btn-danger");
		}

		// Zeige Modal
		modal.style.display = "flex";
		modal.setAttribute("aria-hidden", "false");

		// Event Handler
		var closeAndResolve = (result) => {
			modal.style.display = "none";
			modal.setAttribute("aria-hidden", "true");
			cleanup();
			if (previouslyFocused && previouslyFocused.focus) {
				previouslyFocused.focus();
			}
			resolve(result);
		};

		var handleOk = () => closeAndResolve(true);
		var handleCancel = () => closeAndResolve(false);

		var cleanup = () => {
			okBtn.removeEventListener("click", handleOk);
			cancelBtn.removeEventListener("click", handleCancel);
			modal.removeEventListener("click", handleBackdropClick);
			modal.removeEventListener("keydown", handleKeyDown);
		};

		var handleBackdropClick = (e) => {
			if (e.target === modal) {
				handleCancel();
			}
		};

		// Keyboard: ESC zum Schließen + Focus Trap
		var handleKeyDown = (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				handleCancel();
				return;
			}
			if (e.key === "Tab") {
				this._trapFocus(modal, e);
			}
		};

		okBtn.addEventListener("click", handleOk);
		cancelBtn.addEventListener("click", handleCancel);
		modal.addEventListener("click", handleBackdropClick);
		modal.addEventListener("keydown", handleKeyDown);

		// Fokus auf den passenden Button setzen
		setTimeout(() => {
			if (options.danger) {
				cancelBtn.focus();
			} else {
				okBtn.focus();
			}
		}, 100);
	});
};

// Focus Trap - hält den Fokus innerhalb eines Modals
GartenPlaner.prototype._trapFocus = function (modal, e) {
	const focusableSelectors =
		'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]';
	const focusable = Array.from(
		modal.querySelectorAll(focusableSelectors),
	).filter((el) => el.offsetParent !== null);
	if (focusable.length === 0) return;

	const firstFocusable = focusable[0];
	const lastFocusable = focusable[focusable.length - 1];

	if (e.shiftKey) {
		if (document.activeElement === firstFocusable) {
			e.preventDefault();
			lastFocusable.focus();
		}
	} else {
		if (document.activeElement === lastFocusable) {
			e.preventDefault();
			firstFocusable.focus();
		}
	}
};

// Loading State für Buttons - verhindert Doppelklicks
GartenPlaner.prototype.setButtonLoading = function (
	button,
	loading,
	originalText,
) {
	if (!button) return;
	if (loading) {
		// Ursprüngliche Knoten merken (statt HTML-String-Roundtrip über innerHTML)
		if (!button._gpOriginalNodes) {
			button._gpOriginalNodes = Array.from(button.childNodes);
		}
		button.disabled = true;
		button.classList.add("btn-loading");
		button.setAttribute("aria-busy", "true");
		var spinner = this._el("span", "btn-spinner");
		spinner.setAttribute("aria-hidden", "true");
		button.replaceChildren(spinner);
		if (originalText) {
			button.appendChild(document.createTextNode(" " + originalText));
		}
	} else {
		button.disabled = false;
		button.classList.remove("btn-loading");
		button.removeAttribute("aria-busy");
		if (button._gpOriginalNodes) {
			button.replaceChildren(...button._gpOriginalNodes);
			delete button._gpOriginalNodes;
		}
	}
};

// Undo-Aktion registrieren und Notification anzeigen
GartenPlaner.prototype._registerUndo = function (action) {
	this.undoStack.push(action);
	this._showUndoNotification(action.description);
};

GartenPlaner.prototype._showUndoNotification = function (message) {
	const existing = document.querySelector(".undo-notification");
	if (existing) existing.remove();
	if (this.undoTimeout) clearTimeout(this.undoTimeout);

	const notification = document.createElement("div");
	notification.className = "undo-notification";
	notification.setAttribute("role", "alert");
	const messageEl = this._el("span", "undo-message", message);
	const undoBtn = this._el("button", "undo-btn", "Rückgängig");
	undoBtn.type = "button";
	undoBtn.setAttribute("aria-label", "Rückgängig machen");
	const closeBtn = this._el("button", "undo-close-btn", "\u00d7");
	closeBtn.type = "button";
	closeBtn.setAttribute("aria-label", "Schließen");
	notification.append(messageEl, undoBtn, closeBtn);

	document.body.appendChild(notification);

	notification.querySelector(".undo-btn").addEventListener("click", () => {
		const lastAction = this.undoStack.pop();
		if (lastAction && lastAction.undo) {
			lastAction.undo();
			this.showNotification(
				"\u21a9\ufe0f R\u00fcckg\u00e4ngig gemacht: " + lastAction.description,
			);
			this.announce(
				"Aktion r\u00fcckg\u00e4ngig gemacht: " + lastAction.description,
			);
		}
		notification.remove();
		if (this.undoTimeout) clearTimeout(this.undoTimeout);
	});

	notification
		.querySelector(".undo-close-btn")
		.addEventListener("click", () => {
			notification.classList.add("undo-notification-hiding");
			setTimeout(() => notification.remove(), 300);
			if (this.undoTimeout) clearTimeout(this.undoTimeout);
		});

	this.undoTimeout = setTimeout(() => {
		if (notification.parentElement) {
			notification.classList.add("undo-notification-hiding");
			setTimeout(() => notification.remove(), 300);
		}
	}, 8000);
};

GartenPlaner.prototype.showAlert = function (title, message, icon) {
	if (icon === undefined) icon = "ℹ️";
	return this.showConfirm({
		title: title,
		icon: icon,
		message: message,
		confirmText: "OK",
		cancelText: "",
		danger: false,
	});
};
