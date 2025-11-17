/**
 * Gartenplaner - Logging System
 * Umfassendes Logging für Fehler-Tracking, Debug und Performance-Monitoring
 */

class Logger {
    constructor(config = {}) {
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
            CRITICAL: 4
        };

        this.config = {
            minLevel: config.minLevel || this.levels.INFO,
            maxLogs: config.maxLogs || 1000,
            persistLogs: config.persistLogs !== false,
            storageKey: config.storageKey || '_gartenplaner_logs',
            consoleOutput: config.consoleOutput !== false,
            includeStackTrace: config.includeStackTrace !== false,
            timestampFormat: config.timestampFormat || 'ISO', // ISO, locale, timestamp
            categories: config.categories || ['app', 'security', 'storage', 'encryption', 'rate-limit', 'performance']
        };

        this.logs = [];
        this.listeners = new Map();
        this.performanceMarks = new Map();
        
        // Lade gespeicherte Logs
        this.loadLogs();
        
        // Auto-Cleanup alle 5 Minuten
        this.startAutoCleanup();
        
        console.log('📊 Logger initialisiert - Level:', Object.keys(this.levels)[this.config.minLevel]);
    }

    // Log-Methoden für verschiedene Levels
    debug(message, category = 'app', context = {}) {
        this._log(this.levels.DEBUG, 'DEBUG', message, category, context);
    }

    info(message, category = 'app', context = {}) {
        this._log(this.levels.INFO, 'INFO', message, category, context);
    }

    warn(message, category = 'app', context = {}) {
        this._log(this.levels.WARN, 'WARN', message, category, context);
    }

    error(message, category = 'app', context = {}, error = null) {
        const enhancedContext = {
            ...context,
            error: error ? {
                name: error.name,
                message: error.message,
                stack: this.config.includeStackTrace ? error.stack : undefined
            } : undefined
        };
        this._log(this.levels.ERROR, 'ERROR', message, category, enhancedContext);
    }

    critical(message, category = 'app', context = {}, error = null) {
        const enhancedContext = {
            ...context,
            error: error ? {
                name: error.name,
                message: error.message,
                stack: this.config.includeStackTrace ? error.stack : undefined
            } : undefined
        };
        this._log(this.levels.CRITICAL, 'CRITICAL', message, category, enhancedContext);
    }

    // Interne Log-Funktion
    _log(level, levelName, message, category, context) {
        // Prüfe ob Level hoch genug ist
        if (level < this.config.minLevel) {
            return;
        }

        try {
            const logEntry = {
                id: this._generateId(),
                timestamp: Date.now(),
                timestampISO: new Date().toISOString(),
                level: levelName,
                levelValue: level,
                category: category,
                message: message,
                context: context,
                userAgent: navigator.userAgent,
                url: window.location.href
            };

            // Füge zur Log-Liste hinzu
            this.logs.unshift(logEntry);

            // Limitiere Anzahl der Logs
            if (this.logs.length > this.config.maxLogs) {
                this.logs = this.logs.slice(0, this.config.maxLogs);
            }

            // Speichere in LocalStorage
            if (this.config.persistLogs) {
                this._persistLogs();
            }

            // Console-Output
            if (this.config.consoleOutput) {
                this._outputToConsole(logEntry);
            }

            // Benachrichtige Listener
            this._notifyListeners(logEntry);

        } catch (error) {
            // Fallback: Console-Only wenn Logging fehlschlägt
            console.error('Logger failed:', error, { message, category, context });
        }
    }

    // Performance-Tracking
    startPerformance(markName, category = 'performance') {
        const mark = {
            name: markName,
            category: category,
            startTime: performance.now(),
            startTimestamp: Date.now()
        };
        this.performanceMarks.set(markName, mark);
        
        this.debug(`Performance tracking started: ${markName}`, category, { markName });
    }

    endPerformance(markName, logDetails = true) {
        const mark = this.performanceMarks.get(markName);
        if (!mark) {
            this.warn(`Performance mark not found: ${markName}`, 'performance');
            return null;
        }

        const endTime = performance.now();
        const duration = endTime - mark.startTime;
        
        this.performanceMarks.delete(markName);

        const perfData = {
            name: markName,
            category: mark.category,
            duration: duration,
            durationMs: Math.round(duration * 100) / 100,
            startTime: mark.startTime,
            endTime: endTime
        };

        if (logDetails) {
            const level = duration > 1000 ? 'warn' : 'info';
            this[level](`Performance: ${markName} - ${perfData.durationMs}ms`, mark.category, perfData);
        }

        return perfData;
    }

    // Measure async operation
    async measureAsync(name, operation, category = 'performance') {
        this.startPerformance(name, category);
        try {
            const result = await operation();
            this.endPerformance(name);
            return result;
        } catch (error) {
            this.endPerformance(name);
            throw error;
        }
    }

    // Console-Output mit Farben
    _outputToConsole(logEntry) {
        const timestamp = this._formatTimestamp(logEntry.timestamp);
        const prefix = `[${timestamp}] [${logEntry.level}] [${logEntry.category}]`;
        
        const styles = {
            DEBUG: 'color: #888; font-weight: normal',
            INFO: 'color: #0066cc; font-weight: normal',
            WARN: 'color: #ff9900; font-weight: bold',
            ERROR: 'color: #cc0000; font-weight: bold',
            CRITICAL: 'color: #fff; background-color: #cc0000; font-weight: bold; padding: 2px 4px'
        };

        const consoleMethod = {
            DEBUG: 'debug',
            INFO: 'info',
            WARN: 'warn',
            ERROR: 'error',
            CRITICAL: 'error'
        }[logEntry.level] || 'log';

        if (Object.keys(logEntry.context).length > 0) {
            console[consoleMethod](`%c${prefix}`, styles[logEntry.level], logEntry.message, logEntry.context);
        } else {
            console[consoleMethod](`%c${prefix}`, styles[logEntry.level], logEntry.message);
        }
    }

    // Formatiere Zeitstempel
    _formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        
        if (this.config.timestampFormat === 'ISO') {
            return date.toISOString();
        } else if (this.config.timestampFormat === 'locale') {
            return date.toLocaleString('de-DE');
        } else {
            return timestamp.toString();
        }
    }

    // Generiere eindeutige ID
    _generateId() {
        return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Logs in LocalStorage speichern
    _persistLogs() {
        try {
            // Speichere nur die letzten 500 Logs
            const logsToStore = this.logs.slice(0, 500);
            const serialized = JSON.stringify(logsToStore);
            localStorage.setItem(this.config.storageKey, serialized);
        } catch (error) {
            // Storage voll - lösche alte Logs
            console.warn('Logger: Could not persist logs - storage full', error);
            this.logs = this.logs.slice(0, 100);
            try {
                localStorage.setItem(this.config.storageKey, JSON.stringify(this.logs));
            } catch (e) {
                // Wenn immer noch zu voll, lösche Logs komplett
                this.logs = [];
                localStorage.removeItem(this.config.storageKey);
            }
        }
    }

    // Logs aus LocalStorage laden
    loadLogs() {
        try {
            const stored = localStorage.getItem(this.config.storageKey);
            if (stored) {
                this.logs = JSON.parse(stored);
                console.log(`📊 ${this.logs.length} Logs aus Storage geladen`);
            }
        } catch (error) {
            console.warn('Logger: Could not load logs from storage', error);
            this.logs = [];
        }
    }

    // Logs abrufen mit Filteroptionen
    getLogs(filter = {}) {
        let filtered = [...this.logs];

        // Filter nach Level
        if (filter.level) {
            const levelValue = this.levels[filter.level];
            filtered = filtered.filter(log => log.levelValue >= levelValue);
        }

        // Filter nach Kategorie
        if (filter.category) {
            filtered = filtered.filter(log => log.category === filter.category);
        }

        // Filter nach Zeitraum
        if (filter.since) {
            filtered = filtered.filter(log => log.timestamp >= filter.since);
        }

        if (filter.until) {
            filtered = filtered.filter(log => log.timestamp <= filter.until);
        }

        // Filter nach Suchbegriff
        if (filter.search) {
            const searchLower = filter.search.toLowerCase();
            filtered = filtered.filter(log => 
                log.message.toLowerCase().includes(searchLower) ||
                JSON.stringify(log.context).toLowerCase().includes(searchLower)
            );
        }

        // Limitiere Anzahl
        if (filter.limit) {
            filtered = filtered.slice(0, filter.limit);
        }

        return filtered;
    }

    // Statistiken über Logs
    getStatistics() {
        const stats = {
            total: this.logs.length,
            byLevel: {},
            byCategory: {},
            recentErrors: 0,
            oldestLog: null,
            newestLog: null
        };

        // Initialisiere Zähler
        Object.keys(this.levels).forEach(level => {
            stats.byLevel[level] = 0;
        });

        this.config.categories.forEach(cat => {
            stats.byCategory[cat] = 0;
        });

        // Zähle Logs
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        this.logs.forEach(log => {
            stats.byLevel[log.level]++;
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
            
            if (log.levelValue >= this.levels.ERROR && log.timestamp >= oneHourAgo) {
                stats.recentErrors++;
            }
        });

        if (this.logs.length > 0) {
            stats.oldestLog = this.logs[this.logs.length - 1];
            stats.newestLog = this.logs[0];
        }

        return stats;
    }

    // Event-Listener registrieren
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    // Event-Listener entfernen
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    // Listener benachrichtigen
    _notifyListeners(logEntry) {
        // Benachrichtige allgemeine Listener
        if (this.listeners.has('log')) {
            this.listeners.get('log').forEach(callback => {
                try {
                    callback(logEntry);
                } catch (error) {
                    console.error('Logger listener error:', error);
                }
            });
        }

        // Benachrichtige Level-spezifische Listener
        const levelEvent = logEntry.level.toLowerCase();
        if (this.listeners.has(levelEvent)) {
            this.listeners.get(levelEvent).forEach(callback => {
                try {
                    callback(logEntry);
                } catch (error) {
                    console.error('Logger listener error:', error);
                }
            });
        }
    }

    // Logs exportieren
    exportLogs(format = 'json') {
        const logs = this.getLogs();
        
        if (format === 'json') {
            return JSON.stringify(logs, null, 2);
        } else if (format === 'csv') {
            return this._exportAsCSV(logs);
        } else if (format === 'text') {
            return this._exportAsText(logs);
        }
        
        return JSON.stringify(logs);
    }

    // Export als CSV
    _exportAsCSV(logs) {
        const headers = ['Timestamp', 'Level', 'Category', 'Message', 'Context'];
        const rows = logs.map(log => [
            log.timestampISO,
            log.level,
            log.category,
            `"${log.message.replace(/"/g, '""')}"`,
            `"${JSON.stringify(log.context).replace(/"/g, '""')}"`
        ]);
        
        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    // Export als Text
    _exportAsText(logs) {
        return logs.map(log => {
            const timestamp = this._formatTimestamp(log.timestamp);
            const context = Object.keys(log.context).length > 0 
                ? `\n  Context: ${JSON.stringify(log.context, null, 2)}`
                : '';
            return `[${timestamp}] [${log.level}] [${log.category}] ${log.message}${context}`;
        }).join('\n\n');
    }

    // Logs löschen
    clear(filter = null) {
        if (filter) {
            // Lösche nur gefilterte Logs
            const toDelete = this.getLogs(filter);
            const deleteIds = new Set(toDelete.map(log => log.id));
            this.logs = this.logs.filter(log => !deleteIds.has(log.id));
        } else {
            // Lösche alle Logs
            this.logs = [];
        }
        
        this._persistLogs();
        this.info('Logs cleared', 'app', { filter: filter || 'all' });
    }

    // Auto-Cleanup alte Logs
    startAutoCleanup(intervalMs = 5 * 60 * 1000) {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.cleanupInterval = setInterval(() => {
            this._cleanup();
        }, intervalMs);
    }

    stopAutoCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    _cleanup() {
        const before = this.logs.length;
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        
        // Behalte nur Logs der letzten 24h oder die letzten 500 Logs
        this.logs = this.logs.filter(log => 
            log.timestamp >= oneDayAgo || 
            log.levelValue >= this.levels.ERROR
        ).slice(0, 500);
        
        const after = this.logs.length;
        
        if (before !== after) {
            this._persistLogs();
            console.log(`🧹 Logger cleanup: ${before - after} alte Logs entfernt`);
        }
    }

    // Log-Level ändern
    setLogLevel(level) {
        if (typeof level === 'string') {
            level = this.levels[level.toUpperCase()];
        }
        
        if (level !== undefined) {
            this.config.minLevel = level;
            this.info('Log level changed', 'app', { 
                newLevel: Object.keys(this.levels)[level] 
            });
        }
    }

    // Destroy Logger
    destroy() {
        this.stopAutoCleanup();
        this._persistLogs();
        this.listeners.clear();
        this.performanceMarks.clear();
        console.log('📊 Logger destroyed');
    }
}

// Hilfsfunktionen für schnellen Zugriff
const LoggerHelpers = {
    // Download Logs als Datei
    downloadLogs(logger, format = 'json') {
        const data = logger.exportLogs(format);
        const blob = new Blob([data], { 
            type: format === 'json' ? 'application/json' : 'text/plain' 
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gartenplaner_logs_${new Date().toISOString().split('T')[0]}.${format}`;
        link.click();
        URL.revokeObjectURL(url);
    },

    // Formatiere Log-Größe
    formatLogSize(logs) {
        const size = JSON.stringify(logs).length;
        if (size < 1024) return `${size} bytes`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
        return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    },

    // Prüfe Log-Gesundheit
    checkHealth(logger) {
        const stats = logger.getStatistics();
        const health = {
            status: 'healthy',
            issues: [],
            recommendations: []
        };

        // Prüfe auf viele Fehler
        if (stats.recentErrors > 10) {
            health.status = 'warning';
            health.issues.push(`${stats.recentErrors} Fehler in der letzten Stunde`);
            health.recommendations.push('Überprüfen Sie die Fehler-Logs');
        }

        // Prüfe Log-Größe
        const logSize = JSON.stringify(logger.logs).length;
        if (logSize > 1024 * 1024) {
            health.status = 'warning';
            health.issues.push('Logs > 1MB');
            health.recommendations.push('Logs bereinigen oder exportieren');
        }

        // Prüfe auf kritische Fehler
        if (stats.byLevel.CRITICAL > 0) {
            health.status = 'critical';
            health.issues.push(`${stats.byLevel.CRITICAL} kritische Fehler`);
            health.recommendations.push('Sofortige Überprüfung erforderlich');
        }

        return health;
    }
};

// Globales Logger-Objekt erstellen
window.logger = new Logger({
    minLevel: 1, // INFO
    maxLogs: 1000,
    persistLogs: true,
    consoleOutput: true,
    includeStackTrace: true
});

window.LoggerHelpers = LoggerHelpers;

console.log('📊 Logger-System initialisiert');
