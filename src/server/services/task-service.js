const { v4: uuidv4 } = require('uuid');
const { audit } = require('../logger');
const { validateTask, sanitizeTaskData, applyDueFilter } = require('../validation/task-validator');
const {
    readTasks,
    readArchivedTasks,
    withLockedTasks,
    withLockedArchive,
    withLockedTasksAndArchive,
    writeTasks,
    writeArchivedTasks,
} = require('../storage/json-store');
const { calculateNextDueDate, isRecurring } = require('./recurrence');

// --- Pagination helper ---

function paginate(tasks, query) {
    const page = parseInt(query.page, 10);
    const limit = parseInt(query.limit, 10);

    // No pagination params -> return raw array (backwards-compatible)
    if (!page && !limit) return null;

    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 200 ? limit : 50;
    const total = tasks.length;
    const pages = Math.ceil(total / safeLimit);
    const start = (safePage - 1) * safeLimit;
    const data = tasks.slice(start, start + safeLimit);

    return { data, total, page: safePage, limit: safeLimit, pages };
}

// --- Task CRUD operations ---

// `dueFilter` kommt aus parseDueFilter (Route prüft vorher und antwortet bei Fehlern mit 400).
const NO_DUE_FILTER = { dueFrom: null, dueTo: null, sort: null };

function listTasks(query, dueFilter = NO_DUE_FILTER) {
    let tasks = readTasks();

    // Only allow non-sensitive filter via query param
    const status = typeof query.status === 'string' ? query.status.trim() : '';
    if (status) {
        const validStatuses = ['pending', 'in-progress', 'completed'];
        if (validStatuses.includes(status)) {
            tasks = tasks.filter((t) => t.status === status);
        }
    }

    tasks = applyDueFilter(tasks, dueFilter);
    const paginated = paginate(tasks, query);
    return paginated || tasks;
}

function searchTasks(body, dueFilter = NO_DUE_FILTER) {
    let tasks = readTasks();
    const { status, employee, location, page, limit } = body;

    if (typeof status === 'string' && status.trim()) {
        const validStatuses = ['pending', 'in-progress', 'completed'];
        if (validStatuses.includes(status.trim())) {
            tasks = tasks.filter((t) => t.status === status.trim());
        }
    }
    if (typeof employee === 'string' && employee.trim()) {
        tasks = tasks.filter((t) => t.employee === employee.trim());
    }
    if (typeof location === 'string' && location.trim()) {
        tasks = tasks.filter((t) => t.location === location.trim());
    }

    tasks = applyDueFilter(tasks, dueFilter);
    const paginated = paginate(tasks, { page, limit });
    return paginated || tasks;
}

function getTask(id) {
    const tasks = readTasks();
    return tasks.find((t) => String(t.id) === String(id)) || null;
}

async function createTask(body) {
    const validation = validateTask(body);
    if (!validation.valid) {
        return { error: true, status: 400, errors: validation.errors };
    }

    const sanitized = sanitizeTaskData(body);
    const task = {
        id: uuidv4(),
        title: sanitized.title,
        employee: sanitized.employee || '',
        location: sanitized.location,
        description: sanitized.description || '',
        notes: sanitized.notes || '',
        status: sanitized.status || 'pending',
        priority: sanitized.priority || 'medium',
        recurrence: sanitized.recurrence || 'none',
        dueDate: sanitized.dueDate || null,
        createdAt: new Date().toISOString(),
        history: [
            {
                timestamp: new Date().toISOString(),
                action: 'created',
                details: {
                    title: sanitized.title,
                    employee: sanitized.employee,
                    location: sanitized.location,
                    ...(sanitized.dueDate ? { dueDate: sanitized.dueDate } : {}),
                },
            },
        ],
        subtasks: Array.isArray(sanitized.subtasks)
            ? sanitized.subtasks.map((st) => ({
                  id: Date.now() + Math.random(),
                  text: typeof st === 'string' ? st : st.text || '',
                  completed: typeof st === 'object' ? !!st.completed : false,
              }))
            : [],
        sortOrder: Date.now(),
    };

    await withLockedTasks((tasks) => {
        tasks.push(task);
        return { tasks };
    });

    audit('task_created', { taskId: task.id, title: sanitized.title, employee: sanitized.employee });
    return { error: false, task };
}

// Folgeaufgabe einer wiederholenden Aufgabe (#327). Reine Funktion: verändert weder `task` noch den Speicher,
// damit sie vor dem Schreibvorgang gefahrlos aufgerufen werden kann. Fälligkeit (`dueDate`, #344): altes Datum +
// Intervall, siehe calculateNextDueDate (Monatsende begrenzt). Das frühere Feld `nextDue` wird nicht mehr
// geschrieben, damit es keine zweite Wahrheit neben `dueDate` gibt. Unterpunkte starten wieder offen, `history` beginnt neu.
function buildFollowUpTask(task, completedAt) {
    const now = new Date().toISOString();
    return {
        id: uuidv4(),
        title: task.title,
        employee: task.employee || '',
        location: task.location,
        description: task.description || '',
        notes: task.notes || '',
        status: 'pending',
        priority: task.priority || 'medium',
        recurrence: task.recurrence,
        createdAt: now,
        recurrenceOf: task.id,
        lastRecurrence: completedAt,
        dueDate: calculateNextDueDate(task.recurrence, task.dueDate, completedAt),
        history: [
            {
                timestamp: now,
                action: 'created',
                details: {
                    title: task.title,
                    employee: task.employee,
                    location: task.location,
                    recurrenceOf: task.id,
                },
            },
        ],
        subtasks: Array.isArray(task.subtasks)
            ? task.subtasks.map((st) => ({ id: Date.now() + Math.random(), text: st.text || '', completed: false }))
            : [],
        sortOrder: Date.now(),
    };
}

// Wechselt eine Aufgabe auf `completed` und hat sie eine Wiederholung, entsteht die Folgeaufgabe im selben
// Sperr- und Schreibvorgang wie die Statusänderung: tasks.json wird genau einmal (temp-Datei + rename)
// geschrieben, es gibt keinen Zwischenzustand mit nur einer der beiden Änderungen. Schlägt das Schreiben fehl,
// bleibt alles beim Alten (HTTP 500, Cache wird verworfen). Nur der Übergang zu `completed` zählt;
// `completed` -> `completed` und ein erneutes PUT erzeugen nichts. Wird eine Aufgabe wieder geöffnet und
// nochmals abgeschlossen, bleibt es bei der einen Folgeaufgabe (Marker `followUpId`).
async function updateTask(id, body) {
    const validation = validateTask(body, true);
    if (!validation.valid) {
        return { error: true, status: 400, errors: validation.errors };
    }

    const sanitized = sanitizeTaskData(body);
    const result = await withLockedTasks((tasks) => {
        const index = tasks.findIndex((t) => String(t.id) === String(id));
        if (index === -1) return { tasks: undefined, notFound: true };

        const task = tasks[index];
        const changes = [];
        let followUp = null;
        let completing = false;
        let statusEntry = null;

        if (sanitized.title !== undefined && sanitized.title !== task.title) {
            changes.push(`Titel: "${task.title}" \u2192 "${sanitized.title}"`);
            task.title = sanitized.title;
        }
        if (sanitized.employee !== undefined && sanitized.employee !== task.employee) {
            changes.push(`Mitarbeiter: "${task.employee}" \u2192 "${sanitized.employee}"`);
            task.employee = sanitized.employee;
        }
        if (sanitized.location !== undefined && sanitized.location !== task.location) {
            changes.push(`Standort: "${task.location}" \u2192 "${sanitized.location}"`);
            task.location = sanitized.location;
        }
        if (sanitized.description !== undefined && sanitized.description !== task.description) {
            changes.push('Beschreibung ge\u00e4ndert');
            task.description = sanitized.description;
        }
        if (sanitized.notes !== undefined && sanitized.notes !== task.notes) {
            changes.push('Notizen ge\u00e4ndert');
            task.notes = sanitized.notes;
        }
        if (sanitized.status !== undefined && sanitized.status !== task.status) {
            const oldStatus = task.status;
            task.status = sanitized.status;
            if (sanitized.status === 'completed') {
                task.completedAt = new Date().toISOString();
            } else {
                task.completedAt = null;
            }
            if (!task.history) task.history = [];
            statusEntry = {
                timestamp: new Date().toISOString(),
                action: sanitized.status === 'completed' ? 'completed' : 'reopened',
                details: { from: oldStatus, to: sanitized.status },
            };
            task.history.push(statusEntry);
            completing = sanitized.status === 'completed';
        }
        if (sanitized.dueDate !== undefined && sanitized.dueDate !== (task.dueDate ?? null)) {
            const label = (value) => (value ? `"${value}"` : 'kein Termin');
            changes.push(`F\u00e4lligkeit: ${label(task.dueDate)} \u2192 ${label(sanitized.dueDate)}`);
            task.dueDate = sanitized.dueDate;
        }
        if (sanitized.priority !== undefined) task.priority = sanitized.priority;
        if (sanitized.recurrence !== undefined) task.recurrence = sanitized.recurrence;
        if (sanitized.subtasks !== undefined) {
            task.subtasks = Array.isArray(sanitized.subtasks)
                ? sanitized.subtasks.map((st) => ({
                      id: Date.now() + Math.random(),
                      text: typeof st === 'string' ? st : st.text || '',
                      completed: typeof st === 'object' ? !!st.completed : false,
                  }))
                : [];
        }

        if (changes.length > 0) {
            if (!task.history) task.history = [];
            task.history.push({
                timestamp: new Date().toISOString(),
                action: 'edited',
                details: { changes },
            });
        }

        // Nach allen Feldänderungen, damit ein im selben PUT gesetztes `recurrence`/`subtasks` gilt.
        if (completing && isRecurring(task.recurrence) && !task.followUpId) {
            followUp = buildFollowUpTask(task, task.completedAt);
            task.followUpId = followUp.id;
            statusEntry.details.followUpId = followUp.id;
            tasks.push(followUp);
        }

        tasks[index] = task;
        return { tasks, task, changes, followUp };
    });

    if (result.notFound) return { error: true, status: 404, message: 'Task not found' };

    audit('task_updated', { taskId: result.task.id, changes: result.changes });
    if (result.followUp) {
        audit('task_recurred', {
            taskId: result.task.id,
            followUpId: result.followUp.id,
            recurrence: result.task.recurrence,
            dueDate: result.followUp.dueDate,
        });
    }
    return { error: false, task: result.task, followUp: result.followUp };
}

async function deleteTask(id) {
    const result = await withLockedTasks((tasks) => {
        const index = tasks.findIndex((t) => String(t.id) === String(id));
        if (index === -1) return { tasks: undefined, notFound: true };
        const deletedTask = tasks.splice(index, 1)[0];
        return { tasks, deletedTask };
    });

    if (result.notFound) return { error: true, status: 404, message: 'Task not found' };

    audit('task_deleted', { taskId: result.deletedTask.id, title: result.deletedTask.title });
    return { error: false };
}

// --- Archive/unarchive duplicate repair (#339) ---
// Archive/unarchive touch two files. The destination is written first, so a failed second write leaves
// the same task id in tasks.json AND archived-tasks.json (recoverable) instead of losing it. Such
// duplicates are resolved under the storage locks before every archive/unarchive and once at start-up.
//
// Which copy wins: the one with the newer state. Its "last activity" is the latest valid timestamp of
// `createdAt`, `archivedAt` and all `history[].timestamp` values (every state change appends a history
// entry). A failed archive therefore resolves to the archive copy, a failed unarchive to the tasks copy,
// and an edit made after a failed operation wins over the stale copy. Ties go to the copy with the
// longer history, then to the archive copy. Only the losing copy is removed; the winner is never touched,
// so a task cannot vanish from both files.

function lastActivity(task) {
    const stamps = [
        task.createdAt,
        task.archivedAt,
        ...(Array.isArray(task.history) ? task.history : []).map((h) => h && h.timestamp),
    ];
    return stamps.reduce((latest, value) => {
        const time = typeof value === 'string' ? Date.parse(value) : NaN;
        return Number.isNaN(time) ? latest : Math.max(latest, time);
    }, 0);
}

function archiveCopyWins(active, archived) {
    const diff = lastActivity(archived) - lastActivity(active);
    if (diff !== 0) return diff > 0;
    const historyDiff = (archived.history || []).length - (active.history || []).length;
    return historyDiff >= 0;
}

// Must run inside withLockedTasksAndArchive. Returns the resolved task ids.
async function resolveArchiveDuplicates() {
    const tasks = readTasks();
    const archived = readArchivedTasks();
    const archivedById = new Map(archived.map((t) => [String(t.id), t]));
    const dropFromTasks = new Set();
    const dropFromArchive = new Set();
    const resolved = [];

    for (const active of tasks) {
        const id = String(active.id);
        const archivedCopy = archivedById.get(id);
        if (!archivedCopy || dropFromTasks.has(id) || dropFromArchive.has(id)) continue;
        const keep = archiveCopyWins(active, archivedCopy) ? 'archive' : 'tasks';
        (keep === 'archive' ? dropFromTasks : dropFromArchive).add(id);
        resolved.push({ taskId: active.id, kept: keep, removed: keep === 'archive' ? 'tasks' : 'archive' });
    }

    if (resolved.length === 0) return [];
    if (dropFromTasks.size > 0) await writeTasks(tasks.filter((t) => !dropFromTasks.has(String(t.id))));
    if (dropFromArchive.size > 0) {
        await writeArchivedTasks(archived.filter((t) => !dropFromArchive.has(String(t.id))));
    }
    for (const entry of resolved) audit('archive_duplicate_resolved', entry);
    return resolved;
}

// Start-up entry point (server.js): repairs duplicates left by a crash or a failed second write.
async function repairArchiveDuplicates() {
    return withLockedTasksAndArchive(resolveArchiveDuplicates);
}

// In-memory data is re-read from disk on a failed write (see json-store writeJSON).
async function archiveTask(id) {
    return withLockedTasksAndArchive(async () => {
        await resolveArchiveDuplicates();
        const tasks = readTasks();
        const index = tasks.findIndex((t) => String(t.id) === String(id));
        if (index === -1) {
            return { error: true, status: 404, message: 'Task not found' };
        }

        const task = { ...tasks[index] };
        task.archivedAt = new Date().toISOString();
        task.history = [
            ...(task.history || []),
            { timestamp: new Date().toISOString(), action: 'archived', details: {} },
        ];

        await writeArchivedTasks([...readArchivedTasks(), task]);
        await writeTasks(tasks.filter((_, i) => i !== index));

        audit('task_archived', { taskId: task.id, title: task.title });
        return { error: false, task };
    });
}

async function unarchiveTask(id) {
    return withLockedTasksAndArchive(async () => {
        await resolveArchiveDuplicates();
        const archived = readArchivedTasks();
        const index = archived.findIndex((t) => String(t.id) === String(id));
        if (index === -1) {
            return { error: true, status: 404, message: 'Archived task not found' };
        }

        const task = { ...archived[index] };
        delete task.archivedAt;
        task.history = [
            ...(task.history || []),
            { timestamp: new Date().toISOString(), action: 'unarchived', details: {} },
        ];

        await writeTasks([...readTasks(), task]);
        await writeArchivedTasks(archived.filter((_, i) => i !== index));

        audit('task_unarchived', { taskId: task.id, title: task.title });
        return { error: false, task };
    });
}

function listArchivedTasks() {
    return readArchivedTasks();
}

async function deleteArchivedTask(id) {
    const result = await withLockedArchive((archived) => {
        const index = archived.findIndex((t) => String(t.id) === String(id));
        if (index === -1) return { tasks: undefined, notFound: true };
        const deletedArchived = archived.splice(index, 1)[0];
        return { tasks: archived, deletedArchived };
    });

    if (result.notFound) return { error: true, status: 404, message: 'Archived task not found' };

    audit('archived_task_deleted', { taskId: result.deletedArchived.id, title: result.deletedArchived.title });
    return { error: false };
}

module.exports = {
    paginate,
    listTasks,
    searchTasks,
    getTask,
    createTask,
    updateTask,
    deleteTask,
    archiveTask,
    unarchiveTask,
    repairArchiveDuplicates,
    listArchivedTasks,
    deleteArchivedTask,
};
