const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '..', '..', '..', 'data');
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

function acquireLock(file, timeout = 5000) {
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
            setTimeout(tryLock, 10);
        })();
    });
}

function releaseLock(file) {
    locks.delete(file);
}

// --- In-memory cache ---
const cache = new Map();

// A missing file is an empty collection. Any other failure (corrupt JSON, EIO, EACCES) is thrown:
// treating it as "empty" would let the next write silently overwrite the unreadable data.
function readJSON(file) {
    const cached = cache.get(file);
    if (cached !== undefined) return cached;
    let data;
    try {
        data = fs.readFileSync(file, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    const parsed = JSON.parse(data);
    cache.set(file, parsed);
    return parsed;
}

async function writeJSON(file, data) {
    cache.set(file, data);
    const tmp = file + '.tmp';
    try {
        await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await fsp.rename(tmp, file);
                return;
            } catch (err) {
                if (attempt === 2 || err.code !== 'EPERM') throw err;
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
    } catch (err) {
        // The cached (and in-place mutated) data was never persisted: drop it so the next read
        // reflects what is really on disk, and do not leave a stale temp file behind.
        cache.delete(file);
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw err;
    }
}

function resetCaches() {
    cache.clear();
}

function readTasks() {
    return readJSON(TASKS_FILE);
}
async function writeTasks(tasks) {
    await writeJSON(TASKS_FILE, tasks);
}
function readArchivedTasks() {
    return readJSON(ARCHIVED_FILE);
}
async function writeArchivedTasks(tasks) {
    await writeJSON(ARCHIVED_FILE, tasks);
}

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

// Lock several files in one fixed order (tasks, then archive) so that concurrent operations on both
// files (archive/unarchive) can never wait on each other. Locks are always released again, even when
// acquiring the second one times out.
async function withLockedTasksAndArchive(fn) {
    await acquireLock(TASKS_FILE);
    try {
        await acquireLock(ARCHIVED_FILE);
        try {
            return await fn();
        } finally {
            releaseLock(ARCHIVED_FILE);
        }
    } finally {
        releaseLock(TASKS_FILE);
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
    withLockedArchive,
    withLockedTasksAndArchive,
};
