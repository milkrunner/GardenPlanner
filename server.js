const { app } = require('./src/server/app');
const { logger, audit } = require('./src/server/logger');
const { migrate } = require('./scripts/migrate');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '';

if (require.main === module) {
    if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
        process.stderr.write('\u26a0\ufe0f  WARNUNG: JWT_SECRET ist nicht gesetzt \u2014 Authentifizierung ist deaktiviert!\n');
    }

    migrate().then(() => {
        const server = app.listen(PORT, () => {
            logger.info({ port: PORT, auth: !!JWT_SECRET }, 'Gartenplaner API started');
            audit('server_started', { port: PORT, authEnabled: !!JWT_SECRET });
            if (!JWT_SECRET) {
                logger.warn('No JWT_SECRET set. Authentication is disabled.');
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
    }).catch(err => {
        logger.error({ err: String(err), stack: err.stack }, 'Migration failed, cannot start');
        process.exit(1);
    });
}

module.exports = { app };
