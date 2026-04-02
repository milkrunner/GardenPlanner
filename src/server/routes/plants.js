/**
 * @module routes/plants
 * Express router for plant data endpoints under /api/plants.
 * Supports listing plants with optional category/search filters and fetching individual plants.
 */

const express = require('express');
const router = express.Router();
const { listPlants, getPlant, listCategories } = require('../services/plant-service');

// GET /api/plants - List all plants, optional ?category=&search=
router.get('/', (req, res) => {
    res.json(listPlants(req.query));
});

// GET /api/plants/:id - Get single plant
router.get('/:id', (req, res) => {
    const plant = getPlant(req.params.id);
    if (!plant) return res.status(404).json({ error: 'Plant not found' });
    res.json(plant);
});

module.exports = router;
