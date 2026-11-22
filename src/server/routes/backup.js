const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/async-handler');
const { MODES, exportData, importData } = require('../services/backup-service');

// Import bundles may be larger than the global 100 kB body limit. The limit is raised for this one route only
// (app.js skips the global parser for it), and the parser runs after authentication and the rate limiter.
const IMPORT_BODY_LIMIT = '5mb';

// GET /api/export - Download all tasks, archived tasks and custom plants as one JSON bundle
router.get(
    '/export',
    asyncHandler(async (req, res) => {
        const bundle = await exportData();
        res.set('Cache-Control', 'no-store');
        res.set(
            'Content-Disposition',
            `attachment; filename="gartenplaner-export-${bundle.exportedAt.slice(0, 10)}.json"`,
        );
        res.json(bundle);
    }),
);

// POST /api/import - Import a bundle. Default: only into an empty instance (409 otherwise).
// ?mode=merge adds missing IDs and reports skipped ones; ?mode=replace&confirm=replace replaces everything
// after an automatic backup in DATA_DIR/backups/.
router.post(
    '/import',
    express.json({ limit: IMPORT_BODY_LIMIT }),
    asyncHandler(async (req, res) => {
        const { mode = 'create', confirm } = req.query;
        if (typeof mode !== 'string' || !MODES.includes(mode) || req.query.mode === 'create') {
            return res
                .status(400)
                .json({ error: 'Invalid mode. Use mode=merge or mode=replace (default: empty instance only).' });
        }
        if (mode === 'replace' && confirm !== 'replace') {
            return res
                .status(400)
                .json({ error: 'mode=replace overwrites all data. Confirm explicitly with confirm=replace.' });
        }
        const result = await importData(req.body, mode);
        if (result.error) {
            return res.status(result.status).json({ errors: result.errors });
        }
        res.json(result.result);
    }),
);

module.exports = router;
