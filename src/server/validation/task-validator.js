// --- Validation ---

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateIdParam(req, res, next) {
    if (!UUID_REGEX.test(req.params.id)) {
        return res.status(400).json({ error: 'Invalid ID format. Expected a valid UUID.' });
    }
    next();
}

// Fälligkeitsdatum (#344): reines Kalenderdatum `YYYY-MM-DD` ohne Uhrzeit und Zeitzone. Es muss ein echtes Datum
// sein (kein 2026-02-30) und im plausiblen Bereich liegen. Als ISO-Text sind Datumswerte lexikografisch sortierbar.
const DUE_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DUE_DATE_MIN = '2000-01-01';
const DUE_DATE_MAX = '2100-12-31';

function isValidDueDate(value) {
    if (typeof value !== 'string') return false;
    const match = DUE_DATE_REGEX.exec(value);
    if (!match) return false;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    return real && value >= DUE_DATE_MIN && value <= DUE_DATE_MAX;
}

function validateTask(taskData, partial = false) {
    const errors = [];

    if (!partial || taskData.title !== undefined) {
        if (
            typeof taskData.title !== 'string' ||
            taskData.title.trim().length < 1 ||
            taskData.title.trim().length > 200
        ) {
            errors.push('Titel muss zwischen 1 und 200 Zeichen lang sein');
        }
    }
    if (taskData.employee !== undefined && taskData.employee !== '') {
        if (typeof taskData.employee !== 'string' || taskData.employee.trim().length > 100) {
            errors.push('Mitarbeiter darf maximal 100 Zeichen lang sein');
        }
    }
    if (!partial || taskData.location !== undefined) {
        if (
            typeof taskData.location !== 'string' ||
            taskData.location.trim().length < 1 ||
            taskData.location.trim().length > 100
        ) {
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
    if (taskData.dueDate !== undefined && taskData.dueDate !== null && !isValidDueDate(taskData.dueDate)) {
        errors.push(
            `F\u00e4lligkeitsdatum muss ein g\u00fcltiges Datum im Format JJJJ-MM-TT zwischen ${DUE_DATE_MIN} und ${DUE_DATE_MAX} sein oder null`,
        );
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
    if (data.dueDate !== undefined) sanitized.dueDate = data.dueDate;
    if (data.subtasks !== undefined) sanitized.subtasks = data.subtasks;
    return sanitized;
}

// Filter und Sortierung nach Fälligkeit für GET /api/tasks (Query) und POST /api/tasks/search (Body).
// Leere Werte gelten als nicht gesetzt; ungültige Werte werden abgelehnt statt still ignoriert,
// sonst sähe ein Tippfehler wie ein leeres Ergebnis aus.
const SORT_FIELDS = ['dueDate'];

function parseDueFilter(params) {
    const filter = { dueFrom: null, dueTo: null, sort: null };
    const errors = [];
    const source = params && typeof params === 'object' ? params : {};
    for (const name of ['dueFrom', 'dueTo']) {
        const value = source[name];
        if (value === undefined || value === null || value === '') continue;
        if (isValidDueDate(value)) filter[name] = value;
        else errors.push(`${name} muss ein g\u00fcltiges Datum im Format JJJJ-MM-TT sein`);
    }
    const sort = source.sort;
    if (sort !== undefined && sort !== null && sort !== '') {
        if (SORT_FIELDS.includes(sort)) filter.sort = sort;
        else errors.push(`sort muss einer von ${SORT_FIELDS.join(', ')} sein`);
    }
    return { valid: errors.length === 0, errors, filter };
}

// Ohne Fälligkeit (fehlendes Feld oder null) fällt eine Aufgabe aus jedem Datumsfilter heraus und steht beim
// Sortieren hinten. Die Sortierung ist stabil: gleiche Daten behalten ihre bisherige Reihenfolge.
function applyDueFilter(tasks, filter) {
    let result = tasks;
    if (filter.dueFrom) result = result.filter((t) => t.dueDate && t.dueDate >= filter.dueFrom);
    if (filter.dueTo) result = result.filter((t) => t.dueDate && t.dueDate <= filter.dueTo);
    if (filter.sort === 'dueDate') {
        result = [...result].sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
        });
    }
    return result;
}

module.exports = {
    validateTask,
    escapeHtml,
    sanitizeTaskData,
    validateIdParam,
    isValidDueDate,
    parseDueFilter,
    applyDueFilter,
};
