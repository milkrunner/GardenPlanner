// Strict validation of an export bundle before anything is written (#329).
// Every task goes through validateTask (same rules as the API) and is then rebuilt from known fields only,
// so unknown keys of an imported file never reach the data files.
const { validateTask, sanitizeTaskData } = require('./task-validator');

const FORMAT_VERSION = 1;
const MAX_ITEMS = 10000; // tasks + archived tasks per bundle
const MAX_PLANTS = 1000;
const MAX_HISTORY = 1000;
const MAX_ERRORS = 20;
// Same pattern as validateIdParam in task-validator.js (kept here to leave that legacy file untouched).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isDateString = (value) => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));

function buildSubtasks(subtasks) {
    return subtasks.map((st) => {
        if (typeof st === 'string') return { id: Date.now() + Math.random(), text: st, completed: false };
        const keepId =
            (typeof st.id === 'number' && Number.isFinite(st.id)) || (typeof st.id === 'string' && st.id.length <= 64);
        return { id: keepId ? st.id : Date.now() + Math.random(), text: st.text, completed: !!st.completed };
    });
}

function validateHistory(history, errors, label) {
    if (!Array.isArray(history)) {
        errors.push(`${label}: history muss ein Array sein`);
        return [];
    }
    if (history.length > MAX_HISTORY) errors.push(`${label}: history hat mehr als ${MAX_HISTORY} Einträge`);
    return history.map((entry, i) => {
        if (
            !isObject(entry) ||
            !isDateString(entry.timestamp) ||
            typeof entry.action !== 'string' ||
            entry.action.length > 50
        ) {
            errors.push(`${label}: history[${i}] braucht timestamp (Datum) und action (max. 50 Zeichen)`);
            return null;
        }
        if (entry.details !== undefined && !isObject(entry.details)) {
            errors.push(`${label}: history[${i}].details muss ein Objekt sein`);
            return null;
        }
        return { timestamp: entry.timestamp, action: entry.action, details: entry.details || {} };
    });
}

// Returns the normalized task or null (errors are appended with the position in the bundle).
function normalizeTask(raw, label, errors) {
    if (!isObject(raw)) {
        errors.push(`${label}: muss ein Objekt sein`);
        return null;
    }
    const before = errors.length;
    if (typeof raw.id !== 'string' || !UUID_REGEX.test(raw.id)) errors.push(`${label}: id muss eine UUID v4 sein`);
    for (const message of validateTask(raw).errors) errors.push(`${label}: ${message}`);
    if (!isDateString(raw.createdAt)) errors.push(`${label}: createdAt muss ein Datum (ISO 8601) sein`);
    for (const field of ['completedAt', 'archivedAt']) {
        if (raw[field] !== undefined && raw[field] !== null && !isDateString(raw[field])) {
            errors.push(`${label}: ${field} muss ein Datum (ISO 8601) oder null sein`);
        }
    }
    // Verknüpfung wiederholender Aufgaben (#327): bleibt beim Wiederherstellen erhalten, sonst könnte eine
    // wieder abgeschlossene Aufgabe eine zweite Folgeaufgabe erzeugen.
    for (const field of ['followUpId', 'recurrenceOf']) {
        if (raw[field] !== undefined && (typeof raw[field] !== 'string' || !UUID_REGEX.test(raw[field]))) {
            errors.push(`${label}: ${field} muss eine UUID v4 sein`);
        }
    }
    // `nextDue` ist das Altfeld vor `dueDate` (#344): wird nicht mehr geschrieben, bleibt aber lesbar erhalten.
    for (const field of ['lastRecurrence', 'nextDue']) {
        if (raw[field] !== undefined && !isDateString(raw[field])) {
            errors.push(`${label}: ${field} muss ein Datum (ISO 8601) sein`);
        }
    }
    if (raw.sortOrder !== undefined && !(typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder))) {
        errors.push(`${label}: sortOrder muss eine Zahl sein`);
    }
    const history = raw.history === undefined ? [] : validateHistory(raw.history, errors, label);
    if (errors.length > before) return null;

    const clean = sanitizeTaskData(raw);
    const task = {
        id: raw.id,
        title: clean.title,
        employee: clean.employee || '',
        location: clean.location,
        description: clean.description || '',
        notes: clean.notes || '',
        status: clean.status || 'pending',
        priority: clean.priority || 'medium',
        recurrence: clean.recurrence || 'none',
        createdAt: raw.createdAt,
    };
    // Ältere Bündel ohne dueDate bleiben gültig und bekommen es nicht ergänzt.
    if (clean.dueDate !== undefined) task.dueDate = clean.dueDate;
    if (raw.completedAt !== undefined) task.completedAt = raw.completedAt;
    if (raw.archivedAt !== undefined) task.archivedAt = raw.archivedAt;
    if (raw.sortOrder !== undefined) task.sortOrder = raw.sortOrder;
    for (const field of ['followUpId', 'recurrenceOf', 'lastRecurrence', 'nextDue']) {
        if (raw[field] !== undefined) task[field] = raw[field];
    }
    task.subtasks = Array.isArray(clean.subtasks) ? buildSubtasks(clean.subtasks) : [];
    task.history = history;
    return task;
}

function validateStringList(value, max, label, errors) {
    if (value === undefined) return;
    if (
        !Array.isArray(value) ||
        value.length > 50 ||
        value.some((item) => typeof item !== 'string' || item.length > max)
    ) {
        errors.push(`${label}: muss ein Array aus Texten sein (max. 50 Einträge, je ${max} Zeichen)`);
    }
}

function normalizePlant(raw, label, errors) {
    if (!isObject(raw)) {
        errors.push(`${label}: muss ein Objekt sein`);
        return null;
    }
    const before = errors.length;
    if (typeof raw.id !== 'string' || !SLUG_REGEX.test(raw.id))
        errors.push(`${label}: id muss ein Slug sein (a-z, 0-9, -)`);
    for (const field of ['name', 'category']) {
        if (typeof raw[field] !== 'string' || raw[field].trim().length < 1 || raw[field].length > 100) {
            errors.push(`${label}: ${field} muss zwischen 1 und 100 Zeichen lang sein`);
        }
    }
    for (const field of ['icon', 'difficulty', 'sun', 'water', 'spacing', 'germination', 'harvest']) {
        if (raw[field] !== undefined && (typeof raw[field] !== 'string' || raw[field].length > 100)) {
            errors.push(`${label}: ${field} muss ein Text sein (max. 100 Zeichen)`);
        }
    }
    if (raw.tips !== undefined && (typeof raw.tips !== 'string' || raw.tips.length > 2000)) {
        errors.push(`${label}: tips muss ein Text sein (max. 2000 Zeichen)`);
    }
    validateStringList(raw.season, 50, `${label}: season`, errors);
    validateStringList(raw.companions, 100, `${label}: companions`, errors);
    validateStringList(raw.avoid, 100, `${label}: avoid`, errors);
    if (errors.length > before) return null;

    const plant = { id: raw.id, name: raw.name.trim(), category: raw.category.trim() };
    for (const field of ['icon', 'difficulty', 'sun', 'water', 'spacing', 'germination', 'harvest']) {
        if (raw[field] !== undefined) plant[field] = raw[field];
    }
    for (const field of ['season', 'companions', 'avoid']) {
        plant[field] = raw[field] === undefined ? [] : [...raw[field]];
    }
    // The plant library searches in tips, so it has to exist.
    plant.tips = raw.tips === undefined ? '' : raw.tips;
    return plant;
}

function normalizeList(list, kind, normalize, errors, seen) {
    const result = [];
    list.forEach((raw, index) => {
        if (errors.length >= MAX_ERRORS) return;
        const item = normalize(raw, `${kind}[${index}]`, errors);
        if (!item) return;
        const key = item.id.toLowerCase();
        if (seen.has(key)) {
            errors.push(`${kind}[${index}]: id ${item.id} kommt im Bündel mehrfach vor`);
            return;
        }
        seen.add(key);
        result.push(item);
    });
    return result;
}

// Returns { ok: true, bundle } with normalized data, or { ok: false, status, errors }.
function validateBundle(body) {
    if (!isObject(body)) return { ok: false, status: 400, errors: ['Body muss ein Export-Bündel (JSON-Objekt) sein'] };
    if (body.formatVersion !== FORMAT_VERSION) {
        return {
            ok: false,
            status: 400,
            errors: [`Nicht unterstütztes Format: formatVersion muss ${FORMAT_VERSION} sein`],
        };
    }
    const errors = [];
    for (const field of ['tasks', 'archivedTasks']) {
        if (!Array.isArray(body[field])) errors.push(`${field} muss ein Array sein`);
    }
    if (body.plants !== undefined && body.plants !== null && !Array.isArray(body.plants)) {
        errors.push('plants muss ein Array oder null sein');
    }
    if (errors.length) return { ok: false, status: 400, errors };

    const plants = body.plants || null;
    if (body.tasks.length + body.archivedTasks.length > MAX_ITEMS) {
        return { ok: false, status: 413, errors: [`Das Bündel enthält mehr als ${MAX_ITEMS} Aufgaben`] };
    }
    if (plants && plants.length > MAX_PLANTS) {
        return { ok: false, status: 413, errors: [`Das Bündel enthält mehr als ${MAX_PLANTS} Pflanzen`] };
    }

    const seenTasks = new Set();
    const tasks = normalizeList(body.tasks, 'tasks', normalizeTask, errors, seenTasks);
    const archivedTasks = normalizeList(body.archivedTasks, 'archivedTasks', normalizeTask, errors, seenTasks);
    const normalizedPlants = plants ? normalizeList(plants, 'plants', normalizePlant, errors, new Set()) : null;

    if (errors.length) return { ok: false, status: 400, errors: errors.slice(0, MAX_ERRORS) };
    return { ok: true, bundle: { tasks, archivedTasks, plants: normalizedPlants } };
}

module.exports = { FORMAT_VERSION, MAX_ITEMS, validateBundle };
