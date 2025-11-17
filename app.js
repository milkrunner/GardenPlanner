// Gartenplaner App - Lokale Datenspeicherung mit LocalStorage
class GartenPlaner {
    constructor() {
        this.tasks = this.loadTasks();
        this.archivedTasks = this.loadArchivedTasks();
        this.showArchive = false;
        this.currentFilter = {
            employee: '',
            location: '',
            status: ''
        };
        this.searchQuery = '';
        this.currentView = 'list';
        this.draggedTaskId = null;
        this.selectedTasks = new Set();
        this.bulkMode = false;
        this.tempSubtasks = []; // Temporäre Subtasks für neue Aufgabe
        this.init();
    }

    // Initialisierung
    init() {
        this.checkRecurringTasks();
        this.setupEventListeners();
        this.setupCreateSubtaskListeners(); // Für neue Aufgabe
        this.updateEmployeeFilter();
        this.updateLocationFilter();
        this.renderTasks();
        this.updateStatistics();
        this.initWeather(); // Wetter-Widget initialisieren
    }

    // Event Listeners einrichten
    setupEventListeners() {
        // Formular Submit
        const taskForm = document.getElementById('taskForm');
        if (taskForm) {
            taskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addTask();
            });
        }

        // Filter (nur wenn vorhanden)
        const filterEmployee = document.getElementById('filterEmployee');
        if (filterEmployee) {
            filterEmployee.addEventListener('change', (e) => {
                this.currentFilter.employee = e.target.value;
                this.renderTasks();
            });
        }

        const filterLocation = document.getElementById('filterLocation');
        if (filterLocation) {
            filterLocation.addEventListener('change', (e) => {
                this.currentFilter.location = e.target.value;
                this.renderTasks();
            });
        }

        const filterStatus = document.getElementById('filterStatus');
        if (filterStatus) {
            filterStatus.addEventListener('change', (e) => {
                this.currentFilter.status = e.target.value;
                this.renderTasks();
            });
        }

        // Suchfunktion
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim();
                this.performSearch();
            });
        }

        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                this.clearSearch();
            });
        }

        // View Toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentView = e.target.dataset.view;
                this.switchView();
            });
        });

        // Datenverwaltung (nur wenn vorhanden)
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => this.exportPDF());
        }

        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportData());
        }

        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                document.getElementById('importFile').click();
            });
        }

        const importFile = document.getElementById('importFile');
        if (importFile) {
            importFile.addEventListener('change', (e) => this.importData(e));
        }

        const clearBtn = document.getElementById('clearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAllData());
        }

        // Archiv-Toggle
        const toggleArchiveBtn = document.getElementById('toggleArchiveBtn');
        if (toggleArchiveBtn) {
            toggleArchiveBtn.addEventListener('click', () => this.toggleArchiveView());
        }
    }



    // Aufgabe hinzufügen
    async addTask() {
        // Input-Werte sanitizen
        const taskData = {
            title: Security.sanitizeText(document.getElementById('taskTitle').value),
            employee: Security.sanitizeText(document.getElementById('taskEmployee').value),
            location: Security.sanitizeText(document.getElementById('taskLocation').value),
            description: Security.sanitizeText(document.getElementById('taskDescription').value),
            status: 'pending'
        };

        // Validierung
        const validation = Security.validateTask(taskData);
        if (!validation.valid) {
            this.showNotification('❌ ' + validation.errors.join(', '), 'error');
            Security.logSecurityEvent('warning', 'Invalid task data', validation.errors);
            return;
        }

        const task = {
            id: Date.now(),
            ...taskData,
            createdAt: new Date().toISOString(),
            history: [],
            subtasks: [...this.tempSubtasks] // Übernehme temporäre Subtasks
        };

        // Initiale History erstellen
        this.addHistoryEntry(task, 'created', {
            title: task.title,
            employee: task.employee,
            location: task.location
        });

        this.tasks.push(task);
        this.saveTasks();
        this.renderTasks();
        this.updateStatistics();
        this.updateEmployeeFilter();
        this.updateLocationFilter();
        document.getElementById('taskForm').reset();
        
        // Reset tempSubtasks und Liste
        this.tempSubtasks = [];
        this.renderCreateSubtasksList();
        
        // Scroll zur neuen Aufgabe (falls auf Dashboard)
        setTimeout(() => {
            const newTaskElement = document.querySelector(`[data-task-id="${task.id}"]`);
            if (newTaskElement) {
                newTaskElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
        
        this.showNotification('✅ Aufgabe erfolgreich hinzugefügt!');
        this.announce(`Neue Aufgabe "${task.title}" wurde hinzugefügt`);
    }

    // Aufgabe löschen
    async deleteTask(id) {
        const confirmed = await this.showConfirm({
            title: 'Aufgabe löschen',
            icon: '🗑️',
            message: 'Möchten Sie diese Aufgabe wirklich löschen?',
            confirmText: 'Löschen',
            cancelText: 'Abbrechen',
            danger: true
        });

        if (confirmed) {
            // Animation abspielen
            const taskElement = document.querySelector(`[data-task-id="${id}"]`);
            if (taskElement) {
                taskElement.classList.add('task-removing');
                await new Promise(resolve => setTimeout(resolve, 400));
            }

            this.tasks = this.tasks.filter(task => task.id !== id);
            this.saveTasks();
            this.renderTasks();
            this.updateStatistics();
            this.updateEmployeeFilter();
            this.updateLocationFilter();
            this.showNotification('🗑️ Aufgabe gelöscht');
        }
    }

    // Aufgabe bearbeiten - Modal öffnen
    openEditModal(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const modal = document.getElementById('editModal');
        if (!modal) return;

        // Speichere die ID der zu bearbeitenden Aufgabe
        modal.dataset.taskId = id;

        // Modal anzeigen
        modal.style.display = 'flex';

        // Event Listeners für Modal
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = document.getElementById('cancelEditBtn');
        const editForm = document.getElementById('editTaskForm');

        const closeModal = () => {
            modal.style.display = 'none';
            delete modal.dataset.taskId;
        };

        // Entferne alte Event Listener
        closeBtn.replaceWith(closeBtn.cloneNode(true));
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        editForm.replaceWith(editForm.cloneNode(true));

        // Füge neue Event Listener hinzu
        const newCloseBtn = modal.querySelector('.modal-close');
        const newCancelBtn = document.getElementById('cancelEditBtn');
        const newEditForm = document.getElementById('editTaskForm');

        // Formular mit aktuellen Werten füllen (NACH dem replaceWith)
        document.getElementById('editTaskTitle').value = task.title;
        document.getElementById('editTaskEmployee').value = task.employee;
        document.getElementById('editTaskLocation').value = task.location || '';
        document.getElementById('editTaskDescription').value = task.description || '';

        // Subtasks rendern
        this.renderSubtasksInModal(task);

        // Subtask Event Listeners (NACH dem replaceWith)
        this.setupSubtaskListeners(task);

        newCloseBtn.addEventListener('click', closeModal);
        newCancelBtn.addEventListener('click', closeModal);
        
        // Schließen bei Klick außerhalb des Modals
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Formular Submit
        newEditForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveEditedTask(id);
            closeModal();
        });
    }

    // Bearbeitete Aufgabe speichern
    saveEditedTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const oldTitle = task.title;
        const oldEmployee = task.employee;
        const oldLocation = task.location;
        const oldDescription = task.description;

        // Input-Werte sanitizen und validieren
        const taskData = {
            title: Security.sanitizeText(document.getElementById('editTaskTitle').value),
            employee: Security.sanitizeText(document.getElementById('editTaskEmployee').value),
            location: Security.sanitizeText(document.getElementById('editTaskLocation').value),
            description: Security.sanitizeText(document.getElementById('editTaskDescription').value),
            status: task.status
        };

        // Validierung
        const validation = Security.validateTask(taskData);
        if (!validation.valid) {
            this.showNotification('❌ ' + validation.errors.join(', '), 'error');
            Security.logSecurityEvent('warning', 'Invalid task data on edit', validation.errors);
            return;
        }

        task.title = taskData.title;
        task.employee = taskData.employee;
        task.location = taskData.location;
        task.description = taskData.description;

        // History-Eintrag für Änderungen
        const changes = [];
        if (oldTitle !== task.title) changes.push(`Titel: "${oldTitle}" → "${task.title}"`);
        if (oldEmployee !== task.employee) changes.push(`Mitarbeiter: "${oldEmployee}" → "${task.employee}"`);
        if (oldLocation !== task.location) changes.push(`Standort: "${oldLocation}" → "${task.location}"`);
        if (oldDescription !== task.description) changes.push('Beschreibung geändert');

        if (changes.length > 0) {
            this.addHistoryEntry(task, 'edited', {
                changes: changes
            });
        }

        this.saveTasks();
        this.renderTasks();
        this.updateStatistics();
        this.updateEmployeeFilter();
        this.updateLocationFilter();
        this.showNotification('✅ Aufgabe erfolgreich aktualisiert!');
    }

    // Archiv-Ansicht umschalten
    toggleArchiveView() {
        this.showArchive = !this.showArchive;
        const btn = document.getElementById('toggleArchiveBtn');
        const title = document.getElementById('tasksHeaderTitle');
        const bulkModeBtn = document.getElementById('bulkModeBtn');

        if (this.showArchive) {
            btn.textContent = '📋 Aktive Aufgaben anzeigen';
            title.textContent = 'Archivierte Aufgaben';
            if (bulkModeBtn) bulkModeBtn.style.display = 'none';
        } else {
            btn.textContent = '📦 Archiv anzeigen';
            title.textContent = 'Alle Aufgaben';
            if (bulkModeBtn) bulkModeBtn.style.display = 'block';
        }

        // Bulk-Modus deaktivieren wenn aktiv
        if (this.bulkMode) {
            this.toggleBulkMode();
        }

        this.renderTasks();
        this.updateStatistics();
    }

    // Aufgabe archivieren
    archiveTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        if (confirm('Möchten Sie diese Aufgabe wirklich archivieren?')) {
            // Füge Archivierungsdatum hinzu
            task.archivedAt = new Date().toISOString();
            
            // History-Eintrag
            this.addHistoryEntry(task, 'archived', {});
            
            // Verschiebe in Archiv
            this.archivedTasks.push(task);
            this.tasks = this.tasks.filter(t => t.id !== id);

            this.saveTasks();
            this.saveArchivedTasks();
            this.renderTasks();
            this.updateStatistics();
            this.updateEmployeeFilter();
            this.updateLocationFilter();
            this.showNotification('📦 Aufgabe archiviert');
        }
    }

    // Aufgabe aus Archiv wiederherstellen
    unarchiveTask(id) {
        const task = this.archivedTasks.find(t => t.id === id);
        if (!task) return;

        if (confirm('Möchten Sie diese Aufgabe wiederherstellen?')) {
            // Entferne Archivierungsdatum
            delete task.archivedAt;
            
            // History-Eintrag
            this.addHistoryEntry(task, 'unarchived', {});
            
            // Verschiebe zurück zu aktiven Aufgaben
            this.tasks.push(task);
            this.archivedTasks = this.archivedTasks.filter(t => t.id !== id);

            this.saveTasks();
            this.saveArchivedTasks();
            this.renderTasks();
            this.updateStatistics();
            this.updateEmployeeFilter();
            this.updateLocationFilter();
            this.showNotification('↻ Aufgabe wiederhergestellt');
        }
    }

    // Archivierte Aufgabe endgültig löschen
    deleteArchivedTask(id) {
        if (confirm('Möchten Sie diese archivierte Aufgabe endgültig löschen?')) {
            this.archivedTasks = this.archivedTasks.filter(t => t.id !== id);
            this.saveArchivedTasks();
            this.renderTasks();
            this.showNotification('🗑️ Archivierte Aufgabe gelöscht');
        }
    }

    // Aufgabe als erledigt markieren
    async toggleTaskStatus(id) {
        const task = this.tasks.find(task => task.id === id);
        if (task) {
            // Animation abspielen beim Erledigen
            if (task.status === 'pending') {
                const taskElement = document.querySelector(`[data-task-id="${id}"]`);
                if (taskElement) {
                    taskElement.classList.add('task-completing');
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            const oldStatus = task.status;
            task.status = task.status === 'pending' ? 'completed' : 'pending';
            task.completedAt = task.status === 'completed' ? new Date().toISOString() : null;
            
            // History-Eintrag
            this.addHistoryEntry(task, task.status === 'completed' ? 'completed' : 'reopened', {
                from: oldStatus,
                to: task.status
            });
            
            this.saveTasks();
            this.renderTasks();
            this.updateStatistics();
            this.showNotification(task.status === 'completed' ? '✅ Aufgabe erledigt!' : '🔄 Aufgabe reaktiviert');
        }
    }

    // Aufgaben filtern
    getFilteredTasks() {
        const tasksToFilter = this.showArchive ? this.archivedTasks : this.tasks;
        return tasksToFilter.filter(task => {
            const employeeMatch = !this.currentFilter.employee || task.employee === this.currentFilter.employee;
            const locationMatch = !this.currentFilter.location || task.location === this.currentFilter.location;
            const statusMatch = !this.currentFilter.status || task.status === this.currentFilter.status;
            
            // Suchfilter anwenden
            let searchMatch = true;
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                searchMatch = 
                    task.title.toLowerCase().includes(query) ||
                    task.employee.toLowerCase().includes(query) ||
                    (task.location && task.location.toLowerCase().includes(query)) ||
                    (task.description && task.description.toLowerCase().includes(query));
            }
            
            return employeeMatch && locationMatch && statusMatch && searchMatch;
        });
    }

    // Suchfunktion durchführen
    performSearch() {
        const clearBtn = document.getElementById('clearSearchBtn');
        const searchResults = document.getElementById('searchResults');
        const searchResultCount = document.getElementById('searchResultCount');
        
        // Clear-Button anzeigen/verstecken
        if (clearBtn) {
            clearBtn.style.display = this.searchQuery ? 'flex' : 'none';
        }
        
        // Tasks neu rendern mit Suchfilter
        this.renderTasks();
        
        // Suchergebnisse anzeigen
        if (searchResults && searchResultCount && this.searchQuery) {
            const filteredTasks = this.getFilteredTasks();
            searchResultCount.textContent = filteredTasks.length;
            searchResults.style.display = 'flex';
        } else if (searchResults) {
            searchResults.style.display = 'none';
        }
    }

    // Suche zurücksetzen
    clearSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
            this.searchQuery = '';
            this.performSearch();
        }
    }

    // Nächstes Fälligkeitsdatum berechnen
    calculateNextDue(recurrence, fromDate = new Date()) {
        const nextDate = new Date(fromDate);
        
        switch(recurrence) {
            case 'daily':
                nextDate.setDate(nextDate.getDate() + 1);
                break;
            case 'weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;
            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
            default:
                return null;
        }
        
        return nextDate.toISOString();
    }

    // Wiederholungs-Badge erstellen
    getRecurrenceBadge(recurrence) {
        const labels = {
            'daily': 'Täglich',
            'weekly': 'Wöchentlich',
            'monthly': 'Monatlich'
        };

        const icons = {
            'daily': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
            'weekly': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/></svg>',
            'monthly': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
        };

        return `<span class="recurrence-badge" title="Diese Aufgabe wiederholt sich ${labels[recurrence].toLowerCase()}">${icons[recurrence] || ''}${labels[recurrence] || recurrence}</span>`;
    }

    // Wiederholende Aufgaben überprüfen
    checkRecurringTasks() {
        const now = new Date();
        let tasksCreated = false;

        this.tasks.forEach(task => {
            if (task.recurrence && task.recurrence !== 'none' && task.nextDue) {
                const nextDueDate = new Date(task.nextDue);
                
                // Wenn das Fälligkeitsdatum erreicht oder überschritten ist
                if (now >= nextDueDate) {
                    // Neue Instanz der Aufgabe erstellen
                    const newTask = {
                        id: Date.now() + Math.random(), // Eindeutige ID
                        title: task.title,
                        employee: task.employee,
                        location: task.location,
                        description: task.description,
                        status: 'pending',
                        createdAt: new Date().toISOString(),
                        recurrence: task.recurrence,
                        lastRecurrence: new Date().toISOString(),
                        nextDue: this.calculateNextDue(task.recurrence)
                    };

                    this.tasks.push(newTask);
                    tasksCreated = true;

                    // Original-Task aktualisieren
                    task.lastRecurrence = new Date().toISOString();
                    task.nextDue = this.calculateNextDue(task.recurrence);
                }
            }
        });

        if (tasksCreated) {
            this.saveTasks();
            this.showNotification('🔄 Wiederholende Aufgaben wurden erstellt');
        }
    }

    // Aufgaben anzeigen
    renderTasks() {
        const filteredTasks = this.getFilteredTasks();
        const tasksList = document.getElementById('tasksList');

        // Wenn tasksList nicht existiert (z.B. auf index.html), nicht rendern
        if (!tasksList) {
            return;
        }

        if (filteredTasks.length === 0) {
            const emptyMessage = this.showArchive 
                ? {
                    icon: '📦',
                    title: 'Archiv ist leer',
                    message: 'Hier werden archivierte Aufgaben angezeigt.',
                    action: ''
                }
                : {
                    icon: '🌱',
                    title: 'Noch keine Aufgaben vorhanden',
                    message: 'Beginnen Sie mit Ihrer Gartenplanung!',
                    action: '<a href="index.html" class="btn btn-primary empty-state-btn">➕ Erste Aufgabe erstellen</a>'
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
            const orderA = a.sortOrder !== undefined ? a.sortOrder : this.tasks.indexOf(a);
            const orderB = b.sortOrder !== undefined ? b.sortOrder : this.tasks.indexOf(b);
            return orderA - orderB;
        });

        tasksList.innerHTML = filteredTasks.map(task => this.createTaskCard(task)).join('');

        // Event Listeners für Buttons und Drag & Drop
        filteredTasks.forEach(task => {
            const card = document.querySelector(`[data-task-id="${task.id}"]`);
            if (card) {
                // Checkbox Event Listener
                const checkbox = card.querySelector('.task-select-checkbox');
                if (checkbox) {
                    checkbox.addEventListener('change', (e) => {
                        e.stopPropagation();
                        this.toggleTaskSelection(task.id);
                    });
                }

                // Button Event Listeners
                card.querySelector('.edit-btn')?.addEventListener('click', () => {
                    this.openEditModal(task.id);
                });
                card.querySelector('.complete-btn, .uncomplete-btn')?.addEventListener('click', () => {
                    this.toggleTaskStatus(task.id);
                });
                card.querySelector('.archive-btn')?.addEventListener('click', () => {
                    this.archiveTask(task.id);
                });
                card.querySelector('.unarchive-btn')?.addEventListener('click', () => {
                    this.unarchiveTask(task.id);
                });
                card.querySelector('.delete-btn')?.addEventListener('click', () => {
                    if (this.showArchive) {
                        this.deleteArchivedTask(task.id);
                    } else {
                        this.deleteTask(task.id);
                    }
                });

                // Drag & Drop Event Listeners (nur für aktive Aufgaben und nicht auf mobilen Geräten)
                const isMobile = window.innerWidth <= 768;
                if (!isMobile) {
                    card.addEventListener('dragstart', (e) => this.handleDragStart(e, task.id));
                    card.addEventListener('dragend', (e) => this.handleDragEnd(e));
                    card.addEventListener('dragover', (e) => this.handleDragOver(e));
                    card.addEventListener('drop', (e) => this.handleDrop(e, task.id));
                    card.addEventListener('dragenter', (e) => this.handleDragEnter(e));
                    card.addEventListener('dragleave', (e) => this.handleDragLeave(e));
                } else {
                    // Auf mobilen Geräten Drag & Drop deaktivieren
                    card.setAttribute('draggable', 'false');
                }
            }
        });

        // Bulk-Toolbar aktualisieren
        this.updateBulkToolbar();
    }

    // Aufgaben-Karte erstellen
    createTaskCard(task) {
        const isCompleted = task.status === 'completed';
        const isSelected = this.selectedTasks.has(task.id);
        const isArchived = this.showArchive;

        // Sanitize all user inputs for XSS protection
        const safeTitle = Security.escapeHtml(task.title);
        const safeEmployee = Security.escapeHtml(task.employee);
        const safeLocation = Security.escapeHtml(task.location || 'Kein Standort');
        const safeDescription = task.description ? Security.escapeHtml(task.description) : '';

        return `
            <div class="task-card ${isCompleted ? 'completed' : ''} ${isSelected ? 'selected' : ''} ${isArchived ? 'archived' : ''}" 
                 data-task-id="${task.id}" 
                 draggable="${!isArchived}"
                 role="article"
                 aria-label="Aufgabe: ${safeTitle}"
                 tabindex="0">
                ${this.bulkMode && !isArchived ? `
                    <div class="task-checkbox">
                        <input type="checkbox" class="task-select-checkbox" ${isSelected ? 'checked' : ''} aria-label="Aufgabe auswählen: ${safeTitle}">
                    </div>
                ` : ''}
                <div class="task-info">
                    <div class="task-header">
                        ${!isArchived ? '<span class="drag-handle"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>' : ''}
                        <span class="task-title">${safeTitle}</span>
                        ${task.recurrence && task.recurrence !== 'none' ? this.getRecurrenceBadge(task.recurrence) : ''}
                        ${isArchived && task.archivedAt ? `<span class="archived-badge"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Archiviert am ${new Date(task.archivedAt).toLocaleDateString('de-DE')}</span>` : ''}
                    </div>
                    <div class="task-meta">
                        <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${safeEmployee}</span>
                        <span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${safeLocation}</span>
                    </div>
                    ${safeDescription ? `<div class="task-description">${safeDescription}</div>` : ''}
                    ${this.renderSubtasksProgress(task)}
                </div>
                <div class="task-actions" role="group" aria-label="Aufgaben-Aktionen">
                    ${!isArchived ? `
                        <button class="task-btn task-btn-icon edit-btn" aria-label="Aufgabe bearbeiten" title="Bearbeiten"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                        ${isCompleted ? 
                            '<button class="task-btn task-btn-icon uncomplete-btn" aria-label="Aufgabe reaktivieren" title="Reaktivieren"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 4v4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' :
                            '<button class="task-btn task-btn-icon complete-btn" aria-label="Als erledigt markieren" title="Erledigt"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
                        }
                        <button class="task-btn task-btn-icon archive-btn" aria-label="Aufgabe archivieren" title="Archivieren"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                        <button class="task-btn task-btn-icon delete-btn" aria-label="Aufgabe löschen" title="Löschen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                    ` : `
                        <button class="task-btn task-btn-icon unarchive-btn" aria-label="Aufgabe wiederherstellen" title="Wiederherstellen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 4v4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                        <button class="task-btn task-btn-icon delete-btn" aria-label="Aufgabe endgültig löschen" title="Endgültig löschen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                    `}
                </div>
            </div>
        `;
    }

    // Ansicht wechseln
    switchView() {
        const listView = document.getElementById('tasksList');
        const calendarView = document.getElementById('tasksCalendar');

        if (!listView || !calendarView) {
            return;
        }

        if (this.currentView === 'list') {
            listView.style.display = 'flex';
            calendarView.style.display = 'none';
        } else {
            listView.style.display = 'none';
            calendarView.style.display = 'block';
            this.renderCalendar();
        }
    }

    // Kalenderansicht (deaktiviert, da keine Datumsinformationen mehr vorhanden)
    renderCalendar() {
        const calendarDiv = document.getElementById('calendarView');
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
    }

    // Mitarbeiter-Filter aktualisieren
    updateEmployeeFilter() {
        const filterSelect = document.getElementById('filterEmployee');
        if (!filterSelect) {
            return;
        }

        const employees = [...new Set(this.tasks.map(task => task.employee))].sort();
        const currentValue = filterSelect.value;

        // XSS-sicher: Escape alle Mitarbeiternamen
        filterSelect.innerHTML = '<option value="">Alle Mitarbeiter</option>' +
            employees.map(emp => {
                const safe = Security.escapeHtml(emp);
                return `<option value="${safe}">${safe}</option>`;
            }).join('');
        
        filterSelect.value = currentValue;
    }

    updateLocationFilter() {
        const filterSelect = document.getElementById('filterLocation');
        if (!filterSelect) {
            return;
        }

        const locations = [...new Set(this.tasks.map(task => task.location).filter(loc => loc))].sort();
        const currentValue = filterSelect.value;

        // XSS-sicher: Escape alle Standorte
        filterSelect.innerHTML = '<option value="">Alle Standorte</option>' +
            locations.map(loc => {
                const safe = Security.escapeHtml(loc);
                return `<option value="${safe}">${safe}</option>`;
            }).join('');
        
        filterSelect.value = currentValue;
    }

    // Statistiken aktualisieren
    updateStatistics() {
        if (this.showArchive) {
            // Archiv-Statistiken
            const archivedCount = this.archivedTasks.length;
            const archivedCompleted = this.archivedTasks.filter(t => t.status === 'completed').length;
            const archivedPending = this.archivedTasks.filter(t => t.status === 'pending').length;

            const statPending = document.getElementById('statPending');
            const statCompleted = document.getElementById('statCompleted');
            const statEmployees = document.getElementById('statEmployees');

            if (statPending) statPending.textContent = archivedPending;
            if (statCompleted) statCompleted.textContent = archivedCompleted;
            if (statEmployees) statEmployees.textContent = archivedCount;
        } else {
            // Aktive Aufgaben-Statistiken
            const pending = this.tasks.filter(t => t.status === 'pending').length;
            const completed = this.tasks.filter(t => t.status === 'completed').length;
            const total = this.tasks.length;
            const employees = new Set(this.tasks.map(t => t.employee)).size;

            const statPending = document.getElementById('statPending');
            const statCompleted = document.getElementById('statCompleted');
            const statEmployees = document.getElementById('statEmployees');

            if (statPending) statPending.textContent = pending;
            if (statCompleted) statCompleted.textContent = completed;
            if (statEmployees) statEmployees.textContent = employees;

            // Fortschrittsbalken aktualisieren
            this.updateProgressBars(pending, completed, total, employees);
        }

        // Diagramme aktualisieren (nur auf Statistiken-Seite)
        if (window.location.pathname.includes('statistics.html')) {
            this.updateCharts();
        }
    }

    // Fortschrittsbalken aktualisieren
    updateProgressBars(pending, completed, total, employees) {
        const progressPending = document.getElementById('progressPending');
        const progressCompleted = document.getElementById('progressCompleted');
        const progressEmployees = document.getElementById('progressEmployees');
        const totalTasks = document.getElementById('totalTasks');
        const completionRate = document.getElementById('completionRate');
        const avgTasksPerEmployee = document.getElementById('avgTasksPerEmployee');

        if (progressPending && total > 0) {
            const pendingPercent = (pending / total) * 100;
            progressPending.style.width = `${pendingPercent}%`;
        }

        if (progressCompleted && total > 0) {
            const completedPercent = (completed / total) * 100;
            progressCompleted.style.width = `${completedPercent}%`;
            if (completionRate) completionRate.textContent = Math.round(completedPercent);
        }

        if (progressEmployees && employees > 0) {
            const employeePercent = Math.min((employees / 10) * 100, 100); // Max 10 als 100%
            progressEmployees.style.width = `${employeePercent}%`;
        }

        if (totalTasks) totalTasks.textContent = total;
        if (avgTasksPerEmployee && employees > 0) {
            avgTasksPerEmployee.textContent = (total / employees).toFixed(1);
        }
    }

    // Diagramme aktualisieren
    updateCharts() {
        this.updateEmployeeChart();
        this.updateLocationChart();
        this.updateActivityChart();
    }

    // Mitarbeiter-Diagramm
    updateEmployeeChart() {
        const employeeChart = document.getElementById('employeeChart');
        if (!employeeChart) return;

        const employeeCounts = {};
        this.tasks.forEach(task => {
            employeeCounts[task.employee] = (employeeCounts[task.employee] || 0) + 1;
        });

        const sortedEmployees = Object.entries(employeeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // Top 10

        if (sortedEmployees.length === 0) {
            employeeChart.innerHTML = '<div class="chart-empty">Noch keine Daten verfügbar</div>';
            return;
        }

        const maxCount = Math.max(...sortedEmployees.map(e => e[1]));
        
        // XSS-sicher: Escape Mitarbeiternamen
        employeeChart.innerHTML = sortedEmployees.map(([name, count]) => {
            const safeName = Security.escapeHtml(name);
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
        }).join('');
    }

    // Standort-Diagramm
    updateLocationChart() {
        const locationChart = document.getElementById('locationChart');
        if (!locationChart) return;

        const locationCounts = {};
        this.tasks.forEach(task => {
            if (task.location) {
                locationCounts[task.location] = (locationCounts[task.location] || 0) + 1;
            }
        });

        const sortedLocations = Object.entries(locationCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // Top 10

        if (sortedLocations.length === 0) {
            locationChart.innerHTML = '<div class="chart-empty">Noch keine Daten verfügbar</div>';
            return;
        }

        const maxCount = Math.max(...sortedLocations.map(l => l[1]));
        
        // XSS-sicher: Escape Standortnamen
        locationChart.innerHTML = sortedLocations.map(([name, count]) => {
            const safeName = Security.escapeHtml(name);
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
        }).join('');
    }

    // Aktivitäts-Diagramm (letzte 7 Tage)
    updateActivityChart() {
        const activityChart = document.getElementById('activityChart');
        if (!activityChart) return;

        // Letzte 7 Tage
        const days = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            days.push(date);
        }

        const dayCounts = days.map(day => {
            const dayStr = day.toISOString().split('T')[0];
            return {
                date: day,
                label: day.toLocaleDateString('de-DE', { weekday: 'short' }),
                count: this.tasks.filter(task => {
                    const taskDate = new Date(task.createdAt).toISOString().split('T')[0];
                    return taskDate === dayStr;
                }).length
            };
        });

        const maxCount = Math.max(...dayCounts.map(d => d.count), 1);

        activityChart.innerHTML = dayCounts.map(day => {
            const height = (day.count / maxCount) * 100;
            return `
                <div class="timeline-bar" style="height: ${height}%" title="${day.count} Aufgaben">
                    ${day.count > 0 ? `<div class="timeline-bar-value">${day.count}</div>` : ''}
                    <div class="timeline-bar-label">${day.label}</div>
                </div>
            `;
        }).join('');
    }

    // Zusätzliche Statistiken aktualisieren
    updateAdditionalStats() {
        const statArchived = document.getElementById('statArchived');
        const statLocations = document.getElementById('statLocations');
        const statToday = document.getElementById('statToday');
        const statThisWeek = document.getElementById('statThisWeek');

        if (statArchived) {
            statArchived.textContent = this.archivedTasks.length;
        }

        if (statLocations) {
            const locations = new Set(this.tasks.filter(t => t.location).map(t => t.location));
            statLocations.textContent = locations.size;
        }

        if (statToday) {
            const today = new Date().toISOString().split('T')[0];
            const todayTasks = this.tasks.filter(task => {
                const taskDate = new Date(task.createdAt).toISOString().split('T')[0];
                return taskDate === today;
            });
            statToday.textContent = todayTasks.length;
        }

        if (statThisWeek) {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const weekTasks = this.tasks.filter(task => {
                return new Date(task.createdAt) >= weekAgo;
            });
            statThisWeek.textContent = weekTasks.length;
        }

        // History-Timeline rendern
        this.renderHistory();
    }

    // History-Timeline rendern
    renderHistory() {
        const historyTimeline = document.getElementById('historyTimeline');
        if (!historyTimeline) return;

        const allHistory = this.getAllHistory();

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
        const recentHistory = allHistory.slice(0, 50);

        // XSS-sicher: Escape alle User-Inputs in History
        historyTimeline.innerHTML = recentHistory.map(entry => {
            const date = new Date(entry.timestamp);
            const timeAgo = this.getTimeAgo(date);
            const formattedDate = date.toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const actionInfo = this.getActionInfo(entry.action);
            const detailsHTML = this.getHistoryDetailsHTML(entry);

            const safeTitle = Security.escapeHtml(entry.taskTitle);
            const safeEmployee = Security.escapeHtml(entry.taskEmployee);

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
                        ${detailsHTML ? `<div class="history-details">${detailsHTML}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Action Info (Icon, Label, Farbe)
    getActionInfo(action) {
        const actions = {
            'created': { icon: '➕', label: 'Erstellt', color: '#27ae60' },
            'edited': { icon: '✏️', label: 'Bearbeitet', color: '#3498db' },
            'completed': { icon: '✅', label: 'Erledigt', color: '#2ecc71' },
            'reopened': { icon: '🔄', label: 'Wiedereröffnet', color: '#f39c12' },
            'archived': { icon: '📦', label: 'Archiviert', color: '#95a5a6' },
            'unarchived': { icon: '↻', label: 'Wiederhergestellt', color: '#9b59b6' },
            'deleted': { icon: '🗑️', label: 'Gelöscht', color: '#e74c3c' }
        };

        return actions[action] || { icon: '📝', label: action, color: '#7f8c8d' };
    }

    // History Details HTML erstellen
    getHistoryDetailsHTML(entry) {
        if (!entry.details) return '';

        if (entry.action === 'created') {
            return `Mitarbeiter: ${entry.details.employee}, Standort: ${entry.details.location}`;
        }

        if (entry.action === 'edited' && entry.details.changes) {
            return entry.details.changes.join('<br>');
        }

        return '';
    }

    // Zeit seit... berechnen
    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'Gerade eben';
        if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
        if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`;
        if (seconds < 604800) return `vor ${Math.floor(seconds / 86400)} Tag(en)`;
        
        return date.toLocaleDateString('de-DE');
    }

    // Daten speichern (LocalStorage)
    saveTasks() {
        localStorage.setItem('gartenplaner_tasks', JSON.stringify(this.tasks));
    }

    // Daten laden (LocalStorage)
    loadTasks() {
        const saved = localStorage.getItem('gartenplaner_tasks');
        return saved ? JSON.parse(saved) : [];
    }

    // Archivierte Aufgaben laden
    loadArchivedTasks() {
        const saved = localStorage.getItem('gartenplaner_archived_tasks');
        return saved ? JSON.parse(saved) : [];
    }

    // Archivierte Aufgaben speichern
    saveArchivedTasks() {
        localStorage.setItem('gartenplaner_archived_tasks', JSON.stringify(this.archivedTasks));
    }

    // Daten exportieren
    exportData() {
        const dataStr = JSON.stringify(this.tasks, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gartenplaner_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        this.showNotification('💾 Daten exportiert!');
    }

    // PDF exportieren
    async exportPDF() {
        // Prüfe ob jsPDF verfügbar ist
        if (typeof window.jspdf === 'undefined') {
            await this.showConfirm({
                title: 'Fehler',
                icon: '❌',
                message: 'PDF-Export ist nicht verfügbar. Bitte laden Sie die Seite neu.',
                confirmText: 'OK',
                cancelText: '',
                danger: false
            });
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Filtere Aufgaben basierend auf aktuellen Filtern
        const tasksToExport = this.getFilteredTasks();

        if (tasksToExport.length === 0) {
            await this.showConfirm({
                title: 'Keine Aufgaben',
                icon: 'ℹ️',
                message: 'Keine Aufgaben zum Exportieren vorhanden.',
                confirmText: 'OK',
                cancelText: '',
                danger: false
            });
            return;
        }

        // PDF-Titel
        doc.setFontSize(20);
        doc.text('Gartenplaner - Aufgabenliste', 14, 20);

        // Datum
        doc.setFontSize(10);
        doc.text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, 14, 28);

        // Statistiken
        const pending = tasksToExport.filter(t => t.status === 'pending').length;
        const completed = tasksToExport.filter(t => t.status === 'completed').length;
        doc.text(`Gesamt: ${tasksToExport.length} | Offen: ${pending} | Erledigt: ${completed}`, 14, 34);

        // Linie
        doc.setLineWidth(0.5);
        doc.line(14, 38, 196, 38);

        let yPosition = 46;
        const pageHeight = 280;
        const margin = 14;

        // Aufgaben durchgehen
        tasksToExport.forEach((task, index) => {
            // Neue Seite wenn nötig
            if (yPosition > pageHeight - 40) {
                doc.addPage();
                yPosition = 20;
            }

            // Aufgabennummer und Titel
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            const statusIcon = task.status === 'completed' ? '[✓]' : '[ ]';
            doc.text(`${statusIcon} ${index + 1}. ${task.title}`, margin, yPosition);
            yPosition += 7;

            // Details
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            
            // Mitarbeiter
            doc.text(`Mitarbeiter: ${task.employee}`, margin + 5, yPosition);
            yPosition += 6;

            // Standort
            if (task.location) {
                doc.text(`Standort: ${task.location}`, margin + 5, yPosition);
                yPosition += 6;
            }

            // Status
            doc.text(`Status: ${task.status === 'pending' ? 'Ausstehend' : 'Erledigt'}`, margin + 5, yPosition);
            yPosition += 6;

            // Beschreibung
            if (task.description) {
                doc.text('Beschreibung:', margin + 5, yPosition);
                yPosition += 6;
                
                // Text umbrechen bei langen Beschreibungen
                const maxWidth = 180;
                const lines = doc.splitTextToSize(task.description, maxWidth);
                lines.forEach(line => {
                    if (yPosition > pageHeight - 20) {
                        doc.addPage();
                        yPosition = 20;
                    }
                    doc.text(line, margin + 10, yPosition);
                    yPosition += 5;
                });
            }

            // Erstellt am
            if (task.createdAt) {
                const date = new Date(task.createdAt).toLocaleDateString('de-DE');
                doc.setFontSize(8);
                doc.setTextColor(128, 128, 128);
                doc.text(`Erstellt: ${date}`, margin + 5, yPosition);
                doc.setTextColor(0, 0, 0);
                yPosition += 6;
            }

            // Trennlinie
            doc.setDrawColor(200, 200, 200);
            doc.line(margin, yPosition, 196, yPosition);
            yPosition += 10;
        });

        // Footer auf allen Seiten
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(`Seite ${i} von ${pageCount}`, 196, 290, { align: 'right' });
        }

        // PDF speichern
        const filename = `gartenplaner_aufgaben_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        this.showNotification('📄 PDF erfolgreich exportiert!');
    }

    // Daten importieren
    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                const confirmed = await this.showConfirm({
                    title: 'Daten importieren',
                    icon: '📥',
                    message: `${imported.length} Aufgaben gefunden. Möchten Sie diese importieren?\n\nAchtung: Aktuelle Daten werden überschrieben!`,
                    confirmText: 'Importieren',
                    cancelText: 'Abbrechen',
                    danger: false
                });

                if (confirmed) {
                    this.tasks = imported;
                    this.saveTasks();
                    this.renderTasks();
                    this.updateStatistics();
                    this.updateEmployeeFilter();
                    this.updateLocationFilter();
                    this.showNotification('📥 Daten erfolgreich importiert!');
                }
            } catch (error) {
                await this.showConfirm({
                    title: 'Fehler',
                    icon: '❌',
                    message: 'Fehler beim Importieren: Ungültige Datei',
                    confirmText: 'OK',
                    cancelText: '',
                    danger: true
                });
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    // Alle Daten löschen
    async clearAllData() {
        const confirmed1 = await this.showConfirm({
            title: '⚠️ WARNUNG',
            icon: '⚠️',
            message: 'Möchten Sie wirklich ALLE Daten löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden!',
            confirmText: 'Weiter',
            cancelText: 'Abbrechen',
            danger: true
        });

        if (confirmed1) {
            const confirmed2 = await this.showConfirm({
                title: '⚠️ LETZTE WARNUNG',
                icon: '🚨',
                message: 'Sind Sie sich absolut sicher?\n\nAlle Aufgaben werden unwiderruflich gelöscht!',
                confirmText: 'Ja, alles löschen',
                cancelText: 'Abbrechen',
                danger: true
            });

            if (confirmed2) {
                this.tasks = [];
                this.saveTasks();
                this.renderTasks();
                this.updateStatistics();
                this.updateEmployeeFilter();
                this.updateLocationFilter();
                this.showNotification('🗑️ Alle Daten gelöscht');
            }
        }
    }

    // Benachrichtigung anzeigen
    showNotification(message) {
        // Erstelle Benachrichtigungselement
        const notification = document.createElement('div');
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
        if (!document.querySelector('#notification-style')) {
            const style = document.createElement('style');
            style.id = 'notification-style';
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
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Screen Reader Announcement
    announce(message) {
        const announcer = window.announcer;
        if (announcer) {
            announcer.textContent = '';
            setTimeout(() => {
                announcer.textContent = message;
            }, 100);
        }
    }

    // Schöner Confirm-Dialog
    showConfirm(options) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const title = document.getElementById('confirmModalTitle');
            const icon = document.getElementById('confirmModalIcon');
            const message = document.getElementById('confirmModalMessage');
            const okBtn = document.getElementById('confirmOkBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');

            // Setze Inhalte
            title.textContent = options.title || 'Bestätigung erforderlich';
            icon.textContent = options.icon || '⚠️';
            // Unterstütze Zeilenumbrüche in der Nachricht
            message.innerHTML = (options.message || 'Möchten Sie fortfahren?').replace(/\n/g, '<br>');
            okBtn.textContent = options.confirmText || 'Bestätigen';
            cancelBtn.textContent = options.cancelText || 'Abbrechen';

            // Verstecke Cancel-Button wenn kein Text vorhanden
            if (!options.cancelText) {
                cancelBtn.style.display = 'none';
            } else {
                cancelBtn.style.display = 'block';
            }

            // Setze Button-Stil
            if (options.danger) {
                okBtn.classList.add('btn-danger');
            } else {
                okBtn.classList.remove('btn-danger');
            }

            // Zeige Modal
            modal.style.display = 'flex';

            // Event Handler
            const handleOk = () => {
                modal.style.display = 'none';
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                modal.style.display = 'none';
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                okBtn.removeEventListener('click', handleOk);
                cancelBtn.removeEventListener('click', handleCancel);
                modal.removeEventListener('click', handleBackdropClick);
            };

            const handleBackdropClick = (e) => {
                if (e.target === modal) {
                    handleCancel();
                }
            };

            okBtn.addEventListener('click', handleOk);
            cancelBtn.addEventListener('click', handleCancel);
            modal.addEventListener('click', handleBackdropClick);
        });
    }

    // Hilfsfunktion für Info-Dialoge (nur OK-Button)
    showAlert(title, message, icon = 'ℹ️') {
        return this.showConfirm({
            title: title,
            icon: icon,
            message: message,
            confirmText: 'OK',
            cancelText: '',
            danger: false
        });
    }

    // Drag & Drop Handler
    handleDragStart(e, taskId) {
        this.draggedTaskId = taskId;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
    }

    handleDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        // Entferne alle drag-over Klassen
        document.querySelectorAll('.task-card').forEach(card => {
            card.classList.remove('drag-over');
        });
    }

    handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    handleDragEnter(e) {
        if (e.currentTarget.classList.contains('task-card')) {
            e.currentTarget.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        if (e.currentTarget.classList.contains('task-card')) {
            e.currentTarget.classList.remove('drag-over');
        }
    }

    handleDrop(e, targetTaskId) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        e.preventDefault();

        const draggedTaskId = this.draggedTaskId;
        
        if (draggedTaskId && draggedTaskId !== targetTaskId) {
            // Finde die Aufgaben
            const draggedTask = this.tasks.find(t => t.id === draggedTaskId);
            const targetTask = this.tasks.find(t => t.id === targetTaskId);

            if (draggedTask && targetTask) {
                // Hole aktuelle gefilterte Liste
                const filteredTasks = this.getFilteredTasks();
                
                // Finde Indizes in der gefilterten Liste
                const draggedFilteredIndex = filteredTasks.findIndex(t => t.id === draggedTaskId);
                const targetFilteredIndex = filteredTasks.findIndex(t => t.id === targetTaskId);
                
                // Finde Indizes im Haupt-Array
                const draggedIndex = this.tasks.findIndex(t => t.id === draggedTaskId);
                const targetIndex = this.tasks.findIndex(t => t.id === targetTaskId);

                // Entferne die gezogene Aufgabe
                const [removed] = this.tasks.splice(draggedIndex, 1);
                
                // Berechne neue Position
                const newTargetIndex = this.tasks.findIndex(t => t.id === targetTaskId);
                
                // Füge sie an der neuen Position ein
                if (draggedFilteredIndex < targetFilteredIndex) {
                    this.tasks.splice(newTargetIndex + 1, 0, removed);
                } else {
                    this.tasks.splice(newTargetIndex, 0, removed);
                }
                
                this.saveTasks();
                this.renderTasks();
                this.showNotification('✅ Aufgabe verschoben!');
            }
        }

        return false;
    }

    // Subtask-Methoden für CREATE (neue Aufgabe)
    setupCreateSubtaskListeners() {
        const addBtn = document.getElementById('addSubtaskBtnCreate');
        const input = document.getElementById('newSubtaskInputCreate');

        if (addBtn && input) {
            addBtn.addEventListener('click', () => this.addCreateSubtask());
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addCreateSubtask();
                }
            });
        }
    }

    addCreateSubtask() {
        const input = document.getElementById('newSubtaskInputCreate');
        if (!input || !input.value.trim()) return;

        // Input sanitizen und validieren
        const text = Security.sanitizeText(input.value);
        if (!Security.validateInput.text(text, 1, 200)) {
            this.showNotification('❌ Teilaufgabe muss zwischen 1 und 200 Zeichen lang sein', 'error');
            return;
        }

        const subtask = {
            id: Date.now(),
            text: text,
            completed: false
        };

        this.tempSubtasks.push(subtask);
        input.value = '';
        this.renderCreateSubtasksList();
    }

    deleteCreateSubtask(subtaskId) {
        this.tempSubtasks = this.tempSubtasks.filter(st => st.id !== subtaskId);
        this.renderCreateSubtasksList();
    }

    toggleCreateSubtask(subtaskId) {
        const subtask = this.tempSubtasks.find(st => st.id === subtaskId);
        if (subtask) {
            subtask.completed = !subtask.completed;
            this.renderCreateSubtasksList();
        }
    }

    renderCreateSubtasksList() {
        const subtasksList = document.getElementById('subtasksListCreate');
        if (!subtasksList) return;

        if (this.tempSubtasks.length === 0) {
            subtasksList.innerHTML = '<p class="no-subtasks">Keine Teilaufgaben vorhanden</p>';
            return;
        }

        // XSS-sicher: Escape Subtask-Text
        subtasksList.innerHTML = this.tempSubtasks.map(subtask => {
            const safeText = Security.escapeHtml(subtask.text);
            return `
            <div class="subtask-item ${subtask.completed ? 'completed' : ''}">
                <input 
                    type="checkbox" 
                    class="subtask-checkbox-create" 
                    ${subtask.completed ? 'checked' : ''}
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
        }).join('');

        // Event Listeners
        subtasksList.querySelectorAll('.subtask-checkbox-create').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const subtaskId = parseInt(e.target.dataset.subtaskId);
                this.toggleCreateSubtask(subtaskId);
            });
        });

        subtasksList.querySelectorAll('.btn-delete-subtask-create').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const subtaskId = parseInt(e.currentTarget.dataset.subtaskId);
                this.deleteCreateSubtask(subtaskId);
            });
        });
    }

    // Subtask-Methoden für EDIT (bestehende Aufgabe)
    setupSubtaskListeners(task) {
        const addBtn = document.getElementById('addSubtaskBtn');
        const input = document.getElementById('newSubtaskInput');

        if (addBtn && input) {
            // Entferne alte Listener
            const newAddBtn = addBtn.cloneNode(true);
            addBtn.replaceWith(newAddBtn);
            
            const newInput = input.cloneNode(true);
            input.replaceWith(newInput);

            // Neue Listener hinzufügen
            newAddBtn.addEventListener('click', () => this.addSubtask(task));
            newInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addSubtask(task);
                }
            });
        }
    }

    addSubtask(task) {
        const input = document.getElementById('newSubtaskInput');
        if (!input || !input.value.trim()) return;

        // Input sanitizen und validieren
        const text = Security.sanitizeText(input.value);
        if (!Security.validateInput.text(text, 1, 200)) {
            this.showNotification('❌ Teilaufgabe muss zwischen 1 und 200 Zeichen lang sein', 'error');
            return;
        }

        if (!task.subtasks) {
            task.subtasks = [];
        }

        const subtask = {
            id: Date.now(),
            text: text,
            completed: false
        };

        task.subtasks.push(subtask);
        input.value = '';
        
        this.renderSubtasksInModal(task);
        this.saveTasks();
    }

    toggleSubtask(task, subtaskId) {
        if (!task.subtasks) return;

        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
            subtask.completed = !subtask.completed;
            this.renderSubtasksInModal(task);
            this.saveTasks();
            this.renderTasks(); // Update main view to show progress
        }
    }

    deleteSubtask(task, subtaskId) {
        if (!task.subtasks) return;

        task.subtasks = task.subtasks.filter(st => st.id !== subtaskId);
        this.renderSubtasksInModal(task);
        this.saveTasks();
        this.renderTasks(); // Update main view to show progress
    }

    renderSubtasksInModal(task) {
        const subtasksList = document.getElementById('subtasksList');
        if (!subtasksList) return;

        if (!task.subtasks || task.subtasks.length === 0) {
            subtasksList.innerHTML = '<p class="no-subtasks">Keine Teilaufgaben vorhanden</p>';
            return;
        }

        // XSS-sicher: Escape Subtask-Text
        subtasksList.innerHTML = task.subtasks.map(subtask => {
            const safeText = Security.escapeHtml(subtask.text);
            return `
            <div class="subtask-item ${subtask.completed ? 'completed' : ''}">
                <input 
                    type="checkbox" 
                    class="subtask-checkbox" 
                    ${subtask.completed ? 'checked' : ''}
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
        }).join('');

        // Event Listeners für Subtask-Checkboxen und Delete-Buttons
        subtasksList.querySelectorAll('.subtask-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const subtaskId = parseInt(e.target.dataset.subtaskId);
                this.toggleSubtask(task, subtaskId);
            });
        });

        subtasksList.querySelectorAll('.btn-delete-subtask').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const subtaskId = parseInt(e.currentTarget.dataset.subtaskId);
                this.deleteSubtask(task, subtaskId);
            });
        });
    }

    getSubtaskProgress(task) {
        if (!task.subtasks || task.subtasks.length === 0) {
            return { completed: 0, total: 0, percentage: 0 };
        }

        const completed = task.subtasks.filter(st => st.completed).length;
        const total = task.subtasks.length;
        const percentage = Math.round((completed / total) * 100);

        return { completed, total, percentage };
    }

    renderSubtasksProgress(task) {
        if (!task.subtasks || task.subtasks.length === 0) {
            return '';
        }

        const progress = this.getSubtaskProgress(task);
        const allCompleted = progress.completed === progress.total;

        return `
            <div class="subtasks-progress">
                <div class="subtasks-progress-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;">
                        <path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="subtasks-progress-text ${allCompleted ? 'completed' : ''}">
                        ${progress.completed}/${progress.total} Teilaufgaben erledigt
                    </span>
                </div>
                <div class="subtasks-progress-bar">
                    <div class="subtasks-progress-fill" style="width: ${progress.percentage}%"></div>
                </div>
            </div>
        `;
    }

    // Bulk-Aktionen
    toggleBulkMode() {
        this.bulkMode = !this.bulkMode;
        const btn = document.getElementById('bulkModeBtn');
        if (btn) {
            btn.textContent = this.bulkMode ? '✗ Mehrfachauswahl beenden' : '✓ Mehrfachauswahl';
            btn.classList.toggle('active');
        }
        
        if (!this.bulkMode) {
            this.selectedTasks.clear();
        }
        
        this.renderTasks();
    }

    toggleTaskSelection(taskId) {
        if (this.selectedTasks.has(taskId)) {
            this.selectedTasks.delete(taskId);
        } else {
            this.selectedTasks.add(taskId);
        }
        this.renderTasks();
    }

    selectAllTasks() {
        const filteredTasks = this.getFilteredTasks();
        filteredTasks.forEach(task => this.selectedTasks.add(task.id));
        this.renderTasks();
    }

    deselectAllTasks() {
        this.selectedTasks.clear();
        this.renderTasks();
    }

    bulkCompleteTasksAction() {
        if (this.selectedTasks.size === 0) {
            this.showNotification('⚠️ Keine Aufgaben ausgewählt');
            return;
        }

        this.selectedTasks.forEach(taskId => {
            const task = this.tasks.find(t => t.id === taskId);
            if (task && task.status !== 'completed') {
                task.status = 'completed';
                task.completedAt = new Date().toISOString();
            }
        });

        this.saveTasks();
        this.selectedTasks.clear();
        this.renderTasks();
        this.updateStatistics();
        this.showNotification('✅ Aufgaben als erledigt markiert!');
    }

    bulkUncompleteTasksAction() {
        if (this.selectedTasks.size === 0) {
            this.showNotification('⚠️ Keine Aufgaben ausgewählt');
            return;
        }

        this.selectedTasks.forEach(taskId => {
            const task = this.tasks.find(t => t.id === taskId);
            if (task && task.status === 'completed') {
                task.status = 'pending';
                task.completedAt = null;
            }
        });

        this.saveTasks();
        this.selectedTasks.clear();
        this.renderTasks();
        this.updateStatistics();
        this.showNotification('🔄 Aufgaben reaktiviert!');
    }

    async bulkDeleteTasksAction() {
        if (this.selectedTasks.size === 0) {
            this.showNotification('⚠️ Keine Aufgaben ausgewählt');
            return;
        }

        const count = this.selectedTasks.size;
        const confirmed = await this.showConfirm({
            title: 'Aufgaben löschen',
            icon: '🗑️',
            message: `Möchten Sie wirklich ${count} Aufgabe(n) löschen?`,
            confirmText: 'Löschen',
            cancelText: 'Abbrechen',
            danger: true
        });

        if (confirmed) {
            this.tasks = this.tasks.filter(task => !this.selectedTasks.has(task.id));
            this.selectedTasks.clear();
            this.saveTasks();
            this.renderTasks();
            this.updateStatistics();
            this.updateEmployeeFilter();
            this.updateLocationFilter();
            this.showNotification(`🗑️ ${count} Aufgabe(n) gelöscht`);
        }
    }

    updateBulkToolbar() {
        const toolbar = document.getElementById('bulkToolbar');
        const countSpan = document.getElementById('bulkCount');
        
        if (toolbar && countSpan) {
            toolbar.style.display = this.bulkMode ? 'flex' : 'none';
            countSpan.textContent = this.selectedTasks.size;
        }
    }

    // History-Eintrag hinzufügen
    addHistoryEntry(task, action, details = {}) {
        if (!task.history) {
            task.history = [];
        }

        const entry = {
            timestamp: new Date().toISOString(),
            action: action,
            details: details
        };

        task.history.push(entry);
    }

    // Alle History-Einträge sammeln (für Statistik-Seite)
    getAllHistory() {
        const allHistory = [];

        // History aus aktiven Tasks
        this.tasks.forEach(task => {
            if (task.history && task.history.length > 0) {
                task.history.forEach(entry => {
                    allHistory.push({
                        ...entry,
                        taskId: task.id,
                        taskTitle: task.title,
                        taskEmployee: task.employee
                    });
                });
            }
        });

        // History aus archivierten Tasks
        this.archivedTasks.forEach(task => {
            if (task.history && task.history.length > 0) {
                task.history.forEach(entry => {
                    allHistory.push({
                        ...entry,
                        taskId: task.id,
                        taskTitle: task.title,
                        taskEmployee: task.employee
                    });
                });
            }
        });

        // Nach Timestamp sortieren (neueste zuerst)
        allHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return allHistory;
    }

    setupBulkActionListeners() {
        const bulkModeBtn = document.getElementById('bulkModeBtn');
        if (bulkModeBtn) {
            bulkModeBtn.addEventListener('click', () => this.toggleBulkMode());
        }

        const selectAllBtn = document.getElementById('selectAllBtn');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => this.selectAllTasks());
        }

        const deselectAllBtn = document.getElementById('deselectAllBtn');
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => this.deselectAllTasks());
        }

        const bulkCompleteBtn = document.getElementById('bulkCompleteBtn');
        if (bulkCompleteBtn) {
            bulkCompleteBtn.addEventListener('click', () => this.bulkCompleteTasksAction());
        }

        const bulkUncompleteBtn = document.getElementById('bulkUncompleteBtn');
        if (bulkUncompleteBtn) {
            bulkUncompleteBtn.addEventListener('click', () => this.bulkUncompleteTasksAction());
        }

        const bulkArchiveBtn = document.getElementById('bulkArchiveBtn');
        if (bulkArchiveBtn) {
            bulkArchiveBtn.addEventListener('click', () => this.bulkArchiveTasksAction());
        }

        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => this.bulkDeleteTasksAction());
        }
    }

    // Bulk-Archivierung
    bulkArchiveTasksAction() {
        if (this.selectedTasks.size === 0) {
            alert('Bitte wählen Sie mindestens eine Aufgabe aus.');
            return;
        }

        const count = this.selectedTasks.size;
        if (confirm(`Möchten Sie wirklich ${count} Aufgabe(n) archivieren?`)) {
            const tasksToArchive = this.tasks.filter(task => this.selectedTasks.has(task.id));
            
            tasksToArchive.forEach(task => {
                task.archivedAt = new Date().toISOString();
                this.archivedTasks.push(task);
            });

            this.tasks = this.tasks.filter(task => !this.selectedTasks.has(task.id));
            this.selectedTasks.clear();
            
            this.saveTasks();
            this.saveArchivedTasks();
            this.renderTasks();
            this.updateStatistics();
            this.updateEmployeeFilter();
            this.updateLocationFilter();
            this.showNotification(`📦 ${count} Aufgabe(n) archiviert`);
        }
    }

    // ===== WETTER-API INTEGRATION =====
    initWeather() {
        const weatherSection = document.querySelector('.weather-section');
        if (!weatherSection) return;

        const changeLocationBtn = document.getElementById('changeLocationBtn');
        if (changeLocationBtn) {
            changeLocationBtn.addEventListener('click', () => this.promptLocation());
        }

        this.loadWeather();
    }

    async loadWeather() {
        try {
            const location = this.getStoredLocation();
            
            if (!location) {
                await this.promptLocation();
                return;
            }

            // Prüfe Cache (1 Stunde)
            const cached = this.getCachedWeather();
            if (cached) {
                this.renderWeather(cached);
                return;
            }

            // Lade neue Daten
            await this.fetchWeather(location);
        } catch (error) {
            console.error('Fehler beim Laden des Wetters:', error);
            this.showWeatherError('Fehler beim Laden der Wetterdaten');
        }
    }

    getStoredLocation() {
        const stored = localStorage.getItem('weather_location');
        return stored ? JSON.parse(stored) : null;
    }

    storeLocation(location) {
        localStorage.setItem('weather_location', JSON.stringify(location));
    }

    getCachedWeather() {
        const cached = localStorage.getItem('weather_cache');
        if (!cached) return null;

        const data = JSON.parse(cached);
        const age = Date.now() - data.timestamp;
        const maxAge = 60 * 60 * 1000; // 1 Stunde

        if (age < maxAge) {
            return data.weather;
        }

        return null;
    }

    cacheWeather(weather) {
        const data = {
            timestamp: Date.now(),
            weather: weather
        };
        localStorage.setItem('weather_cache', JSON.stringify(data));
    }

    async promptLocation() {
        const locationName = prompt('Bitte geben Sie Ihren Standort ein (z.B. "Berlin" oder "München"):', this.getStoredLocation()?.name || 'Berlin');
        
        if (!locationName || !locationName.trim()) return;

        const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName.trim())}&count=1&language=de&format=json`;

        try {
            const response = await fetch(geocodeUrl);
            const data = await response.json();

            if (!data.results || data.results.length === 0) {
                alert('Standort nicht gefunden. Bitte versuchen Sie es erneut.');
                return;
            }

            const result = data.results[0];
            const location = {
                name: result.name,
                country: result.country,
                lat: result.latitude,
                lon: result.longitude
            };

            this.storeLocation(location);
            await this.fetchWeather(location);
        } catch (error) {
            console.error('Fehler beim Geocoding:', error);
            alert('Fehler beim Suchen des Standorts.');
        }
    }

    async fetchWeather(location) {
        const weatherForecast = document.getElementById('weatherForecast');
        if (weatherForecast) {
            weatherForecast.innerHTML = '<div class="weather-loading">Lade Wetterdaten...</div>';
        }

        // Open-Meteo API (kostenlos, kein API-Key nötig)
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=Europe/Berlin&forecast_days=7`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            const weather = {
                location: location,
                daily: data.daily
            };

            this.cacheWeather(weather);
            this.renderWeather(weather);
        } catch (error) {
            console.error('Fehler beim Abrufen der Wetterdaten:', error);
            this.showWeatherError('Fehler beim Laden der Wetterdaten');
        }
    }

    renderWeather(weather) {
        const weatherLocationName = document.getElementById('weatherLocationName');
        const weatherForecast = document.getElementById('weatherForecast');

        if (!weatherForecast) return;

        // Standortname aktualisieren
        if (weatherLocationName) {
            weatherLocationName.textContent = `${weather.location.name}, ${weather.location.country}`;
        }

        // 7-Tage Vorhersage rendern
        const days = weather.daily.time.slice(0, 7);
        
        weatherForecast.innerHTML = days.map((date, index) => {
            const weatherCode = weather.daily.weather_code[index];
            const tempMax = Math.round(weather.daily.temperature_2m_max[index]);
            const tempMin = Math.round(weather.daily.temperature_2m_min[index]);

            const dayName = this.getDayName(date, index);
            const weatherInfo = this.getWeatherInfo(weatherCode);
            const todayClass = index === 0 ? 'today' : '';

            return `
                <div class="weather-day-card ${todayClass}">
                    <div class="weather-icon-wrapper">
                        <div class="weather-icon">${weatherInfo.icon}</div>
                    </div>
                    <div class="weather-content">
                        <div class="weather-day-name">${dayName}</div>
                        <div class="weather-day-date">${new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</div>
                        <div class="weather-temp">${tempMax}°</div>
                        <div class="weather-temp-range">${tempMin}° - ${tempMax}°</div>
                        <div class="weather-description">${weatherInfo.description}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    getDayName(dateString, index) {
        if (index === 0) return 'Heute';
        if (index === 1) return 'Morgen';

        const date = new Date(dateString);
        const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
        return days[date.getDay()];
    }

    getWeatherInfo(code) {
        // WMO Weather interpretation codes
        const weatherCodes = {
            0: { icon: '☀️', description: 'Klar' },
            1: { icon: '🌤️', description: 'Meist klar' },
            2: { icon: '⛅', description: 'Teilweise bewölkt' },
            3: { icon: '☁️', description: 'Bewölkt' },
            45: { icon: '🌫️', description: 'Neblig' },
            48: { icon: '🌫️', description: 'Neblig' },
            51: { icon: '🌦️', description: 'Leichter Nieselregen' },
            53: { icon: '🌦️', description: 'Nieselregen' },
            55: { icon: '🌧️', description: 'Starker Nieselregen' },
            61: { icon: '🌧️', description: 'Leichter Regen' },
            63: { icon: '🌧️', description: 'Regen' },
            65: { icon: '🌧️', description: 'Starker Regen' },
            71: { icon: '🌨️', description: 'Leichter Schneefall' },
            73: { icon: '🌨️', description: 'Schneefall' },
            75: { icon: '🌨️', description: 'Starker Schneefall' },
            77: { icon: '🌨️', description: 'Schnee­körner' },
            80: { icon: '🌦️', description: 'Leichte Schauer' },
            81: { icon: '🌧️', description: 'Schauer' },
            82: { icon: '🌧️', description: 'Starke Schauer' },
            85: { icon: '🌨️', description: 'Schnee­schauer' },
            86: { icon: '🌨️', description: 'Starke Schnee­schauer' },
            95: { icon: '⛈️', description: 'Gewitter' },
            96: { icon: '⛈️', description: 'Gewitter mit Hagel' },
            99: { icon: '⛈️', description: 'Starkes Gewitter' }
        };

        return weatherCodes[code] || { icon: '🌡️', description: 'Unbekannt' };
    }

    getGardenTip(weatherCode, tempMax, precipitation) {
        let tip = '';

        // Tipps basierend auf Wetter
        if (weatherCode >= 61 && weatherCode <= 65 || weatherCode >= 80 && weatherCode <= 82) {
            tip = '💧 Kein Gießen nötig';
        } else if (tempMax > 25 && precipitation < 1) {
            tip = '🚿 Gießen empfohlen';
        } else if (weatherCode >= 71 && weatherCode <= 86) {
            tip = '❄️ Frostschutz prüfen';
        } else if (weatherCode >= 95) {
            tip = '⚠️ Pflanzen schützen';
        } else if (tempMax > 15 && tempMax < 25 && precipitation < 5) {
            tip = '🌱 Ideal zum Pflanzen';
        }

        return tip ? `<div class="garden-tip">${tip}</div>` : '';
    }

    showWeatherError(message) {
        const weatherForecast = document.getElementById('weatherForecast');
        if (weatherForecast) {
            weatherForecast.innerHTML = `
                <div class="weather-error">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                        <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <p>${message}</p>
                    <button class="btn btn-secondary" onclick="window.gartenPlaner.promptLocation()">Standort eingeben</button>
                </div>
            `;
        }
    }
}

// Dark Mode Toggle
class ThemeManager {
    constructor() {
        this.theme = localStorage.getItem('theme') || 'light';
        this.init();
    }

    init() {
        // Theme anwenden
        this.applyTheme(this.theme);

        // Toggle-Button Event Listener
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.updateIcon(theme);
        localStorage.setItem('theme', theme);
        this.theme = theme;
    }

    toggleTheme() {
        const newTheme = this.theme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
        
        // Update ARIA attributes
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.setAttribute('aria-pressed', newTheme === 'dark' ? 'true' : 'false');
            themeToggle.setAttribute('aria-label', newTheme === 'dark' ? 'Light Mode aktivieren' : 'Dark Mode aktivieren');
        }
    }

    updateIcon(theme) {
        const icon = document.getElementById('themeIcon');
        if (icon) {
            if (theme === 'light') {
                // Moon icon for light theme
                icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
            } else {
                // Sun icon for dark theme
                icon.innerHTML = '<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
            }
        }
    }
}

// App initialisieren
document.addEventListener('DOMContentLoaded', () => {
    // Theme Manager initialisieren
    window.themeManager = new ThemeManager();
    
    // Gartenplaner initialisieren
    window.gartenPlaner = new GartenPlaner();
    window.gartenPlaner.setupBulkActionListeners();
    
    // Print-Datum setzen für Footer
    const container = document.querySelector('.container');
    if (container) {
        const printDate = new Date().toLocaleDateString('de-DE', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        container.setAttribute('data-print-date', printDate);
    }

    // Print-Event Listener für Optimierungen
    window.addEventListener('beforeprint', () => {
        // Dark Mode temporär deaktivieren für Druck
        document.documentElement.setAttribute('data-print-mode', 'true');
    });

    window.addEventListener('afterprint', () => {
        document.documentElement.removeAttribute('data-print-mode');
    });

    // Keyboard Navigation für Task-Karten
    document.addEventListener('keydown', (e) => {
        const activeElement = document.activeElement;
        
        // Escape schließt Modals
        if (e.key === 'Escape') {
            const modal = document.getElementById('editModal');
            if (modal && modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        }
        
        // Enter/Space auf Buttons
        if ((e.key === 'Enter' || e.key === ' ') && activeElement.classList.contains('task-btn')) {
            e.preventDefault();
            activeElement.click();
        }
    });

    // Announce live region updates for screen readers
    const announcer = document.createElement('div');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    document.body.appendChild(announcer);
    window.announcer = announcer;
    
    console.log('🌱 Gartenplaner erfolgreich gestartet!');
    console.log('💾 Alle Änderungen werden automatisch im Browser gespeichert (LocalStorage)');
    console.log('🖱️ Drag & Drop aktiviert - Ziehe Aufgaben zum Sortieren!');
    console.log('✓ Bulk-Aktionen aktiviert - Mehrere Aufgaben gleichzeitig bearbeiten!');
    console.log('🌙 Dark Mode verfügbar - Klick auf den Button unten rechts!');
    console.log('🖨️ Print-Stylesheet aktiviert - Optimierte Druckansicht verfügbar!');
    console.log('♿ Accessibility verbessert - ARIA-Labels und Keyboard-Navigation!');
});
