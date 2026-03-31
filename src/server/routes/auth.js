/**
 * @module routes/auth
 * Express router for authentication status endpoints.
 * Exposes GET /auth/status to check whether API key auth is required.
 */

const express = require('express');
const router = express.Router();
const { API_KEY } = require('../middleware/auth');

// Auth status endpoint (always accessible, no auth required)
router.get('/status', (req, res) => {
    res.json({ authRequired: !!API_KEY });
});

module.exports = router;
