const pino = require('pino');
const path = require('path');
const fs = require('fs');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', '..', 'data', 'logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const MAX_LOG_SIZE = parseInt(process.env.MAX_LOG_SIZE, 10) || 10 * 1024 * 1024; // 10MB

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFile = path.join(LOG_DIR, 'server.log');
const auditFile = path.join(LOG_DIR, 'audit.log');

// Rotate log file if it exceeds MAX_LOG_SIZE
function rotateIfNeeded(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size >= MAX_LOG_SIZE) {
                const rotated = filePath + '.' + new Date().toISOString().replace(/[:.]/g, '-');
                fs.renameSync(filePath, rotated);

                // Keep only last 5 rotated files
                const dir = path.dirname(filePath);
                const base = path.basename(filePath);
                const rotatedFiles = fs.readdirSync(dir)
                    .filter(f => f.startsWith(base + '.'))
                    .sort()
                    .reverse();

                for (const old of rotatedFiles.slice(5)) {
                    fs.unlinkSync(path.join(dir, old));
                }
            }
        }
    } catch (err) {
        console.error('Log rotation failed:', err.message);
    }
}

rotateIfNeeded(logFile);
rotateIfNeeded(auditFile);

// Main application logger
// Production: JSON to stdout (default pino) + file; Dev: pino-pretty + file; Test: no transport
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

let transport;
if (isTest) {
    transport = undefined;
} else if (isProduction) {
    // In production, only use file transport — pino's default stdout produces compact JSON
    transport = pino.transport({
        targets: [
            {
                target: 'pino/file',
                options: { destination: logFile, mkdir: true },
                level: LOG_LEVEL
            },
            {
                target: 'pino/file',
                options: { destination: 1 },
                level: LOG_LEVEL
            }
        ]
    });
} else {
    // Development: pino-pretty for console + file
    transport = pino.transport({
        targets: [
            {
                target: 'pino/file',
                options: { destination: logFile, mkdir: true },
                level: LOG_LEVEL
            },
            {
                target: 'pino-pretty',
                options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss' },
                level: LOG_LEVEL
            }
        ]
    });
}

const logger = pino({ level: LOG_LEVEL }, transport);

// Audit logger - separate file for security/data events
const auditTransport = process.env.NODE_ENV === 'test'
    ? undefined
    : pino.transport({
        target: 'pino/file',
        options: { destination: auditFile, mkdir: true }
    });

const auditLogger = pino({ level: 'info' }, auditTransport);

/**
 * Write a structured audit log entry to the audit log file.
 * @param {string} event - Audit event name (e.g. 'task_created', 'auth_failure')
 * @param {Object} [details={}] - Additional context for the event
 * @returns {void}
 */
function audit(event, details = {}) {
    auditLogger.info({
        event,
        ...details,
        timestamp: new Date().toISOString()
    });
}

/**
 * Express middleware that logs each request with method, URL, status, duration, and IP.
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 * @returns {void}
 */
function requestLogger(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: duration + 'ms',
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent') || '-'
        };

        if (res.statusCode >= 500) {
            logger.error(logData, 'request error');
        } else if (res.statusCode >= 400) {
            logger.warn(logData, 'request warning');
        } else {
            logger.info(logData, 'request');
        }
    });

    next();
}

module.exports = { logger, audit, requestLogger, LOG_DIR };
