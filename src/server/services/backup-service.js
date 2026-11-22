const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { audit, logger } = require('../logger');
const { FORMAT_VERSION, validateBundle } = require('../validation/backup-validator');
const {
    DATA_DIR,
    TASKS_FILE,
    ARCHIVED_FILE,
    acquireLock,
    releaseLock,
    readTasks,
    readArchivedTasks,
    writeTasks,
    writeArchivedTasks,
    writeJSON,
    withLockedTasksAndArchive,
} = require('../storage/json-store');
const { PLANTS_FILE, readPlants } = require('./plant-service');

const MODES = ['create', 'merge', 'replace'];

// Raw file content or null when the file does not exist. Other read errors are thrown (HTTP 500).
function readRaw(file) {
    try {
        return fs.readFileSync(file, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

function parsePlants(raw) {
    if (raw === null) return null;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

// Export: one consistent snapshot of tasks and archive (both locks held, so a running archive operation
// cannot be seen half-done). `plants` is only set when the instance has its own plants.json.
async function exportData() {
    return withLockedTasksAndArchive(async () => {
        const bundle = {
            formatVersion: FORMAT_VERSION,
            app: 'gartenplaner',
            exportedAt: new Date().toISOString(),
            tasks: [...readTasks()],
            archivedTasks: [...readArchivedTasks()],
            plants: parsePlants(readRaw(PLANTS_FILE)),
        };
        audit('data_exported', {
            tasks: bundle.tasks.length,
            archivedTasks: bundle.archivedTasks.length,
            customPlants: bundle.plants ? bundle.plants.length : 0,
        });
        return bundle;
    });
}

// Copies the current files into DATA_DIR/backups/<name>/ and returns that relative path.
async function backupFiles(files) {
    const name = `import-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
    const dir = path.join(DATA_DIR, 'backups', name);
    await fsp.mkdir(dir, { recursive: true });
    for (const file of files) {
        try {
            await fsp.copyFile(file, path.join(dir, path.basename(file)), fs.constants.COPYFILE_EXCL);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
    }
    return path.posix.join('backups', name);
}

function conflict(message, reason) {
    audit('data_import_rejected', { reason });
    return { error: true, status: 409, errors: [message] };
}

const ids = (list) => list.map((item) => item.id);

// Decides what ends up on disk. Returns { next: {tasks, archivedTasks, plants} (undefined = untouched),
// skipped } or a conflict result.
function plan(mode, bundle, current) {
    const skipped = { tasks: [], archivedTasks: [], plants: [] };
    const everything = () => ({
        next: { tasks: bundle.tasks, archivedTasks: bundle.archivedTasks, plants: bundle.plants },
        skipped,
        imported: {
            tasks: bundle.tasks.length,
            archivedTasks: bundle.archivedTasks.length,
            plants: bundle.plants ? bundle.plants.length : 0,
        },
    });
    if (mode === 'create') {
        const occupied = current.tasks.length > 0 || current.archivedTasks.length > 0;
        if (occupied || (bundle.plants && current.plantsRaw !== null)) {
            return conflict(
                'Die Zielinstanz ist nicht leer. Import überschreibt nie unbemerkt: mode=merge ergänzt fehlende ' +
                    'Einträge, mode=replace&confirm=replace ersetzt alles (mit automatischer Sicherung).',
                'target_not_empty',
            );
        }
        return everything();
    }
    if (mode === 'replace') return everything();

    // merge: existing IDs (tasks and archive) are kept and reported, only new ones are added.
    const known = new Set([...ids(current.tasks), ...ids(current.archivedTasks)].map((id) => String(id).toLowerCase()));
    const pick = (list, key) => {
        const added = [];
        for (const item of list) {
            if (known.has(item.id.toLowerCase())) skipped[key].push(item.id);
            else added.push(item);
        }
        return added;
    };
    const addedTasks = pick(bundle.tasks, 'tasks');
    const addedArchived = pick(bundle.archivedTasks, 'archivedTasks');
    const next = {};
    if (addedTasks.length) next.tasks = [...current.tasks, ...addedTasks];
    if (addedArchived.length) next.archivedTasks = [...current.archivedTasks, ...addedArchived];

    let plantsAdded = 0;
    if (bundle.plants) {
        if (current.plantsRaw !== null && parsePlants(current.plantsRaw) === null) {
            return conflict(
                'plants.json der Zielinstanz ist nicht lesbar und würde überschrieben: mode=replace&confirm=replace ' +
                    'sichert die alte Datei vorher.',
                'plants_unreadable',
            );
        }
        const base = readPlants();
        const have = new Set(base.map((plant) => plant.id));
        const addedPlants = bundle.plants.filter((plant) => {
            if (have.has(plant.id)) skipped.plants.push(plant.id);
            return !have.has(plant.id);
        });
        plantsAdded = addedPlants.length;
        if (plantsAdded) next.plants = [...base, ...addedPlants];
    }
    return {
        next,
        skipped,
        imported: {
            tasks: addedTasks.length,
            archivedTasks: addedArchived.length,
            plants: plantsAdded,
        },
    };
}

// Writes the planned files. If a later write fails, the files already written are restored, so a partial
// import is not left behind (the data was validated beforehand; this covers I/O failures).
async function writeAll(next, current) {
    const restore = [];
    try {
        if (next.tasks) {
            restore.push(() => writeTasks(current.tasks));
            await writeTasks(next.tasks);
        }
        if (next.archivedTasks) {
            restore.push(() => writeArchivedTasks(current.archivedTasks));
            await writeArchivedTasks(next.archivedTasks);
        }
        if (next.plants) {
            restore.push(() =>
                current.plantsRaw === null
                    ? fsp.rm(PLANTS_FILE, { force: true })
                    : fsp.writeFile(PLANTS_FILE, current.plantsRaw, 'utf8'),
            );
            await writeJSON(PLANTS_FILE, next.plants);
        }
    } catch (err) {
        for (const undo of restore.reverse()) {
            await undo().catch((undoErr) => logger.error({ err: undoErr.message }, 'import rollback failed'));
        }
        throw err;
    }
}

// Import under the tasks and archive locks (fixed order) and the plants lock. Everything is validated before
// the first byte is written; the result is all-or-nothing.
async function importData(body, mode = 'create') {
    if (!MODES.includes(mode)) throw new Error(`Unknown import mode: ${mode}`);
    const checked = validateBundle(body);
    if (!checked.ok) {
        audit('data_import_rejected', { reason: 'invalid_bundle', mode, status: checked.status });
        return { error: true, status: checked.status, errors: checked.errors };
    }
    const { bundle } = checked;

    return withLockedTasksAndArchive(async () => {
        await acquireLock(PLANTS_FILE);
        try {
            const current = {
                tasks: readTasks(),
                archivedTasks: readArchivedTasks(),
                plantsRaw: readRaw(PLANTS_FILE),
            };
            const planned = plan(mode, bundle, current);
            if (planned.error) return planned;

            let backup = null;
            if (mode === 'replace') {
                const files = [TASKS_FILE, ARCHIVED_FILE];
                if (bundle.plants) files.push(PLANTS_FILE);
                backup = await backupFiles(files);
            }
            await writeAll(planned.next, current);

            const { imported } = planned;
            audit('data_imported', {
                mode,
                imported,
                skipped: {
                    tasks: planned.skipped.tasks.length,
                    archivedTasks: planned.skipped.archivedTasks.length,
                    plants: planned.skipped.plants.length,
                },
                backup,
            });
            return { error: false, result: { mode, imported, skipped: planned.skipped, backup } };
        } finally {
            releaseLock(PLANTS_FILE);
        }
    });
}

module.exports = { MODES, exportData, importData };
