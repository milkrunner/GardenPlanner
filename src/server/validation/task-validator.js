// --- Validation ---

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateIdParam(req, res, next) {
    if (!UUID_REGEX.test(req.params.id)) {
        return res.status(400).json({ error: 'Invalid ID format. Expected a valid UUID.' });
    }
    next();
}

function validateTask(taskData, partial = false) {
    const errors = [];

    if (!partial || taskData.title !== undefined) {
        if (typeof taskData.title !== 'string' || taskData.title.trim().length < 1 || taskData.title.trim().length > 200) {
            errors.push('Titel muss zwischen 1 und 200 Zeichen lang sein');
        }
    }
    if (taskData.employee !== undefined && taskData.employee !== '') {
        if (typeof taskData.employee !== 'string' || taskData.employee.trim().length > 100) {
            errors.push('Mitarbeiter darf maximal 100 Zeichen lang sein');
        }
    }
    if (!partial || taskData.location !== undefined) {
        if (typeof taskData.location !== 'string' || taskData.location.trim().length < 1 || taskData.location.trim().length > 100) {
            errors.push('Standort muss angegeben werden (max 100 Zeichen)');
        }
    }
    if (taskData.description !== undefined && taskData.description !== '') {
        if (typeof taskData.description !== 'string' || taskData.description.length > 2000) {
            errors.push('Beschreibung darf maximal 2000 Zeichen lang sein');
        }
    }
    if (taskData.notes !== undefined && taskData.notes !== '') {
        if (typeof taskData.notes !== 'string' || taskData.notes.length > 5000) {
            errors.push('Notizen d\u00fcrfen maximal 5000 Zeichen lang sein');
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
            if (taskData.subtasks.length > 50) {
                errors.push('Maximal 50 Unteraufgaben erlaubt');
            }
            taskData.subtasks.forEach((st, i) => {
                if (typeof st === 'string') {
                    if (st.length > 500) {
                        errors.push(`Unteraufgabe ${i + 1}: Text darf maximal 500 Zeichen lang sein`);
                    }
                } else if (typeof st === 'object' && st !== null) {
                    if (typeof st.text !== 'string') {
                        errors.push(`Unteraufgabe ${i + 1}: text muss ein String sein`);
                    } else if (st.text.length > 500) {
                        errors.push(`Unteraufgabe ${i + 1}: Text darf maximal 500 Zeichen lang sein`);
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
