const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/async-handler');
const { listPlants, getPlant, createPlant, updatePlant, deletePlant } = require('../services/plant-service');

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

// Shared error mapping: validation problems are {errors: [...]}, everything else {error: message}
function sendFailure(res, result) {
    if (result.status === 400) return res.status(400).json({ errors: result.errors });
    return res.status(result.status).json({ error: result.message });
}

// POST /api/plants - Create a plant
router.post(
    '/',
    asyncHandler(async (req, res) => {
        const result = await createPlant(req.body);
        if (result.error) return sendFailure(res, result);
        res.status(201).json(result.plant);
    }),
);

// PUT /api/plants/:id - Update a plant (only the sent fields change)
router.put(
    '/:id',
    asyncHandler(async (req, res) => {
        const result = await updatePlant(req.params.id, req.body);
        if (result.error) return sendFailure(res, result);
        res.json(result.plant);
    }),
);

// DELETE /api/plants/:id - Delete a plant
router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
        const result = await deletePlant(req.params.id);
        if (result.error) return sendFailure(res, result);
        res.status(204).send();
    }),
);

module.exports = router;
