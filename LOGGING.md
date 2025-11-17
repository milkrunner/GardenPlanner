# Logging System

Umfassendes Logging-System für Fehler-Tracking, Debug-Logs und Performance-Monitoring.

## 🎯 Übersicht

Das Logging-System bietet:

- ✅ **Mehrere Log-Levels**: DEBUG, INFO, WARN, ERROR, CRITICAL
- ✅ **Performance-Tracking**: Messung von Operationsdauern
- ✅ **Persistierung**: Automatische Speicherung in LocalStorage
- ✅ **Log-Viewer UI**: Filtern, Suchen, Exportieren
- ✅ **Event-System**: Listener für Log-Events
- ✅ **Auto-Cleanup**: Automatische Bereinigung alter Logs
- ✅ **Stack-Traces**: Detaillierte Fehlerinformationen
- ✅ **Kategorisierung**: Logs nach Modulen organisiert

## 🚀 Installation

Das Logger-System ist bereits in allen HTML-Seiten eingebunden:

```html
<script src="logger.js"></script>
```

Das globale `window.logger` Objekt wird automatisch initialisiert.

## 📝 Verwendung

### Basis-Logging

```javascript
// Info-Log
window.logger.info("Operation erfolgreich", "app", {
  userId: 123,
  action: "create",
});

// Warning-Log
window.logger.warn("Speicherplatz wird knapp", "storage", {
  usage: 0.85,
  limit: 5242880,
});

// Error-Log
window.logger.error(
  "Speichern fehlgeschlagen",
  "storage",
  {
    operation: "saveTasks",
    taskCount: 42,
  },
  error
);

// Critical-Log
window.logger.critical(
  "Datenbankverbindung verloren",
  "app",
  {
    attempts: 3,
  },
  error
);

// Debug-Log (nur bei DEBUG-Level sichtbar)
window.logger.debug("Debugging-Information", "app", {
  variable: someValue,
});
```

### Performance-Tracking

```javascript
// Performance-Messung starten
window.logger.startPerformance("addTask", "performance");

// ... Operation durchführen ...

// Performance-Messung beenden
const perfData = window.logger.endPerformance("addTask");
// Automatisch geloggt als INFO (< 1s) oder WARN (> 1s)

// Async Operation messen
const result = await window.logger.measureAsync(
  "loadData",
  async () => {
    return await fetchData();
  },
  "performance"
);
```

### Kategorien

Vordefinierte Kategorien:

- `app` - Anwendungslogik
- `security` - Sicherheit (XSS, Validierung, etc.)
- `storage` - LocalStorage-Operationen
- `encryption` - Verschlüsselung/Entschlüsselung
- `rate-limit` - Rate-Limiting
- `performance` - Performance-Messungen

## 📊 Log-Levels

| Level    | Value | Verwendung                               | Beispiel                                |
| -------- | ----- | ---------------------------------------- | --------------------------------------- |
| DEBUG    | 0     | Detaillierte Debug-Informationen         | Variable-Werte, Funktionsaufrufe        |
| INFO     | 1     | Allgemeine Informationen                 | Operation erfolgreich, Initialisierung  |
| WARN     | 2     | Warnungen, keine kritischen Fehler       | Speicherplatz niedrig, Rate-Limit       |
| ERROR    | 3     | Fehler, die behandelt werden können      | Speichern fehlgeschlagen, Parsing-Error |
| CRITICAL | 4     | Kritische Fehler, App funktioniert nicht | DB-Verbindung verloren, Key fehlt       |

### Log-Level ändern

```javascript
// Level auf DEBUG setzen (alle Logs sichtbar)
window.logger.setLogLevel("DEBUG");

// Level auf ERROR setzen (nur Fehler)
window.logger.setLogLevel("ERROR");

// Numerisch
window.logger.setLogLevel(0); // DEBUG
```

## ⚡ Performance-Tracking

### Beispiele

**Einfache Messung:**

```javascript
async function addTask() {
  window.logger.startPerformance("addTask", "app");

  try {
    // ... Operation ...
    window.logger.endPerformance("addTask"); // Logged automatisch
  } catch (error) {
    window.logger.endPerformance("addTask", false); // Kein auto-log
    throw error;
  }
}
```

**Mit measureAsync:**

```javascript
const data = await window.logger.measureAsync(
  "loadAllTasks",
  () => SafeStorage.getItem("tasks", []),
  "storage"
);
```

**Performance-Daten abrufen:**

```javascript
const perfData = window.logger.endPerformance("myOperation");
console.log(`Operation dauerte ${perfData.durationMs}ms`);
```

## 🖥️ Log-Viewer

Zugriff auf den Log-Viewer über: `logs.html`

### Features

- **Filtering**: Nach Level, Kategorie, Zeitraum
- **Suche**: Volltextsuche in Logs
- **Export**: JSON, CSV, Text
- **Details**: Klick auf Log zeigt Details (Context, Stack-Trace)
- **Statistiken**: Übersicht über Logs und Fehler
- **Auto-Refresh**: Aktualisierung alle 5 Sekunden
- **Health-Check**: System-Gesundheitsstatus

### Programmatischer Zugriff

```javascript
// Logs abrufen
const allLogs = window.logger.getLogs();

// Gefilterte Logs
const errorLogs = window.logger.getLogs({
  level: "ERROR",
  category: "storage",
  since: Date.now() - 3600000, // Letzte Stunde
  limit: 50,
});

// Statistiken
const stats = window.logger.getStatistics();
console.log(`Total Logs: ${stats.total}`);
console.log(`Recent Errors: ${stats.recentErrors}`);

// Export
const jsonData = window.logger.exportLogs("json");
const csvData = window.logger.exportLogs("csv");
const textData = window.logger.exportLogs("text");

// Download als Datei
LoggerHelpers.downloadLogs(window.logger, "json");
```

## 📌 Best Practices

### 1. Logging-Strategie

**DO:**

```javascript
// Kontext hinzufügen
window.logger.info("Task created", "app", {
  taskId: task.id,
  employee: task.employee,
  hasSubtasks: task.subtasks.length > 0,
});

// Fehler mit Stack-Trace
window.logger.error(
  "Failed to save",
  "storage",
  {
    operation: "saveTasks",
    taskCount: this.tasks.length,
  },
  error
);
```

**DON'T:**

```javascript
// Zu wenig Kontext
window.logger.info("Success", "app");

// Fehler ohne Kontext
window.logger.error("Error", "app");
```

### 2. Performance-Logging

**DO:**

```javascript
// Kritische Operationen tracken
window.logger.startPerformance("addTask", "performance");
// ... operation ...
window.logger.endPerformance("addTask");

// Bei Fehler Performance trotzdem beenden
try {
  window.logger.startPerformance("operation");
  // ...
} catch (error) {
  window.logger.endPerformance("operation", false);
}
```

**DON'T:**

```javascript
// Performance nicht beenden
window.logger.startPerformance("task");
// ... operation ...
// Vergessen endPerformance zu callen
```

### 3. Kategorisierung

Nutze konsistente Kategorien:

```javascript
// Security-Events
window.logger.warn("XSS attempt blocked", "security", { input });

// Storage-Events
window.logger.info("Data saved", "storage", { key, size });

// Encryption-Events
window.logger.error("Encryption failed", "encryption", {}, error);

// Rate-Limiting
window.logger.warn("Rate limit reached", "rate-limit", { limiter });
```

### 4. Log-Hygiene

```javascript
// Regelmäßig Logs bereinigen
window.logger.clear({ level: "DEBUG" }); // Nur DEBUG löschen

// Health-Check durchführen
const health = LoggerHelpers.checkHealth(window.logger);
if (health.status === "critical") {
  console.error("Critical issues:", health.issues);
}

// Log-Größe prüfen
const size = LoggerHelpers.formatLogSize(window.logger.logs);
console.log(`Log size: ${size}`);
```

### 5. Event-Listener

```javascript
// Auf alle Logs hören
window.logger.on("log", (logEntry) => {
  console.log("New log:", logEntry);
});

// Auf Fehler reagieren
window.logger.on("error", (logEntry) => {
  // Benachrichtigung senden
  notifyAdmin(logEntry);
});

// Listener entfernen
window.logger.off("error", callback);
```

## 🔧 API-Referenz

### Logger-Klasse

#### Methoden

##### log(level, message, category, context)

- `level`: Log-Level (DEBUG, INFO, WARN, ERROR, CRITICAL)
- `message`: Log-Nachricht
- `category`: Kategorie
- `context`: Zusätzliche Kontextdaten

##### startPerformance(name, category)

- Startet Performance-Tracking

##### endPerformance(name, logDetails)

- Beendet Performance-Tracking
- Gibt Performance-Daten zurück

##### measureAsync(name, operation, category)

- Misst async Operation automatisch

##### getLogs(filter)

- Gibt gefilterte Logs zurück
- Filter: `{ level, category, since, until, search, limit }`

##### getStatistics()

- Gibt Log-Statistiken zurück

##### exportLogs(format)

- Exportiert Logs als JSON, CSV oder Text

##### clear(filter)

- Löscht Logs (optional gefiltert)

##### setLogLevel(level)

- Setzt minimales Log-Level

##### on(event, callback)

- Registriert Event-Listener

##### off(event, callback)

- Entfernt Event-Listener

##### destroy()

- Beendet Logger und speichert Logs

### Konfiguration

```javascript
const logger = new Logger({
    minLevel: 1,                    // INFO
    maxLogs: 1000,                  // Max. 1000 Logs speichern
    persistLogs: true,              // In LocalStorage speichern
    storageKey: '_gartenplaner_logs',
    consoleOutput: true,            // Auch in Console loggen
    includeStackTrace: true,        // Stack-Traces bei Errors
    timestampFormat: 'ISO',         // ISO, locale, timestamp
    categories: ['app', 'security', ...]
});
```

### LoggerHelpers

#### downloadLogs(logger, format)

- Download Logs als Datei

#### formatLogSize(logs)

- Formatiert Log-Größe

#### checkHealth(logger)

- Prüft System-Gesundheit

## 🎯 Beispiele

### Komplettes Beispiel

```javascript
class MyService {
  async performOperation() {
    // Performance tracken
    window.logger.startPerformance("myOperation", "app");

    try {
      // Operation beginnen
      window.logger.info("Starting operation", "app", {
        user: this.userId,
        type: "create",
      });

      // Rate-Limiting prüfen
      if (window.rateLimiter) {
        const limit = window.rateLimiter.checkLimit("operation");
        if (!limit.allowed) {
          window.logger.warn("Rate limit exceeded", "rate-limit", {
            resetMs: limit.resetMs,
          });
          return;
        }
      }

      // Daten laden
      const data = await window.logger.measureAsync(
        "loadData",
        () => this.loadData(),
        "storage"
      );

      // Daten verarbeiten
      const result = await this.processData(data);

      // Erfolg loggen
      window.logger.info("Operation completed", "app", {
        recordsProcessed: result.length,
        duration: window.logger.endPerformance("myOperation").durationMs,
      });

      return result;
    } catch (error) {
      // Fehler loggen
      window.logger.error(
        "Operation failed",
        "app",
        {
          operation: "performOperation",
          userId: this.userId,
        },
        error
      );

      // Performance beenden
      window.logger.endPerformance("myOperation", false);

      throw error;
    }
  }
}
```

### Monitoring Dashboard

```javascript
// Regelmäßiger Health-Check
setInterval(() => {
  const health = LoggerHelpers.checkHealth(window.logger);
  const stats = window.logger.getStatistics();

  console.log("System Health:", health.status);
  console.log("Total Logs:", stats.total);
  console.log("Recent Errors:", stats.recentErrors);

  if (health.status === "critical") {
    // Benachrichtigung senden
    notifyAdmin({
      status: health.status,
      issues: health.issues,
      recommendations: health.recommendations,
    });
  }
}, 60000); // Alle 60 Sekunden
```

## 🔗 Verwandte Dokumentation

- [ERROR_HANDLING_BEST_PRACTICES.md](./ERROR_HANDLING_BEST_PRACTICES.md) - Error Handling
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error Boundary System
- [SECURITY.md](./SECURITY.md) - Sicherheitsrichtlinien

---

**Version:** 1.0  
**Letzte Aktualisierung:** 2024  
**Status:** ✅ Produktiv
