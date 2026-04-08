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
    ],
    'garden.css': [
        'src/css/styles.css',
        'src/css/garden.css'
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
    'src/js/api.js',
    'src/js/offline-store.js',
    'src/js/sync-manager.js',
    'src/js/offline-ui.js'
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
    ],
    // garden.html
    'garden-bundle.js': [
        'src/js/garden-planner.js',
        'src/js/offline-store.js',
        'src/js/sync-manager.js',
        'src/js/offline-ui.js'
    ]
};

// ── Page → bundle mapping (for HTML rewriting) ─────────────────────

const pageBundleMap = {
    'index':      { js: 'index-bundle.js',      css: 'styles.css' },
    'dashboard':  { js: 'dashboard-bundle.js',   css: 'styles.css' },
    'statistics': { js: 'statistics-bundle.js',   css: 'styles.css' },
    'plants':     { js: 'plants-bundle.js',       css: 'plants.css' },
    'logs':       { js: 'logs-bundle.js',         css: 'logs.css' },
    'login':      { js: 'login-bundle.js',        css: 'styles.css' },
    'admin':      { js: 'admin-bundle.js',        css: 'styles.css' },
    'garden':     { js: 'garden-bundle.js',       css: 'garden.css' },
};

// ── Build ────────────────────────────────────────────────────────────

console.log('Building bundles...\n');
ensureDir(DIST);
ensureDir(path.join(DIST, 'js'));
ensureDir(path.join(DIST, 'css'));

// CSS
console.log('CSS bundles:');
for (const [name, files] of Object.entries(cssBundles)) {
    const content = files.map(readSource).join('\n');
    writeBundle(path.join('css', name), content);
}

// JS — concatenate with semicolons between files to avoid ASI issues
console.log('\nJS bundles:');
for (const [name, files] of Object.entries(jsBundles)) {
    const content = files.map(readSource).join('\n;\n');
    writeBundle(path.join('js', name), content);
}

// Copy auth-check.js (loaded separately at top of body)
const authCheckContent = readSource('src/js/auth-check.js');
if (authCheckContent) writeBundle(path.join('js', 'auth-check.js'), authCheckContent);

// ── HTML processing ─────────────────────────────────────────────────
// Replace individual <script>/<link> tags with bundled references.

console.log('\nHTML pages:');
const publicDir = path.join(ROOT, 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

for (const file of htmlFiles) {
    const pageName = file.replace('.html', '');
    const mapping = pageBundleMap[pageName];
    if (!mapping) {
        // Unknown page — copy as-is
        const content = fs.readFileSync(path.join(publicDir, file), 'utf8');
        writeBundle(file, content);
        continue;
    }

    let html = fs.readFileSync(path.join(publicDir, file), 'utf8');

    // Replace CSS: ../src/css/styles.css (and page-specific CSS) → /dist/css/bundle.css
    html = html.replace(
        /\s*<link\s+rel="stylesheet"\s+href="\.\.\/src\/css\/[^"]+"\s*\/?>[ \t]*/g,
        ''
    );
    // Insert bundled CSS before </head>
    html = html.replace(
        '</head>',
        `    <link rel="stylesheet" href="/dist/css/${mapping.css}">\n  </head>`
    );

    // Replace JS: ../src/js/auth-check.js → /dist/js/auth-check.js
    html = html.replace(
        /(<script\s+src=")\.\.\/src\/js\/auth-check\.js(">\s*<\/script>)/g,
        '$1/dist/js/auth-check.js$2'
    );

    // Replace pwa-register.js path for production
    html = html.replace(
        /(<script\s+src=")\.\.\/src\/js\/pwa-register\.js(">\s*<\/script>)/g,
        '$1/dist/js/pwa-register.js$2'
    );

    // Replace all other ../src/js/*.js script tags with single bundle
    // Find the FIRST and LAST src/js script tag, replace the whole block
    const scriptPattern = /^[ \t]*<script\s+src="\.\.\/src\/js\/[^"]+"><\/script>[ \t]*\n?/gm;
    const matches = [...html.matchAll(scriptPattern)];
    if (matches.length > 0) {
        const firstIdx = matches[0].index;
        const lastMatch = matches[matches.length - 1];
        const lastIdx = lastMatch.index + lastMatch[0].length;
        const before = html.slice(0, firstIdx);
        const after = html.slice(lastIdx);
        html = before + `    <script src="/dist/js/${mapping.js}"></script>\n` + after;
    }

    writeBundle(file, html);
}

// Copy PWA files to dist/
console.log('\nPWA files:');
const pwaFiles = [
    { src: 'public/sw.js', dest: 'sw.js' },
    { src: 'public/manifest.json', dest: 'manifest.json' },
    { src: 'public/offline.html', dest: 'offline.html' }
];
for (const file of pwaFiles) {
    const content = readSource(file.src);
    if (content) writeBundle(file.dest, content);
}

// Copy icons directory
const iconsSourceDir = path.join(ROOT, 'public', 'icons');
if (fs.existsSync(iconsSourceDir)) {
    ensureDir(path.join(DIST, 'icons'));
    const iconFiles = fs.readdirSync(iconsSourceDir);
    for (const iconFile of iconFiles) {
        const content = fs.readFileSync(path.join(iconsSourceDir, iconFile));
        fs.writeFileSync(path.join(DIST, 'icons', iconFile), content);
        console.log(`  icons/${iconFile}`);
    }
}

// Copy vendor directory
const vendorSourceDir = path.join(ROOT, 'public', 'vendor');
if (fs.existsSync(vendorSourceDir)) {
    const copyDir = (src, dest) => {
        ensureDir(dest);
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                copyDir(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
                console.log(`  vendor/${entry.name}`);
            }
        }
    };
    copyDir(vendorSourceDir, path.join(DIST, 'vendor'));
}

// Copy pwa-register.js (loaded separately like auth-check.js)
const pwaRegisterContent = readSource('src/js/pwa-register.js');
if (pwaRegisterContent) writeBundle(path.join('js', 'pwa-register.js'), pwaRegisterContent);

// ── Summary ──────────────────────────────────────────────────────────

const countFiles = (dir) => {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...countFiles(full));
        else files.push(full);
    }
    return files;
};

const allFiles = countFiles(DIST);
const totalSize = allFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);

console.log(`\nBuild complete: ${allFiles.length} files, ${(totalSize / 1024).toFixed(1)} KB total`);
