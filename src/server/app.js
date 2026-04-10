const express = require('express');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

const { requestLogger } = require('./logger');
const { securityHeaders } = require('./middleware/security');
const { jwtAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error-handler');
const { apiDeprecation } = require('./middleware/api-deprecation');
const { generalLimiter, writeLimiter, authLimiter, resetRateLimitStores } = require('./middleware/rate-limit');
const { validateTask, escapeHtml, sanitizeTaskData } = require('./validation/task-validator');
const { paginate } = require('./services/task-service');
const { listCategories } = require('./services/plant-service');

const tasksRouter = require('./routes/tasks');
const archiveRouter = require('./routes/archive');
const plantsRouter = require('./routes/plants');
const photosRouter = require('./routes/photos');
const gardensRouter = require('./routes/gardens');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const { requireAdmin } = require('./middleware/require-admin');

const app = express();

// --- Project root for static files ---
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const USE_BUNDLES = process.env.NODE_ENV === 'production' && fs.existsSync(DIST_DIR);
const APP_VERSION = require(path.join(PROJECT_ROOT, 'package.json')).version;

// --- Middleware (order preserved exactly) ---

app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));

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

// JWT authentication for /api/* routes (populates req.user; public auth paths pass through)
app.use('/api/v1', jwtAuth);
app.use('/api', jwtAuth);

// Deprecation middleware for legacy /api/* paths (without /v1/)
// Must come after jwtAuth so auth still works on legacy paths.
app.use('/api', apiDeprecation);

// Auth routes (after jwtAuth so req.user is populated on /status)
app.use('/api/v1/auth', authRouter);
app.use('/api/auth', authRouter);

// Rate limiting — tiered
app.use('/api/v1/auth', authLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/v1', generalLimiter);
app.use('/api', generalLimiter);

// --- Static file serving (replaces nginx) ---

// Serve bundled assets from dist/ in production (long cache — content is versioned by build)
if (USE_BUNDLES) {
    app.use('/dist', express.static(DIST_DIR, { maxAge: '7d' }));
}

app.use('/public', express.static(path.join(PROJECT_ROOT, 'public'), { maxAge: '1d' }));

// Vendor-Dateien (Workbox etc.) — lang cachen, aendert sich nur bei Versionswechsel
app.use('/vendor', express.static(path.join(PROJECT_ROOT, 'public', 'vendor'), { maxAge: '30d' }));

// Icons
app.use('/icons', express.static(path.join(PROJECT_ROOT, 'public', 'icons'), { maxAge: '7d' }));

// Serve /src (CSS/JS needed in dev since HTML references ../src/)
app.use('/src', express.static(path.join(PROJECT_ROOT, 'src'), { maxAge: '1d' }));

// #115: /tests and /docs only in development
if (process.env.NODE_ENV !== 'production') {
    app.use('/tests', express.static(path.join(PROJECT_ROOT, 'tests')));
    app.use('/docs', express.static(path.join(PROJECT_ROOT, 'docs')));
}

// Service Worker: Muss vom Root serviert werden, kein Cache (damit Updates sofort greifen)
app.get('/sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(PROJECT_ROOT, 'public', 'sw.js'));
});

// Manifest vom Root servieren
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'public', 'manifest.json'));
});

// Version endpoint (public, no auth needed)
app.get('/api/v1/version', (req, res) => {
    res.json({ version: APP_VERSION });
});
app.get('/api/version', (req, res) => {
    res.json({ version: APP_VERSION });
});

// HTML page routes (with and without .html extension)
// In production with bundles, serve pre-processed HTML from dist/
const HTML_ROOT = USE_BUNDLES ? DIST_DIR : path.join(PROJECT_ROOT, 'public');

const pages = ['index', 'dashboard', 'statistics', 'logs', 'plants', 'garden', 'login', 'admin'];
pages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        res.sendFile(path.join(HTML_ROOT, `${page}.html`));
    });
    app.get(`/${page}.html`, (req, res) => {
        res.sendFile(path.join(HTML_ROOT, `${page}.html`));
    });
});

// Root -> index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(HTML_ROOT, 'index.html'));
});

// Stricter rate limit on write operations (canonical /api/v1 paths first, then legacy /api)
app.post('/api/v1/tasks', writeLimiter);
app.put('/api/v1/tasks/:id', writeLimiter);
app.delete('/api/v1/tasks/:id', writeLimiter);
app.post('/api/v1/tasks/:id/archive', writeLimiter);
app.post('/api/v1/tasks/:id/unarchive', writeLimiter);
app.delete('/api/v1/archived-tasks/:id', writeLimiter);
app.post('/api/tasks', writeLimiter);
app.put('/api/tasks/:id', writeLimiter);
app.delete('/api/tasks/:id', writeLimiter);
app.post('/api/tasks/:id/archive', writeLimiter);
app.post('/api/tasks/:id/unarchive', writeLimiter);
app.delete('/api/archived-tasks/:id', writeLimiter);
app.post('/api/v1/tasks/:id/photos', writeLimiter);
app.delete('/api/v1/tasks/:id/photos/:filename', writeLimiter);
app.post('/api/tasks/:id/photos', writeLimiter);
app.delete('/api/tasks/:id/photos/:filename', writeLimiter);
app.post('/api/tasks/:id/comments', writeLimiter);
app.delete('/api/tasks/:id/comments/:commentId', writeLimiter);
app.post('/api/v1/tasks/:id/comments', writeLimiter);
app.delete('/api/v1/tasks/:id/comments/:commentId', writeLimiter);
// Batch operations (#244)
app.patch('/api/v1/tasks/batch', writeLimiter);
app.delete('/api/v1/tasks/batch', writeLimiter);
app.patch('/api/tasks/batch', writeLimiter);
app.delete('/api/tasks/batch', writeLimiter);
// Garden write operations (#251)
app.post('/api/v1/gardens', writeLimiter);
app.put('/api/v1/gardens/:id', writeLimiter);
app.delete('/api/v1/gardens/:id', writeLimiter);
app.post('/api/v1/gardens/import', writeLimiter);

// --- Canonical API Routes (/api/v1) ---

app.use('/api/v1/tasks', tasksRouter);
app.use('/api/v1', archiveRouter);
app.use('/api/v1/plants', plantsRouter);
app.use('/api/v1', photosRouter);
app.use('/api/v1/gardens', gardensRouter);

app.get('/api/v1/plant-categories', (req, res) => {
    res.json(listCategories());
});

// --- Admin Routes ---
app.use('/api/v1/admin', requireAdmin, adminRouter);

// --- Legacy /api/* routes (deprecated, served with deprecation headers via middleware above) ---

app.use('/api/tasks', tasksRouter);
app.use('/api', archiveRouter);
app.use('/api/plants', plantsRouter);
app.use('/api', photosRouter);

app.get('/api/plant-categories', (req, res) => {
    res.json(listCategories());
});

app.use('/api/admin', requireAdmin, adminRouter);

// --- Test-only error route (for verifying error handler) ---
if (process.env.NODE_ENV === 'test') {
    app.get('/api/v1/test-error', (req, res, next) => {
        next(new Error('Test error for verification'));
    });
}

// --- Global error handler (AFTER all routes) ---
app.use(errorHandler);

module.exports = { app, validateTask, escapeHtml, sanitizeTaskData, paginate, resetRateLimitStores };
