/**
 * Frontend Unit Tests fuer GardenPlanner (#239)
 * Testet JS-Module: Filter-Logik, Task-Rendering-Logik, Kommentar-Badge,
 * Pagination-Hilfsfunktionen und Validierungs-Logik.
 *
 * Da die Frontend-Module als Prototyp-Erweiterungen auf GartenPlaner arbeiten,
 * erstellen wir ein minimales Mock-Objekt.
 */

const fs = require('node:fs');
const path = require('node:path');

// =====================================================
// Minimaler GartenPlaner Mock
// =====================================================

function createMockPlaner(tasks = [], archivedTasks = []) {
    return {
        tasks: tasks,
        archivedTasks: archivedTasks,
        showArchive: false,
        currentFilter: { employee: '', location: '', status: '' },
        searchQuery: '',
        selectedTasks: new Set(),
        bulkMode: false,
        tempSubtasks: [],
        useAPI: false,
    };
}

// =====================================================
// Filter-Logik Tests
// =====================================================

describe('getFilteredTasks Logik', () => {
    // Wir extrahieren die Filter-Logik als reine Funktion zum Testen
    function getFilteredTasks(planer) {
        const tasksToFilter = planer.showArchive ? planer.archivedTasks : planer.tasks;
        return tasksToFilter.filter((task) => {
            const employeeMatch = !planer.currentFilter.employee ||
                task.employee === planer.currentFilter.employee;
            const locationMatch = !planer.currentFilter.location ||
                task.location === planer.currentFilter.location;
            const statusMatch = !planer.currentFilter.status ||
                task.status === planer.currentFilter.status;

            let searchMatch = true;
            if (planer.searchQuery) {
                const query = planer.searchQuery.toLowerCase();
                searchMatch =
                    task.title.toLowerCase().includes(query) ||
                    task.employee.toLowerCase().includes(query) ||
                    (task.location && task.location.toLowerCase().includes(query)) ||
                    (task.description && task.description.toLowerCase().includes(query));
            }

            return employeeMatch && locationMatch && statusMatch && searchMatch;
        });
    }

    const sampleTasks = [
        { id: '1', title: 'Rasen maehen', employee: 'Max', location: 'Garten', description: 'Vorgarten', status: 'pending' },
        { id: '2', title: 'Hecke schneiden', employee: 'Lisa', location: 'Vorgarten', description: 'Alle Hecken', status: 'completed' },
        { id: '3', title: 'Giessen', employee: 'Max', location: 'Gewaechshaus', description: '', status: 'pending' },
        { id: '4', title: 'Umgraben', employee: 'Tom', location: 'Garten', description: 'Beet vorbereiten', status: 'in-progress' },
    ];

    test('gibt alle Tasks zurueck wenn keine Filter gesetzt', () => {
        const planer = createMockPlaner(sampleTasks);
        expect(getFilteredTasks(planer)).toHaveLength(4);
    });

    test('filtert nach Mitarbeiter', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.currentFilter.employee = 'Max';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(2);
        result.forEach(t => expect(t.employee).toBe('Max'));
    });

    test('filtert nach Standort', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.currentFilter.location = 'Garten';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(2);
    });

    test('filtert nach Status', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.currentFilter.status = 'pending';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(2);
    });

    test('kombiniert mehrere Filter (AND-Verknuepfung)', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.currentFilter.employee = 'Max';
        planer.currentFilter.status = 'pending';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(2);
    });

    test('Suche im Titel', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.searchQuery = 'rasen';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Rasen maehen');
    });

    test('Suche im Mitarbeiternamen', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.searchQuery = 'lisa';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(1);
    });

    test('Suche in Standort', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.searchQuery = 'gewaechs';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(1);
    });

    test('Suche in Beschreibung', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.searchQuery = 'beet';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('4');
    });

    test('Suche ist case-insensitive', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.searchQuery = 'RASEN';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(1);
    });

    test('Suche ohne Treffer gibt leeres Array', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.searchQuery = 'xyz nicht vorhanden';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(0);
    });

    test('leere Suche gibt alle Tasks zurueck', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.searchQuery = '';
        expect(getFilteredTasks(planer)).toHaveLength(4);
    });

    test('Filter + Suche arbeiten zusammen', () => {
        const planer = createMockPlaner(sampleTasks);
        planer.currentFilter.employee = 'Max';
        planer.searchQuery = 'rasen';
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(1);
    });

    test('showArchive zeigt archivierte Tasks', () => {
        const archived = [{ id: '5', title: 'Alt', employee: 'Max', location: 'Garten', description: '', status: 'completed' }];
        const planer = createMockPlaner(sampleTasks, archived);
        planer.showArchive = true;
        const result = getFilteredTasks(planer);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('5');
    });

    test('leere Task-Liste gibt leeres Array', () => {
        const planer = createMockPlaner([]);
        expect(getFilteredTasks(planer)).toHaveLength(0);
    });
});

// =====================================================
// Kommentar-Badge Rendering Tests
// =====================================================

describe('Kommentar-Badge Logik', () => {
    // Simuliere die renderCommentBadge Logik
    function renderCommentBadge(task) {
        var comments = Array.isArray(task.comments) ? task.comments : [];
        if (comments.length === 0) return '';
        return comments.length.toString();
    }

    test('gibt leeren String zurueck wenn keine Kommentare', () => {
        expect(renderCommentBadge({ comments: [] })).toBe('');
        expect(renderCommentBadge({})).toBe('');
        expect(renderCommentBadge({ comments: undefined })).toBe('');
    });

    test('zeigt Anzahl bei vorhandenen Kommentaren', () => {
        const task = {
            comments: [
                { id: '1', text: 'Kommentar 1', username: 'Max', createdAt: '2026-01-01T00:00:00.000Z' },
                { id: '2', text: 'Kommentar 2', username: 'Lisa', createdAt: '2026-01-02T00:00:00.000Z' }
            ]
        };
        expect(renderCommentBadge(task)).toBe('2');
    });

    test('zeigt 1 bei einem Kommentar', () => {
        const task = {
            comments: [{ id: '1', text: 'Einziger', username: 'Max', createdAt: '2026-01-01T00:00:00.000Z' }]
        };
        expect(renderCommentBadge(task)).toBe('1');
    });
});

// =====================================================
// Kommentar-Sortierung Tests
// =====================================================

describe('Kommentar-Sortierung', () => {
    function sortCommentsChronologically(comments) {
        return comments.slice().sort(function (a, b) {
            return new Date(a.createdAt) - new Date(b.createdAt);
        });
    }

    test('sortiert chronologisch (aelteste zuerst)', () => {
        const comments = [
            { id: '3', createdAt: '2026-01-03T00:00:00.000Z' },
            { id: '1', createdAt: '2026-01-01T00:00:00.000Z' },
            { id: '2', createdAt: '2026-01-02T00:00:00.000Z' }
        ];
        const sorted = sortCommentsChronologically(comments);
        expect(sorted[0].id).toBe('1');
        expect(sorted[1].id).toBe('2');
        expect(sorted[2].id).toBe('3');
    });

    test('leeres Array bleibt leer', () => {
        expect(sortCommentsChronologically([])).toHaveLength(0);
    });

    test('einzelner Kommentar bleibt unveraendert', () => {
        const comments = [{ id: '1', createdAt: '2026-01-01T00:00:00.000Z' }];
        const sorted = sortCommentsChronologically(comments);
        expect(sorted).toHaveLength(1);
        expect(sorted[0].id).toBe('1');
    });
});

// =====================================================
// Task-Sortierung Tests
// =====================================================

describe('Task-Sortierung', () => {
    function sortBySortOrder(tasks) {
        return tasks.slice().sort((a, b) => {
            var orderA = a.sortOrder !== undefined ? a.sortOrder : 0;
            var orderB = b.sortOrder !== undefined ? b.sortOrder : 0;
            return orderA - orderB;
        });
    }

    test('sortiert nach sortOrder aufsteigend', () => {
        const tasks = [
            { id: '3', sortOrder: 3000 },
            { id: '1', sortOrder: 1000 },
            { id: '2', sortOrder: 2000 }
        ];
        const sorted = sortBySortOrder(tasks);
        expect(sorted[0].id).toBe('1');
        expect(sorted[1].id).toBe('2');
        expect(sorted[2].id).toBe('3');
    });

    test('Tasks ohne sortOrder werden an den Anfang sortiert', () => {
        const tasks = [
            { id: '2', sortOrder: 1000 },
            { id: '1' }
        ];
        const sorted = sortBySortOrder(tasks);
        expect(sorted[0].id).toBe('1');
    });
});

// =====================================================
// Subtask-Progress Logik Tests
// =====================================================

describe('Subtask-Progress Berechnung', () => {
    function calculateProgress(task) {
        if (!task.subtasks || task.subtasks.length === 0) return null;
        const total = task.subtasks.length;
        const completed = task.subtasks.filter(st => st.completed).length;
        return { total, completed, percent: Math.round((completed / total) * 100) };
    }

    test('gibt null zurueck wenn keine Subtasks', () => {
        expect(calculateProgress({})).toBeNull();
        expect(calculateProgress({ subtasks: [] })).toBeNull();
    });

    test('berechnet 0% wenn nichts erledigt', () => {
        const task = {
            subtasks: [
                { text: 'A', completed: false },
                { text: 'B', completed: false }
            ]
        };
        const progress = calculateProgress(task);
        expect(progress.total).toBe(2);
        expect(progress.completed).toBe(0);
        expect(progress.percent).toBe(0);
    });

    test('berechnet 50% korrekt', () => {
        const task = {
            subtasks: [
                { text: 'A', completed: true },
                { text: 'B', completed: false }
            ]
        };
        const progress = calculateProgress(task);
        expect(progress.percent).toBe(50);
    });

    test('berechnet 100% wenn alles erledigt', () => {
        const task = {
            subtasks: [
                { text: 'A', completed: true },
                { text: 'B', completed: true }
            ]
        };
        const progress = calculateProgress(task);
        expect(progress.percent).toBe(100);
    });

    test('rundet Prozent korrekt', () => {
        const task = {
            subtasks: [
                { text: 'A', completed: true },
                { text: 'B', completed: false },
                { text: 'C', completed: false }
            ]
        };
        const progress = calculateProgress(task);
        expect(progress.percent).toBe(33); // 33.33... -> 33
    });
});

// =====================================================
// Statistik-Berechnungen Tests
// =====================================================

describe('Statistik-Berechnungen', () => {
    function calculateStats(tasks) {
        const pending = tasks.filter(t => t.status === 'pending').length;
        const completed = tasks.filter(t => t.status === 'completed').length;
        const total = tasks.length;
        const employees = new Set(tasks.map(t => t.employee).filter(e => e)).size;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        return { pending, completed, total, employees, completionRate };
    }

    test('berechnet leere Statistik', () => {
        const stats = calculateStats([]);
        expect(stats.pending).toBe(0);
        expect(stats.completed).toBe(0);
        expect(stats.total).toBe(0);
        expect(stats.employees).toBe(0);
        expect(stats.completionRate).toBe(0);
    });

    test('zaehlt Status korrekt', () => {
        const tasks = [
            { status: 'pending', employee: 'Max' },
            { status: 'completed', employee: 'Lisa' },
            { status: 'completed', employee: 'Max' },
            { status: 'in-progress', employee: 'Tom' }
        ];
        const stats = calculateStats(tasks);
        expect(stats.pending).toBe(1);
        expect(stats.completed).toBe(2);
        expect(stats.total).toBe(4);
        expect(stats.employees).toBe(3);
        expect(stats.completionRate).toBe(50);
    });

    test('ignoriert leere Mitarbeiternamen', () => {
        const tasks = [
            { status: 'pending', employee: '' },
            { status: 'pending', employee: 'Max' }
        ];
        const stats = calculateStats(tasks);
        expect(stats.employees).toBe(1);
    });

    test('zaehlt eindeutige Mitarbeiter', () => {
        const tasks = [
            { status: 'pending', employee: 'Max' },
            { status: 'pending', employee: 'Max' },
            { status: 'pending', employee: 'Lisa' }
        ];
        const stats = calculateStats(tasks);
        expect(stats.employees).toBe(2);
    });
});

// =====================================================
// History-Sortierung Tests
// =====================================================

describe('History-Aggregation', () => {
    function getAllHistory(tasks, archivedTasks) {
        const allHistory = [];
        const allTasks = tasks.concat(archivedTasks || []);

        allTasks.forEach(task => {
            if (task.history && task.history.length > 0) {
                task.history.forEach(entry => {
                    allHistory.push({
                        ...entry,
                        taskId: task.id,
                        taskTitle: task.title
                    });
                });
            }
        });

        allHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return allHistory;
    }

    test('sammelt History aus mehreren Tasks', () => {
        const tasks = [
            { id: '1', title: 'Task 1', history: [{ timestamp: '2026-01-01T00:00:00.000Z', action: 'created' }] },
            { id: '2', title: 'Task 2', history: [{ timestamp: '2026-01-02T00:00:00.000Z', action: 'created' }] }
        ];
        const result = getAllHistory(tasks, []);
        expect(result).toHaveLength(2);
    });

    test('sortiert History absteigend nach Zeitstempel', () => {
        const tasks = [
            { id: '1', title: 'Task 1', history: [{ timestamp: '2026-01-01T00:00:00.000Z', action: 'created' }] },
            { id: '2', title: 'Task 2', history: [{ timestamp: '2026-01-03T00:00:00.000Z', action: 'created' }] }
        ];
        const result = getAllHistory(tasks, []);
        expect(result[0].taskId).toBe('2'); // Neuerer Eintrag zuerst
    });

    test('behandelt Tasks ohne History', () => {
        const tasks = [
            { id: '1', title: 'Task 1' },
            { id: '2', title: 'Task 2', history: [] }
        ];
        const result = getAllHistory(tasks, []);
        expect(result).toHaveLength(0);
    });

    test('inkludiert archivierte Tasks', () => {
        const tasks = [{ id: '1', title: 'Aktiv', history: [{ timestamp: '2026-01-01T00:00:00.000Z', action: 'created' }] }];
        const archived = [{ id: '2', title: 'Archiviert', history: [{ timestamp: '2026-01-02T00:00:00.000Z', action: 'archived' }] }];
        const result = getAllHistory(tasks, archived);
        expect(result).toHaveLength(2);
    });
});

// =====================================================
// Recurrence Berechnung Tests
// =====================================================

describe('calculateNextDue Logik', () => {
    function calculateNextDue(recurrence, fromDate = new Date()) {
        const nextDate = new Date(fromDate);
        switch (recurrence) {
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

    test('daily addiert 1 Tag', () => {
        const from = new Date('2026-03-15T12:00:00.000Z');
        const result = new Date(calculateNextDue('daily', from));
        expect(result.getDate()).toBe(16);
    });

    test('weekly addiert 7 Tage', () => {
        const from = new Date('2026-03-15T12:00:00.000Z');
        const result = new Date(calculateNextDue('weekly', from));
        expect(result.getDate()).toBe(22);
    });

    test('monthly addiert 1 Monat', () => {
        const from = new Date('2026-03-15T12:00:00.000Z');
        const result = new Date(calculateNextDue('monthly', from));
        expect(result.getMonth()).toBe(3); // April
    });

    test('none gibt null zurueck', () => {
        expect(calculateNextDue('none')).toBeNull();
    });

    test('unbekannter Wert gibt null zurueck', () => {
        expect(calculateNextDue('yearly')).toBeNull();
    });
});

// =====================================================
// Export Dateiname Tests
// =====================================================

describe('Export Dateiname Logik', () => {
    function buildExportFilename(name, ext) {
        var cleanName = (name || 'garten').replace(/[^a-zA-Z0-9\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df _-]/g, '');
        var now = new Date();
        var y = now.getFullYear();
        var m = String(now.getMonth() + 1).padStart(2, '0');
        var d = String(now.getDate()).padStart(2, '0');
        return cleanName + '_' + y + '-' + m + '-' + d + '.' + ext;
    }

    test('erzeugt korrekten Dateinamen mit Datum', () => {
        const result = buildExportFilename('MeinGarten', 'svg');
        expect(result).toMatch(/^MeinGarten_\d{4}-\d{2}-\d{2}\.svg$/);
    });

    test('ersetzt Sonderzeichen im Namen', () => {
        const result = buildExportFilename('Mein/Garten<Test>', 'png');
        expect(result).not.toContain('/');
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
    });

    test('verwendet Default-Name wenn leer', () => {
        const result = buildExportFilename('', 'svg');
        expect(result).toMatch(/^garten_/);
    });

    test('verwendet Default-Name wenn null', () => {
        const result = buildExportFilename(null, 'png');
        expect(result).toMatch(/^garten_/);
    });

    test('behaelt Umlaute bei', () => {
        const result = buildExportFilename('Gemuese-Garten', 'svg');
        expect(result).toContain('Gemuese-Garten');
    });
});
