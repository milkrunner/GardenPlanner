# Error Boundaries und Fehlerbehandlung

## Übersicht

Die Gartenplaner-Anwendung verfügt über ein umfassendes Error-Handling-System mit automatischer Fehler-Recovery und benutzerfreundlichen Fehlermeldungen.

## Features

### 1. Error Boundary

Globaler Error Handler der alle Fehler abfängt:

- Runtime Errors (JavaScript-Fehler)
- Unhandled Promise Rejections
- Storage-Fehler (LocalStorage quota exceeded)
- DOM-Fehler

### 2. Safe Wrappers

#### SafeStorage

Fehlertolerante LocalStorage-Operationen:

```javascript
// Lesen mit Fallback
const tasks = SafeStorage.getItem("tasks", []);

// Schreiben mit Error Handling
const success = SafeStorage.setItem("tasks", tasksArray);
if (!success) {
  console.log("Speichern fehlgeschlagen");
}
```

#### SafeDOM

Fehlertolerante DOM-Operationen:

```javascript
// QuerySelector mit null-Rückgabe statt Error
const element = SafeDOM.querySelector("#myElement");

// Event Listener mit automatischem Error Handling
SafeDOM.addEventListener(button, "click", handleClick);
```

#### safeExecute / safeAsync

Function Wrapper für automatisches Error Handling:

```javascript
// Synchrone Funktion wrappen
const safeFunction = safeExecute(myFunction, fallbackValue);

// Async Funktion wrappen
const safeAsyncFn = safeAsync(myAsyncFunction, fallbackValue);
```

### 3. Automatische Fehler-Recovery

Das System versucht automatisch, sich von Fehlern zu erholen:

**LocalStorage-Fehler:**

- Automatisches Cleanup alter Daten
- Entfernen von Error-Logs
- Bereinigung von Collaboration-Präsenzdaten

**DOM-Fehler:**

- Automatisches Re-Rendering nach 1 Sekunde
- Wiederherstellung des letzten bekannten Zustands

**Netzwerk-Fehler:**

- Benutzerfreundliche Hinweise
- Retry-Mechanismen (wo sinnvoll)

### 4. User Notifications

Kritische Fehler werden dem Benutzer angezeigt:

**Error Toast:**

- Erscheint unten rechts
- Automatisches Ausblenden nach 8 Sekunden
- Schließbar durch Klick auf X
- Benutzerfreundliche Nachrichten

**Fehlertypen:**

- ⚠️ Storage-Fehler: "Speicher voll"
- 🌐 Netzwerk-Fehler: "Keine Verbindung"
- 🔄 Daten-Fehler: "Seite neu laden"

### 5. Error Logging

Alle Fehler werden geloggt:

- Maximum 50 Fehler im Memory
- Maximum 100 Fehler in LocalStorage
- Automatisches Rotation/Cleanup
- Timestamp und Kontext-Informationen

### 6. Error Callbacks

Registriere Custom Callbacks für Fehlertypen:

```javascript
errorBoundary.onError("storage", (error) => {
  console.log("Storage Fehler:", error);
  // Custom Handling
});
```

## Verwendung

### In app.js integriert

Die Anwendung verwendet automatisch SafeStorage:

```javascript
// Alte Version (unsicher):
localStorage.setItem("tasks", JSON.stringify(tasks));

// Neue Version (sicher):
SafeStorage.setItem("tasks", tasks);
```

### Eigene Funktionen schützen

```javascript
// Function mit Error Handling wrappen
const myFunction = safeExecute(() => {
  // Code der fehlschlagen könnte
  riskyOperation();
}, fallbackValue);

// Async Function wrappen
const myAsyncFn = safeAsync(async () => {
  const data = await fetchData();
  return data;
});
```

### Error Stats abrufen

```javascript
// Fehler-Statistiken
const stats = errorBoundary.getErrorStats();
console.log("Gesamt:", stats.total);
console.log("Nach Typ:", stats.byType);
console.log("Letzte 5:", stats.recent);

// Alle Fehler
const errors = errorBoundary.getErrors();

// Fehler löschen
errorBoundary.clearErrors();
```

## Error-Typen

| Typ       | Beschreibung                 | Recovery    |
| --------- | ---------------------------- | ----------- |
| `runtime` | JavaScript Runtime Errors    | Re-Render   |
| `promise` | Unhandled Promise Rejections | Logging     |
| `storage` | LocalStorage Errors          | Cleanup     |
| `async`   | Async Function Errors        | Fallback    |
| `dom`     | DOM-Operationen              | Null-Return |

## Testing

Teste das Error Handling mit `error-test.html`:

<http://localhost:8000/error-test.html>

Features:

- Runtime Error Tests
- Storage Error Tests
- Async Error Tests
- DOM Error Tests
- Recovery Tests
- Callback Tests
- Error Statistics

## Best Practices

### 1. Immer SafeStorage verwenden

```javascript
// ❌ Nicht:
localStorage.setItem(key, JSON.stringify(data));

// ✅ Sondern:
SafeStorage.setItem(key, data);
```

### 2. Kritische Funktionen wrappen

```javascript
// ❌ Nicht:
async function loadData() {
  const response = await fetch(url);
  return response.json();
}

// ✅ Sondern:
const loadData = safeAsync(async () => {
  const response = await fetch(url);
  return response.json();
}, []);
```

### 3. DOM-Operationen prüfen

```javascript
// ❌ Nicht:
const element = document.querySelector("#myId");
element.addEventListener("click", handler);

// ✅ Sondern:
const element = SafeDOM.querySelector("#myId");
if (element) {
  SafeDOM.addEventListener(element, "click", handler);
}
```

### 4. Callbacks für Custom Handling

```javascript
errorBoundary.onError("storage", (error) => {
  // Zeige UI-Hinweis
  showStorageWarning();
});
```

## Fehlerbehandlung-Reihenfolge

1. **Error tritt auf**
2. **Error Boundary fängt ab**
3. **Error wird geloggt** (Memory + LocalStorage)
4. **Callbacks werden ausgeführt**
5. **User-Notification** (bei kritischen Fehlern)
6. **Recovery-Versuch** (automatisch)
7. **Fallback** (wenn verfügbar)

## Konfiguration

Die Error Boundary ist vorkonfiguriert, kann aber angepasst werden:

```javascript
// Maximale Error-Anzahl ändern
errorBoundary.maxErrors = 100;

// Production-Modus (weniger Logging)
errorBoundary.isProduction = true;
```

## Development vs Production

**Development:**

- Ausführliche Console-Logs
- Alle Fehler werden angezeigt
- Stack Traces verfügbar

**Production:**

- Minimales Logging
- Nur kritische Fehler-Notifications
- Fehler an Monitoring-Service senden (TODO)

## Monitoring Integration

Für Production-Umgebungen kann das Logging erweitert werden:

```javascript
errorBoundary.onError("runtime", (error) => {
  // Sende an Monitoring-Service
  sendToSentry(error);
  sendToLogRocket(error);
});
```

## Troubleshooting

### "Storage voll" Fehler

1. Automatischer Cleanup läuft
2. Alte Daten werden entfernt
3. User wird benachrichtigt
4. Lösung: Alte Aufgaben archivieren/löschen

### Wiederkehrende Fehler

1. Prüfe Error-Log: `errorBoundary.getErrors()`
2. Identifiziere Pattern
3. Implementiere spezifischen Fix
4. Registriere Callback für Monitoring

### DOM-Fehler

1. Error Boundary fängt ab
2. Re-Render nach 1 Sekunde
3. Wenn persistent: Seite neu laden

## Dateien

- `error-handler.js` - Error Boundary Implementation
- `error-test.html` - Test Suite
- `styles.css` - Error Toast Styles (`.error-toast`)
- `app.js` - Integration mit SafeStorage

## Dependencies

- `security.js` - Für escapeHtml in Error Messages
- Alle HTML-Files müssen error-handler.js einbinden

## Browser-Kompatibilität

- ✅ Chrome/Edge (Modern)
- ✅ Firefox (Modern)
- ✅ Safari (Modern)
- ⚠️ IE11 (Nicht getestet)

## Performance

- Minimaler Overhead (~1ms pro Error)
- Keine Performance-Einbußen im Happy Path
- Error-Logging ist asynchron
- Automatisches Cleanup verhindert Memory-Leaks
