/**
 * @module middleware/api-deprecation
 * Middleware that marks legacy /api/* requests (without /v1/) as deprecated.
 *
 * Adds response headers:
 *   Deprecation: true
 *   Sunset: 2026-12-31T23:59:59Z
 *   Link: </api/v1/*>; rel="successor-version"
 *
 * Also logs a warning so operators can track legacy usage.
 * The request is still handled normally (same route handlers) — this is
 * purely additive so existing clients keep working during the migration window.
 */

const { logger } = require('../logger');

const SUNSET_DATE = '2026-12-31T23:59:59Z';

/**
 * Express middleware that sets deprecation headers on legacy /api/* requests.
 * Mount this on the /api path *before* the route handlers.
 *
 * When mounted via app.use('/api', apiDeprecation), Express strips the /api
 * prefix so req.path starts with '/'. Requests to /api/v1/* arrive here with
 * req.path === '/v1/...' — those are the canonical paths and must be skipped.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function apiDeprecation(req, res, next) {
    // Skip canonical /api/v1/* requests — they are NOT deprecated
    if (req.path.startsWith('/v1/') || req.path === '/v1') {
        return next();
    }

    const v1Path = '/api/v1' + req.path;

    res.set('Deprecation', 'true');
    res.set('Sunset', SUNSET_DATE);
    res.set('Link', `<${v1Path}>; rel="successor-version"`);

    logger.warn({
        msg: 'Deprecated API path used — migrate to /api/v1/',
        deprecatedPath: req.originalUrl,
        canonicalPath: v1Path,
        ip: req.ip,
        method: req.method,
    });

    next();
}

module.exports = { apiDeprecation, SUNSET_DATE };
