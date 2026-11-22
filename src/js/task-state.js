// task-state.js - State Management & Persistence for GartenPlaner
// Extends GartenPlaner.prototype - must be loaded AFTER app.js defines the class.
// Do NOT add defer or async to script tags.

// Fehlermeldung unter einem Formularfeld (Element `<id>Error` mit role="alert"); leere Meldung räumt auf.
GartenPlaner.prototype._setFieldError = (inputId, message) => {
	var input = document.getElementById(inputId);
	var error = document.getElementById(inputId + "Error");
	if (!input || !error) return;
	error.textContent = message || "";
	error.classList.toggle("visible", Boolean(message));
	input.classList.toggle("invalid", Boolean(message));
	if (message) {
		input.setAttribute("aria-invalid", "true");
		input.setAttribute("aria-describedby", error.id);
	} else {
		input.removeAttribute("aria-invalid");
		input.removeAttribute("aria-describedby");
	}
};

// Pflanzenbibliothek laden (#347). Ohne Server (localStorage-Modus) oder bei einem Fehler bleibt `null`: die Auswahl
// bietet dann nur "Keine Pflanze", und Karten zeigen keine Pflanze statt eine falsche "nicht mehr vorhanden"-Meldung.
GartenPlaner.prototype.loadPlants = async function () {
	if (!this.useAPI || typeof TaskAPI.getPlants !== "function") return null;
	try {
		var plants = await TaskAPI.getPlants();
		return Array.isArray(plants) ? plants : null;
	} catch (error) {
		console.warn("Pflanzenbibliothek nicht geladen:", error.message);
		return null;
	}
};

GartenPlaner.prototype.getPlant = function (plantId) {
	if (!plantId || !Array.isArray(this.plants)) return null;
	return this.plants.find((p) => p.id === plantId) || null;
};

// Füllt ein Pflanzen-<select> mit DOM-Buildern (Pflanzennamen sind Daten, nie als HTML). Eine verwaiste Referenz
// (Pflanze gelöscht) bleibt als eigener Eintrag ausgewählt, damit Speichern sie nicht stillschweigend entfernt.
GartenPlaner.prototype.populatePlantSelect = function (selectId, selectedId) {
	var select = document.getElementById(selectId);
	if (!select) return;
	var makeOption = (value, text) => {
		var option = document.createElement("option");
		option.value = value;
		option.textContent = text;
		return option;
	};
	var options = [makeOption("", "Keine Pflanze")];
	var plants = Array.isArray(this.plants) ? [...this.plants] : [];
	plants.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
	plants.forEach((plant) => {
		options.push(
			makeOption(plant.id, `${plant.icon || ""} ${plant.name}`.trim()),
		);
	});
	if (selectedId && !plants.some((p) => p.id === selectedId)) {
		options.push(
			makeOption(
				selectedId,
				Array.isArray(this.plants)
					? "Pflanze nicht mehr vorhanden"
					: `Pflanze: ${selectedId}`,
			),
		);
	}
	select.replaceChildren(...options);
	select.value = selectedId || "";
};

GartenPlaner.prototype.addTask = async function () {
	const submitBtn = document.querySelector(
		'#taskForm button[type="submit"], #taskForm .btn-primary',
	);
	this.setButtonLoading(submitBtn, true, "Speichert...");
	try {
		if (window.logger) {
			window.logger.startPerformance("addTask", "performance");
		}

		if (window.rateLimiter) {
			const limitResult = window.rateLimiter.checkLimit("taskCreate");
			if (!limitResult.allowed) {
				window.rateLimiter.showRateLimitWarning(
					"taskCreate",
					limitResult.resetMs,
				);
				if (window.logger) {
					window.logger.warn("Task creation rate limit exceeded", "app", {
						resetMs: limitResult.resetMs,
					});
				}
				return;
			}
		}

		this._setFieldError("taskDueDate", "");
		const dueDateInput = document.getElementById("taskDueDate");
		const plantSelect = document.getElementById("taskPlant");
		const taskData = {
			title: Security.sanitizeText(document.getElementById("taskTitle").value),
			employee: Security.sanitizeText(
				document.getElementById("taskEmployee").value,
			),
			location: Security.sanitizeText(
				document.getElementById("taskLocation").value,
			),
			description: Security.sanitizeText(
				document.getElementById("taskDescription").value,
			),
			dueDate: dueDateInput && dueDateInput.value ? dueDateInput.value : null,
			plantId: plantSelect && plantSelect.value ? plantSelect.value : null,
			status: "pending",
		};

		const validation = Security.validateTask(taskData);
		if (!validation.valid) {
			if (
				taskData.dueDate &&
				!Security.validateInput.dueDate(taskData.dueDate)
			) {
				this._setFieldError(
					"taskDueDate",
					"Bitte ein gültiges Datum zwischen 2000 und 2100 wählen.",
				);
				if (dueDateInput) dueDateInput.focus();
			}
			this.showNotification("\u274c " + validation.errors.join(", "), "error");
			Security.logSecurityEvent(
				"warning",
				"Invalid task data",
				validation.errors,
			);
			if (window.logger) {
				window.logger.warn("Task validation failed", "app", {
					errors: validation.errors,
				});
			}
			if (window.rateLimiter) {
				window.rateLimiter.rollbackRequest("taskCreate");
			}
			return;
		}

		let task;
		if (this.useAPI) {
			task = await TaskAPI.createTask({
				...taskData,
				subtasks: this.tempSubtasks.map((st) => ({
					text: st.text,
					completed: st.completed,
				})),
			});
		} else {
			task = {
				id: Date.now(),
				...taskData,
				createdAt: new Date().toISOString(),
				history: [],
				subtasks: [...this.tempSubtasks],
			};
			this.addHistoryEntry(task, "created", {
				title: task.title,
				employee: task.employee,
				location: task.location,
			});
		}

		this.tasks.push(task);
		await this.saveTasks();
		this.renderTasks();
		this.updateStatistics();
		this.updateEmployeeFilter();
		this.updateLocationFilter();

		const taskForm = document.getElementById("taskForm");
		if (taskForm) {
			taskForm.reset();
		}

		this.tempSubtasks = [];
		this.renderCreateSubtasksList();

		setTimeout(() => {
			const newTaskElement = document.querySelector(
				`[data-task-id="${task.id}"]`,
			);
			if (newTaskElement) {
				newTaskElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}
		}, 100);

		this.showNotification("\u2705 Aufgabe erfolgreich hinzugef\u00fcgt!");

		if (window.logger) {
			window.logger.endPerformance("addTask");
			window.logger.info("Task created successfully", "app", {
				taskId: task.id,
				title: task.title,
				employee: task.employee,
				subtasksCount: task.subtasks.length,
			});
		}
		this.announce(`Neue Aufgabe "${task.title}" wurde hinzugef\u00fcgt`);
	} catch (error) {
		console.error("Fehler beim Hinzuf\u00fcgen der Aufgabe:", error);
		if (window.logger) {
			window.logger.endPerformance("addTask", false);
			window.logger.error(
				"Failed to add task",
				"app",
				{ error: error.message },
				error,
			);
		}
		if (window.rateLimiter) {
			window.rateLimiter.rollbackRequest("taskCreate");
		}
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to add task: " + error.message,
				error: error,
				function: "addTask",
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim Hinzuf\u00fcgen der Aufgabe. Bitte versuchen Sie es erneut.",
			"error",
		);
	} finally {
		this.setButtonLoading(submitBtn, false);
	}
};

GartenPlaner.prototype.deleteTask = async function (id) {
	try {
		if (window.rateLimiter) {
			const limitResult = window.rateLimiter.checkLimit("taskDelete");
			if (!limitResult.allowed) {
				window.rateLimiter.showRateLimitWarning(
					"taskDelete",
					limitResult.resetMs,
				);
				return;
			}
		}
		const confirmed = await this.showConfirm({
			title: "Aufgabe l\u00f6schen",
			icon: "\ud83d\uddd1\ufe0f",
			message: "M\u00f6chten Sie diese Aufgabe wirklich l\u00f6schen?",
			confirmText: "L\u00f6schen",
			cancelText: "Abbrechen",
			danger: true,
		});
		if (!confirmed) {
			if (window.rateLimiter) {
				window.rateLimiter.rollbackRequest("taskDelete");
			}
			return;
		}
		const taskElement = document.querySelector(`[data-task-id="${id}"]`);
		if (taskElement) {
			taskElement.classList.add("task-removing");
			await new Promise((resolve) => setTimeout(resolve, 400));
		}
		if (this.useAPI) {
			await TaskAPI.deleteTask(id);
		}
		this.tasks = this.tasks.filter((task) => String(task.id) !== String(id));
		await this.saveTasks();
		this.renderTasks();
		this.updateStatistics();
		this.updateEmployeeFilter();
		this.updateLocationFilter();
		this.showNotification("\ud83d\uddd1\ufe0f Aufgabe gel\u00f6scht");
	} catch (error) {
		console.error("Fehler beim L\u00f6schen der Aufgabe:", error);
		if (window.rateLimiter) {
			window.rateLimiter.rollbackRequest("taskDelete");
		}
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to delete task: " + error.message,
				error: error,
				function: "deleteTask",
				taskId: id,
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim L\u00f6schen der Aufgabe. Bitte versuchen Sie es erneut.",
			"error",
		);
	}
};

GartenPlaner.prototype.saveEditedTask = async function (id) {
	const saveBtn = document.querySelector('#editTaskForm button[type="submit"]');
	this.setButtonLoading(saveBtn, true, "Speichert...");
	try {
		if (window.rateLimiter) {
			const limitResult = window.rateLimiter.checkLimit(
				"taskEdit",
				`task_${id}`,
			);
			if (!limitResult.allowed) {
				window.rateLimiter.showRateLimitWarning(
					"taskEdit",
					limitResult.resetMs,
				);
				return;
			}
		}
		const task = this.tasks.find((t) => t.id === id);
		if (!task) {
			throw new Error(`Task with id ${id} not found`);
		}
		const oldTitle = task.title;
		const oldEmployee = task.employee;
		const oldLocation = task.location;
		const oldDescription = task.description;
		const oldDueDate = task.dueDate || null;
		const oldPlantId = task.plantId || null;
		const editDueDate = document.getElementById("editTaskDueDate");
		const editPlant = document.getElementById("editTaskPlant");
		const taskData = {
			title: Security.sanitizeText(
				document.getElementById("editTaskTitle").value,
			),
			employee: Security.sanitizeText(
				document.getElementById("editTaskEmployee").value,
			),
			location: Security.sanitizeText(
				document.getElementById("editTaskLocation").value,
			),
			description: Security.sanitizeText(
				document.getElementById("editTaskDescription").value,
			),
			dueDate: editDueDate && editDueDate.value ? editDueDate.value : null,
			// Ohne Auswahlfeld (ältere Seite) bleibt die Referenz unberührt
			plantId: editPlant ? editPlant.value || null : oldPlantId,
			status: task.status,
		};
		const validation = Security.validateTask(taskData);
		if (!validation.valid) {
			this.showNotification("\u274c " + validation.errors.join(", "), "error");
			Security.logSecurityEvent(
				"warning",
				"Invalid task data on edit",
				validation.errors,
			);
			if (window.rateLimiter) {
				window.rateLimiter.rollbackRequest("taskEdit", `task_${id}`);
			}
			return;
		}
		task.title = taskData.title;
		task.employee = taskData.employee;
		task.location = taskData.location;
		task.description = taskData.description;
		task.dueDate = taskData.dueDate;
		task.plantId = taskData.plantId;
		const changes = [];
		if (oldTitle !== task.title)
			changes.push(`Titel: "${oldTitle}" \u2192 "${task.title}"`);
		if (oldEmployee !== task.employee)
			changes.push(`Mitarbeiter: "${oldEmployee}" \u2192 "${task.employee}"`);
		if (oldLocation !== task.location)
			changes.push(`Standort: "${oldLocation}" \u2192 "${task.location}"`);
		if (oldDescription !== task.description)
			changes.push("Beschreibung ge\u00e4ndert");
		if (oldDueDate !== task.dueDate) {
			const dueLabel = (value) => (value ? `"${value}"` : "kein Termin");
			changes.push(
				`F\u00e4lligkeit: ${dueLabel(oldDueDate)} \u2192 ${dueLabel(task.dueDate)}`,
			);
		}
		if (oldPlantId !== task.plantId) {
			const plantLabel = (value) => (value ? `"${value}"` : "keine Pflanze");
			changes.push(
				`Pflanze: ${plantLabel(oldPlantId)} \u2192 ${plantLabel(task.plantId)}`,
			);
		}
		if (this.useAPI) {
			await TaskAPI.updateTask(id, taskData);
		} else if (changes.length > 0) {
			this.addHistoryEntry(task, "edited", { changes: changes });
		}
		await this.saveTasks();
		this.renderTasks();
		this.updateStatistics();
		this.updateEmployeeFilter();
		this.updateLocationFilter();
		this.showNotification("\u2705 Aufgabe erfolgreich aktualisiert!");
	} catch (error) {
		console.error("Fehler in saveEditedTask:", error);
		if (window.rateLimiter) {
			window.rateLimiter.rollbackRequest("taskEdit", `task_${id}`);
		}
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to save edited task: " + error.message,
				error: error,
				function: "saveEditedTask",
				context: { taskId: id },
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim Speichern der Aufgabe. Bitte versuchen Sie es erneut.",
			"error",
		);
	} finally {
		this.setButtonLoading(saveBtn, false);
	}
};

GartenPlaner.prototype.toggleArchiveView = function () {
	this.showArchive = !this.showArchive;
	const btn = document.getElementById("toggleArchiveBtn");
	const title = document.getElementById("tasksHeaderTitle");
	const bulkModeBtn = document.getElementById("bulkModeBtn");
	if (this.showArchive) {
		btn.textContent = "\ud83d\udccb Aktive Aufgaben anzeigen";
		title.textContent = "Archivierte Aufgaben";
		if (bulkModeBtn) bulkModeBtn.style.display = "none";
	} else {
		btn.textContent = "\ud83d\udce6 Archiv anzeigen";
		title.textContent = "Alle Aufgaben";
		if (bulkModeBtn) bulkModeBtn.style.display = "block";
	}
	if (this.bulkMode) {
		this.toggleBulkMode();
	}
	this.renderTasks();
	this.updateStatistics();
};

GartenPlaner.prototype.archiveTask = async function (id) {
	try {
		const task = this.tasks.find((t) => t.id === id);
		if (!task) {
			throw new Error(`Task with id ${id} not found`);
		}
		if (confirm("M\u00f6chten Sie diese Aufgabe wirklich archivieren?")) {
			if (this.useAPI) {
				const archivedTask = await TaskAPI.archiveTask(id);
				this.tasks = this.tasks.filter((t) => String(t.id) !== String(id));
				this.archivedTasks.push(archivedTask);
			} else {
				task.archivedAt = new Date().toISOString();
				this.addHistoryEntry(task, "archived", {});
				this.archivedTasks.push(task);
				this.tasks = this.tasks.filter((t) => t.id !== id);
			}
			await this.saveTasks();
			await this.saveArchivedTasks();
			this.renderTasks();
			this.updateStatistics();
			this.updateEmployeeFilter();
			this.updateLocationFilter();
			this.showNotification("\ud83d\udce6 Aufgabe archiviert");
		}
	} catch (error) {
		console.error("Fehler in archiveTask:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to archive task: " + error.message,
				error: error,
				function: "archiveTask",
				context: { taskId: id },
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim Archivieren der Aufgabe. Bitte versuchen Sie es erneut.",
			"error",
		);
	}
};

GartenPlaner.prototype.unarchiveTask = async function (id) {
	try {
		const task = this.archivedTasks.find((t) => t.id === id);
		if (!task) {
			throw new Error(`Archived task with id ${id} not found`);
		}
		if (confirm("M\u00f6chten Sie diese Aufgabe wiederherstellen?")) {
			if (this.useAPI) {
				const restoredTask = await TaskAPI.unarchiveTask(id);
				this.archivedTasks = this.archivedTasks.filter(
					(t) => String(t.id) !== String(id),
				);
				this.tasks.push(restoredTask);
			} else {
				delete task.archivedAt;
				this.addHistoryEntry(task, "unarchived", {});
				this.tasks.push(task);
				this.archivedTasks = this.archivedTasks.filter((t) => t.id !== id);
			}
			await this.saveTasks();
			await this.saveArchivedTasks();
			this.renderTasks();
			this.updateStatistics();
			this.updateEmployeeFilter();
			this.updateLocationFilter();
			this.showNotification("\u21bb Aufgabe wiederhergestellt");
		}
	} catch (error) {
		console.error("Fehler in unarchiveTask:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to unarchive task: " + error.message,
				error: error,
				function: "unarchiveTask",
				context: { taskId: id },
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim Wiederherstellen der Aufgabe. Bitte versuchen Sie es erneut.",
			"error",
		);
	}
};

GartenPlaner.prototype.deleteArchivedTask = async function (id) {
	try {
		const task = this.archivedTasks.find((t) => t.id === id);
		if (!task) {
			throw new Error(`Archived task with id ${id} not found`);
		}
		if (
			confirm(
				"M\u00f6chten Sie diese archivierte Aufgabe endg\u00fcltig l\u00f6schen?",
			)
		) {
			if (this.useAPI) {
				await TaskAPI.deleteArchivedTask(id);
			}
			this.archivedTasks = this.archivedTasks.filter(
				(t) => String(t.id) !== String(id),
			);
			await this.saveArchivedTasks();
			this.renderTasks();
			this.showNotification(
				"\ud83d\uddd1\ufe0f Archivierte Aufgabe gel\u00f6scht",
			);
		}
	} catch (error) {
		console.error("Fehler in deleteArchivedTask:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to delete archived task: " + error.message,
				error: error,
				function: "deleteArchivedTask",
				context: { taskId: id },
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim L\u00f6schen der archivierten Aufgabe. Bitte versuchen Sie es erneut.",
			"error",
		);
	}
};

GartenPlaner.prototype.toggleTaskStatus = async function (id) {
	try {
		const task = this.tasks.find((task) => task.id === id);
		if (!task) {
			throw new Error(`Task with id ${id} not found`);
		}
		const oldStatus = task.status;
		if (task.status === "pending") {
			const taskElement = document.querySelector(`[data-task-id="${id}"]`);
			if (taskElement) {
				taskElement.classList.add("task-completing");
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		}
		const newStatus = task.status === "pending" ? "completed" : "pending";
		// Folgeaufgaben wiederholender Aufgaben erzeugt der Server (#327) und liefert sie in der Antwort mit.
		let followUp = null;
		if (this.useAPI) {
			const updated = await TaskAPI.updateTask(id, { status: newStatus });
			followUp = updated?.followUp || null;
		}
		task.status = newStatus;
		task.completedAt =
			task.status === "completed" ? new Date().toISOString() : null;
		this.addHistoryEntry(
			task,
			task.status === "completed" ? "completed" : "reopened",
			{ from: oldStatus, to: task.status },
		);
		if (followUp) {
			task.followUpId = followUp.id;
			this.tasks.push(followUp);
		}
		await this.saveTasks();
		this.renderTasks();
		this.updateStatistics();
		this.showNotification(
			task.status === "completed"
				? `\u2705 Aufgabe erledigt!${followUp ? " Folgeaufgabe wurde angelegt." : ""}`
				: "\ud83d\udd04 Aufgabe reaktiviert",
		);
	} catch (error) {
		console.error("Fehler in toggleTaskStatus:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to toggle task status: " + error.message,
				error: error,
				function: "toggleTaskStatus",
				context: { taskId: id },
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim \u00c4ndern des Aufgabenstatus. Bitte versuchen Sie es erneut.",
			"error",
		);
	}
};

GartenPlaner.prototype.saveTasks = async function () {
	try {
		localStorage.setItem("gartenplaner_tasks", JSON.stringify(this.tasks));
	} catch (error) {
		console.error("Fehler in saveTasks:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "storage",
				message: "Failed to save tasks: " + error.message,
				error: error,
				function: "saveTasks",
				context: { taskCount: this.tasks.length },
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification("\u26a0\ufe0f Speichern fehlgeschlagen.", "error");
		throw error;
	}
};

// Nur echte Netzwerkausfälle nutzen die lokale Kopie, und das sichtbar (#324).
GartenPlaner.prototype.announceOfflineFallback = () => {
	window.GP?.Auth?.setStatus(
		"offline",
		"Server nicht erreichbar \u2013 angezeigt wird die lokale Kopie. \u00c4nderungen werden nicht synchronisiert.",
	);
};

// HTTP-Fehler (401, 5xx) werden gemeldet statt mit veralteten lokalen Daten zu maskieren.
GartenPlaner.prototype.handleLoadFailure = (error, what) => {
	console.error(`${what} konnten nicht geladen werden:`, error.message);
	if (error.status === 401) {
		window.GP?.Auth?.setStatus(
			"auth",
			"API-Key fehlt oder wurde abgelehnt \u2013 Daten werden nicht vom Server geladen.",
			{
				label: "API-Key eingeben",
				run: () => window.GP.Auth.enterKeyAndReload(),
			},
		);
	} else {
		window.GP?.Auth?.setStatus(
			"error",
			`${what} konnten nicht geladen werden: ${error.message}`,
		);
	}
	return [];
};

GartenPlaner.prototype.loadTasks = async function () {
	try {
		if (this.useAPI) {
			const tasks = await TaskAPI.getTasks();
			localStorage.setItem("gartenplaner_tasks", JSON.stringify(tasks));
			return tasks;
		}
	} catch (error) {
		if (!error.network) return this.handleLoadFailure(error, "Aufgaben");
		console.warn(
			"Server nicht erreichbar, verwende localStorage-Fallback:",
			error.message,
		);
		this.announceOfflineFallback();
	}
	try {
		const data = localStorage.getItem("gartenplaner_tasks");
		if (!data) return [];
		const parsed = JSON.parse(data);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		console.error("Fehler in loadTasks:", error);
		return [];
	}
};

GartenPlaner.prototype.loadArchivedTasks = async function () {
	try {
		if (this.useAPI) {
			const tasks = await TaskAPI.getArchivedTasks();
			localStorage.setItem(
				"gartenplaner_archived_tasks",
				JSON.stringify(tasks),
			);
			return tasks;
		}
	} catch (error) {
		if (!error.network) return this.handleLoadFailure(error, "Archiv");
		console.warn(
			"Server nicht erreichbar f\u00fcr Archiv, verwende localStorage-Fallback:",
			error.message,
		);
		this.announceOfflineFallback();
	}
	try {
		const data = localStorage.getItem("gartenplaner_archived_tasks");
		if (!data) return [];
		const parsed = JSON.parse(data);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		console.error("Fehler in loadArchivedTasks:", error);
		return [];
	}
};

GartenPlaner.prototype.saveArchivedTasks = async function () {
	try {
		localStorage.setItem(
			"gartenplaner_archived_tasks",
			JSON.stringify(this.archivedTasks),
		);
	} catch (error) {
		console.error("Fehler in saveArchivedTasks:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "storage",
				message: "Failed to save archived tasks: " + error.message,
				error: error,
				function: "saveArchivedTasks",
				context: { archivedTaskCount: this.archivedTasks.length },
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u26a0\ufe0f Archiv-Speichern fehlgeschlagen",
			"error",
		);
		throw error;
	}
};

GartenPlaner.prototype.clearAllData = async function () {
	try {
		const confirmed1 = await this.showConfirm({
			title: "\u26a0\ufe0f WARNUNG",
			icon: "\u26a0\ufe0f",
			message:
				"M\u00f6chten Sie wirklich ALLE Daten l\u00f6schen?\n\nDiese Aktion kann nicht r\u00fcckg\u00e4ngig gemacht werden!",
			confirmText: "Weiter",
			cancelText: "Abbrechen",
			danger: true,
		});
		if (confirmed1) {
			const confirmed2 = await this.showConfirm({
				title: "\u26a0\ufe0f LETZTE WARNUNG",
				icon: "\ud83d\udea8",
				message:
					"Sind Sie sich absolut sicher?\n\nAlle Aufgaben werden unwiderruflich gel\u00f6scht!",
				confirmText: "Ja, alles l\u00f6schen",
				cancelText: "Abbrechen",
				danger: true,
			});
			if (confirmed2) {
				this.tasks = [];
				await this.saveTasks();
				this.renderTasks();
				this.updateStatistics();
				this.updateEmployeeFilter();
				this.updateLocationFilter();
				this.showNotification("\ud83d\uddd1\ufe0f Alle Daten gel\u00f6scht");
			}
		}
	} catch (error) {
		console.error("Fehler in clearAllData:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to clear all data: " + error.message,
				error: error,
				function: "clearAllData",
				context: {},
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim L\u00f6schen der Daten. Bitte versuchen Sie es erneut.",
			"error",
		);
	}
};

GartenPlaner.prototype.addHistoryEntry = (task, action, details = {}) => {
	if (!task.history) {
		task.history = [];
	}
	task.history.push({
		timestamp: new Date().toISOString(),
		action: action,
		details: details,
	});
};

GartenPlaner.prototype.getAllHistory = function () {
	const allHistory = [];
	this.tasks.forEach((task) => {
		if (task.history && task.history.length > 0) {
			task.history.forEach((entry) => {
				allHistory.push({
					...entry,
					taskId: task.id,
					taskTitle: task.title,
					taskEmployee: task.employee,
				});
			});
		}
	});
	this.archivedTasks.forEach((task) => {
		if (task.history && task.history.length > 0) {
			task.history.forEach((entry) => {
				allHistory.push({
					...entry,
					taskId: task.id,
					taskTitle: task.title,
					taskEmployee: task.employee,
				});
			});
		}
	});
	allHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
	return allHistory;
};

GartenPlaner.prototype.bulkCompleteTasksAction = function () {
	if (this.selectedTasks.size === 0) {
		this.showNotification("\u26a0\ufe0f Keine Aufgaben ausgew\u00e4hlt");
		return;
	}
	const previousStates = [];
	this.selectedTasks.forEach((taskId) => {
		const task = this.tasks.find((t) => t.id === taskId);
		if (task && task.status !== "completed") {
			previousStates.push({
				id: task.id,
				status: task.status,
				completedAt: task.completedAt || null,
			});
			task.status = "completed";
			task.completedAt = new Date().toISOString();
		}
	});
	const count = previousStates.length;
	this.saveTasks();
	this.selectedTasks.clear();
	this.renderTasks();
	this.updateStatistics();
	this._registerUndo({
		type: "bulkComplete",
		description: `${count} Aufgabe(n) als erledigt markiert`,
		undo: () => {
			previousStates.forEach((s) => {
				const task = this.tasks.find((t) => t.id === s.id);
				if (task) {
					task.status = s.status;
					task.completedAt = s.completedAt;
				}
			});
			this.saveTasks();
			this.renderTasks();
			this.updateStatistics();
		},
	});
};

GartenPlaner.prototype.bulkUncompleteTasksAction = function () {
	if (this.selectedTasks.size === 0) {
		this.showNotification("\u26a0\ufe0f Keine Aufgaben ausgew\u00e4hlt");
		return;
	}
	const previousStates = [];
	this.selectedTasks.forEach((taskId) => {
		const task = this.tasks.find((t) => t.id === taskId);
		if (task && task.status === "completed") {
			previousStates.push({
				id: task.id,
				status: task.status,
				completedAt: task.completedAt,
			});
			task.status = "pending";
			task.completedAt = null;
		}
	});
	const count = previousStates.length;
	this.saveTasks();
	this.selectedTasks.clear();
	this.renderTasks();
	this.updateStatistics();
	this._registerUndo({
		type: "bulkUncomplete",
		description: `${count} Aufgabe(n) reaktiviert`,
		undo: () => {
			previousStates.forEach((s) => {
				const task = this.tasks.find((t) => t.id === s.id);
				if (task) {
					task.status = s.status;
					task.completedAt = s.completedAt;
				}
			});
			this.saveTasks();
			this.renderTasks();
			this.updateStatistics();
		},
	});
};

GartenPlaner.prototype.bulkDeleteTasksAction = async function () {
	if (this.selectedTasks.size === 0) {
		this.showNotification("\u26a0\ufe0f Keine Aufgaben ausgew\u00e4hlt");
		return;
	}
	const count = this.selectedTasks.size;
	const confirmed = await this.showConfirm({
		title: "Aufgaben l\u00f6schen",
		icon: "\ud83d\uddd1\ufe0f",
		message: `M\u00f6chten Sie wirklich ${count} Aufgabe(n) l\u00f6schen?`,
		confirmText: "L\u00f6schen",
		cancelText: "Abbrechen",
		danger: true,
	});
	if (confirmed) {
		const deletedTasks = this.tasks
			.filter((task) => this.selectedTasks.has(task.id))
			.map((t) => ({ ...t }));
		this.tasks = this.tasks.filter((task) => !this.selectedTasks.has(task.id));
		this.selectedTasks.clear();
		this.saveTasks();
		this.renderTasks();
		this.updateStatistics();
		this.updateEmployeeFilter();
		this.updateLocationFilter();
		this._registerUndo({
			type: "bulkDelete",
			description: `${count} Aufgabe(n) gel\u00f6scht`,
			undo: () => {
				this.tasks.push(...deletedTasks);
				this.saveTasks();
				this.renderTasks();
				this.updateStatistics();
				this.updateEmployeeFilter();
				this.updateLocationFilter();
			},
		});
	}
};

GartenPlaner.prototype.bulkArchiveTasksAction = async function () {
	if (this.selectedTasks.size === 0) {
		this.showNotification("\u26a0\ufe0f Keine Aufgaben ausgew\u00e4hlt");
		return;
	}
	const count = this.selectedTasks.size;
	const confirmed = await this.showConfirm({
		title: "Aufgaben archivieren",
		icon: "\ud83d\udce6",
		message: `M\u00f6chten Sie wirklich ${count} Aufgabe(n) archivieren?`,
		confirmText: "Archivieren",
		cancelText: "Abbrechen",
	});
	if (confirmed) {
		const archivedTasksCopy = this.tasks
			.filter((task) => this.selectedTasks.has(task.id))
			.map((t) => ({ ...t }));
		const tasksToArchive = this.tasks.filter((task) =>
			this.selectedTasks.has(task.id),
		);
		tasksToArchive.forEach((task) => {
			task.archivedAt = new Date().toISOString();
			this.archivedTasks.push(task);
		});
		this.tasks = this.tasks.filter((task) => !this.selectedTasks.has(task.id));
		this.selectedTasks.clear();
		this.saveTasks();
		this.saveArchivedTasks();
		this.renderTasks();
		this.updateStatistics();
		this.updateEmployeeFilter();
		this.updateLocationFilter();
		this._registerUndo({
			type: "bulkArchive",
			description: `${count} Aufgabe(n) archiviert`,
			undo: () => {
				const ids = new Set(archivedTasksCopy.map((t) => t.id));
				this.archivedTasks = this.archivedTasks.filter((t) => !ids.has(t.id));
				this.tasks.push(...archivedTasksCopy);
				this.saveTasks();
				this.saveArchivedTasks();
				this.renderTasks();
				this.updateStatistics();
				this.updateEmployeeFilter();
				this.updateLocationFilter();
			},
		});
	}
};
