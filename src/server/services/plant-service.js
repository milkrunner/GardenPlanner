const fs = require('fs');
const path = require('path');

const PLANTS_FILE = path.join(__dirname, '..', '..', '..', 'data', 'plants.json');
const DEFAULT_PLANTS_FILE = path.join(__dirname, '..', 'defaults', 'default-plants.json');

function loadDefaultPlants() {
    try {
        return JSON.parse(fs.readFileSync(DEFAULT_PLANTS_FILE, 'utf8'));
    } catch {
        return [];
    }
}

function readPlants() {
    try {
        if (fs.existsSync(PLANTS_FILE)) {
            return JSON.parse(fs.readFileSync(PLANTS_FILE, 'utf8'));
        }
    } catch { /* ignore */ }
    return loadDefaultPlants();
}

function listPlants(query) {
    let plants = readPlants();
    const category = typeof query.category === 'string' ? query.category.trim() : '';
    const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';

    if (category) {
        plants = plants.filter(p => p.category === category);
    }
    if (search) {
        plants = plants.filter(p =>
            p.name.toLowerCase().includes(search) ||
            p.category.toLowerCase().includes(search) ||
            p.tips.toLowerCase().includes(search)
        );
    }
    return plants;
}

function getPlant(id) {
    const plants = readPlants();
    return plants.find(p => p.id === id) || null;
}

function listCategories() {
    const plants = readPlants();
    return [...new Set(plants.map(p => p.category))].sort();
}

module.exports = { readPlants, listPlants, getPlant, listCategories };
