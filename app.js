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
        this.currentView = 'list';
        this.draggedTaskId = null;
        this.selectedTasks = new Set();
        this.bulkMode = false;
        this.init();
    }

    // Initialisierung
    init() {
        this.setupEventListeners();
        this.updateEmployeeFilter();
        this.updateLocationFilter();
        this.renderTasks();
        this.updateStatistics();
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
    addTask() {
        const task = {
            id: Date.now(),
            title: document.getElementById('taskTitle').value,
            employee: document.getElementById('taskEmployee').value,
            location: document.getElementById('taskLocation').value,
            description: document.getElementById('taskDescription').value,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        this.tasks.push(task);
        this.saveTasks();
        this.renderTasks();
        this.updateStatistics();
        this.updateEmployeeFilter();
        this.updateLocationFilter();
        document.getElementById('taskForm').reset();
        
        this.showNotification('✅ Aufgabe erfolgreich hinzugefügt!');
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

        // Formular mit aktuellen Werten füllen
        document.getElementById('editTaskTitle').value = task.title;
        document.getElementById('editTaskEmployee').value = task.employee;
        document.getElementById('editTaskLocation').value = task.location || '';
        document.getElementById('editTaskDescription').value = task.description || '';

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

        task.title = document.getElementById('editTaskTitle').value;
        task.employee = document.getElementById('editTaskEmployee').value;
        task.location = document.getElementById('editTaskLocation').value;
        task.description = document.getElementById('editTaskDescription').value;

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
    toggleTaskStatus(id) {
        const task = this.tasks.find(task => task.id === id);
        if (task) {
            task.status = task.status === 'pending' ? 'completed' : 'pending';
            task.completedAt = task.status === 'completed' ? new Date().toISOString() : null;
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
            return employeeMatch && locationMatch && statusMatch;
        });
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

                // Drag & Drop Event Listeners (nur für aktive Aufgaben)
                card.addEventListener('dragstart', (e) => this.handleDragStart(e, task.id));
                card.addEventListener('dragend', (e) => this.handleDragEnd(e));
                card.addEventListener('dragover', (e) => this.handleDragOver(e));
                card.addEventListener('drop', (e) => this.handleDrop(e, task.id));
                card.addEventListener('dragenter', (e) => this.handleDragEnter(e));
                card.addEventListener('dragleave', (e) => this.handleDragLeave(e));
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

        return `
            <div class="task-card ${isCompleted ? 'completed' : ''} ${isSelected ? 'selected' : ''} ${isArchived ? 'archived' : ''}" data-task-id="${task.id}" draggable="${!isArchived}">
                ${this.bulkMode && !isArchived ? `
                    <div class="task-checkbox">
                        <input type="checkbox" class="task-select-checkbox" ${isSelected ? 'checked' : ''}>
                    </div>
                ` : ''}
                <div class="task-info">
                    <div class="task-header">
                        ${!isArchived ? '<span class="drag-handle">☰</span>' : ''}
                        <span class="task-title">${task.title}</span>
                        ${isArchived && task.archivedAt ? `<span class="archived-badge">📦 Archiviert am ${new Date(task.archivedAt).toLocaleDateString('de-DE')}</span>` : ''}
                    </div>
                    <div class="task-meta">
                        <span>👤 ${task.employee}</span>
                        <span>📍 ${task.location || 'Kein Standort'}</span>
                    </div>
                    ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                </div>
                <div class="task-actions">
                    ${!isArchived ? `
                        <button class="task-btn edit-btn">✏️ Bearbeiten</button>
                        ${isCompleted ? 
                            '<button class="task-btn uncomplete-btn">Reaktivieren</button>' :
                            '<button class="task-btn complete-btn">Erledigt</button>'
                        }
                        <button class="task-btn archive-btn">📦 Archivieren</button>
                        <button class="task-btn delete-btn">Löschen</button>
                    ` : `
                        <button class="task-btn unarchive-btn">↻ Wiederherstellen</button>
                        <button class="task-btn delete-btn">Endgültig löschen</button>
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

        filterSelect.innerHTML = '<option value="">Alle Mitarbeiter</option>' +
            employees.map(emp => `<option value="${emp}">${emp}</option>`).join('');
        
        filterSelect.value = currentValue;
    }

    updateLocationFilter() {
        const filterSelect = document.getElementById('filterLocation');
        if (!filterSelect) {
            return;
        }

        const locations = [...new Set(this.tasks.map(task => task.location).filter(loc => loc))].sort();
        const currentValue = filterSelect.value;

        filterSelect.innerHTML = '<option value="">Alle Standorte</option>' +
            locations.map(loc => `<option value="${loc}">${loc}</option>`).join('');
        
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
            const employees = new Set(this.tasks.map(t => t.employee)).size;

            const statPending = document.getElementById('statPending');
            const statCompleted = document.getElementById('statCompleted');
            const statEmployees = document.getElementById('statEmployees');

            if (statPending) statPending.textContent = pending;
            if (statCompleted) statCompleted.textContent = completed;
            if (statEmployees) statEmployees.textContent = employees;
        }
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
}

// App initialisieren
document.addEventListener('DOMContentLoaded', () => {
    window.gartenPlaner = new GartenPlaner();
    window.gartenPlaner.setupBulkActionListeners();
    console.log('🌱 Gartenplaner erfolgreich gestartet!');
    console.log('💾 Alle Änderungen werden automatisch im Browser gespeichert (LocalStorage)');
    console.log('🖱️ Drag & Drop aktiviert - Ziehe Aufgaben zum Sortieren!');
    console.log('✓ Bulk-Aktionen aktiviert - Mehrere Aufgaben gleichzeitig bearbeiten!');
});
