/**
 * @module services/task-service
 * Business logic for task CRUD, search, pagination, and archiving.
 */

/**
 * @typedef {Object} Task
 * @property {string} id - UUID v4 identifier
 * @property {string} title - Task title
 * @property {string} employee - Assigned employee name
 * @property {string} location - Task location
 * @property {string} description - Detailed description
 * @property {string} notes - Additional notes
 * @property {'pending'|'in-progress'|'completed'} status - Current status
 * @property {'low'|'medium'|'high'} priority - Priority level
 * @property {'none'|'daily'|'weekly'|'monthly'} recurrence - Recurrence pattern
 * @property {string} createdAt - ISO 8601 creation timestamp
 * @property {string} [completedAt] - ISO 8601 completion timestamp
 * @property {string} [archivedAt] - ISO 8601 archive timestamp
 * @property {Array<{timestamp: string, action: string, details: Object}>} history - Change history
 * @property {Array<{id: number, text: string, completed: boolean}>} subtasks - Subtask list
 * @property {number} sortOrder - Numeric sort order (epoch ms)
 */

/**
 * @typedef {Object} PaginatedResult
 * @property {Task[]} data - Page of tasks
 * @property {number} total - Total number of matching tasks
 * @property {number} page - Current page number
 * @property {number} limit - Items per page
 * @property {number} pages - Total number of pages
 */

/**
 * @typedef {Object} TaskOperationResult
 * @property {boolean} error - Whether the operation failed
 * @property {number} [status] - HTTP status code (on error)
 * @property {string} [message] - Error message (on error)
 * @property {string[]} [errors] - Validation error messages (on validation failure)
 * @property {Task} [task] - The resulting task (on success)
 */

const { v4: uuidv4 } = require('uuid');
const { audit } = require('../logger');
const { PAGINATION } = require('../config');
const { validateTask, sanitizeTaskData } = require('../validation/task-validator');
const store = require('../storage/postgres-store');

// --- Pagination helper ---

/**
 * Paginate an array of tasks based on query parameters.
 * Returns null if no pagination params are provided (backwards-compatible).
 * @param {Task[]} tasks - Full array of tasks to paginate
 * @param {Object} query - Query parameters
 * @param {string|number} [query.page] - Page number (1-based)
 * @param {string|number} [query.limit] - Items per page
 * @returns {PaginatedResult|null} Paginated result or null if no pagination requested
 */
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

/**
 * List tasks with optional status filter and pagination.
 * @param {Object} query - Query parameters
 * @param {string} [query.status] - Filter by status ('pending'|'in-progress'|'completed')
 * @param {string|number} [query.page] - Page number
 * @param {string|number} [query.limit] - Items per page
 * @returns {Promise<Task[]|PaginatedResult>} Array of tasks or paginated result
 */
async function listTasks(query) {
    let tasks = await store.readTasks();

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

/**
 * Search tasks by status, employee, and/or location with optional pagination.
 * @param {Object} body - Search criteria from request body
 * @param {string} [body.status] - Filter by status
 * @param {string} [body.employee] - Filter by employee name (exact match)
 * @param {string} [body.location] - Filter by location (exact match)
 * @param {string|number} [body.page] - Page number
 * @param {string|number} [body.limit] - Items per page
 * @returns {Promise<Task[]|PaginatedResult>} Array of tasks or paginated result
 */
async function searchTasks(body) {
    let tasks = await store.readTasks();
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

/**
 * Get a single task by ID.
 * @param {string} id - Task UUID
 * @returns {Promise<Task|null>} The task or null if not found
 */
async function getTask(id) {
    return store.getTaskById(id);
}

/**
 * Create a new task. Validates and sanitizes input, generates UUID, and persists.
 * @param {Object} body - Task data from request body
 * @returns {Promise<TaskOperationResult>} Result with the created task or validation errors
 */
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

    const created = await store.createTask(task);
    audit('task_created', { taskId: created.id, title: sanitized.title, employee: sanitized.employee });
    return { error: false, task: created };
}

/**
 * Update an existing task by ID. Validates input, tracks changes in history.
 * @param {string} id - Task UUID
 * @param {Object} body - Partial task data to update
 * @returns {Promise<TaskOperationResult>} Result with the updated task or error
 */
async function updateTask(id, body) {
    const validation = validateTask(body, true);
    if (!validation.valid) {
        return { error: true, status: 400, errors: validation.errors };
    }

    const sanitized = sanitizeTaskData(body);
    const existing = await store.getTaskById(id);
    if (!existing) {
        return { error: true, status: 404, message: 'Task not found' };
    }

    const updatedFields = {};
    const changes = [];
    const historyEntries = [];

    if (sanitized.title !== undefined && sanitized.title !== existing.title) {
        changes.push(`Titel: "${existing.title}" \u2192 "${sanitized.title}"`);
        updatedFields.title = sanitized.title;
    }
    if (sanitized.employee !== undefined && sanitized.employee !== existing.employee) {
        changes.push(`Mitarbeiter: "${existing.employee}" \u2192 "${sanitized.employee}"`);
        updatedFields.employee = sanitized.employee;
    }
    if (sanitized.location !== undefined && sanitized.location !== existing.location) {
        changes.push(`Standort: "${existing.location}" \u2192 "${sanitized.location}"`);
        updatedFields.location = sanitized.location;
    }
    if (sanitized.description !== undefined && sanitized.description !== existing.description) {
        changes.push('Beschreibung ge\u00e4ndert');
        updatedFields.description = sanitized.description;
    }
    if (sanitized.notes !== undefined && sanitized.notes !== existing.notes) {
        changes.push('Notizen ge\u00e4ndert');
        updatedFields.notes = sanitized.notes;
    }
    if (sanitized.status !== undefined && sanitized.status !== existing.status) {
        const oldStatus = existing.status;
        updatedFields.status = sanitized.status;
        if (sanitized.status === 'completed') {
            updatedFields.completedAt = new Date().toISOString();
        } else {
            updatedFields.completedAt = null;
        }
        historyEntries.push({
            timestamp: new Date().toISOString(),
            action: sanitized.status === 'completed' ? 'completed' : 'reopened',
            details: { from: oldStatus, to: sanitized.status }
        });
    }
    if (sanitized.priority !== undefined) updatedFields.priority = sanitized.priority;
    if (sanitized.recurrence !== undefined) updatedFields.recurrence = sanitized.recurrence;
    if (sanitized.subtasks !== undefined) {
        updatedFields.subtasks = Array.isArray(sanitized.subtasks) ? sanitized.subtasks.map(st => ({
            id: Date.now() + Math.random(),
            text: typeof st === 'string' ? st : (st.text || ''),
            completed: typeof st === 'object' ? !!st.completed : false
        })) : [];
    }

    if (changes.length > 0) {
        historyEntries.push({
            timestamp: new Date().toISOString(),
            action: 'edited',
            details: { changes }
        });
    }

    // Merge history entries with existing history
    if (historyEntries.length > 0) {
        const currentHistory = Array.isArray(existing.history) ? existing.history : [];
        updatedFields.history = [...currentHistory, ...historyEntries];
    }

    const updated = await store.updateTask(id, updatedFields);
    audit('task_updated', { taskId: updated.id, changes });
    return { error: false, task: updated };
}

/**
 * Delete a task by ID.
 * @param {string} id - Task UUID
 * @returns {Promise<TaskOperationResult>} Result indicating success or not-found error
 */
async function deleteTask(id) {
    const existing = await store.getTaskById(id);
    if (!existing) {
        return { error: true, status: 404, message: 'Task not found' };
    }

    await store.deleteTask(id);
    audit('task_deleted', { taskId: existing.id, title: existing.title });
    return { error: false };
}

/**
 * Archive a task by setting its archived_at timestamp.
 * @param {string} id - Task UUID
 * @returns {Promise<TaskOperationResult>} Result with the archived task or not-found error
 */
async function archiveTask(id) {
    const archived = await store.archiveTask(id);
    if (!archived) {
        return { error: true, status: 404, message: 'Task not found' };
    }

    // Add history entry
    const currentHistory = Array.isArray(archived.history) ? archived.history : [];
    currentHistory.push({ timestamp: new Date().toISOString(), action: 'archived', details: {} });
    await store.updateTask(id, { history: currentHistory });

    audit('task_archived', { taskId: archived.id, title: archived.title });
    return { error: false, task: archived };
}

/**
 * Restore an archived task back to the active tasks store.
 * @param {string} id - Archived task UUID
 * @returns {Promise<TaskOperationResult>} Result with the restored task or not-found error
 */
async function unarchiveTask(id) {
    const restored = await store.unarchiveTask(id);
    if (!restored) {
        return { error: true, status: 404, message: 'Archived task not found' };
    }

    // Add history entry
    const currentHistory = Array.isArray(restored.history) ? restored.history : [];
    currentHistory.push({ timestamp: new Date().toISOString(), action: 'unarchived', details: {} });
    await store.updateTask(id, { history: currentHistory });

    audit('task_unarchived', { taskId: restored.id, title: restored.title });
    return { error: false, task: restored };
}

/**
 * List all archived tasks.
 * @returns {Promise<Task[]>} Array of archived tasks
 */
async function listArchivedTasks() {
    return store.readArchivedTasks();
}

/**
 * Permanently delete an archived task.
 * @param {string} id - Archived task UUID
 * @returns {Promise<TaskOperationResult>} Result indicating success or not-found error
 */
async function deleteArchivedTask(id) {
    const existing = await store.getTaskById(id);
    if (!existing) {
        return { error: true, status: 404, message: 'Archived task not found' };
    }

    await store.deleteTask(id);
    audit('archived_task_deleted', { taskId: existing.id, title: existing.title });
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
