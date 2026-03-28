const { app, validateTask, escapeHtml, sanitizeTaskData, paginate, resetCaches } = require('./src/server/app');
const { logger, audit } = require('./src/server/logger');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';

// --- Start server ---

if (require.main === module) {
    const server = app.listen(PORT, () => {
        logger.info({ port: PORT, auth: !!API_KEY }, 'Gartenplaner API started');
        audit('server_started', { port: PORT, authEnabled: !!API_KEY });
        if (!API_KEY) {
            logger.warn('No API_KEY set. API is open for all requests.');
        }
    });

    function shutdown(signal) {
        logger.info({ signal }, 'shutting down gracefully');
        server.close(() => {
            logger.info('all connections closed');
            process.exit(0);
        });
        setTimeout(() => {
            logger.error('forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, validateTask, escapeHtml, sanitizeTaskData, paginate, resetCaches };
