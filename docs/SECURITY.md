# Sicherheits-Features

## XSS-Schutz und Input-Validierung

Die Anwendung verfügt über umfassende Sicherheitsmechanismen zum Schutz vor Cross-Site-Scripting (XSS) und zur Validierung von Benutzereingaben.

### Implementierte Schutzmaßnahmen

#### 1. HTML-Escaping

Alle Benutzereingaben werden vor der Darstellung escaped:

- Aufgabentitel
- Mitarbeiternamen
- Standortbezeichnungen
- Beschreibungen
- Teilaufgaben
- Filter-Optionen
- Diagramme und Statistiken

#### 2. Input-Validierung

**Aufgaben:**

- Titel: 1-200 Zeichen
- Beschreibung: max. 2000 Zeichen
- Mitarbeiter: 1-100 Zeichen (Pflichtfeld)
- Standort: 1-100 Zeichen (Pflichtfeld)
- Status: nur erlaubte Werte (pending, in-progress, completed)

**Teilaufgaben:**

- Text: 1-200 Zeichen

**Allgemein:**

- Alle Text-Inputs werden getrimmt
- Leerzeichen am Anfang/Ende werden entfernt
- Leere Eingaben werden abgelehnt

#### 3. Sichere DOM-Manipulation

- `Security.escapeHtml()` - Escaped alle HTML-Sonderzeichen
- `Security.sanitizeText()` - Entfernt gefährliche Zeichen
- `Security.validateInput.*` - Verschiedene Validierungs-Funktionen

#### 4. Schutzfunktionen

- URL-Sanitization (nur http/https/mailto erlaubt)
- Event-Handler-Validierung
- LocalStorage-Größenlimit (5MB)
- JSON-Validierung

### Verwendung

Die Security-Utilities sind global verfügbar:

```javascript
// HTML escapen
const safe = Security.escapeHtml(userInput);

// Text validieren
if (Security.validateInput.text(input, 1, 100)) {
  // Input ist gültig
}

// Komplette Aufgabe validieren
const validation = Security.validateTask(taskData);
if (validation.valid) {
  // Aufgabe ist valid
} else {
  console.log(validation.errors);
}
```

### Security-Events Logging

Alle Sicherheits-relevanten Ereignisse werden geloggt:

- Ungültige Eingaben
- Validierungsfehler
- Fehlgeschlagene Operationen

### Best Practices

1. **Immer escapen** vor innerHTML-Verwendung
2. **Immer validieren** vor dem Speichern
3. **Nie direkt** User-Input in HTML einfügen
4. **Verwende** textContent statt innerHTML wo möglich

### Geschützte Bereiche

✅ Aufgaben erstellen & bearbeiten  
✅ Teilaufgaben hinzufügen  
✅ Filter-Selects  
✅ Diagramme und Charts  
✅ History-Timeline  
✅ Suchfunktion  
✅ Benachrichtigungen

### Security-Module

**Datei:** `security.js`  
**Status:** Object.freeze() - nicht modifizierbar  
**Einbindung:** Vor app.js in allen HTML-Dateien

### Hinweise für Entwickler

- Alle neuen Features müssen Security-Utilities verwenden
- Niemals `eval()` oder `innerHTML` mit User-Input verwenden
- Immer Validierung vor localStorage.setItem()
- Bei Unsicherheit: Security.escapeHtml() verwenden
