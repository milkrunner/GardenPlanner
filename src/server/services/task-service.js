const { v4: uuidv4 } = require('uuid');
const { audit } = require('../logger');
const { PAGINATION } = require('../config');
const { validateTask, sanitizeTaskData } = require('../validation/task-validator');
const {
    readTasks,
    readArchivedTasks,
    withLockedTasks,
    withLockedArchive,
    acquireLock,
    releaseLock,
    writeTasks,
    writeArchivedTasks,
    TASKS_FILE,
    ARCHIVED_FILE
} = require('../storage/json-store');

// --- Pagination helper ---

function paginate(tasks, query) {
    const page = parseInt(query.page, 10);
    const limit = parseInt(query.limit, 10);

    // No pagination params -> return raw array (backwards-compatible)
    if (!page && !limit) return null;

    const safePage = (Number.isInteger(page) && page > 0) ? page : 1;
    const safeLimit = (Number.isInteger(limit) && limit > 0 && limit <= PAGINATION.MAX_LIMIT) ? limit : PAGINATION.DEFAULT_LIMIT;
    const total = tasks.length;
    const pages = Math.ceil(total / safeLimit);
    const start = (safePage - 1) * safeLimit;
    const data = tasks.slice(start, start + safeLimit);

    return { data, total, page: safePage, limit: safeLimit, pages };
}

// --- Task CRUD operations ---

function listTasks(query) {
    let tasks = readTasks();

    // Only allow non-sensitive filter via query param
    const status = typeof query.status === 'string' ? query.status.trim() : '';
    if (status) {
        const validStatuses = ['pending', 'in-progress', 'completed'];
        if (validStatuses.includes(status)) {
            tasks = tasks.filter(t => t.status === status);
        }
    }

    const paginated = paginate(tasks, query);
    return paginated || tasks;
}

function searchTasks(body) {
    let tasks = readTasks();
    const { status, employee, location, page, limit } = body;

    if (typeof status === 'string' && status.trim()) {
        const validStatuses = ['pending', 'in-progress', 'completed'];
        if (validStatuses.includes(status.trim())) {
            tasks = tasks.filter(t => t.status === status.trim());
        }
    }
    if (typeof employee === 'string' && employee.trim()) {
        tasks = tasks.filter(t => t.employee === employee.trim());
    }
    if (typeof location === 'string' && location.trim()) {
        tasks = tasks.filter(t => t.location === location.trim());
    }

    const paginated = paginate(tasks, { page, limit });
    return paginated || tasks;
}

function getTask(id) {
    const tasks = readTasks();
    return tasks.find(t => String(t.id) === String(id)) || null;
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
        createdAt: new Date().toISOString(),
        history: [{
            timestamp: new Date().toISOString(),
            action: 'created',
            details: {
                title: sanitized.title,
                employee: sanitized.employee,
                location: sanitized.location
            }
        }],
        subtasks: Array.isArray(sanitized.subtasks) ? sanitized.subtasks.map(st => ({
            id: Date.now() + Math.random(),
            text: typeof st === 'string' ? st : (st.text || ''),
            completed: typeof st === 'object' ? !!st.completed : false
        })) : [],
        sortOrder: Date.now()
    };

    await withLockedTasks((tasks) => {
        tasks.push(task);
        return { tasks };
    });

    audit('task_created', { taskId: task.id, title: sanitized.title, employee: sanitized.employee });
    return { error: false, task };
}

async function updateTask(id, body) {
    const validation = validateTask(body, true);
    if (!validation.valid) {
        return { error: true, status: 400, errors: validation.errors };
    }

    const sanitized = sanitizeTaskData(body);
    const result = await withLockedTasks((tasks) => {
        const index = tasks.findIndex(t => String(t.id) === String(id));
        if (index === -1) return { tasks: undefined, notFound: true };

        const task = tasks[index];
        const changes = [];

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
            task.history.push({
                timestamp: new Date().toISOString(),
                action: sanitized.status === 'completed' ? 'completed' : 'reopened',
                details: { from: oldStatus, to: sanitized.status }
            });
        }
        if (sanitized.priority !== undefined) task.priority = sanitized.priority;
        if (sanitized.recurrence !== undefined) task.recurrence = sanitized.recurrence;
        if (sanitized.subtasks !== undefined) {
            task.subtasks = Array.isArray(sanitized.subtasks) ? sanitized.subtasks.map(st => ({
                id: Date.now() + Math.random(),
                text: typeof st === 'string' ? st : (st.text || ''),
                completed: typeof st === 'object' ? !!st.completed : false
            })) : [];
        }

        if (changes.length > 0) {
            if (!task.history) task.history = [];
            task.history.push({
                timestamp: new Date().toISOString(),
                action: 'edited',
                details: { changes }
            });
        }

        tasks[index] = task;
        return { tasks, task, changes };
    });

    if (result.notFound) return { error: true, status: 404, message: 'Task not found' };

    audit('task_updated', { taskId: result.task.id, changes: result.changes });
    return { error: false, task: result.task };
}

async function deleteTask(id) {
    const result = await withLockedTasks((tasks) => {
        const index = tasks.findIndex(t => String(t.id) === String(id));
        if (index === -1) return { tasks: undefined, notFound: true };
        const deletedTask = tasks.splice(index, 1)[0];
        return { tasks, deletedTask };
    });

    if (result.notFound) return { error: true, status: 404, message: 'Task not found' };

    audit('task_deleted', { taskId: result.deletedTask.id, title: result.deletedTask.title });
    return { error: false };
}

async function archiveTask(id) {
    await acquireLock(TASKS_FILE);
    await acquireLock(ARCHIVED_FILE);
    try {
        const tasks = readTasks();
        const index = tasks.findIndex(t => String(t.id) === String(id));
        if (index === -1) {
            releaseLock(ARCHIVED_FILE);
            releaseLock(TASKS_FILE);
            return { error: true, status: 404, message: 'Task not found' };
        }

        const task = tasks[index];
        task.archivedAt = new Date().toISOString();
        if (!task.history) task.history = [];
        task.history.push({ timestamp: new Date().toISOString(), action: 'archived', details: {} });

        tasks.splice(index, 1);
        const archived = readArchivedTasks();
        archived.push(task);

        await writeTasks(tasks);
        await writeArchivedTasks(archived);

        audit('task_archived', { taskId: task.id, title: task.title });
        return { error: false, task };
    } finally {
        releaseLock(ARCHIVED_FILE);
        releaseLock(TASKS_FILE);
    }
}

async function unarchiveTask(id) {
    await acquireLock(ARCHIVED_FILE);
    await acquireLock(TASKS_FILE);
    try {
        const archived = readArchivedTasks();
        const index = archived.findIndex(t => String(t.id) === String(id));
        if (index === -1) {
            releaseLock(TASKS_FILE);
            releaseLock(ARCHIVED_FILE);
            return { error: true, status: 404, message: 'Archived task not found' };
        }

        const task = archived[index];
        delete task.archivedAt;
        if (!task.history) task.history = [];
        task.history.push({ timestamp: new Date().toISOString(), action: 'unarchived', details: {} });

        archived.splice(index, 1);
        const tasks = readTasks();
        tasks.push(task);

        await writeArchivedTasks(archived);
        await writeTasks(tasks);

        audit('task_unarchived', { taskId: task.id, title: task.title });
        return { error: false, task };
    } finally {
        releaseLock(TASKS_FILE);
        releaseLock(ARCHIVED_FILE);
    }
}

function listArchivedTasks() {
    return readArchivedTasks();
}

async function deleteArchivedTask(id) {
    const result = await withLockedArchive((archived) => {
        const index = archived.findIndex(t => String(t.id) === String(id));
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
    listArchivedTasks,
    deleteArchivedTask
};
