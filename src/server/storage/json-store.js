const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { STORAGE } = require('../config');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
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

// --- Storage helpers with file locking (#22) ---

const locks = new Map();

function acquireLock(file, timeout = STORAGE.LOCK_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        (function tryLock() {
            if (!locks.get(file)) {
                locks.set(file, true);
                return resolve();
            }
            if (Date.now() - start > timeout) {
                return reject(new Error(`Lock timeout for ${path.basename(file)}`));
            }
            setTimeout(tryLock, STORAGE.LOCK_POLL_INTERVAL_MS);
        })();
    });
}

function releaseLock(file) {
    locks.delete(file);
}

// --- In-memory cache ---
const cache = new Map();

function readJSON(file) {
    const cached = cache.get(file);
    if (cached !== undefined) return cached;
    try {
        const data = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(data);
        cache.set(file, parsed);
        return parsed;
    } catch {
        return [];
    }
}

async function writeJSON(file, data) {
    cache.set(file, data);
    const tmp = file + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    for (let attempt = 0; attempt < STORAGE.WRITE_MAX_RETRIES; attempt++) {
        try {
            await fsp.rename(tmp, file);
            return;
        } catch (err) {
            if (attempt === STORAGE.WRITE_MAX_RETRIES - 1 || err.code !== 'EPERM') throw err;
            await new Promise(resolve => setTimeout(resolve, STORAGE.WRITE_RETRY_DELAY_MS));
        }
    }
}

function resetCaches() {
    cache.clear();
}

function readTasks() { return readJSON(TASKS_FILE); }
async function writeTasks(tasks) { await writeJSON(TASKS_FILE, tasks); }
function readArchivedTasks() { return readJSON(ARCHIVED_FILE); }
async function writeArchivedTasks(tasks) { await writeJSON(ARCHIVED_FILE, tasks); }

async function withLockedTasks(fn) {
    await acquireLock(TASKS_FILE);
    try {
        const tasks = readTasks();
        const result = fn(tasks);
        if (result.tasks !== undefined) await writeTasks(result.tasks);
        return result;
    } finally {
        releaseLock(TASKS_FILE);
    }
}

async function withLockedArchive(fn) {
    await acquireLock(ARCHIVED_FILE);
    try {
        const tasks = readArchivedTasks();
        const result = fn(tasks);
        if (result.tasks !== undefined) await writeArchivedTasks(result.tasks);
        return result;
    } finally {
        releaseLock(ARCHIVED_FILE);
    }
}

module.exports = {
    DATA_DIR,
    TASKS_FILE,
    ARCHIVED_FILE,
    acquireLock,
    releaseLock,
    readJSON,
    writeJSON,
    resetCaches,
    readTasks,
    writeTasks,
    readArchivedTasks,
    writeArchivedTasks,
    withLockedTasks,
    withLockedArchive
};
