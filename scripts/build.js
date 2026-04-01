/**
 * Build script for CSS/JS bundling (#47)
 *
 * Concatenates per-page JS files into single bundles and CSS files into
 * combined stylesheets. Designed to be run during Docker image build so
 * the HTML can later be updated to reference bundled files in production.
 *
 * Usage:  node scripts/build.js
 * Output: dist/  (JS + CSS bundles)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// ── helpers ──────────────────────────────────────────────────────────

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readSource(relPath) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) {
        console.warn(`  WARNING: ${relPath} not found, skipping`);
        return '';
    }
    return fs.readFileSync(full, 'utf8');
}

function writeBundle(name, content) {
    const dest = path.join(DIST, name);
    fs.writeFileSync(dest, content);
    const kb = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1);
    console.log(`  ${name}  (${kb} KB)`);
}

// ── CSS bundles ──────────────────────────────────────────────────────

const cssBundles = {
    'styles.css': [
        'src/css/styles.css'
    ],
    'plants.css': [
        'src/css/styles.css',
        'src/css/plants.css'
    ],
    'logs.css': [
        'src/css/styles.css',
        'src/css/logs.css'
    ]
};

// ── Shared JS (common across most pages) ─────────────────────────────

const sharedJs = [
    'src/js/config.js',
    'src/js/security.js',
    'src/js/encryption.js',
    'src/js/rate-limiter.js',
    'src/js/logger.js',
    'src/js/error-handler.js',
    'src/js/api.js'
];

// ── Per-page JS bundles ──────────────────────────────────────────────
// Order matters — mirrors the <script> order in each HTML page.

const jsBundles = {
    // index.html (new task page)
    'index-bundle.js': [
        ...sharedJs,
        'src/js/app.js',
        'src/js/task-state.js',
        'src/js/task-filters.js',
        'src/js/task-renderer.js',
        'src/js/task-events.js',
        'src/js/task-export.js',
        'src/js/tab-sync.js'
    ],
    // dashboard.html
    'dashboard-bundle.js': [
        ...sharedJs,
        'src/js/app.js',
        'src/js/task-state.js',
        'src/js/task-filters.js',
        'src/js/task-renderer.js',
        'src/js/task-events.js',
        'src/js/task-export.js',
        'src/js/tab-sync.js',
        'src/js/dashboard-init.js'
    ],
    // statistics.html
    'statistics-bundle.js': [
        ...sharedJs,
        'src/js/app.js',
        'src/js/task-state.js',
        'src/js/task-filters.js',
        'src/js/task-renderer.js',
        'src/js/task-events.js',
        'src/js/task-export.js',
        'src/js/statistics-interactive.js',
        'src/js/statistics-init.js'
    ],
    // plants.html
    'plants-bundle.js': [
        ...sharedJs,
        'src/js/ui-states.js',
        'src/js/confirm-dialog.js',
        'src/js/app.js',
        'src/js/task-state.js',
        'src/js/task-filters.js',
        'src/js/task-renderer.js',
        'src/js/task-events.js',
        'src/js/task-export.js',
        'src/js/plants.js'
    ],
    // logs.html  (logger.js + log-viewer.js appear before shared scripts in HTML;
    //  logger.js is duplicated in the HTML — we include it once at the top)
    'logs-bundle.js': [
        'src/js/logger.js',
        'src/js/log-viewer.js',
        'src/js/config.js',
        'src/js/security.js',
        'src/js/encryption.js',
        'src/js/rate-limiter.js',
        // logger.js already included above
        'src/js/error-handler.js',
        'src/js/api.js',
        'src/js/app.js',
        'src/js/task-state.js',
        'src/js/task-filters.js',
        'src/js/task-renderer.js',
        'src/js/task-events.js',
        'src/js/task-export.js'
    ],
    // login.html (minimal)
    'login-bundle.js': [
        'src/js/config.js',
        'src/js/app.js'
    ],
    // admin.html
    'admin-bundle.js': [
        ...sharedJs,
        'src/js/confirm-dialog.js',
        'src/js/app.js'
    ]
};

// ── Build ────────────────────────────────────────────────────────────

console.log('Building bundles...\n');
ensureDir(DIST);

// CSS
console.log('CSS bundles:');
for (const [name, files] of Object.entries(cssBundles)) {
    const content = files.map(readSource).join('\n');
    writeBundle(name, content);
}

// JS — concatenate with semicolons between files to avoid ASI issues
console.log('\nJS bundles:');
for (const [name, files] of Object.entries(jsBundles)) {
    const content = files.map(readSource).join('\n;\n');
    writeBundle(name, content);
}

// ── Summary ──────────────────────────────────────────────────────────

const allFiles = fs.readdirSync(DIST);
const totalSize = allFiles.reduce((sum, f) => {
    return sum + fs.statSync(path.join(DIST, f)).size;
}, 0);

console.log(`\nBuild complete: ${allFiles.length} files, ${(totalSize / 1024).toFixed(1)} KB total`);
