// Rate Limiting für Gartenplaner
// Schutz vor zu vielen Operationen mit Token Bucket & Sliding Window

class RateLimiter {
    constructor() {
        this.limiters = new Map();
        this.defaultLimits = (window.APP_CONFIG && window.APP_CONFIG.rateLimits) || {
            storage: { maxRequests: 60, windowMs: 60000 },
            taskCreate: { maxRequests: 10, windowMs: 60000 },
            taskEdit: { maxRequests: 30, windowMs: 60000 },
            taskDelete: { maxRequests: 20, windowMs: 60000 },
            search: { maxRequests: 100, windowMs: 60000 },
            filter: { maxRequests: 100, windowMs: 60000 },
            export: { maxRequests: 5, windowMs: 300000 },
            api: { maxRequests: 30, windowMs: 60000 }
        };

        this.callbacks = new Map();
        this.cleanupInterval = null;
        
        this.init();
    }

    init() {
        // Initialisiere Standard-Limiter
        for (const [key, config] of Object.entries(this.defaultLimits)) {
            this.createLimiter(key, config);
        }

        // Starte automatisches Cleanup
        this.startCleanup();

        console.log('⏱️ Rate Limiter initialisiert');
    }

    // Erstelle neuen Limiter
    createLimiter(name, config) {
        this.limiters.set(name, {
            maxRequests: config.maxRequests,
            windowMs: config.windowMs,
            requests: [],
            blocked: false,
            blockedUntil: null
        });
    }

    // Prüfe ob Request erlaubt ist (Token Bucket mit Sliding Window)
    checkLimit(limiterName, identifier = 'default') {
        try {
            // Validierung
            if (!limiterName || typeof limiterName !== 'string') {
                console.error('Invalid limiterName provided to checkLimit');
                return { allowed: true, remaining: Infinity, resetMs: 0 };
            }
            
            if (!identifier || typeof identifier !== 'string') {
                identifier = 'default';
            }
            
            const limiter = this.limiters.get(limiterName);
            if (!limiter) {
                console.warn(`Rate Limiter '${limiterName}' nicht gefunden`);
                return { allowed: true, remaining: Infinity, resetMs: 0 };
            }

            const now = Date.now();
        const key = `${limiterName}:${identifier}`;

        // Prüfe ob blockiert
        if (limiter.blocked && limiter.blockedUntil > now) {
            return {
                allowed: false,
                remaining: 0,
                resetMs: limiter.blockedUntil - now,
                blocked: true,
                reason: 'rate_limit_exceeded'
            };
        }

        // Cleanup alte Requests (Sliding Window)
        limiter.requests = limiter.requests.filter(req => 
            req.timestamp > now - limiter.windowMs
        );

        // Zähle Requests für diesen Identifier
        const identifierRequests = limiter.requests.filter(req => req.identifier === identifier);
        
        // Prüfe Limit
        if (identifierRequests.length >= limiter.maxRequests) {
            // Blockiere für Restzeit des ältesten Requests
            const oldestRequest = identifierRequests[0];
            const resetMs = limiter.windowMs - (now - oldestRequest.timestamp);
            
            limiter.blocked = true;
            limiter.blockedUntil = now + resetMs;

            // Trigger Callback
            this.triggerCallback('limit_exceeded', {
                limiter: limiterName,
                identifier: identifier,
                maxRequests: limiter.maxRequests,
                windowMs: limiter.windowMs,
                resetMs: resetMs
            });

            return {
                allowed: false,
                remaining: 0,
                resetMs: resetMs,
                blocked: true,
                reason: 'rate_limit_exceeded'
            };
        }

        // Request erlaubt - füge hinzu
        limiter.requests.push({
            identifier: identifier,
            timestamp: now
        });

        // Entsperre wenn blockiert
        if (limiter.blocked && limiter.blockedUntil <= now) {
            limiter.blocked = false;
            limiter.blockedUntil = null;
        }

            const remaining = limiter.maxRequests - identifierRequests.length - 1;
            const oldestTimestamp = identifierRequests.length > 0 
                ? identifierRequests[0].timestamp 
                : now;
            const resetMs = limiter.windowMs - (now - oldestTimestamp);

            return {
                allowed: true,
                remaining: remaining,
                resetMs: resetMs,
                blocked: false
            };
        } catch (error) {
            console.error('Fehler in checkLimit:', error);
            
            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'runtime',
                    message: 'Rate limit check failed: ' + error.message,
                    error: error,
                    function: 'checkLimit',
                    context: { limiterName, identifier },
                    timestamp: new Date().toISOString()
                });
            }
            
            // Fallback: Erlaube Request bei Fehler
            return { allowed: true, remaining: Infinity, resetMs: 0 };
        }
    }

    // Wrapper für sichere Operation mit Rate-Limiting
    async withLimit(limiterName, operation, identifier = 'default') {
        const result = this.checkLimit(limiterName, identifier);

        if (!result.allowed) {
            // Rate-Limit überschritten
            this.showRateLimitWarning(limiterName, result.resetMs);
            
            throw new Error(`Rate limit exceeded for ${limiterName}. Try again in ${Math.ceil(result.resetMs / 1000)}s`);
        }

        // Führe Operation aus
        try {
            return await operation();
        } catch (error) {
            // Bei Fehler: Entferne Request wieder (Rollback)
            this.rollbackRequest(limiterName, identifier);
            throw error;
        }
    }

    // Rollback eines Requests (bei Fehler)
    rollbackRequest(limiterName, identifier) {
        const limiter = this.limiters.get(limiterName);
        if (!limiter) return;

        // Entferne letzten Request für diesen Identifier
        const lastIndex = limiter.requests.map(r => r.identifier).lastIndexOf(identifier);
        if (lastIndex !== -1) {
            limiter.requests.splice(lastIndex, 1);
        }
    }

    // Zeige Rate-Limit Warnung
    showRateLimitWarning(limiterName, resetMs) {
        const seconds = Math.ceil(resetMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        let timeText = seconds < 60 
            ? `${seconds} Sekunde${seconds !== 1 ? 'n' : ''}`
            : `${minutes} Minute${minutes !== 1 ? 'n' : ''}${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ''}`;

        const messages = {
            storage: {
                title: '⏱️ Zu viele Speicher-Operationen',
                text: `Bitte verlangsamen Sie Ihre Aktionen. Speichern wieder möglich in ${timeText}.`
            },
            taskCreate: {
                title: '⏱️ Zu viele neue Aufgaben',
                text: `Sie erstellen Aufgaben zu schnell. Bitte warten Sie ${timeText}.`
            },
            taskEdit: {
                title: '⏱️ Zu viele Bearbeitungen',
                text: `Bitte verlangsamen Sie Ihre Bearbeitungen. Fortfahren in ${timeText}.`
            },
            taskDelete: {
                title: '⏱️ Zu viele Löschungen',
                text: `Sie löschen zu schnell. Bitte warten Sie ${timeText}.`
            },
            export: {
                title: '⏱️ Export-Limit erreicht',
                text: `Zu viele Exports. Nächster Export möglich in ${timeText}.`
            },
            api: {
                title: '⏱️ Zu viele Anfragen',
                text: `Bitte verlangsamen Sie Ihre Aktionen. Fortfahren in ${timeText}.`
            }
        };

        const config = messages[limiterName] || {
            title: '⏱️ Rate-Limit erreicht',
            text: `Zu viele Operationen. Bitte warten Sie ${timeText}.`
        };

        // Zeige Notification wenn ErrorBoundary verfügbar
        if (window.errorBoundary && window.errorBoundary.showErrorNotification) {
            window.errorBoundary.showErrorNotification(
                config.title,
                config.text,
                'warning',
                Math.min(resetMs, 8000) // Max 8 Sekunden Anzeige
            );
        } else {
            console.warn(`${config.title}: ${config.text}`);
        }
    }

    // Prüfe Status eines Limiters
    getStatus(limiterName, identifier = 'default') {
        const limiter = this.limiters.get(limiterName);
        if (!limiter) return null;

        const now = Date.now();
        const identifierRequests = limiter.requests.filter(
            req => req.identifier === identifier && req.timestamp > now - limiter.windowMs
        );

        const remaining = Math.max(0, limiter.maxRequests - identifierRequests.length);
        const oldestTimestamp = identifierRequests.length > 0 
            ? identifierRequests[0].timestamp 
            : now;
        const resetMs = limiter.windowMs - (now - oldestTimestamp);

        return {
            name: limiterName,
            identifier: identifier,
            maxRequests: limiter.maxRequests,
            windowMs: limiter.windowMs,
            currentRequests: identifierRequests.length,
            remaining: remaining,
            resetMs: Math.max(0, resetMs),
            blocked: limiter.blocked,
            blockedUntil: limiter.blockedUntil,
            percentage: Math.round((identifierRequests.length / limiter.maxRequests) * 100)
        };
    }

    // Alle Limiter-Status abrufen
    getAllStatus() {
        const status = {};
        for (const [name, limiter] of this.limiters.entries()) {
            status[name] = this.getStatus(name);
        }
        return status;
    }

    // Reset eines Limiters
    reset(limiterName, identifier = null) {
        const limiter = this.limiters.get(limiterName);
        if (!limiter) return false;

        if (identifier) {
            // Nur für spezifischen Identifier
            limiter.requests = limiter.requests.filter(req => req.identifier !== identifier);
        } else {
            // Gesamten Limiter zurücksetzen
            limiter.requests = [];
            limiter.blocked = false;
            limiter.blockedUntil = null;
        }

        console.log(`🔄 Rate Limiter '${limiterName}' zurückgesetzt`);
        return true;
    }

    // Reset aller Limiter
    resetAll() {
        for (const [name, limiter] of this.limiters.entries()) {
            limiter.requests = [];
            limiter.blocked = false;
            limiter.blockedUntil = null;
        }
        console.log('🔄 Alle Rate Limiter zurückgesetzt');
    }

    // Registriere Callback für Events
    on(event, callback) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }
        this.callbacks.get(event).push(callback);
    }

    // Trigger Callback
    triggerCallback(event, data) {
        const callbacks = this.callbacks.get(event) || [];
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in rate limiter callback for ${event}:`, error);
            }
        });
    }

    // Automatisches Cleanup alter Requests
    startCleanup(intervalMs = 30000) {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, intervalMs);
    }

    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    cleanup() {
        try {
            const now = Date.now();
            let cleaned = 0;

            for (const [name, limiter] of this.limiters.entries()) {
                try {
                    const before = limiter.requests.length;
                    limiter.requests = limiter.requests.filter(
                        req => req.timestamp > now - limiter.windowMs
                    );
                    cleaned += before - limiter.requests.length;

                    // Entsperre wenn Zeit abgelaufen
                    if (limiter.blocked && limiter.blockedUntil <= now) {
                        limiter.blocked = false;
                        limiter.blockedUntil = null;
                    }
                } catch (error) {
                    console.error(`Fehler beim Cleanup von '${name}':`, error);
                }
            }

            if (cleaned > 0) {
                console.log(`🧹 Rate Limiter Cleanup: ${cleaned} alte Requests entfernt`);
            }
        } catch (error) {
            console.error('Fehler in cleanup:', error);
            
            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'runtime',
                    message: 'Rate limiter cleanup failed: ' + error.message,
                    error: error,
                    function: 'cleanup',
                    context: {},
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    // Update Limiter-Konfiguration
    updateLimit(limiterName, config) {
        const limiter = this.limiters.get(limiterName);
        if (!limiter) {
            console.warn(`Rate Limiter '${limiterName}' nicht gefunden`);
            return false;
        }

        if (config.maxRequests !== undefined) {
            limiter.maxRequests = config.maxRequests;
        }
        if (config.windowMs !== undefined) {
            limiter.windowMs = config.windowMs;
        }

        console.log(`⚙️ Rate Limiter '${limiterName}' aktualisiert:`, config);
        return true;
    }

    // Statistiken
    getStatistics() {
        const stats = {
            totalLimiters: this.limiters.size,
            totalRequests: 0,
            blockedLimiters: 0,
            byLimiter: {}
        };

        for (const [name, limiter] of this.limiters.entries()) {
            const requestCount = limiter.requests.length;
            stats.totalRequests += requestCount;
            
            if (limiter.blocked) {
                stats.blockedLimiters++;
            }

            stats.byLimiter[name] = {
                requests: requestCount,
                maxRequests: limiter.maxRequests,
                blocked: limiter.blocked,
                utilization: Math.round((requestCount / limiter.maxRequests) * 100)
            };
        }

        return stats;
    }

    // Destroy - Cleanup
    destroy() {
        this.stopCleanup();
        this.limiters.clear();
        this.callbacks.clear();
        console.log('🗑️ Rate Limiter zerstört');
    }
}

// Safe Wrapper-Funktionen
const RateLimitHelpers = {
    // Wrap eine Funktion mit Rate-Limiting
    wrap(limiterName, fn, identifier = 'default') {
        return async function(...args) {
            if (!window.rateLimiter) {
                console.warn('Rate Limiter nicht initialisiert');
                return await fn.apply(this, args);
            }

            return await window.rateLimiter.withLimit(
                limiterName,
                () => fn.apply(this, args),
                identifier
            );
        };
    },

    // Dekorator für Rate-Limited Funktionen
    limited(limiterName, identifier = 'default') {
        return function(target, propertyKey, descriptor) {
            const originalMethod = descriptor.value;
            
            descriptor.value = async function(...args) {
                if (!window.rateLimiter) {
                    return await originalMethod.apply(this, args);
                }

                return await window.rateLimiter.withLimit(
                    limiterName,
                    () => originalMethod.apply(this, args),
                    identifier
                );
            };

            return descriptor;
        };
    }
};

// Global verfügbar machen
window.RateLimiter = RateLimiter;
window.RateLimitHelpers = RateLimitHelpers;

// Auto-Initialisierung
window.rateLimiter = new RateLimiter();

// Freeze
Object.freeze(RateLimiter.prototype);
Object.freeze(RateLimitHelpers);
