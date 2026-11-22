const {
  app,
  validateTask,
  escapeHtml,
  sanitizeTaskData,
  paginate,
  resetCaches,
} = require('./src/server/app');
const { logger, audit } = require('./src/server/logger');
const {
  repairArchiveDuplicates,
} = require('./src/server/services/task-service');
const { checkStartupConfig } = require('./src/server/config');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';

// --- Start server ---

if (require.main === module) {
  const config = checkStartupConfig();
  if (!config.ok) {
    // stderr directly: the pino worker transport may not flush before exit
    console.error(`FATAL: ${config.error}`);
    process.exit(1);
  }

  let server;
  // #339: a crash or failed write during archive/unarchive can leave one task in both files.
  // Repair before accepting requests; a storage error here must not block start (it surfaces per request).
  repairArchiveDuplicates()
    .catch((err) => {
      logger.error({ err: err.message }, 'archive duplicate repair failed');
    })
    .then(() => {
      server = app.listen(PORT, () => {
        logger.info(
          { port: PORT, auth: !!API_KEY, trustProxy: app.get('trust proxy') },
          'Gartenplaner API started',
        );
        audit('server_started', { port: PORT, authEnabled: !!API_KEY });
        if (config.warning) {
          logger.warn(config.warning);
        }
      });
    });

  function shutdown(signal) {
    logger.info({ signal }, 'shutting down gracefully');
    if (!server) process.exit(0);
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

module.exports = {
  app,
  validateTask,
  escapeHtml,
  sanitizeTaskData,
  paginate,
  resetCaches,
};
