const { logger } = require('../logger');

// --- Global error handler ---
function errorHandler(err, req, res, next) {
    // Let Express-generated HTTP errors (e.g., 413 Payload Too Large) pass through with their status
    if (err.status && err.status < 500) {
        return res.status(err.status).json({ error: err.message });
    }
    logger.error({ err: err.message, url: req.originalUrl, method: req.method }, 'unhandled error');
    res.status(500).json({ error: 'Internal server error' });
}

module.exports = { errorHandler };
