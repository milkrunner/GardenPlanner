/**
 * @module services/garden-service
 * Business logic for garden CRUD operations (#251).
 * Gardens are stored in PostgreSQL with JSONB data.
 */

const { v4: uuidv4 } = require('uuid');
const { audit } = require('../logger');
const { query } = require('../storage/db');

/**
 * List all gardens for a specific user.
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} Array of garden objects (without full data for listing)
 */
async function listGardens(userId) {
    const { rows } = await query(
        `SELECT id, user_id, name, created_at, updated_at
         FROM gardens WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [userId]
    );
    return rows.map(rowToGardenSummary);
}

/**
 * Get a single garden by ID (with full data).
 * @param {string} id - Garden UUID
 * @param {string} userId - User UUID (for access control)
 * @returns {Promise<Object|null>} The garden or null
 */
async function getGarden(id, userId) {
    const { rows } = await query(
        'SELECT * FROM gardens WHERE id = $1 AND user_id = $2',
        [id, userId]
    );
    if (rows.length === 0) return null;
    return rowToGarden(rows[0]);
}

/**
 * Create a new garden.
 * @param {string} userId - User UUID
 * @param {Object} body - { name, data }
 * @returns {Promise<Object>} The created garden
 */
async function createGarden(userId, body) {
    const errors = validateGardenInput(body);
    if (errors.length > 0) {
        return { error: true, status: 400, errors: errors };
    }

    const id = uuidv4();
    const name = (body.name || 'Mein Garten').trim().substring(0, 100);
    const data = body.data || {};

    const { rows } = await query(
        `INSERT INTO gardens (id, user_id, name, data)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, userId, name, JSON.stringify(data)]
    );

    audit('garden_created', { gardenId: id, userId, name });
    return { error: false, garden: rowToGarden(rows[0]) };
}

/**
 * Update an existing garden.
 * @param {string} id - Garden UUID
 * @param {string} userId - User UUID
 * @param {Object} body - { name?, data? }
 * @returns {Promise<Object>} Result with updated garden
 */
async function updateGarden(id, userId, body) {
    const existing = await getGarden(id, userId);
    if (!existing) {
        return { error: true, status: 404, message: 'Garten nicht gefunden' };
    }

    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (body.name !== undefined) {
        updates.push('name = $' + paramIdx);
        params.push(String(body.name).trim().substring(0, 100));
        paramIdx++;
    }

    if (body.data !== undefined) {
        updates.push('data = $' + paramIdx);
        params.push(JSON.stringify(body.data));
        paramIdx++;
    }

    if (updates.length === 0) {
        return { error: false, garden: existing };
    }

    updates.push('updated_at = NOW()');
    params.push(id);
    params.push(userId);

    const { rows } = await query(
        'UPDATE gardens SET ' + updates.join(', ') +
        ' WHERE id = $' + paramIdx + ' AND user_id = $' + (paramIdx + 1) +
        ' RETURNING *',
        params
    );

    if (rows.length === 0) {
        return { error: true, status: 404, message: 'Garten nicht gefunden' };
    }

    audit('garden_updated', { gardenId: id, userId });
    return { error: false, garden: rowToGarden(rows[0]) };
}

/**
 * Delete a garden.
 * @param {string} id - Garden UUID
 * @param {string} userId - User UUID
 * @returns {Promise<Object>} Result
 */
async function deleteGarden(id, userId) {
    const { rowCount } = await query(
        'DELETE FROM gardens WHERE id = $1 AND user_id = $2',
        [id, userId]
    );

    if (rowCount === 0) {
        return { error: true, status: 404, message: 'Garten nicht gefunden' };
    }

    audit('garden_deleted', { gardenId: id, userId });
    return { error: false };
}

/**
 * Export a garden as JSON.
 * @param {string} id - Garden UUID
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} Garden data or null
 */
async function exportGarden(id, userId) {
    return getGarden(id, userId);
}

/**
 * Import a garden from JSON.
 * @param {string} userId - User UUID
 * @param {Object} gardenJson - Full garden JSON (with name and data)
 * @returns {Promise<Object>} The imported garden
 */
async function importGarden(userId, gardenJson) {
    return createGarden(userId, {
        name: gardenJson.name || 'Importierter Garten',
        data: gardenJson.data || gardenJson
    });
}

// --- Helpers ---

function validateGardenInput(body) {
    const errors = [];
    if (body.name !== undefined && typeof body.name !== 'string') {
        errors.push('Name muss ein String sein');
    }
    if (body.name !== undefined && body.name.trim().length === 0) {
        errors.push('Name darf nicht leer sein');
    }
    if (body.data !== undefined && typeof body.data !== 'object') {
        errors.push('Daten muessen ein Objekt sein');
    }
    return errors;
}

function rowToGardenSummary(row) {
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function rowToGarden(row) {
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        data: row.data || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

module.exports = {
    listGardens,
    getGarden,
    createGarden,
    updateGarden,
    deleteGarden,
    exportGarden,
    importGarden
};
