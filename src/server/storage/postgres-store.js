/**
 * @module storage/postgres-store
 * PostgreSQL-based storage layer for tasks, replacing json-store.
 */

const { query } = require('./db');

/**
 * Convert a database row to a task object with camelCase property names.
 * @param {Object} row - Database row
 * @returns {Object} Task object
 */
function rowToTask(row) {
    return {
        id: row.id,
        title: row.title,
        employee: row.employee || '',
        location: row.location,
        description: row.description || '',
        notes: row.notes || '',
        status: row.status,
        priority: row.priority,
        recurrence: row.recurrence,
        subtasks: row.subtasks || [],
        history: row.history || [],
        sortOrder: parseInt(row.sort_order),
        completedAt: row.completed_at,
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

/**
 * Read all active (non-archived) tasks.
 * @returns {Promise<Array>} Array of task objects
 */
async function readTasks() {
    const { rows } = await query(
        'SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY sort_order DESC'
    );
    return rows.map(rowToTask);
}

/**
 * Read all archived tasks.
 * @returns {Promise<Array>} Array of archived task objects
 */
async function readArchivedTasks() {
    const { rows } = await query(
        'SELECT * FROM tasks WHERE archived_at IS NOT NULL ORDER BY archived_at DESC'
    );
    return rows.map(rowToTask);
}

/**
 * Create a new task in the database.
 * @param {Object} task - Task object to insert
 * @returns {Promise<Object>} The created task
 */
async function createTask(task) {
    const { rows } = await query(`
        INSERT INTO tasks (id, title, employee, location, description, notes, status, priority, recurrence, subtasks, history, sort_order, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
    `, [
        task.id, task.title, task.employee, task.location,
        task.description, task.notes, task.status, task.priority, task.recurrence,
        JSON.stringify(task.subtasks), JSON.stringify(task.history),
        task.sortOrder, task.createdAt
    ]);
    return rowToTask(rows[0]);
}

/**
 * Get a single task by ID.
 * @param {string} id - Task UUID
 * @returns {Promise<Object|null>} The task or null if not found
 */
async function getTaskById(id) {
    const { rows } = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    return rows.length ? rowToTask(rows[0]) : null;
}

/**
 * Update a task by ID with the given fields.
 * @param {string} id - Task UUID
 * @param {Object} fields - Fields to update (camelCase keys)
 * @returns {Promise<Object|null>} The updated task or null if not found
 */
async function updateTask(id, fields) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    const columnMap = {
        title: 'title', employee: 'employee', location: 'location',
        description: 'description', notes: 'notes', status: 'status',
        priority: 'priority', recurrence: 'recurrence',
        sortOrder: 'sort_order', completedAt: 'completed_at'
    };

    for (const [key, col] of Object.entries(columnMap)) {
        if (fields[key] !== undefined) {
            setClauses.push(`${col} = $${idx++}`);
            values.push(fields[key]);
        }
    }
    if (fields.subtasks !== undefined) {
        setClauses.push(`subtasks = $${idx++}`);
        values.push(JSON.stringify(fields.subtasks));
    }
    if (fields.history !== undefined) {
        setClauses.push(`history = $${idx++}`);
        values.push(JSON.stringify(fields.history));
    }

    if (setClauses.length === 0) {
        // Nothing to update, just return current task
        return getTaskById(id);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await query(
        `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
    );
    return rows.length ? rowToTask(rows[0]) : null;
}

/**
 * Delete a task by ID.
 * @param {string} id - Task UUID
 * @returns {Promise<boolean>} True if a row was deleted
 */
async function deleteTask(id) {
    const { rowCount } = await query('DELETE FROM tasks WHERE id = $1', [id]);
    return rowCount > 0;
}

/**
 * Archive a task by setting its archived_at timestamp.
 * @param {string} id - Task UUID
 * @returns {Promise<Object|null>} The archived task or null if not found / already archived
 */
async function archiveTask(id) {
    const { rows } = await query(
        `UPDATE tasks SET archived_at = NOW(), updated_at = NOW() WHERE id = $1 AND archived_at IS NULL RETURNING *`,
        [id]
    );
    return rows.length ? rowToTask(rows[0]) : null;
}

/**
 * Unarchive a task by clearing its archived_at timestamp.
 * @param {string} id - Task UUID
 * @returns {Promise<Object|null>} The unarchived task or null if not found / not archived
 */
async function unarchiveTask(id) {
    const { rows } = await query(
        `UPDATE tasks SET archived_at = NULL, updated_at = NOW() WHERE id = $1 AND archived_at IS NOT NULL RETURNING *`,
        [id]
    );
    return rows.length ? rowToTask(rows[0]) : null;
}

module.exports = {
    readTasks, readArchivedTasks, createTask, getTaskById,
    updateTask, deleteTask, archiveTask, unarchiveTask
};
