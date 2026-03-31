// --- Validation ---

const { FIELD_LIMITS } = require('../config');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateIdParam(req, res, next) {
    if (!UUID_REGEX.test(req.params.id)) {
        return res.status(400).json({ error: true, status: 400, message: 'Invalid ID format' });
    }
    next();
}

function validateTask(taskData, partial = false) {
    const errors = [];

    if (!partial || taskData.title !== undefined) {
        if (typeof taskData.title !== 'string' || taskData.title.trim().length < 1 || taskData.title.trim().length > FIELD_LIMITS.TITLE_MAX) {
            errors.push(`Titel muss zwischen 1 und ${FIELD_LIMITS.TITLE_MAX} Zeichen lang sein`);
        }
    }
    if (taskData.employee !== undefined && taskData.employee !== '') {
        if (typeof taskData.employee !== 'string' || taskData.employee.trim().length > FIELD_LIMITS.EMPLOYEE_MAX) {
            errors.push(`Mitarbeiter darf maximal ${FIELD_LIMITS.EMPLOYEE_MAX} Zeichen lang sein`);
        }
    }
    if (!partial || taskData.location !== undefined) {
        if (typeof taskData.location !== 'string' || taskData.location.trim().length < 1 || taskData.location.trim().length > FIELD_LIMITS.LOCATION_MAX) {
            errors.push(`Standort muss angegeben werden (max ${FIELD_LIMITS.LOCATION_MAX} Zeichen)`);
        }
    }
    if (taskData.description !== undefined && taskData.description !== '') {
        if (typeof taskData.description !== 'string' || taskData.description.length > FIELD_LIMITS.DESCRIPTION_MAX) {
            errors.push(`Beschreibung darf maximal ${FIELD_LIMITS.DESCRIPTION_MAX} Zeichen lang sein`);
        }
    }
    if (taskData.notes !== undefined && taskData.notes !== '') {
        if (typeof taskData.notes !== 'string' || taskData.notes.length > FIELD_LIMITS.NOTES_MAX) {
            errors.push(`Notizen d\u00fcrfen maximal ${FIELD_LIMITS.NOTES_MAX} Zeichen lang sein`);
        }
    }
    if (taskData.status !== undefined) {
        const valid = ['pending', 'in-progress', 'completed'];
        if (!valid.includes(taskData.status)) {
            errors.push('Ung\u00fcltiger Status (erlaubt: pending, in-progress, completed)');
        }
    }
    if (taskData.priority !== undefined) {
        const valid = ['low', 'medium', 'high'];
        if (!valid.includes(taskData.priority)) {
            errors.push('Ung\u00fcltige Priorit\u00e4t (erlaubt: low, medium, high)');
        }
    }
    if (taskData.recurrence !== undefined) {
        const valid = ['none', 'daily', 'weekly', 'monthly'];
        if (!valid.includes(taskData.recurrence)) {
            errors.push('Ung\u00fcltige Wiederholung (erlaubt: none, daily, weekly, monthly)');
        }
    }
    if (taskData.subtasks !== undefined) {
        if (!Array.isArray(taskData.subtasks)) {
            errors.push('Unteraufgaben m\u00fcssen ein Array sein');
        } else {
            if (taskData.subtasks.length > FIELD_LIMITS.MAX_SUBTASKS) {
                errors.push(`Maximal ${FIELD_LIMITS.MAX_SUBTASKS} Unteraufgaben erlaubt`);
            }
            taskData.subtasks.forEach((st, i) => {
                if (typeof st === 'string') {
                    if (st.length > FIELD_LIMITS.SUBTASK_TEXT_MAX) {
                        errors.push(`Unteraufgabe ${i + 1}: Text darf maximal ${FIELD_LIMITS.SUBTASK_TEXT_MAX} Zeichen lang sein`);
                    }
                } else if (typeof st === 'object' && st !== null) {
                    if (typeof st.text !== 'string') {
                        errors.push(`Unteraufgabe ${i + 1}: text muss ein String sein`);
                    } else if (st.text.length > FIELD_LIMITS.SUBTASK_TEXT_MAX) {
                        errors.push(`Unteraufgabe ${i + 1}: Text darf maximal ${FIELD_LIMITS.SUBTASK_TEXT_MAX} Zeichen lang sein`);
                    }
                    if (st.completed !== undefined && typeof st.completed !== 'boolean') {
                        errors.push(`Unteraufgabe ${i + 1}: completed muss ein Boolean sein`);
                    }
                } else {
                    errors.push(`Unteraufgabe ${i + 1}: muss ein String oder Objekt mit text-Eigenschaft sein`);
                }
            });
        }
    }

    return { valid: errors.length === 0, errors };
}

// Canonical server-side escapeHtml implementation.
// Note: The client-side version in src/js/security.js also escapes forward slashes
// (/ -> &#x2F;) for additional DOM context safety. This server version does not,
// because server-side escaping is only used for logging/audit contexts.
// Do NOT attempt to share a single module between server (CommonJS) and browser
// (global scripts) without a build system.
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeTaskData(data) {
    const sanitized = {};
    if (data.title !== undefined) sanitized.title = data.title.trim();
    if (data.employee !== undefined) sanitized.employee = data.employee.trim();
    if (data.location !== undefined) sanitized.location = data.location.trim();
    if (data.description !== undefined) sanitized.description = data.description.trim();
    if (data.notes !== undefined) sanitized.notes = data.notes.trim();
    if (data.status !== undefined) sanitized.status = data.status;
    if (data.priority !== undefined) sanitized.priority = data.priority;
    if (data.recurrence !== undefined) sanitized.recurrence = data.recurrence;
    if (data.subtasks !== undefined) sanitized.subtasks = data.subtasks;
    return sanitized;
}

module.exports = { validateTask, escapeHtml, sanitizeTaskData, validateIdParam };
