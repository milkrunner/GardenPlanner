// task-events.js - Event Handling & Drag/Drop for GartenPlaner
// Extends GartenPlaner.prototype - must be loaded AFTER app.js defines the class.
// Do NOT add defer or async to script tags.

// Event Listeners einrichten
GartenPlaner.prototype.setupEventListeners = function () {
	// Formular Submit
	const taskForm = document.getElementById("taskForm");
	if (taskForm) {
		taskForm.addEventListener("submit", (e) => {
			e.preventDefault();
			this.addTask();
		});
		// Clear tempSubtasks when the form is reset (e.g. via browser reset)
		taskForm.addEventListener("reset", () => {
			this.tempSubtasks = [];
			// Defer rendering so the native reset completes first
			setTimeout(() => this.renderCreateSubtasksList(), 0);
		});
	}

	// Filter (nur wenn vorhanden)
	const filterEmployee = document.getElementById("filterEmployee");
	if (filterEmployee) {
		filterEmployee.addEventListener("change", (e) => {
			this.currentFilter.employee = e.target.value;
			this.renderTasks();
		});
	}

	const filterLocation = document.getElementById("filterLocation");
	if (filterLocation) {
		filterLocation.addEventListener("change", (e) => {
			this.currentFilter.location = e.target.value;
			this.renderTasks();
		});
	}

	const filterStatus = document.getElementById("filterStatus");
	if (filterStatus) {
		filterStatus.addEventListener("change", (e) => {
			this.currentFilter.status = e.target.value;
			this.renderTasks();
		});
	}

	// Suchfunktion
	const searchInput = document.getElementById("searchInput");
	if (searchInput) {
		searchInput.addEventListener("input", (e) => {
			this.searchQuery = e.target.value.trim();
			this.performSearch();
		});
	}

	const clearSearchBtn = document.getElementById("clearSearchBtn");
	if (clearSearchBtn) {
		clearSearchBtn.addEventListener("click", () => {
			this.clearSearch();
		});
	}

	// View Toggle
	document.querySelectorAll(".view-btn").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			document
				.querySelectorAll(".view-btn")
				.forEach((b) => b.classList.remove("active"));
			e.target.classList.add("active");
			this.currentView = e.target.dataset.view;
			this.switchView();
		});
	});

	// Datenverwaltung (nur wenn vorhanden)
	const exportPdfBtn = document.getElementById("exportPdfBtn");
	if (exportPdfBtn) {
		exportPdfBtn.addEventListener("click", () => this.exportPDF());
	}

	const exportBtn = document.getElementById("exportBtn");
	if (exportBtn) {
		exportBtn.addEventListener("click", () => this.exportData());
	}

	const importBtn = document.getElementById("importBtn");
	if (importBtn) {
		importBtn.addEventListener("click", () => {
			document.getElementById("importFile").click();
		});
	}

	const importFile = document.getElementById("importFile");
	if (importFile) {
		importFile.addEventListener("change", (e) => this.importData(e));
	}

	const clearBtn = document.getElementById("clearBtn");
	if (clearBtn) {
		clearBtn.addEventListener("click", () => this.clearAllData());
	}

	// Archiv-Toggle
	const toggleArchiveBtn = document.getElementById("toggleArchiveBtn");
	if (toggleArchiveBtn) {
		toggleArchiveBtn.addEventListener("click", () => this.toggleArchiveView());
	}

	// Photo Upload (Create Form)
	this.tempPhotos = [];
	this.setupPhotoUploadCreate();
};

// Bulk Action Listeners
GartenPlaner.prototype.setupBulkActionListeners = function () {
	const bulkModeBtn = document.getElementById("bulkModeBtn");
	if (bulkModeBtn) {
		bulkModeBtn.addEventListener("click", () => this.toggleBulkMode());
	}

	const selectAllBtn = document.getElementById("selectAllBtn");
	if (selectAllBtn) {
		selectAllBtn.addEventListener("click", () => this.selectAllTasks());
	}

	const deselectAllBtn = document.getElementById("deselectAllBtn");
	if (deselectAllBtn) {
		deselectAllBtn.addEventListener("click", () => this.deselectAllTasks());
	}

	const bulkCompleteBtn = document.getElementById("bulkCompleteBtn");
	if (bulkCompleteBtn) {
		bulkCompleteBtn.addEventListener("click", () =>
			this.bulkCompleteTasksAction(),
		);
	}

	const bulkUncompleteBtn = document.getElementById("bulkUncompleteBtn");
	if (bulkUncompleteBtn) {
		bulkUncompleteBtn.addEventListener("click", () =>
			this.bulkUncompleteTasksAction(),
		);
	}

	const bulkArchiveBtn = document.getElementById("bulkArchiveBtn");
	if (bulkArchiveBtn) {
		bulkArchiveBtn.addEventListener("click", () =>
			this.bulkArchiveTasksAction(),
		);
	}

	const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
	if (bulkDeleteBtn) {
		bulkDeleteBtn.addEventListener("click", () => this.bulkDeleteTasksAction());
	}

	// Prioritaet-Aendern (#244)
	const bulkPrioritySelect = document.getElementById("bulkPrioritySelect");
	if (bulkPrioritySelect) {
		bulkPrioritySelect.addEventListener("change", (e) => {
			if (e.target.value) {
				this.bulkChangePriorityAction(e.target.value);
				e.target.value = "";
			}
		});
	}
};

// Subtask-Methoden für CREATE (neue Aufgabe)
GartenPlaner.prototype.setupCreateSubtaskListeners = function () {
	const addBtn = document.getElementById("addSubtaskBtnCreate");
	const input = document.getElementById("newSubtaskInputCreate");

	if (addBtn && input) {
		addBtn.addEventListener("click", () => this.addCreateSubtask());
		input.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.addCreateSubtask();
			}
		});
	}
};

// Subtask-Methoden für EDIT (bestehende Aufgabe)
GartenPlaner.prototype.setupSubtaskListeners = function (task) {
	const addBtn = document.getElementById("addSubtaskBtn");
	const input = document.getElementById("newSubtaskInput");

	if (addBtn && input) {
		// Entferne alte Listener
		const newAddBtn = addBtn.cloneNode(true);
		addBtn.replaceWith(newAddBtn);

		const newInput = input.cloneNode(true);
		input.replaceWith(newInput);

		// Neue Listener hinzufügen
		newAddBtn.addEventListener("click", () => this.addSubtask(task));
		newInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.addSubtask(task);
			}
		});
	}
};

// Aufgabe bearbeiten - Modal öffnen
GartenPlaner.prototype.openEditModal = function (id) {
	const task = this.tasks.find((t) => t.id === id);
	if (!task) return;

	const modal = document.getElementById("editModal");
	if (!modal) return;

	// Speichere die ID der zu bearbeitenden Aufgabe
	modal.dataset.taskId = id;

	// Speichere das Element, das vor dem Öffnen fokussiert war
	this._previouslyFocused = document.activeElement;

	// Modal anzeigen
	modal.style.display = "flex";
	modal.setAttribute("aria-hidden", "false");

	// Event Listeners für Modal
	const closeBtn = modal.querySelector(".modal-close");
	const cancelBtn = document.getElementById("cancelEditBtn");
	const editForm = document.getElementById("editTaskForm");

	const closeModal = () => {
		modal.style.display = "none";
		modal.setAttribute("aria-hidden", "true");
		delete modal.dataset.taskId;
		// Entferne Keyboard-Handler
		modal.removeEventListener("keydown", handleKeyDown);
		// Fokus zurücksetzen
		if (this._previouslyFocused && this._previouslyFocused.focus) {
			this._previouslyFocused.focus();
		}
	};

	// Entferne alte Event Listener
	closeBtn.replaceWith(closeBtn.cloneNode(true));
	cancelBtn.replaceWith(cancelBtn.cloneNode(true));
	editForm.replaceWith(editForm.cloneNode(true));

	// Füge neue Event Listener hinzu
	const newCloseBtn = modal.querySelector(".modal-close");
	const newCancelBtn = document.getElementById("cancelEditBtn");
	const newEditForm = document.getElementById("editTaskForm");

	// Formular mit aktuellen Werten füllen (NACH dem replaceWith)
	document.getElementById("editTaskTitle").value = task.title;
	document.getElementById("editTaskEmployee").value = task.employee;
	document.getElementById("editTaskLocation").value = task.location || "";
	document.getElementById("editTaskDescription").value = task.description || "";

	// Abhaengigkeiten-Auswahl befuellen (#242)
	var depSelect = document.getElementById("editTaskDependencies");
	if (depSelect) {
		depSelect.innerHTML = "";
		var currentDeps = task.dependencies || [];
		this.tasks.forEach(function (t) {
			if (t.id === task.id) return; // Eigene Aufgabe nicht als Abhaengigkeit
			var opt = document.createElement("option");
			opt.value = t.id;
			opt.textContent = Security.escapeHtml(t.title);
			if (currentDeps.indexOf(t.id) !== -1) {
				opt.selected = true;
			}
			depSelect.appendChild(opt);
		});
	}

	// Subtasks rendern
	this.renderSubtasksInModal(task);

	// Subtask Event Listeners (NACH dem replaceWith)
	this.setupSubtaskListeners(task);

	// Photo Upload im Edit-Modal einrichten
	this.setupPhotoUploadEdit(task);

	// Kommentare rendern und Event Listeners einrichten
	this.renderComments(task);
	this.setupCommentListeners(task);

	newCloseBtn.addEventListener("click", closeModal);
	newCancelBtn.addEventListener("click", closeModal);

	// Schließen bei Klick außerhalb des Modals
	modal.addEventListener("click", (e) => {
		if (e.target === modal) {
			closeModal();
		}
	});

	// Keyboard: ESC zum Schließen + Focus Trap
	const handleKeyDown = (e) => {
		if (e.key === "Escape") {
			e.preventDefault();
			closeModal();
			return;
		}
		if (e.key === "Tab") {
			this._trapFocus(modal, e);
		}
	};
	modal.addEventListener("keydown", handleKeyDown);

	// Formular Submit
	newEditForm.addEventListener("submit", (e) => {
		e.preventDefault();
		this.saveEditedTask(id);
		closeModal();
	});

	// Fokus auf erstes Eingabefeld setzen
	setTimeout(() => {
		const firstInput = document.getElementById("editTaskTitle");
		if (firstInput) firstInput.focus();
	}, 100);
};

// Drag & Drop Handler
GartenPlaner.prototype.handleDragStart = function (e, taskId) {
	this.draggedTaskId = taskId;
	e.currentTarget.classList.add("dragging");
	e.dataTransfer.effectAllowed = "move";
	e.dataTransfer.setData("text/html", e.currentTarget.innerHTML);
};

GartenPlaner.prototype.handleDragEnd = (e) => {
	e.currentTarget.classList.remove("dragging");
	// Entferne alle drag-over Klassen
	document.querySelectorAll(".task-card").forEach((card) => {
		card.classList.remove("drag-over");
	});
};

GartenPlaner.prototype.handleDragOver = (e) => {
	if (e.preventDefault) {
		e.preventDefault();
	}
	e.dataTransfer.dropEffect = "move";
	return false;
};

GartenPlaner.prototype.handleDragEnter = (e) => {
	if (e.currentTarget.classList.contains("task-card")) {
		e.currentTarget.classList.add("drag-over");
	}
};

GartenPlaner.prototype.handleDragLeave = (e) => {
	if (e.currentTarget.classList.contains("task-card")) {
		e.currentTarget.classList.remove("drag-over");
	}
};

GartenPlaner.prototype.handleDrop = function (e, targetTaskId) {
	if (e.stopPropagation) {
		e.stopPropagation();
	}
	e.preventDefault();

	const draggedTaskId = this.draggedTaskId;

	if (draggedTaskId && draggedTaskId !== targetTaskId) {
		// Finde die Aufgaben
		const draggedTask = this.tasks.find((t) => t.id === draggedTaskId);
		const targetTask = this.tasks.find((t) => t.id === targetTaskId);

		if (draggedTask && targetTask) {
			// Hole aktuelle gefilterte Liste
			const filteredTasks = this.getFilteredTasks();

			// Finde Indizes in der gefilterten Liste
			const draggedFilteredIndex = filteredTasks.findIndex(
				(t) => t.id === draggedTaskId,
			);
			const targetFilteredIndex = filteredTasks.findIndex(
				(t) => t.id === targetTaskId,
			);

			// Finde Indizes im Haupt-Array
			const draggedIndex = this.tasks.findIndex((t) => t.id === draggedTaskId);
			const targetIndex = this.tasks.findIndex((t) => t.id === targetTaskId);

			// Entferne die gezogene Aufgabe
			const [removed] = this.tasks.splice(draggedIndex, 1);

			// Berechne neue Position
			const newTargetIndex = this.tasks.findIndex((t) => t.id === targetTaskId);

			// Füge sie an der neuen Position ein
			if (draggedFilteredIndex < targetFilteredIndex) {
				this.tasks.splice(newTargetIndex + 1, 0, removed);
			} else {
				this.tasks.splice(newTargetIndex, 0, removed);
			}

			this.saveTasks();
			this.renderTasks();
			this.showNotification("✅ Aufgabe verschoben!");
		}
	}

	return false;
};

// Bulk-Aktionen
GartenPlaner.prototype.toggleBulkMode = function () {
	this.bulkMode = !this.bulkMode;
	const btn = document.getElementById("bulkModeBtn");
	if (btn) {
		btn.textContent = this.bulkMode
			? "✗ Mehrfachauswahl beenden"
			: "✓ Mehrfachauswahl";
		btn.classList.toggle("active");
	}

	if (!this.bulkMode) {
		this.selectedTasks.clear();
	}

	this.renderTasks();
};

GartenPlaner.prototype.toggleTaskSelection = function (taskId) {
	if (this.selectedTasks.has(taskId)) {
		this.selectedTasks.delete(taskId);
	} else {
		this.selectedTasks.add(taskId);
	}
	this.renderTasks();
};

GartenPlaner.prototype.selectAllTasks = function () {
	const filteredTasks = this.getFilteredTasks();
	filteredTasks.forEach((task) => this.selectedTasks.add(task.id));
	this.renderTasks();
};

GartenPlaner.prototype.deselectAllTasks = function () {
	this.selectedTasks.clear();
	this.renderTasks();
};

// Subtask-Methoden für CREATE (neue Aufgabe)
GartenPlaner.prototype.addCreateSubtask = function () {
	const input = document.getElementById("newSubtaskInputCreate");
	if (!input || !input.value.trim()) return;

	// Input sanitizen und validieren
	const text = Security.sanitizeText(input.value);
	if (!Security.validateInput.text(text, 1, 200)) {
		this.showNotification(
			"❌ Teilaufgabe muss zwischen 1 und 200 Zeichen lang sein",
			"error",
		);
		return;
	}

	const subtask = {
		id: Date.now(),
		text: text,
		completed: false,
	};

	this.tempSubtasks.push(subtask);
	input.value = "";
	this.renderCreateSubtasksList();
};

GartenPlaner.prototype.deleteCreateSubtask = function (subtaskId) {
	this.tempSubtasks = this.tempSubtasks.filter((st) => st.id !== subtaskId);
	this.renderCreateSubtasksList();
};

GartenPlaner.prototype.toggleCreateSubtask = function (subtaskId) {
	const subtask = this.tempSubtasks.find((st) => st.id === subtaskId);
	if (subtask) {
		subtask.completed = !subtask.completed;
		this.renderCreateSubtasksList();
	}
};

// Subtask-Methoden für EDIT (bestehende Aufgabe)
GartenPlaner.prototype.addSubtask = function (task) {
	const input = document.getElementById("newSubtaskInput");
	if (!input || !input.value.trim()) return;

	// Input sanitizen und validieren
	const text = Security.sanitizeText(input.value);
	if (!Security.validateInput.text(text, 1, 200)) {
		this.showNotification(
			"❌ Teilaufgabe muss zwischen 1 und 200 Zeichen lang sein",
			"error",
		);
		return;
	}

	if (!task.subtasks) {
		task.subtasks = [];
	}

	const subtask = {
		id: Date.now(),
		text: text,
		completed: false,
	};

	task.subtasks.push(subtask);
	input.value = "";

	this.renderSubtasksInModal(task);
	this.saveTasks();
};

GartenPlaner.prototype.toggleSubtask = function (task, subtaskId) {
	if (!task.subtasks) return;

	const subtask = task.subtasks.find((st) => st.id === subtaskId);
	if (subtask) {
		subtask.completed = !subtask.completed;
		this.renderSubtasksInModal(task);
		this.saveTasks();
		this.renderTasks(); // Update main view to show progress
	}
};

GartenPlaner.prototype.deleteSubtask = function (task, subtaskId) {
	if (!task.subtasks) return;

	task.subtasks = task.subtasks.filter((st) => st.id !== subtaskId);
	this.renderSubtasksInModal(task);
	this.saveTasks();
	this.renderTasks(); // Update main view to show progress
};

// --- Kommentar-Funktionen ---

GartenPlaner.prototype.renderComments = function (task) {
	var container = document.getElementById("commentsList");
	if (!container) return;

	var comments = Array.isArray(task.comments) ? task.comments : [];

	if (comments.length === 0) {
		container.innerHTML = '<div class="comments-empty">Noch keine Kommentare</div>';
		return;
	}

	// Chronologisch sortieren (aelteste zuerst)
	var sorted = comments.slice().sort(function (a, b) {
		return new Date(a.createdAt) - new Date(b.createdAt);
	});

	container.innerHTML = sorted.map(function (comment) {
		var safeText = Security.escapeHtml(comment.text);
		var safeUser = Security.escapeHtml(comment.username || 'Anonym');
		var date = new Date(comment.createdAt);
		var dateStr = date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

		return '<div class="comment-item" data-comment-id="' + comment.id + '">' +
			'<div class="comment-header">' +
			'<span class="comment-author">' + safeUser + '</span>' +
			'<span class="comment-date">' + dateStr + '</span>' +
			'<button type="button" class="comment-delete-btn" data-comment-id="' + comment.id + '" title="Kommentar loeschen" aria-label="Kommentar loeschen">&times;</button>' +
			'</div>' +
			'<div class="comment-text">' + safeText + '</div>' +
			'</div>';
	}).join('');
};

GartenPlaner.prototype.setupCommentListeners = function (task) {
	var self = this;
	var addBtn = document.getElementById("addCommentBtn");
	var input = document.getElementById("newCommentInput");
	var container = document.getElementById("commentsList");
	if (!addBtn || !input) return;

	// Ersetze Buttons um alte Listener zu entfernen
	var newAddBtn = addBtn.cloneNode(true);
	addBtn.parentNode.replaceChild(newAddBtn, addBtn);

	newAddBtn.addEventListener("click", function () {
		var text = input.value.trim();
		if (!text) return;

		if (self.useAPI) {
			TaskAPI.addComment(task.id, text).then(function (comment) {
				if (!Array.isArray(task.comments)) task.comments = [];
				task.comments.push(comment);
				self.renderComments(task);
				self.renderTasks();
				input.value = '';
			}).catch(function (err) {
				self.showNotification('Fehler beim Hinzufuegen des Kommentars: ' + err.message, 'error');
			});
		} else {
			if (!Array.isArray(task.comments)) task.comments = [];
			task.comments.push({
				id: 'c-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
				username: 'Lokal',
				text: text,
				createdAt: new Date().toISOString()
			});
			self.saveTasks();
			self.renderComments(task);
			self.renderTasks();
			input.value = '';
		}
	});

	// Enter-Taste zum Senden (Shift+Enter fuer Zeilenumbruch)
	var newInput = input.cloneNode(true);
	input.parentNode.replaceChild(newInput, input);
	newInput.addEventListener("keydown", function (e) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			newAddBtn.click();
		}
	});

	// Delete-Buttons fuer Kommentare
	if (container) {
		container.addEventListener("click", function (e) {
			var deleteBtn = e.target.closest(".comment-delete-btn");
			if (!deleteBtn) return;
			var commentId = deleteBtn.dataset.commentId;
			if (!commentId) return;

			if (self.useAPI) {
				TaskAPI.deleteComment(task.id, commentId).then(function () {
					task.comments = (task.comments || []).filter(function (c) { return c.id !== commentId; });
					self.renderComments(task);
					self.renderTasks();
				}).catch(function (err) {
					self.showNotification('Fehler beim Loeschen des Kommentars: ' + err.message, 'error');
				});
			} else {
				task.comments = (task.comments || []).filter(function (c) { return c.id !== commentId; });
				self.saveTasks();
				self.renderComments(task);
				self.renderTasks();
			}
		});
	}
};
