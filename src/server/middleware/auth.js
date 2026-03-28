const crypto = require('crypto');
const { audit } = require('../logger');

const API_KEY = process.env.API_KEY || '';

// API key authentication for /api/* routes
function apiKeyAuth(req, res, next) {
    // Auth status endpoint is always accessible
    if (req.path === '/auth/status') {
        return next();
    }

    // No API key configured = no auth required
    if (!API_KEY) {
        return next();
    }

    // Require valid API key for all requests (timing-safe comparison)
    const providedKey = req.headers['x-api-key'];
    const keyBuffer = Buffer.from(API_KEY, 'utf8');
    const providedBuffer = Buffer.from(typeof providedKey === 'string' ? providedKey : '', 'utf8');
    const lengthMatch = keyBuffer.length === providedBuffer.length;
    const safeProvidedBuffer = lengthMatch ? providedBuffer : keyBuffer;
    if (!lengthMatch || !crypto.timingSafeEqual(keyBuffer, safeProvidedBuffer)) {
        audit('auth_failure', {
            ip: req.ip || req.connection.remoteAddress,
            path: req.originalUrl,
            method: req.method
        });
        return res.status(401).json({ error: 'Unauthorized. Provide a valid X-API-Key header.' });
    }
    next();
}

module.exports = { apiKeyAuth, API_KEY };
