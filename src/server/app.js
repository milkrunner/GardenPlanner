const express = require('express');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { requestLogger } = require('./logger');
const { securityHeaders } = require('./middleware/security');
const { apiKeyAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error-handler');
const { validateTask, escapeHtml, sanitizeTaskData } = require('./validation/task-validator');
const { paginate } = require('./services/task-service');
const { resetCaches } = require('./storage/json-store');
const { listCategories } = require('./services/plant-service');

const tasksRouter = require('./routes/tasks');
const archiveRouter = require('./routes/archive');
const plantsRouter = require('./routes/plants');
const authRouter = require('./routes/auth');

const app = express();

// --- Project root for static files ---
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// --- Middleware (order preserved exactly) ---

app.use(compression());
app.use(express.json({ limit: '100kb' }));

// Security headers
app.use(securityHeaders);

// Request logging
app.use(requestLogger);

// Auth status endpoint (always accessible, before auth middleware)
app.use('/api/auth', authRouter);

// API key authentication for /api/* routes
app.use('/api', apiKeyAuth);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// --- Static file serving (replaces nginx) ---

app.use('/public', express.static(path.join(PROJECT_ROOT, 'public')));
app.use('/src', express.static(path.join(PROJECT_ROOT, 'src')));

// #7: /tests/ and /docs/ only in development
if (process.env.NODE_ENV !== 'production') {
    app.use('/tests', express.static(path.join(PROJECT_ROOT, 'tests')));
    app.use('/docs', express.static(path.join(PROJECT_ROOT, 'docs')));
}

// HTML page routes (with and without .html extension)
const pages = ['index', 'dashboard', 'statistics', 'logs', 'plants'];
pages.forEach(page => {
    app.get(`/${page}`, limiter, (req, res) => {
        res.sendFile(path.join(PROJECT_ROOT, 'public', `${page}.html`));
    });
    app.get(`/${page}.html`, limiter, (req, res) => {
        res.sendFile(path.join(PROJECT_ROOT, 'public', `${page}.html`));
    });
});

// Root -> index.html
app.get('/', limiter, (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'public', 'index.html'));
});

// --- API Routes ---

app.use('/api/tasks', tasksRouter);
app.use('/api', archiveRouter);
app.use('/api/plants', plantsRouter);

// GET /api/plant-categories - List unique categories
app.get('/api/plant-categories', (req, res) => {
    res.json(listCategories());
});

// --- Test-only error route (for verifying error handler) ---
if (process.env.NODE_ENV === 'test') {
    app.get('/api/test-error', (req, res, next) => {
        next(new Error('Test error for verification'));
    });
}

// --- Global error handler (AFTER all routes) ---
app.use(errorHandler);

module.exports = { app, validateTask, escapeHtml, sanitizeTaskData, paginate, resetCaches };
