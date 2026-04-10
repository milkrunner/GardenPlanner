/**
 * @module routes/gardens
 * Express router for garden CRUD endpoints under /api/v1/gardens (#251).
 */

const express = require('express');
const router = express.Router();
const {
    listGardens,
    getGarden,
    createGarden,
    updateGarden,
    deleteGarden,
    exportGarden,
    importGarden
} = require('../services/garden-service');

// Middleware: Pruefe ob User authentifiziert ist
function requireUser(req, res, next) {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: true, status: 401, message: 'Authentifizierung erforderlich' });
    }
    next();
}

// GET /api/v1/gardens - Alle Gaerten des Users auflisten
router.get('/', requireUser, async (req, res) => {
    try {
        const gardens = await listGardens(req.user.id);
        res.json(gardens);
    } catch (err) {
        res.status(500).json({ error: true, status: 500, message: 'Fehler beim Laden der Gaerten' });
    }
});

// GET /api/v1/gardens/:id - Einzelnen Garten laden
router.get('/:id', requireUser, async (req, res) => {
    try {
        const garden = await getGarden(req.params.id, req.user.id);
        if (!garden) {
            return res.status(404).json({ error: true, status: 404, message: 'Garten nicht gefunden' });
        }
        res.json(garden);
    } catch (err) {
        res.status(500).json({ error: true, status: 500, message: 'Fehler beim Laden des Gartens' });
    }
});

// POST /api/v1/gardens - Neuen Garten erstellen
router.post('/', requireUser, async (req, res) => {
    try {
        const result = await createGarden(req.user.id, req.body);
        if (result.error) {
            return res.status(result.status).json({ error: true, status: result.status, errors: result.errors });
        }
        res.status(201).json(result.garden);
    } catch (err) {
        res.status(500).json({ error: true, status: 500, message: 'Fehler beim Erstellen des Gartens' });
    }
});

// PUT /api/v1/gardens/:id - Garten aktualisieren
router.put('/:id', requireUser, async (req, res) => {
    try {
        const result = await updateGarden(req.params.id, req.user.id, req.body);
        if (result.error) {
            return res.status(result.status).json({ error: true, status: result.status, message: result.message });
        }
        res.json(result.garden);
    } catch (err) {
        res.status(500).json({ error: true, status: 500, message: 'Fehler beim Aktualisieren des Gartens' });
    }
});

// DELETE /api/v1/gardens/:id - Garten loeschen
router.delete('/:id', requireUser, async (req, res) => {
    try {
        const result = await deleteGarden(req.params.id, req.user.id);
        if (result.error) {
            return res.status(result.status).json({ error: true, status: result.status, message: result.message });
        }
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: true, status: 500, message: 'Fehler beim Loeschen des Gartens' });
    }
});

// GET /api/v1/gardens/:id/export - Garten als JSON exportieren
router.get('/:id/export', requireUser, async (req, res) => {
    try {
        const garden = await exportGarden(req.params.id, req.user.id);
        if (!garden) {
            return res.status(404).json({ error: true, status: 404, message: 'Garten nicht gefunden' });
        }
        res.setHeader('Content-Disposition', 'attachment; filename="' + (garden.name || 'garten') + '.json"');
        res.json({ name: garden.name, data: garden.data });
    } catch (err) {
        res.status(500).json({ error: true, status: 500, message: 'Fehler beim Exportieren' });
    }
});

// POST /api/v1/gardens/import - Garten aus JSON importieren
router.post('/import', requireUser, async (req, res) => {
    try {
        const result = await importGarden(req.user.id, req.body);
        if (result.error) {
            return res.status(result.status).json({ error: true, status: result.status, errors: result.errors });
        }
        res.status(201).json(result.garden);
    } catch (err) {
        res.status(500).json({ error: true, status: 500, message: 'Fehler beim Importieren' });
    }
});

module.exports = router;
