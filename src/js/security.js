// Sicherheits-Modul für XSS-Schutz und Input-Validierung
const Security = {
    // HTML-Zeichen escapen
    // Note: This client-side version also escapes forward slashes (/ -> &#x2F;)
    // for additional DOM context safety. The server-side canonical version in
    // src/server/validation/task-validator.js does not escape slashes.
    escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) {
            return '';
        }
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\//g, "&#x2F;");
    },

    // URL validieren und escapen
    sanitizeUrl(url) {
        if (!url) return '';
        
        // Nur http(s) und mailto erlauben
        const allowedProtocols = ['http:', 'https:', 'mailto:'];
        try {
            const parsed = new URL(url, window.location.origin);
            if (!allowedProtocols.includes(parsed.protocol)) {
                return 'about:blank';
            }
            return url;
        } catch (e) {
            return 'about:blank';
        }
    },

    // Textinhalt sanitizen (für textContent)
    sanitizeText(text) {
        if (text === null || text === undefined) {
            return '';
        }
        return String(text).trim();
    },

    // HTML-String sicher parsen (für kontrollierte HTML-Inhalte)
    createSafeElement(html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstChild;
    },

    // Formular-Input validieren
    validateInput: {
        // Allgemeine Text-Validierung
        text(value, minLength = 0, maxLength = 500) {
            if (typeof value !== 'string') return false;
            const cleaned = value.trim();
            return cleaned.length >= minLength && cleaned.length <= maxLength;
        },

        // Email-Validierung
        email(value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(String(value).toLowerCase());
        },

        // Datum-Validierung
        date(value) {
            const date = new Date(value);
            return date instanceof Date && !isNaN(date);
        },

        // Select-Option validieren
        option(value, allowedValues) {
            return allowedValues.includes(value);
        },

        // Nummer validieren
        number(value, min = null, max = null) {
            const num = Number(value);
            if (isNaN(num)) return false;
            if (min !== null && num < min) return false;
            if (max !== null && num > max) return false;
            return true;
        },

        // ID validieren (alphanumerisch + Unterstriche)
        id(value) {
            return /^[a-zA-Z0-9_-]+$/.test(value);
        }
    },

    // Aufgaben-spezifische Validierung
    validateTask(taskData) {
        const errors = [];

        // Titel
        if (!this.validateInput.text(taskData.title, 1, 200)) {
            errors.push('Titel muss zwischen 1 und 200 Zeichen lang sein');
        }

        // Beschreibung (optional)
        if (taskData.description && !this.validateInput.text(taskData.description, 0, 2000)) {
            errors.push('Beschreibung darf maximal 2000 Zeichen lang sein');
        }

        // Mitarbeiter (optional)
        if (taskData.employee && !this.validateInput.text(taskData.employee, 0, 100)) {
            errors.push('Mitarbeiter darf maximal 100 Zeichen lang sein');
        }

        // Standort
        if (!this.validateInput.text(taskData.location, 1, 100)) {
            errors.push('Standort muss angegeben werden');
        }

        // Datum
        if (taskData.dueDate && !this.validateInput.date(taskData.dueDate)) {
            errors.push('Ungültiges Fälligkeitsdatum');
        }

        // Status
        const validStatuses = ['pending', 'in-progress', 'completed'];
        if (taskData.status && !this.validateInput.option(taskData.status, validStatuses)) {
            errors.push('Ungültiger Status');
        }

        // Priorität
        const validPriorities = ['low', 'medium', 'high'];
        if (taskData.priority && !this.validateInput.option(taskData.priority, validPriorities)) {
            errors.push('Ungültige Priorität');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    },

    // Sichere DOM-Manipulation
    setTextContent(element, text) {
        if (!element) return;
        element.textContent = this.sanitizeText(text);
    },

    setAttribute(element, attr, value) {
        if (!element) return;
        element.setAttribute(attr, this.escapeHtml(value));
    },

    // Sicheres Einfügen von HTML mit Template Literals
    sanitizeTemplateData(data) {
        if (typeof data === 'object' && data !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'string') {
                    sanitized[key] = this.escapeHtml(value);
                } else if (Array.isArray(value)) {
                    sanitized[key] = value.map(v => 
                        typeof v === 'string' ? this.escapeHtml(v) : v
                    );
                } else {
                    sanitized[key] = value;
                }
            }
            return sanitized;
        }
        return data;
    },

    // Content Security Policy Helper
    generateNonce() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    },

    // LocalStorage-Daten validieren
    validateStorageData(key, data) {
        try {
            // Prüfen ob JSON gültig ist
            if (typeof data === 'string') {
                JSON.parse(data);
            }

            // Größenlimit prüfen (5MB für LocalStorage)
            const size = new Blob([JSON.stringify(data)]).size;
            if (size > 5 * 1024 * 1024) {
                console.warn(`Speicherdaten für '${key}' überschreiten 5MB Limit`);
                return false;
            }

            return true;
        } catch (e) {
            console.warn(`Ungültige Speicherdaten für '${key}':`, e.message);
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'validation',
                    message: `Ungültige Speicherdaten für '${key}': ${e.message}`,
                    error: e,
                    function: 'validateStorageData',
                    context: { key },
                    timestamp: new Date().toISOString()
                });
            }
            return false;
        }
    },

    // XSS in URLs verhindern (z.B. javascript:, data:)
    sanitizeEventHandler(handler) {
        // Entferne gefährliche Protokolle aus Event Handlern
        const dangerous = /javascript:|data:|vbscript:/gi;
        if (dangerous.test(handler)) {
            this.logSecurityEvent('error', 'Gefährlicher Event-Handler erkannt', { handler });
            return '';
        }
        return handler;
    },

    // Logging mit Context (für Debugging)
    logSecurityEvent(type, message, data = null) {
        const event = {
            timestamp: new Date().toISOString(),
            type: type,
            message: message,
            data: data
        };

        // Strukturiertes Logging über Logger wenn verfügbar
        if (window.logger) {
            const level = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'info';
            window.logger[level](message, 'security', data || {});
        } else {
            // Fallback auf Console
            if (type === 'error' || type === 'warning') {
                console.warn('[Security]', event);
            } else {
                console.log('[Security]', event);
            }
        }

        // Kritische Security-Events an ErrorBoundary melden
        if (type === 'error' && window.errorBoundary) {
            window.errorBoundary.handleError({
                type: 'security',
                message: message,
                function: 'logSecurityEvent',
                context: data || {},
                timestamp: new Date().toISOString()
            });
        }
    }
};

// Global verfügbar machen
window.Security = Security;
window.GP.Security = Security;

// Freeze das Objekt um Manipulation zu verhindern
Object.freeze(Security);
