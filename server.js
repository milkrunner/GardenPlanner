const express = require('express');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { logger, audit, requestLogger } = require('./src/server/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const DATA_DIR = path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ARCHIVED_FILE = path.join(DATA_DIR, 'archived-tasks.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, '[]', 'utf8');
}
if (!fs.existsSync(ARCHIVED_FILE)) {
    fs.writeFileSync(ARCHIVED_FILE, '[]', 'utf8');
}

// --- Storage helpers ---

function readTasks() {
    try {
        const data = fs.readFileSync(TASKS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function writeTasks(tasks) {
    const tmp = TASKS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), 'utf8');
    fs.renameSync(tmp, TASKS_FILE);
}

function readArchivedTasks() {
    try {
        const data = fs.readFileSync(ARCHIVED_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function writeArchivedTasks(tasks) {
    const tmp = ARCHIVED_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), 'utf8');
    fs.renameSync(tmp, ARCHIVED_FILE);
}

// --- Validation ---

function validateTask(taskData, partial = false) {
    const errors = [];

    if (!partial || taskData.title !== undefined) {
        if (typeof taskData.title !== 'string' || taskData.title.trim().length < 1 || taskData.title.trim().length > 200) {
            errors.push('Titel muss zwischen 1 und 200 Zeichen lang sein');
        }
    }
    if (!partial || taskData.employee !== undefined) {
        if (typeof taskData.employee !== 'string' || taskData.employee.trim().length < 1 || taskData.employee.trim().length > 100) {
            errors.push('Mitarbeiter muss angegeben werden (max 100 Zeichen)');
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
    if (taskData.status !== undefined) {
        const valid = ['pending', 'in-progress', 'completed'];
        if (!valid.includes(taskData.status)) {
            errors.push('Ungültiger Status (erlaubt: pending, in-progress, completed)');
        }
    }
    if (taskData.priority !== undefined) {
        const valid = ['low', 'medium', 'high'];
        if (!valid.includes(taskData.priority)) {
            errors.push('Ungültige Priorität (erlaubt: low, medium, high)');
        }
    }
    if (taskData.recurrence !== undefined) {
        const valid = ['none', 'daily', 'weekly', 'monthly'];
        if (!valid.includes(taskData.recurrence)) {
            errors.push('Ungültige Wiederholung (erlaubt: none, daily, weekly, monthly)');
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
    if (data.title !== undefined) sanitized.title = escapeHtml(data.title.trim());
    if (data.employee !== undefined) sanitized.employee = escapeHtml(data.employee.trim());
    if (data.location !== undefined) sanitized.location = escapeHtml(data.location.trim());
    if (data.description !== undefined) sanitized.description = escapeHtml(data.description.trim());
    if (data.status !== undefined) sanitized.status = data.status;
    if (data.priority !== undefined) sanitized.priority = data.priority;
    if (data.recurrence !== undefined) sanitized.recurrence = data.recurrence;
    if (data.subtasks !== undefined) sanitized.subtasks = data.subtasks;
    return sanitized;
}

// --- Middleware ---

app.use(compression());
app.use(cors());
app.use(express.json());

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
    next();
});

// Request logging
app.use(requestLogger);

// Auth status endpoint (always accessible, no auth required)
app.get('/api/auth/status', (req, res) => {
    res.json({ authRequired: !!API_KEY });
});

// API key authentication for /api/* routes
app.use('/api', (req, res, next) => {
    // Auth status endpoint is always accessible
    if (req.path === '/auth/status') {
        return next();
    }

    // No API key configured = no auth required
    if (!API_KEY) {
        return next();
    }

    // Require valid API key for all requests
    const providedKey = req.headers['x-api-key'];
    if (providedKey !== API_KEY) {
        audit('auth_failure', {
            ip: req.ip || req.connection.remoteAddress,
            path: req.originalUrl,
            method: req.method
        });
        return res.status(401).json({ error: 'Unauthorized. Provide a valid X-API-Key header.' });
    }
    next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// --- Static file serving (replaces nginx) ---

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/tests', express.static(path.join(__dirname, 'tests')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

// HTML page routes (with and without .html extension)
const pages = ['index', 'dashboard', 'statistics', 'logs'];
pages.forEach(page => {
    app.get(`/${page}`, limiter, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', `${page}.html`));
    });
    app.get(`/${page}.html`, limiter, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', `${page}.html`));
    });
});

// Root -> index.html
app.get('/', limiter, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API Routes ---

// GET /api/tasks - List all tasks (use POST /api/tasks/search for filtered queries)
app.get('/api/tasks', (req, res) => {
    let tasks = readTasks();

    // Only allow non-sensitive filter via query param
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    if (status) {
        const validStatuses = ['pending', 'in-progress', 'completed'];
        if (validStatuses.includes(status)) {
            tasks = tasks.filter(t => t.status === status);
        }
    }

    res.json(tasks);
});

// POST /api/tasks/search - Filter tasks with sensitive criteria via request body
app.post('/api/tasks/search', (req, res) => {
    let tasks = readTasks();
    const { status, employee, location } = req.body;

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

    res.json(tasks);
});

// GET /api/tasks/:id - Get single task
app.get('/api/tasks/:id', (req, res) => {
    const tasks = readTasks();
    const task = tasks.find(t => String(t.id) === String(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
});

// POST /api/tasks - Create a new task
app.post('/api/tasks', (req, res) => {
    const validation = validateTask(req.body);
    if (!validation.valid) {
        return res.status(400).json({ errors: validation.errors });
    }

    const sanitized = sanitizeTaskData(req.body);
    const task = {
        id: uuidv4(),
        title: sanitized.title,
        employee: sanitized.employee,
        location: sanitized.location,
        description: sanitized.description || '',
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
            text: typeof st === 'string' ? escapeHtml(st) : escapeHtml(st.text || ''),
            completed: typeof st === 'object' ? !!st.completed : false
        })) : [],
        sortOrder: Date.now()
    };

    const tasks = readTasks();
    tasks.push(task);
    writeTasks(tasks);

    audit('task_created', { taskId: task.id, title: sanitized.title, employee: sanitized.employee });
    res.status(201).json(task);
});

// PUT /api/tasks/:id - Update a task
app.put('/api/tasks/:id', (req, res) => {
    const validation = validateTask(req.body, true);
    if (!validation.valid) {
        return res.status(400).json({ errors: validation.errors });
    }

    const tasks = readTasks();
    const index = tasks.findIndex(t => String(t.id) === String(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Task not found' });

    const task = tasks[index];
    const sanitized = sanitizeTaskData(req.body);
    const changes = [];

    // Track changes for history
    if (sanitized.title !== undefined && sanitized.title !== task.title) {
        changes.push(`Titel: "${task.title}" → "${sanitized.title}"`);
        task.title = sanitized.title;
    }
    if (sanitized.employee !== undefined && sanitized.employee !== task.employee) {
        changes.push(`Mitarbeiter: "${task.employee}" → "${sanitized.employee}"`);
        task.employee = sanitized.employee;
    }
    if (sanitized.location !== undefined && sanitized.location !== task.location) {
        changes.push(`Standort: "${task.location}" → "${sanitized.location}"`);
        task.location = sanitized.location;
    }
    if (sanitized.description !== undefined && sanitized.description !== task.description) {
        changes.push('Beschreibung geändert');
        task.description = sanitized.description;
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
    if (sanitized.subtasks !== undefined) task.subtasks = sanitized.subtasks;

    // Add edit history entry if fields changed
    if (changes.length > 0) {
        if (!task.history) task.history = [];
        task.history.push({
            timestamp: new Date().toISOString(),
            action: 'edited',
            details: { changes }
        });
    }

    tasks[index] = task;
    writeTasks(tasks);

    audit('task_updated', { taskId: task.id, changes });
    res.json(task);
});

// DELETE /api/tasks/:id - Delete a task
app.delete('/api/tasks/:id', (req, res) => {
    const tasks = readTasks();
    const index = tasks.findIndex(t => String(t.id) === String(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Task not found' });

    const deletedTask = tasks.splice(index, 1)[0];
    writeTasks(tasks);

    audit('task_deleted', { taskId: deletedTask.id, title: deletedTask.title });
    res.status(204).send();
});

// POST /api/tasks/:id/archive - Archive a task
app.post('/api/tasks/:id/archive', (req, res) => {
    const tasks = readTasks();
    const index = tasks.findIndex(t => String(t.id) === String(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Task not found' });

    const task = tasks[index];
    task.archivedAt = new Date().toISOString();
    if (!task.history) task.history = [];
    task.history.push({
        timestamp: new Date().toISOString(),
        action: 'archived',
        details: {}
    });

    tasks.splice(index, 1);
    const archived = readArchivedTasks();
    archived.push(task);

    writeTasks(tasks);
    writeArchivedTasks(archived);

    audit('task_archived', { taskId: task.id, title: task.title });
    res.json(task);
});

// POST /api/tasks/:id/unarchive - Restore a task from archive
app.post('/api/tasks/:id/unarchive', (req, res) => {
    const archived = readArchivedTasks();
    const index = archived.findIndex(t => String(t.id) === String(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Archived task not found' });

    const task = archived[index];
    delete task.archivedAt;
    if (!task.history) task.history = [];
    task.history.push({
        timestamp: new Date().toISOString(),
        action: 'unarchived',
        details: {}
    });

    archived.splice(index, 1);
    const tasks = readTasks();
    tasks.push(task);

    writeArchivedTasks(archived);
    writeTasks(tasks);

    audit('task_unarchived', { taskId: task.id, title: task.title });
    res.json(task);
});

// GET /api/archived-tasks - List archived tasks
app.get('/api/archived-tasks', (req, res) => {
    res.json(readArchivedTasks());
});

// DELETE /api/archived-tasks/:id - Delete an archived task permanently
app.delete('/api/archived-tasks/:id', (req, res) => {
    const archived = readArchivedTasks();
    const index = archived.findIndex(t => String(t.id) === String(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Archived task not found' });

    const deletedArchived = archived.splice(index, 1)[0];
    writeArchivedTasks(archived);

    audit('archived_task_deleted', { taskId: deletedArchived.id, title: deletedArchived.title });
    res.status(204).send();
});

// --- Start server ---

if (require.main === module) {
    app.listen(PORT, () => {
        logger.info({ port: PORT, auth: !!API_KEY }, 'Gartenplaner API started');
        audit('server_started', { port: PORT, authEnabled: !!API_KEY });
        if (!API_KEY) {
            logger.warn('No API_KEY set. API is open for all requests.');
        }
    });
}

module.exports = { app, validateTask, escapeHtml, sanitizeTaskData };
