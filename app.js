// Gartenplaner App - Lokale Datenspeicherung mit LocalStorage
class GartenPlaner {
    constructor() {
        this.tasks = this.loadTasks();
        this.currentFilter = {
            employee: '',
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
        document.getElementById('taskForm').reset();
        
        this.showNotification('✅ Aufgabe erfolgreich hinzugefügt!');
    }

    // Aufgabe löschen
    deleteTask(id) {
        if (confirm('Möchten Sie diese Aufgabe wirklich löschen?')) {
            this.tasks = this.tasks.filter(task => task.id !== id);
            this.saveTasks();
            this.renderTasks();
            this.updateStatistics();
            this.updateEmployeeFilter();
            this.showNotification('🗑️ Aufgabe gelöscht');
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
        return this.tasks.filter(task => {
            const employeeMatch = !this.currentFilter.employee || task.employee === this.currentFilter.employee;
            const statusMatch = !this.currentFilter.status || task.status === this.currentFilter.status;
            return employeeMatch && statusMatch;
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
            tasksList.innerHTML = `
                <div class="empty-state">
                    <h3>🌿 Keine Aufgaben gefunden</h3>
                    <p>Fügen Sie eine neue Aufgabe hinzu oder passen Sie die Filter an.</p>
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
                card.querySelector('.complete-btn, .uncomplete-btn')?.addEventListener('click', () => {
                    this.toggleTaskStatus(task.id);
                });
                card.querySelector('.delete-btn')?.addEventListener('click', () => {
                    this.deleteTask(task.id);
                });

                // Drag & Drop Event Listeners
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

        return `
            <div class="task-card ${isCompleted ? 'completed' : ''} ${isSelected ? 'selected' : ''}" data-task-id="${task.id}" draggable="true">
                ${this.bulkMode ? `
                    <div class="task-checkbox">
                        <input type="checkbox" class="task-select-checkbox" ${isSelected ? 'checked' : ''}>
                    </div>
                ` : ''}
                <div class="task-info">
                    <div class="task-header">
                        <span class="drag-handle">☰</span>
                        <span class="task-title">${task.title}</span>
                    </div>
                    <div class="task-meta">
                        <span>👤 ${task.employee}</span>
                        <span>📍 ${task.location || 'Kein Standort'}</span>
                    </div>
                    ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                </div>
                <div class="task-actions">
                    ${isCompleted ? 
                        '<button class="task-btn uncomplete-btn">Reaktivieren</button>' :
                        '<button class="task-btn complete-btn">Erledigt</button>'
                    }
                    <button class="task-btn delete-btn">Löschen</button>
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
                <h3>📅 Kalenderansicht nicht verfügbar</h3>
                <p>Die Kalenderansicht ist nicht verfügbar, da Aufgaben keine Datumsinformationen enthalten.</p>
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

    // Statistiken aktualisieren
    updateStatistics() {
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

    // Daten speichern (LocalStorage)
    saveTasks() {
        localStorage.setItem('gartenplaner_tasks', JSON.stringify(this.tasks));
    }

    // Daten laden (LocalStorage)
    loadTasks() {
        const saved = localStorage.getItem('gartenplaner_tasks');
        return saved ? JSON.parse(saved) : [];
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

    // Daten importieren
    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (confirm(`${imported.length} Aufgaben gefunden. Möchten Sie diese importieren? (Aktuelle Daten werden überschrieben)`)) {
                    this.tasks = imported;
                    this.saveTasks();
                    this.renderTasks();
                    this.updateStatistics();
                    this.updateEmployeeFilter();
                    this.showNotification('📥 Daten erfolgreich importiert!');
                }
            } catch (error) {
                alert('Fehler beim Importieren: Ungültige Datei');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    // Alle Daten löschen
    clearAllData() {
        if (confirm('⚠️ WARNUNG: Möchten Sie wirklich ALLE Daten löschen? Diese Aktion kann nicht rückgängig gemacht werden!')) {
            if (confirm('Sind Sie sich absolut sicher? Alle Aufgaben werden unwiderruflich gelöscht!')) {
                this.tasks = [];
                this.saveTasks();
                this.renderTasks();
                this.updateStatistics();
                this.updateEmployeeFilter();
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

    bulkDeleteTasksAction() {
        if (this.selectedTasks.size === 0) {
            this.showNotification('⚠️ Keine Aufgaben ausgewählt');
            return;
        }

        const count = this.selectedTasks.size;
        if (confirm(`Möchten Sie wirklich ${count} Aufgabe(n) löschen?`)) {
            this.tasks = this.tasks.filter(task => !this.selectedTasks.has(task.id));
            this.selectedTasks.clear();
            this.saveTasks();
            this.renderTasks();
            this.updateStatistics();
            this.updateEmployeeFilter();
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

        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => this.bulkDeleteTasksAction());
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
