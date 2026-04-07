/**
 * @module storage/json-store
 * JSON file-based storage with in-memory caching, file locking, and atomic writes.
 */

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

/**
 * Acquire an in-memory lock for a given file path. Polls until the lock is available or times out.
 * @param {string} file - Absolute file path to lock on
 * @param {number} [timeout=STORAGE.LOCK_TIMEOUT_MS] - Max wait time in milliseconds
 * @returns {Promise<void>} Resolves when lock is acquired
 * @throws {Error} If lock acquisition times out
 */
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

/**
 * Release an in-memory lock for a given file path.
 * @param {string} file - Absolute file path to unlock
 * @returns {void}
 */
function releaseLock(file) {
    locks.delete(file);
}

// --- In-memory cache ---
const cache = new Map();

/**
 * Read and parse a JSON file, returning cached data if available.
 * @param {string} file - Absolute file path
 * @returns {Array|Object} Parsed JSON data, or empty array on read/parse error
 */
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

/**
 * Atomically write data to a JSON file (write to .tmp then rename). Updates cache.
 * @param {string} file - Absolute file path
 * @param {Array|Object} data - Data to serialize as JSON
 * @returns {Promise<void>}
 * @throws {Error} If write or rename fails after retries
 */
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

/**
 * Clear all in-memory caches. Useful for test isolation.
 * @returns {void}
 */
function resetCaches() {
    cache.clear();
}

/** @returns {Array} Active tasks array */
function readTasks() { return readJSON(TASKS_FILE); }

/**
 * @param {Array} tasks - Tasks array to persist
 * @returns {Promise<void>}
 */
async function writeTasks(tasks) { await writeJSON(TASKS_FILE, tasks); }

/** @returns {Array} Archived tasks array */
function readArchivedTasks() { return readJSON(ARCHIVED_FILE); }

/**
 * @param {Array} tasks - Archived tasks array to persist
 * @returns {Promise<void>}
 */
async function writeArchivedTasks(tasks) { await writeJSON(ARCHIVED_FILE, tasks); }

/**
 * Execute a function with exclusive lock on the tasks file. Automatically reads, writes, and unlocks.
 * @param {function(Array): {tasks: Array|undefined, [key: string]: *}} fn - Callback receiving current tasks; return {tasks} to persist changes
 * @returns {Promise<Object>} The result object returned by fn
 */
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

/**
 * Execute a function with exclusive lock on the archived tasks file. Automatically reads, writes, and unlocks.
 * @param {function(Array): {tasks: Array|undefined, [key: string]: *}} fn - Callback receiving current archived tasks; return {tasks} to persist changes
 * @returns {Promise<Object>} The result object returned by fn
 */
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
