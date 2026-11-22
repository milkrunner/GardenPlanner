const fs = require('fs');
const path = require('path');

const { logger, audit } = require('../logger');
const { DATA_DIR, acquireLock, releaseLock, writeJSON } = require('../storage/json-store');
const {
    DEFAULT_ICON,
    validatePlant,
    sanitizePlantData,
    slugify,
    FIELDS,
    ID_REGEX,
} = require('../validation/plant-validator');

const PLANTS_FILE = path.join(DATA_DIR, 'plants.json');
const DEFAULT_PLANTS_FILE = path.join(__dirname, '..', 'defaults', 'default-plants.json');

// --- Reading ---
//
// The library lives in DATA_DIR/plants.json. Without that file the built-in defaults apply. Reading is
// deliberately forgiving so the plant page keeps working: a damaged plants.json (not parsable, or not an
// array) falls back to the defaults and logs a warning, once per damage episode. Writing is deliberately
// strict: a damaged file is never overwritten (see withLockedPlants), the operator has to repair or delete it.

function loadDefaultPlants() {
    try {
        return JSON.parse(fs.readFileSync(DEFAULT_PLANTS_FILE, 'utf8'));
    } catch (err) {
        logger.error({ file: DEFAULT_PLANTS_FILE, err: err.message }, 'Default plants could not be loaded');
        return [];
    }
}

// Returns the parsed custom library, or null when there is no file. Throws for unreadable or invalid files.
function readCustomPlants() {
    let raw;
    try {
        raw = fs.readFileSync(PLANTS_FILE, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('plants.json must contain a JSON array');
    return parsed;
}

let warnedAboutDamagedFile = false;

function readPlants() {
    try {
        const custom = readCustomPlants();
        warnedAboutDamagedFile = false;
        return custom || loadDefaultPlants();
    } catch (err) {
        if (!warnedAboutDamagedFile) {
            warnedAboutDamagedFile = true;
            logger.warn(
                { file: PLANTS_FILE, err: err.message },
                'plants.json is unreadable or invalid: serving the built-in default plants. ' +
                    'Repair or delete the file to resolve this; plant changes are refused until then.',
            );
        }
        return loadDefaultPlants();
    }
}

function listPlants(query) {
    let plants = readPlants();
    const category = typeof query.category === 'string' ? query.category.trim() : '';
    const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';

    if (category) {
        plants = plants.filter((p) => p.category === category);
    }
    if (search) {
        const matches = (value) => typeof value === 'string' && value.toLowerCase().includes(search);
        plants = plants.filter((p) => matches(p.name) || matches(p.category) || matches(p.tips));
    }
    return plants;
}

function getPlant(id) {
    const plants = readPlants();
    return plants.find((p) => p.id === id) || null;
}

function listCategories() {
    const plants = readPlants();
    return [...new Set(plants.map((p) => p.category).filter((c) => typeof c === 'string'))].sort();
}

// --- Writing ---

// Runs fn(plants) under the plants.json lock. On the first write the defaults become the custom library
// (the repository defaults stay untouched). fn returns { plants } to persist or anything else to skip writing.
// A damaged plants.json raises (HTTP 500) instead of being replaced by the defaults.
async function withLockedPlants(fn) {
    await acquireLock(PLANTS_FILE);
    try {
        const custom = readCustomPlants();
        const initialized = custom === null;
        const plants = custom || loadDefaultPlants();
        const previousCount = plants.length;
        const result = fn(plants);
        if (result.plants !== undefined) {
            await writeJSON(PLANTS_FILE, result.plants);
            if (initialized) audit('plant_library_initialized', { source: 'defaults', count: previousCount });
        }
        return result;
    } finally {
        releaseLock(PLANTS_FILE);
    }
}

function buildPlant(id, sanitized) {
    return {
        id,
        name: sanitized.name,
        category: sanitized.category,
        icon: sanitized.icon || DEFAULT_ICON,
        difficulty: sanitized.difficulty || 'medium',
        sun: sanitized.sun || 'full',
        water: sanitized.water || 'medium',
        season: sanitized.season || [],
        sowMonths: sanitized.sowMonths || [],
        spacing: sanitized.spacing || '',
        germination: sanitized.germination || '',
        harvest: sanitized.harvest || '',
        companions: sanitized.companions || [],
        avoid: sanitized.avoid || [],
        tips: sanitized.tips || '',
    };
}

async function createPlant(body) {
    const validation = validatePlant(body, { allowId: true });
    if (!validation.valid) {
        return { error: true, status: 400, errors: validation.errors };
    }

    const sanitized = sanitizePlantData(body);
    const id = body.id !== undefined ? body.id : slugify(sanitized.name);
    if (!ID_REGEX.test(id)) {
        return {
            error: true,
            status: 400,
            errors: ['Aus dem Namen lässt sich keine ID ableiten, bitte eine ID (Slug) angeben'],
        };
    }
    const plant = buildPlant(id, sanitized);

    const result = await withLockedPlants((plants) => {
        if (plants.some((p) => p.id === id)) return { duplicate: true };
        plants.push(plant);
        return { plants };
    });

    if (result.duplicate) {
        return { error: true, status: 409, message: `Plant with ID "${id}" already exists` };
    }

    audit('plant_created', { plantId: plant.id, name: plant.name, category: plant.category });
    return { error: false, plant };
}

async function updatePlant(id, body) {
    const validation = validatePlant(body, { partial: true });
    if (!validation.valid) {
        return { error: true, status: 400, errors: validation.errors };
    }
    if (body.id !== undefined && body.id !== id) {
        return { error: true, status: 400, errors: ['Die ID einer Pflanze kann nicht geändert werden'] };
    }

    const sanitized = sanitizePlantData(body);
    const result = await withLockedPlants((plants) => {
        const index = plants.findIndex((p) => p.id === id);
        if (index === -1) return { notFound: true };

        const plant = { ...plants[index] };
        const changes = FIELDS.filter(
            (field) =>
                sanitized[field] !== undefined && JSON.stringify(sanitized[field]) !== JSON.stringify(plant[field]),
        );
        if (changes.length === 0) return { plant };

        changes.forEach((field) => {
            plant[field] = sanitized[field];
        });
        plants[index] = plant;
        return { plants, plant, changes };
    });

    if (result.notFound) return { error: true, status: 404, message: 'Plant not found' };

    if (result.changes) audit('plant_updated', { plantId: id, changes: result.changes });
    return { error: false, plant: result.plant };
}

async function deletePlant(id) {
    const result = await withLockedPlants((plants) => {
        const index = plants.findIndex((p) => p.id === id);
        if (index === -1) return { notFound: true };
        const deletedPlant = plants.splice(index, 1)[0];
        return { plants, deletedPlant };
    });

    if (result.notFound) return { error: true, status: 404, message: 'Plant not found' };

    audit('plant_deleted', { plantId: result.deletedPlant.id, name: result.deletedPlant.name });
    return { error: false };
}

module.exports = {
    PLANTS_FILE,
    readPlants,
    listPlants,
    getPlant,
    listCategories,
    createPlant,
    updatePlant,
    deletePlant,
};
