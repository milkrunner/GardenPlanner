const { logger } = require('../logger');

const GENERIC_MESSAGES = {
    400: 'Bad request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not found',
    409: 'Conflict',
    413: 'Request too large',
    429: 'Too many requests'
};

/**
 * Express error-handling middleware. Logs 5xx errors and returns JSON error responses.
 * In production, uses generic messages for all errors; in dev/test, passes through 4xx messages.
 * @param {Error & {status?: number}} err - Error object, optionally with an HTTP status
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 * @returns {void}
 */
function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    const isProduction = process.env.NODE_ENV === 'production';

    // Always log server errors with full context
    if (status >= 500) {
        logger.error({
            err: err.message,
            stack: err.stack,
            url: req.originalUrl,
            method: req.method,
            ip: req.ip
        }, 'unhandled error');
    }

    // In production, use generic messages for all errors
    // In development/test, pass through the original message for 4xx
    const message = (isProduction || status >= 500)
        ? (GENERIC_MESSAGES[status] || 'Internal server error')
        : (err.message || GENERIC_MESSAGES[status] || 'Internal server error');

    res.status(status).json({
        error: true,
        status,
        message
    });
}

module.exports = { errorHandler };
