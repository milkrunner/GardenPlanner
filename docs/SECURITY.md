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

## Backend: Authentifizierung und CSRF

Die API authentifiziert ausschließlich über den Header `X-API-Key` (`middleware/auth.js`,
timing-sicherer Vergleich). Es gibt **keine Cookies, keine Sessions und kein CORS**; der
Browser sendet den Key nur, wenn `src/js/api.js` ihn aktiv als Header setzt.

Ein klassischer CSRF-Angriff nutzt automatisch mitgesendete Anmeldedaten (Cookies). Hier
gibt es keine, daher ist ein CSRF-Token (`csurf`, Double-Submit-Cookie) nicht nötig und
würde nur Cookie-/Session-Infrastruktur ohne Schutzgewinn einführen. Eine fremde Seite
kann den benutzerdefinierten Header `X-API-Key` nur nach einem CORS-Preflight senden, den der
Server nicht freigibt (`Access-Control-*` wird nie gesetzt; `form-action 'self'` in der CSP).
`SameSite` ist nicht relevant, weil keine Cookies gesetzt werden. Die Annahmen sind in
`tests/server-resilience.test.js` abgesichert (Cookie authentifiziert nicht, kein
`Set-Cookie`, keine CORS-Freigabe). Wird später ein Cookie-/Session-Login eingeführt, muss
CSRF-Schutz zeitgleich ergänzt werden.

Ohne `API_KEY` (lokale Entwicklung oder bewusst mit `ALLOW_UNAUTHENTICATED=true`) ist die
API offen; dann schützt auch kein CSRF-Token, weil jeder Client direkt zugreifen kann.
Produktion startet ohne `API_KEY` nicht (siehe `README.md`, Abschnitt Konfiguration).

## Backend: Reverse Proxy (`TRUST_PROXY`)

Standardmäßig vertraut der Server dem Header `X-Forwarded-For` **nicht**: `req.ip` ist die Adresse
der TCP-Verbindung. Das ist für direkt erreichbare Server sicher, weil ein Client den Header sonst
frei setzen könnte, um das Rate-Limit (`express-rate-limit`, Schlüssel `req.ip`) zu umgehen und
falsche Adressen in Request- und Audit-Log (`auth_failure`) zu erzeugen.

Hinter einem Reverse Proxy zeigt dieser Standard die Proxy-Adresse: alle Clients teilen sich ein
Rate-Limit-Fenster. Dann `TRUST_PROXY` setzen (Express-Einstellung `trust proxy`, einmal beim Import
von `src/server/app.js` gelesen):

| Wert                                   | Bedeutung                                                   |
| -------------------------------------- | ----------------------------------------------------------- |
| nicht gesetzt, leer, `false`, `0`      | aus (Standard)                                              |
| Ganzzahl `1`–`32`                      | Anzahl vertrauenswürdiger Proxy-Hops (empfohlen, meist `1`) |
| `loopback`, `linklocal`, `uniquelocal` | Express-Schlüsselwörter, kommagetrennt kombinierbar         |
| IP-Adresse oder CIDR (IPv4/IPv6)       | vertrauenswürdige Proxy-Adressen/-Subnetze, kommagetrennt   |
| `true`                                 | jedem Hop vertrauen (Start mit Warnung, siehe unten)        |

`true` ist nur sicher, wenn der Server ausschließlich über einen Proxy erreichbar ist, der
`X-Forwarded-For` überschreibt oder anfügt. Ist der Server direkt erreichbar, kann jeder Client mit
einem gefälschten Header beliebige Adressen vortäuschen. Bevorzugt eine Hop-Anzahl oder die
Proxy-Subnetze verwenden; bei einer Hop-Anzahl zählt die Adresse von rechts, vorangestellte
gefälschte Einträge werden ignoriert. Ein ungültiger Wert verhindert den Start (Exit-Code 1), damit
ein Tippfehler das Rate-Limit nicht unbemerkt verschlechtert; wird `app.js` ohne diese Prüfung
importiert, gilt „aus“. Tests: `tests/trust-proxy.test.js`.
