// Zentrale Konfiguration für Gartenplaner
// Alle konfigurierbaren Werte an einem Ort

const APP_CONFIG = {
    // Rate Limiting (Client-seitig)
    rateLimits: {
        storage: { maxRequests: 60, windowMs: 60000 },
        taskCreate: { maxRequests: 10, windowMs: 60000 },
        taskEdit: { maxRequests: 30, windowMs: 60000 },
        taskDelete: { maxRequests: 20, windowMs: 60000 },
        search: { maxRequests: 100, windowMs: 60000 },
        filter: { maxRequests: 100, windowMs: 60000 },
        export: { maxRequests: 5, windowMs: 300000 },
        api: { maxRequests: 30, windowMs: 60000 }
    },

    // Logging (#15)
    logging: {
        maxLogs: 1000,
        maxPersisted: 500,
        maxOnError: 100,
        recentErrorWindowMs: 60 * 60 * 1000,
        cleanupIntervalMs: 5 * 60 * 1000,
        retentionMs: 24 * 60 * 60 * 1000,
        maxAfterCleanup: 500,
        storageKey: '_gartenplaner_logs',
        autoRefreshMs: 5000
    },

    // Encryption (AES-GCM)
    encryption: {
        algorithm: 'AES-GCM',
        keyLength: 256,
        ivLength: 12,
        saltLength: 16,
        iterations: 100000
    },

    // UI Timings (ms) (#15, #20)
    ui: {
        errorNotificationDuration: 15000,
        successNotificationDuration: 5000,
        animationDelay: 400,
        retryDelay: 500,
        debounceDelay: 100,
        focusDelay: 100,
        mobileBreakpoint: 768
    },

    // Error Handling
    errors: {
        maxStoredErrors: 50,
        maxLocalStorageErrors: 100
    },

    // Storage
    storage: {
        estimatedQuotaMB: 5,
        warningThresholdPercent: 75,
        criticalThresholdPercent: 90,
        monitoringIntervalMinutes: 5
    },

    // Validation limits (#15)
    validation: {
        titleMaxLength: 200,
        descriptionMaxLength: 2000,
        employeeMaxLength: 100,
        notesMaxLength: 5000
    },

    // API
    api: {
        baseUrl: '/api'
    },

    // PDF Export (#15)
    pdf: {
        pageHeight: 280,
        bottomMargin: 40,
        startY: 46,
        newPageY: 20
    }
};

// Globaler Namespace (#72)
window.GP = window.GP || {};
window.GP.APP_CONFIG = APP_CONFIG;

// Rückwärtskompatibilität
window.APP_CONFIG = APP_CONFIG;

Object.freeze(APP_CONFIG);
