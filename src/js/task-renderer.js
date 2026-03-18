// task-renderer.js - DOM Rendering for GartenPlaner
// Extends GartenPlaner.prototype - must be loaded AFTER app.js defines the class.
// Do NOT add defer or async to script tags.

GartenPlaner.prototype.renderTasks = function () {
	var filteredTasks = this.getFilteredTasks();
	var tasksList = document.getElementById("tasksList");

	// Wenn tasksList nicht existiert (z.B. auf index.html), nicht rendern
	if (!tasksList) {
		return;
	}

	if (filteredTasks.length === 0) {
		var emptyMessage = this.showArchive
			? {
					icon: "📦",
					title: "Archiv ist leer",
					message: "Hier werden archivierte Aufgaben angezeigt.",
					action: "",
				}
			: {
					icon: "🌱",
					title: "Noch keine Aufgaben vorhanden",
					message: "Beginnen Sie mit Ihrer Gartenplanung!",
					action:
						'<a href="index.html" class="btn btn-primary empty-state-btn">➕ Erste Aufgabe erstellen</a>',
				};

		tasksList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${emptyMessage.icon}</div>
                <h3>${emptyMessage.title}</h3>
                <p>${emptyMessage.message}</p>
                ${emptyMessage.action}
            </div>
        `;
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
                    ${!isArchived ? '<span class="drag-handle"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>' : ""}
                    <span class="task-title">${safeTitle}</span>
                    ${task.recurrence && task.recurrence !== "none" ? this.getRecurrenceBadge(task.recurrence) : ""}
                    ${isArchived && task.archivedAt ? `<span class="archived-badge"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Archiviert am ${new Date(task.archivedAt).toLocaleDateString("de-DE")}</span>` : ""}
                </div>
                <div class="task-meta">
                    <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${safeEmployee}</span>
                    <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${safeLocation}</span>
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

GartenPlaner.prototype.renderCalendar = () => {
	var calendarDiv = document.getElementById("calendarView");
	if (!calendarDiv) {
		return;
	}

	calendarDiv.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📅</div>
            <h3>Kalenderansicht nicht verfügbar</h3>
            <p>Die Kalenderansicht ist deaktiviert, da Aufgaben keine Datumsinformationen enthalten.</p>
        </div>
    `;
};

GartenPlaner.prototype.updateEmployeeFilter = function () {
	var filterSelect = document.getElementById("filterEmployee");
	if (!filterSelect) {
		return;
	}

	var employees = [...new Set(this.tasks.map((task) => task.employee))].sort();
	var currentValue = filterSelect.value;

	// XSS-sicher: Escape alle Mitarbeiternamen
	filterSelect.innerHTML =
		'<option value="">Alle Mitarbeiter</option>' +
		employees
			.map((emp) => {
				var safe = Security.escapeHtml(emp);
				return `<option value="${safe}">${safe}</option>`;
			})
			.join("");

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

	// XSS-sicher: Escape alle Standorte
	filterSelect.innerHTML =
		'<option value="">Alle Standorte</option>' +
		locations
			.map((loc) => {
				var safe = Security.escapeHtml(loc);
				return `<option value="${safe}">${safe}</option>`;
			})
			.join("");

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

		var statPending = document.getElementById("statPending");
		var statCompleted = document.getElementById("statCompleted");
		var statEmployees = document.getElementById("statEmployees");

		if (statPending) statPending.textContent = archivedPending;
		if (statCompleted) statCompleted.textContent = archivedCompleted;
		if (statEmployees) statEmployees.textContent = archivedCount;
	} else {
		// Aktive Aufgaben-Statistiken
		var pending = this.tasks.filter((t) => t.status === "pending").length;
		var completed = this.tasks.filter((t) => t.status === "completed").length;
		var total = this.tasks.length;
		var employees = new Set(this.tasks.map((t) => t.employee)).size;

		var statPending = document.getElementById("statPending");
		var statCompleted = document.getElementById("statCompleted");
		var statEmployees = document.getElementById("statEmployees");

		if (statPending) statPending.textContent = pending;
		if (statCompleted) statCompleted.textContent = completed;
		if (statEmployees) statEmployees.textContent = employees;

		// Fortschrittsbalken aktualisieren
		this.updateProgressBars(pending, completed, total, employees);
	}

	// Diagramme aktualisieren (nur auf Statistiken-Seite)
	if (window.location.pathname.includes("statistics.html")) {
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
		employeeChart.innerHTML =
			'<div class="chart-empty">Noch keine Daten verfügbar</div>';
		return;
	}

	var maxCount = Math.max(...sortedEmployees.map((e) => e[1]));

	// XSS-sicher: Escape Mitarbeiternamen
	employeeChart.innerHTML = sortedEmployees
		.map(([name, count]) => {
			var safeName = Security.escapeHtml(name);
			return `
        <div class="chart-bar-item">
            <div class="chart-bar-label" title="${safeName}">${safeName}</div>
            <div class="chart-bar-container">
                <div class="chart-bar-fill" style="width: ${(count / maxCount) * 100}%">
                    <span class="chart-bar-value">${count}</span>
                </div>
            </div>
            <div class="chart-bar-count">${count}</div>
        </div>
    `;
		})
		.join("");
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
		locationChart.innerHTML =
			'<div class="chart-empty">Noch keine Daten verfügbar</div>';
		return;
	}

	var maxCount = Math.max(...sortedLocations.map((l) => l[1]));

	// XSS-sicher: Escape Standortnamen
	locationChart.innerHTML = sortedLocations
		.map(([name, count]) => {
			var safeName = Security.escapeHtml(name);
			return `
        <div class="chart-bar-item">
            <div class="chart-bar-label" title="${safeName}">${safeName}</div>
            <div class="chart-bar-container">
                <div class="chart-bar-fill" style="width: ${(count / maxCount) * 100}%">
                    <span class="chart-bar-value">${count}</span>
                </div>
            </div>
            <div class="chart-bar-count">${count}</div>
        </div>
    `;
		})
		.join("");
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
	var allTasks = this.tasks.concat(this.archivedTasks);

	var dayCounts = days.map((day) => {
		var dayStr = day.toISOString().split("T")[0];
		return {
			date: day,
			label: day.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
			count: allTasks.filter((task) => {
				if (!task.completedAt) return false;
				var completedDate = new Date(task.completedAt).toISOString().split("T")[0];
				return completedDate === dayStr;
			}).length,
		};
	});

	var maxCount = Math.max(...dayCounts.map((d) => d.count), 1);
	var totalCompleted = dayCounts.reduce((sum, d) => sum + d.count, 0);

	if (totalCompleted === 0) {
		chartEl.innerHTML = '<div class="chart-empty">Noch keine erledigten Aufgaben in den letzten 30 Tagen</div>';
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
		var weekAgo = new Date();
		weekAgo.setDate(weekAgo.getDate() - 7);
		var weekTasks = this.tasks.filter((task) => {
			return new Date(task.createdAt) >= weekAgo;
		});
		statThisWeek.textContent = weekTasks.length;
	}

	// Completed this week
	var statCompletedThisWeek = document.getElementById("statCompletedThisWeek");
	if (statCompletedThisWeek) {
		var weekAgo = new Date();
		weekAgo.setDate(weekAgo.getDate() - 7);
		var allTasks = this.tasks.concat(this.archivedTasks);
		var completedThisWeek = allTasks.filter((task) => {
			return task.completedAt && new Date(task.completedAt) >= weekAgo;
		});
		statCompletedThisWeek.textContent = completedThisWeek.length;
	}

	// Average completion time
	var statAvgCompletionTime = document.getElementById("statAvgCompletionTime");
	if (statAvgCompletionTime) {
		var allTasks = this.tasks.concat(this.archivedTasks);
		var completedWithTime = allTasks.filter((t) => t.completedAt && t.createdAt);
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
				statAvgCompletionTime.textContent = (avgHours / 24).toFixed(1) + " Tage";
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
		historyTimeline.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📜</div>
                <h3>Noch keine Historie vorhanden</h3>
                <p>Änderungen an Aufgaben werden hier angezeigt.</p>
            </div>
        `;
		return;
	}

	// Limit auf 50 neueste Einträge
	var recentHistory = allHistory.slice(0, 50);

	// XSS-sicher: Escape alle User-Inputs in History
	historyTimeline.innerHTML = recentHistory
		.map((entry) => {
			var date = new Date(entry.timestamp);
			var timeAgo = this.getTimeAgo(date);
			var formattedDate = date.toLocaleString("de-DE", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});

			var actionInfo = this.getActionInfo(entry.action);
			var detailsHTML = this.getHistoryDetailsHTML(entry);

			var safeTitle = Security.escapeHtml(entry.taskTitle);
			var safeEmployee = Security.escapeHtml(entry.taskEmployee);

			return `
            <div class="history-item">
                <div class="history-icon" style="background: ${actionInfo.color};">
                    ${actionInfo.icon}
                </div>
                <div class="history-content">
                    <div class="history-header">
                        <strong>${actionInfo.label}</strong>
                        <span class="history-task-title">"${safeTitle}"</span>
                    </div>
                    <div class="history-meta">
                        <span class="history-employee">${safeEmployee}</span>
                        <span class="history-time" title="${formattedDate}">${timeAgo}</span>
                    </div>
                    ${detailsHTML ? `<div class="history-details">${detailsHTML}</div>` : ""}
                </div>
            </div>
        `;
		})
		.join("");
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

GartenPlaner.prototype.getHistoryDetailsHTML = (entry) => {
	if (!entry.details) return "";

	if (entry.action === "created") {
		return `Mitarbeiter: ${entry.details.employee}, Standort: ${entry.details.location}`;
	}

	if (entry.action === "edited" && entry.details.changes) {
		return entry.details.changes.join("<br>");
	}

	return "";
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
			'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
		weekly:
			'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/></svg>',
		monthly:
			'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
	};

	return `<span class="recurrence-badge" title="Diese Aufgabe wiederholt sich ${labels[recurrence].toLowerCase()}">${icons[recurrence] || ""}${labels[recurrence] || recurrence}</span>`;
};

GartenPlaner.prototype.renderSubtasksInModal = function (task) {
	var subtasksList = document.getElementById("subtasksList");
	if (!subtasksList) return;

	if (!task.subtasks || task.subtasks.length === 0) {
		subtasksList.innerHTML =
			'<p class="no-subtasks">Keine Teilaufgaben vorhanden</p>';
		return;
	}

	// XSS-sicher: Escape Subtask-Text
	subtasksList.innerHTML = task.subtasks
		.map((subtask) => {
			var safeText = Security.escapeHtml(subtask.text);
			return `
        <div class="subtask-item ${subtask.completed ? "completed" : ""}">
            <input
                type="checkbox"
                class="subtask-checkbox"
                ${subtask.completed ? "checked" : ""}
                data-subtask-id="${subtask.id}"
            >
            <span class="subtask-text">${safeText}</span>
            <button
                type="button"
                class="btn-delete-subtask"
                data-subtask-id="${subtask.id}"
                title="Teilaufgabe löschen"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `;
		})
		.join("");

	// Event Listeners für Subtask-Checkboxen und Delete-Buttons
	subtasksList.querySelectorAll(".subtask-checkbox").forEach((checkbox) => {
		checkbox.addEventListener("change", (e) => {
			var subtaskId = parseInt(e.target.dataset.subtaskId);
			this.toggleSubtask(task, subtaskId);
		});
	});

	subtasksList.querySelectorAll(".btn-delete-subtask").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			var subtaskId = parseInt(e.currentTarget.dataset.subtaskId);
			this.deleteSubtask(task, subtaskId);
		});
	});
};

GartenPlaner.prototype.renderCreateSubtasksList = function () {
	var subtasksList = document.getElementById("subtasksListCreate");
	if (!subtasksList) return;

	if (this.tempSubtasks.length === 0) {
		subtasksList.innerHTML =
			'<p class="no-subtasks">Keine Teilaufgaben vorhanden</p>';
		return;
	}

	// XSS-sicher: Escape Subtask-Text
	subtasksList.innerHTML = this.tempSubtasks
		.map((subtask) => {
			var safeText = Security.escapeHtml(subtask.text);
			return `
        <div class="subtask-item ${subtask.completed ? "completed" : ""}">
            <input
                type="checkbox"
                class="subtask-checkbox-create"
                ${subtask.completed ? "checked" : ""}
                data-subtask-id="${subtask.id}"
            >
            <span class="subtask-text">${safeText}</span>
            <button
                type="button"
                class="btn-delete-subtask-create"
                data-subtask-id="${subtask.id}"
                title="Teilaufgabe löschen"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `;
		})
		.join("");

	// Event Listeners
	subtasksList
		.querySelectorAll(".subtask-checkbox-create")
		.forEach((checkbox) => {
			checkbox.addEventListener("change", (e) => {
				var subtaskId = parseInt(e.target.dataset.subtaskId);
				this.toggleCreateSubtask(subtaskId);
			});
		});

	subtasksList.querySelectorAll(".btn-delete-subtask-create").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			var subtaskId = parseInt(e.currentTarget.dataset.subtaskId);
			this.deleteCreateSubtask(subtaskId);
		});
	});
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;">
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

GartenPlaner.prototype.showNotification = (message) => {
	// Erstelle Benachrichtigungselement
	var notification = document.createElement("div");
	notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #2ecc71;
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 600;
        animation: slideIn 0.3s ease;
    `;
	notification.textContent = message;

	// CSS Animation
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

	// Nach 3 Sekunden entfernen
	setTimeout(() => {
		notification.style.animation = "slideIn 0.3s ease reverse";
		setTimeout(() => notification.remove(), 300);
	}, 3000);
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
		// Unterstütze Zeilenumbrüche in der Nachricht
		message.innerHTML = (options.message || "Möchten Sie fortfahren?").replace(
			/\n/g,
			"<br>",
		);
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
	const focusable = Array.from(modal.querySelectorAll(focusableSelectors)).filter(
		(el) => el.offsetParent !== null,
	);
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
GartenPlaner.prototype.setButtonLoading = function (button, loading, originalText) {
	if (!button) return;
	if (loading) {
		button.dataset.originalText = button.innerHTML;
		button.disabled = true;
		button.classList.add("btn-loading");
		button.setAttribute("aria-busy", "true");
		const spinnerHTML = '<span class="btn-spinner" aria-hidden="true"></span>';
		button.innerHTML = originalText ? spinnerHTML + " " + originalText : spinnerHTML;
	} else {
		button.disabled = false;
		button.classList.remove("btn-loading");
		button.removeAttribute("aria-busy");
		if (button.dataset.originalText) {
			button.innerHTML = button.dataset.originalText;
			delete button.dataset.originalText;
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
	notification.innerHTML = `
		<span class="undo-message">${Security.escapeHtml(message)}</span>
		<button class="undo-btn" type="button" aria-label="Rückgängig machen">Rückgängig</button>
		<button class="undo-close-btn" type="button" aria-label="Schließen">&times;</button>
	`;

	document.body.appendChild(notification);

	notification.querySelector(".undo-btn").addEventListener("click", () => {
		const lastAction = this.undoStack.pop();
		if (lastAction && lastAction.undo) {
			lastAction.undo();
			this.showNotification("\u21a9\ufe0f R\u00fcckg\u00e4ngig gemacht: " + lastAction.description);
			this.announce("Aktion r\u00fcckg\u00e4ngig gemacht: " + lastAction.description);
		}
		notification.remove();
		if (this.undoTimeout) clearTimeout(this.undoTimeout);
	});

	notification.querySelector(".undo-close-btn").addEventListener("click", () => {
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
