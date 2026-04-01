const express = require('express');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

const { requestLogger } = require('./logger');
const { securityHeaders } = require('./middleware/security');
const { jwtAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error-handler');
const { generalLimiter, writeLimiter, authLimiter, resetRateLimitStores } = require('./middleware/rate-limit');
const { validateTask, escapeHtml, sanitizeTaskData } = require('./validation/task-validator');
const { paginate } = require('./services/task-service');
const { listCategories } = require('./services/plant-service');

const tasksRouter = require('./routes/tasks');
const archiveRouter = require('./routes/archive');
const plantsRouter = require('./routes/plants');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const { requireAdmin } = require('./middleware/require-admin');

const app = express();

// --- Project root for static files ---
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// --- Middleware (order preserved exactly) ---

app.use(compression());
app.use(express.json({ limit: '100kb' }));

// Security headers
app.use(securityHeaders);

// Inject CSP nonce into HTML responses
app.use((req, res, next) => {
    const originalSendFile = res.sendFile.bind(res);
    res.sendFile = function(filePath, options, callback) {
        if (filePath.endsWith('.html')) {
            fs.readFile(filePath, 'utf8', (err, html) => {
                if (err) return next(err);
                html = html.replace(/__CSP_NONCE__/g, res.locals.cspNonce);
                res.set('Content-Type', 'text/html');
                res.send(html);
            });
        } else {
            originalSendFile(filePath, options, callback);
        }
    };
    next();
});

// Request logging
app.use(requestLogger);

// Auth status endpoint (always accessible, before auth middleware)
app.use('/api/auth', authRouter);
app.use('/api/v1/auth', authRouter);

// JWT authentication for /api/* routes
app.use('/api', jwtAuth);
app.use('/api/v1', jwtAuth);

// Rate limiting — tiered
app.use('/api/auth', authLimiter);
app.use('/api/v1/auth', authLimiter);
app.use('/api', generalLimiter);
app.use('/api/v1', generalLimiter);

// --- Static file serving (replaces nginx) ---

app.use('/public', express.static(path.join(PROJECT_ROOT, 'public'), { maxAge: '1d' }));

// Serve /src (CSS/JS needed in production since HTML references ../src/)
app.use('/src', express.static(path.join(PROJECT_ROOT, 'src'), { maxAge: '1d' }));

// #115: /tests and /docs only in development
if (process.env.NODE_ENV !== 'production') {
    app.use('/tests', express.static(path.join(PROJECT_ROOT, 'tests')));
    app.use('/docs', express.static(path.join(PROJECT_ROOT, 'docs')));
}

// HTML page routes (with and without .html extension)
const pages = ['index', 'dashboard', 'statistics', 'logs', 'plants', 'garden', 'login', 'admin'];
pages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        res.sendFile(path.join(PROJECT_ROOT, 'public', `${page}.html`));
    });
    app.get(`/${page}.html`, (req, res) => {
        res.sendFile(path.join(PROJECT_ROOT, 'public', `${page}.html`));
    });
});

// Root -> index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'public', 'index.html'));
});

// Stricter rate limit on write operations
app.post('/api/tasks', writeLimiter);
app.put('/api/tasks/:id', writeLimiter);
app.delete('/api/tasks/:id', writeLimiter);
app.post('/api/tasks/:id/archive', writeLimiter);
app.post('/api/tasks/:id/unarchive', writeLimiter);
app.delete('/api/archived-tasks/:id', writeLimiter);
app.post('/api/v1/tasks', writeLimiter);
app.put('/api/v1/tasks/:id', writeLimiter);
app.delete('/api/v1/tasks/:id', writeLimiter);
app.post('/api/v1/tasks/:id/archive', writeLimiter);
app.post('/api/v1/tasks/:id/unarchive', writeLimiter);
app.delete('/api/v1/archived-tasks/:id', writeLimiter);

// --- API Routes ---

app.use('/api/tasks', tasksRouter);
app.use('/api', archiveRouter);
app.use('/api/plants', plantsRouter);

// GET /api/plant-categories - List unique categories
app.get('/api/plant-categories', (req, res) => {
    res.json(listCategories());
});

// --- Versioned API Routes (/api/v1) — canonical, same handlers ---

app.use('/api/v1/tasks', tasksRouter);
app.use('/api/v1', archiveRouter);
app.use('/api/v1/plants', plantsRouter);

// GET /api/v1/plant-categories - List unique categories (versioned)
app.get('/api/v1/plant-categories', (req, res) => {
    res.json(listCategories());
});

// --- Admin Routes ---
app.use('/api/v1/admin', requireAdmin, adminRouter);
app.use('/api/admin', requireAdmin, adminRouter);

// --- Test-only error route (for verifying error handler) ---
if (process.env.NODE_ENV === 'test') {
    app.get('/api/test-error', (req, res, next) => {
        next(new Error('Test error for verification'));
    });
}

// --- Global error handler (AFTER all routes) ---
app.use(errorHandler);

module.exports = { app, validateTask, escapeHtml, sanitizeTaskData, paginate, resetRateLimitStores };
