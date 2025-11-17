// Error Boundaries und Fehlerbehandlung für Gartenplaner
// Graceful Error Handling mit User-Feedback

class ErrorBoundary {
    constructor() {
        this.errors = [];
        this.maxErrors = 50; // Maximum gespeicherte Fehler
        this.isProduction = window.location.hostname !== 'localhost';
        this.errorCallbacks = new Map();
        
        this.init();
    }

    init() {
        // Globale Error Handler
        window.addEventListener('error', (event) => {
            this.handleError({
                type: 'runtime',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error,
                timestamp: new Date().toISOString()
            });
        });

        // Unhandled Promise Rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError({
                type: 'promise',
                message: event.reason?.message || 'Unhandled Promise Rejection',
                error: event.reason,
                timestamp: new Date().toISOString()
            });
        });

        console.log('🛡️ Error Boundary initialisiert');
    }

    handleError(errorInfo) {
        // Fehler loggen
        this.logError(errorInfo);

        // In Development: Console ausgeben
        if (!this.isProduction) {
            console.error('🔴 Error Boundary caught:', errorInfo);
        }

        // Callbacks ausführen
        this.triggerCallbacks(errorInfo);

        // User benachrichtigen (nur bei kritischen Fehlern)
        if (this.isCriticalError(errorInfo)) {
            this.showErrorNotification(errorInfo);
        }

        // Fehler-Recovery versuchen
        this.attemptRecovery(errorInfo);
    }

    logError(errorInfo) {
        this.errors.push(errorInfo);

        // Limit einhalten
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        // In LocalStorage speichern (für Debugging)
        try {
            const errorLog = JSON.parse(localStorage.getItem('gartenplaner_errors') || '[]');
            errorLog.push(errorInfo);
            
            // Nur letzte 100 Fehler behalten
            if (errorLog.length > 100) {
                errorLog.shift();
            }
            
            localStorage.setItem('gartenplaner_errors', JSON.stringify(errorLog));
        } catch (e) {
            console.error('Konnte Fehler nicht in LocalStorage speichern:', e);
        }
    }

    isCriticalError(errorInfo) {
        // Kritische Fehler-Patterns
        const criticalPatterns = [
            /localStorage/i,
            /quota.*exceed/i,
            /cannot read property/i,
            /undefined is not/i,
            /null is not/i
        ];

        const message = errorInfo.message || '';
        return criticalPatterns.some(pattern => pattern.test(message));
    }

    showErrorNotification(errorInfo) {
        const message = this.getUserFriendlyMessage(errorInfo);
        
        // Toast-Benachrichtigung erstellen
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <div class="error-toast-content">
                <div class="error-toast-icon">⚠️</div>
                <div class="error-toast-text">
                    <strong>Ein Fehler ist aufgetreten</strong>
                    <p>${Security.escapeHtml(message)}</p>
                </div>
                <button class="error-toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        // Auto-remove nach 8 Sekunden
        setTimeout(() => {
            toast.classList.add('error-toast-fade');
            setTimeout(() => toast.remove(), 300);
        }, 8000);
    }

    getUserFriendlyMessage(errorInfo) {
        const message = errorInfo.message || '';
        
        // Benutzerfreundliche Nachrichten
        if (/localStorage/i.test(message) || /quota.*exceed/i.test(message)) {
            return 'Ihr Browser-Speicher ist voll. Bitte löschen Sie alte Aufgaben oder leeren Sie den Cache.';
        }
        
        if (/network/i.test(message) || /fetch/i.test(message)) {
            return 'Netzwerkfehler. Bitte überprüfen Sie Ihre Internetverbindung.';
        }
        
        if (/cannot read property/i.test(message) || /undefined is not/i.test(message)) {
            return 'Ein Datenfehler ist aufgetreten. Bitte laden Sie die Seite neu.';
        }
        
        // Fallback
        return 'Ein unerwarteter Fehler ist aufgetreten. Die Anwendung versucht sich zu erholen.';
    }

    attemptRecovery(errorInfo) {
        const message = errorInfo.message || '';
        
        // LocalStorage-Fehler: Versuche Cleanup
        if (/localStorage/i.test(message) || /quota.*exceed/i.test(message)) {
            this.cleanupStorage();
        }
        
        // DOM-Fehler: Versuche Re-Render
        if (/cannot read property/i.test(message) && errorInfo.type === 'runtime') {
            setTimeout(() => {
                if (window.gartenPlaner) {
                    try {
                        window.gartenPlaner.renderTasks();
                    } catch (e) {
                        console.error('Recovery fehlgeschlagen:', e);
                    }
                }
            }, 1000);
        }
    }

    cleanupStorage() {
        try {
            // Entferne alte Error-Logs
            const errorLog = JSON.parse(localStorage.getItem('gartenplaner_errors') || '[]');
            if (errorLog.length > 10) {
                localStorage.setItem('gartenplaner_errors', JSON.stringify(errorLog.slice(-10)));
            }
            
            // Entferne alte Präsenz-Daten (Collaboration)
            const presence = JSON.parse(localStorage.getItem('gartenplaner_presence') || '{}');
            const now = Date.now();
            const cleaned = Object.fromEntries(
                Object.entries(presence).filter(([_, timestamp]) => now - timestamp < 60000)
            );
            localStorage.setItem('gartenplaner_presence', JSON.stringify(cleaned));
            
            console.log('✅ Storage Cleanup durchgeführt');
        } catch (e) {
            console.error('Storage Cleanup fehlgeschlagen:', e);
        }
    }

    // Storage-Überwachung - Prüfe verfügbaren Speicherplatz
    getStorageUsage() {
        try {
            let totalSize = 0;
            let itemCount = 0;
            const details = {};

            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    const value = localStorage.getItem(key);
                    const size = new Blob([value]).size;
                    totalSize += size;
                    itemCount++;
                    
                    // Details für Gartenplaner-Keys sammeln
                    if (key.startsWith('gartenplaner_')) {
                        details[key] = {
                            size: size,
                            sizeKB: (size / 1024).toFixed(2),
                            preview: value.substring(0, 50)
                        };
                    }
                }
            }

            // Geschätzte Quota (normalerweise 5-10MB, wir nehmen konservativ 5MB an)
            const estimatedQuota = 5 * 1024 * 1024; // 5MB in Bytes
            const usagePercent = (totalSize / estimatedQuota * 100).toFixed(2);

            return {
                totalSize: totalSize,
                totalSizeKB: (totalSize / 1024).toFixed(2),
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                itemCount: itemCount,
                estimatedQuota: estimatedQuota,
                estimatedQuotaMB: (estimatedQuota / (1024 * 1024)).toFixed(2),
                usagePercent: usagePercent,
                details: details,
                isCritical: usagePercent > 90,
                isWarning: usagePercent > 75
            };
        } catch (e) {
            console.error('Fehler beim Ermitteln der Storage-Nutzung:', e);
            return null;
        }
    }

    // Prüfe Storage und zeige Warnung wenn nötig
    checkStorageQuota() {
        const usage = this.getStorageUsage();
        if (!usage) return false;

        // Kritischer Bereich (>90%)
        if (usage.isCritical) {
            this.showStorageWarning('critical', usage);
            return false; // Blockiere weitere Speicheroperationen
        }

        // Warnbereich (>75%)
        if (usage.isWarning) {
            this.showStorageWarning('warning', usage);
        }

        return true; // Speicheroperationen erlaubt
    }

    // Zeige Storage-Warnung
    showStorageWarning(level, usage) {
        const messages = {
            warning: {
                title: '⚠️ Speicherplatz wird knapp',
                text: `LocalStorage ist zu ${usage.usagePercent}% voll (${usage.totalSizeMB} MB von ~${usage.estimatedQuotaMB} MB). Bitte löschen Sie alte Aufgaben oder archivieren Sie diese.`,
                duration: 10000
            },
            critical: {
                title: '🚨 Speicherplatz kritisch!',
                text: `LocalStorage ist zu ${usage.usagePercent}% voll! Neue Aufgaben können möglicherweise nicht gespeichert werden. Bitte löschen Sie dringend alte Daten.`,
                duration: 0 // Bleibt sichtbar bis Benutzer schließt
            }
        };

        const config = messages[level];
        this.showErrorNotification(config.title, config.text, level, config.duration);

        // Log für Debugging
        console.warn(`📊 Storage ${level}:`, usage);
    }

    // Starte periodische Storage-Überwachung
    startStorageMonitoring(intervalMinutes = 5) {
        // Initiale Prüfung
        this.checkStorageQuota();

        // Periodische Prüfung
        this.storageMonitorInterval = setInterval(() => {
            this.checkStorageQuota();
        }, intervalMinutes * 60 * 1000);

        console.log(`📊 Storage-Monitoring gestartet (alle ${intervalMinutes} Minuten)`);
    }

    // Stoppe Storage-Überwachung
    stopStorageMonitoring() {
        if (this.storageMonitorInterval) {
            clearInterval(this.storageMonitorInterval);
            this.storageMonitorInterval = null;
            console.log('📊 Storage-Monitoring gestoppt');
        }
    }

    // Callbacks für spezifische Fehlertypen registrieren
    onError(errorType, callback) {
        if (!this.errorCallbacks.has(errorType)) {
            this.errorCallbacks.set(errorType, []);
        }
        this.errorCallbacks.get(errorType).push(callback);
    }

    triggerCallbacks(errorInfo) {
        const callbacks = this.errorCallbacks.get(errorInfo.type) || [];
        callbacks.forEach(callback => {
            try {
                callback(errorInfo);
            } catch (e) {
                console.error('Error in error callback:', e);
            }
        });
    }

    // Error-Log abrufen (für Debugging)
    getErrors() {
        return [...this.errors];
    }

    // Error-Log löschen
    clearErrors() {
        this.errors = [];
        try {
            localStorage.removeItem('gartenplaner_errors');
        } catch (e) {
            console.error('Konnte Error-Log nicht löschen:', e);
        }
    }

    // Fehler-Statistiken
    getErrorStats() {
        const stats = {
            total: this.errors.length,
            byType: {},
            recent: this.errors.slice(-5)
        };

        this.errors.forEach(error => {
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
        });

        return stats;
    }
}

// Safe Function Wrapper - Wraps Funktionen mit Error Handling
function safeExecute(fn, fallback = null, context = null) {
    return function(...args) {
        try {
            return fn.apply(context || this, args);
        } catch (error) {
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'runtime',
                    message: error.message,
                    error: error,
                    function: fn.name || 'anonymous',
                    timestamp: new Date().toISOString()
                });
            }
            
            console.error('Error in safe execute:', error);
            return fallback;
        }
    };
}

// Safe Async Wrapper
function safeAsync(fn, fallback = null) {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'async',
                    message: error.message,
                    error: error,
                    function: fn.name || 'anonymous',
                    timestamp: new Date().toISOString()
                });
            }
            
            console.error('Error in async execute:', error);
            return fallback;
        }
    };
}

// Safe LocalStorage Operations mit Verschlüsselung
const SafeStorage = {
    // Prüfe ob Key verschlüsselt werden soll
    shouldEncrypt(key) {
        // Verschlüssele alle gartenplaner_ Keys außer interne Keys
        return key.startsWith('gartenplaner_') && 
               !key.startsWith('_gartenplaner_');
    },

    async getItem(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return defaultValue;

            const parsed = JSON.parse(item);
            
            // Wenn Daten verschlüsselt sind und Encryption verfügbar ist
            if (parsed && parsed.encrypted && window.dataEncryption) {
                const decrypted = await window.dataEncryption.decrypt(parsed);
                return decrypted !== null ? decrypted : defaultValue;
            }
            
            // Unverschlüsselte Daten
            return parsed;
        } catch (error) {
            console.error(`Error reading from localStorage [${key}]:`, error);
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'storage',
                    message: `Failed to read localStorage: ${error.message}`,
                    key: key,
                    error: error,
                    timestamp: new Date().toISOString()
                });
            }
            return defaultValue;
        }
    },

    async setItem(key, value) {
        try {
            // Prüfe Storage-Quota vor dem Speichern
            if (window.errorBoundary && key.startsWith('gartenplaner_')) {
                const canSave = window.errorBoundary.checkStorageQuota();
                if (!canSave) {
                    // Kritischer Speicherzustand - blockiere Speichern
                    console.error('Storage quota exceeded - cannot save');
                    return false;
                }
            }

            let dataToStore = value;

            // Verschlüssele Daten wenn möglich und nötig
            if (this.shouldEncrypt(key) && window.dataEncryption && window.dataEncryption.isSupported) {
                dataToStore = await window.dataEncryption.encrypt(value);
            }

            localStorage.setItem(key, JSON.stringify(dataToStore));
            return true;
        } catch (error) {
            console.error(`Error writing to localStorage [${key}]:`, error);
            
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'storage',
                    message: `Failed to write localStorage: ${error.message}`,
                    key: key,
                    error: error,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Versuche Cleanup bei Quota-Fehler
            if (error.name === 'QuotaExceededError') {
                if (window.errorBoundary) {
                    window.errorBoundary.cleanupStorage();
                    // Zeige kritische Warnung
                    const usage = window.errorBoundary.getStorageUsage();
                    if (usage) {
                        window.errorBoundary.showStorageWarning('critical', usage);
                    }
                }
            }
            
            return false;
        }
    },

    removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error(`Error removing from localStorage [${key}]:`, error);
            return false;
        }
    },

    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Error clearing localStorage:', error);
            return false;
        }
    }
};

// DOM Safety Helpers
const SafeDOM = {
    querySelector(selector, parent = document) {
        try {
            return parent.querySelector(selector);
        } catch (error) {
            console.error(`Error in querySelector [${selector}]:`, error);
            return null;
        }
    },

    querySelectorAll(selector, parent = document) {
        try {
            return parent.querySelectorAll(selector);
        } catch (error) {
            console.error(`Error in querySelectorAll [${selector}]:`, error);
            return [];
        }
    },

    addEventListener(element, event, handler, options) {
        if (!element) {
            console.warn('addEventListener: element is null');
            return;
        }

        try {
            const safeHandler = safeExecute(handler);
            element.addEventListener(event, safeHandler, options);
        } catch (error) {
            console.error(`Error adding event listener [${event}]:`, error);
        }
    },

    setInnerHTML(element, html) {
        if (!element) {
            console.warn('setInnerHTML: element is null');
            return false;
        }

        try {
            element.innerHTML = html;
            return true;
        } catch (error) {
            console.error('Error setting innerHTML:', error);
            return false;
        }
    },

    setTextContent(element, text) {
        if (!element) {
            console.warn('setTextContent: element is null');
            return false;
        }

        try {
            element.textContent = text;
            return true;
        } catch (error) {
            console.error('Error setting textContent:', error);
            return false;
        }
    }
};

// Global verfügbar machen
window.ErrorBoundary = ErrorBoundary;
window.safeExecute = safeExecute;
window.safeAsync = safeAsync;
window.SafeStorage = SafeStorage;
window.SafeDOM = SafeDOM;

// Auto-Initialisierung
window.errorBoundary = new ErrorBoundary();

// Starte Storage-Monitoring (alle 5 Minuten)
window.errorBoundary.startStorageMonitoring(5);

// Freeze Objects
Object.freeze(SafeStorage);
Object.freeze(SafeDOM);
