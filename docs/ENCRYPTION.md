# 🔐 Data Encryption - Gartenplaner

## Übersicht

Der Gartenplaner verwendet **AES-GCM Verschlüsselung** zum Schutz sensibler Daten im LocalStorage. Die Verschlüsselung erfolgt automatisch und transparent für den Benutzer mit der modernen Web Crypto API.

## Features

✅ **AES-GCM 256-bit Verschlüsselung** - Military-grade Sicherheit  
✅ **Automatische Ver-/Entschlüsselung** - Transparent im SafeStorage  
✅ **Sicheres Key-Management** - Automatische Key-Generierung und -Speicherung  
✅ **Key-Rotation** - Verschlüsselungskeys können erneuert werden  
✅ **Key-Backup** - Export/Import mit optionaler Passwort-Verschlüsselung  
✅ **Browser-Kompatibilität** - Fallback bei fehlender Unterstützung  
✅ **Performance-optimiert** - Keine spürbare Verzögerung

## Technische Details

### Algorithmus

- **Cipher**: AES-GCM (Galois/Counter Mode)
- **Key-Länge**: 256 bits
- **IV-Länge**: 96 bits (12 bytes)
- **Authentication**: Integrierter AEAD-Schutz

### Verschlüsselungsformat

```javascript
{
    encrypted: true,
    data: "base64-encoded-data",  // IV + Ciphertext
    algorithm: "AES-GCM",
    version: 1
}
```

### Unverschlüsselte Daten (Fallback)

```javascript
{
    encrypted: false,
    data: <original-data>
}
```

## Verwendung

### Automatische Verschlüsselung (empfohlen)

Die Verschlüsselung erfolgt **automatisch** beim Verwenden von `SafeStorage`:

```javascript
// Daten speichern - wird automatisch verschlüsselt
await SafeStorage.setItem("gartenplaner_tasks", tasks);

// Daten laden - wird automatisch entschlüsselt
const tasks = await SafeStorage.getItem("gartenplaner_tasks", []);
```

**Wichtig**: `SafeStorage.setItem()` und `getItem()` sind jetzt **async** und geben Promises zurück!

### Manuelle Verschlüsselung

Für spezielle Anwendungsfälle kann die Verschlüsselung auch direkt verwendet werden:

```javascript
// Daten verschlüsseln
const encrypted = await window.dataEncryption.encrypt({
  name: "Vertraulich",
  data: "Geheime Information",
});

// Daten entschlüsseln
const decrypted = await window.dataEncryption.decrypt(encrypted);
```

### Welche Daten werden verschlüsselt?

**Verschlüsselt**:

- Alle Keys, die mit `gartenplaner_` beginnen
- Aufgaben (`gartenplaner_tasks`)
- Archivierte Aufgaben (`gartenplaner_archived_tasks`)
- Benutzereinstellungen

**Nicht verschlüsselt** (interne Keys):

- `_gartenplaner_enc_key` - Verschlüsselungskey selbst
- `_gartenplaner_salt` - Salt für Passwort-Ableitung
- `gartenplaner_errors` - Error-Logs (optional verschlüsseln)

## Key-Management

### Key-Generierung

Ein Verschlüsselungskey wird **automatisch** beim ersten Start generiert:

```javascript
// Automatisch beim Laden
window.dataEncryption = new DataEncryption();
```

### Key-Rotation

Keys können aus Sicherheitsgründen regelmäßig rotiert werden:

```javascript
// Alle Daten werden mit neuem Key neu verschlüsselt
await window.dataEncryption.rotateKey();
```

**Empfehlung**: Key-Rotation alle 6-12 Monate durchführen.

### Key-Backup (Export)

Keys können für Disaster Recovery exportiert werden:

```javascript
// Unverschlüsselter Export (nur für sicheren Speicherort!)
const keyData = await window.dataEncryption.exportKey();

// Verschlüsselter Export mit Passwort (empfohlen)
const keyData = await window.dataEncryption.exportKey(
  "MeinSicheresPasswort123!"
);
```

### Key-Wiederherstellung (Import)

Keys können aus einem Backup wiederhergestellt werden:

```javascript
// Import aus unverschlüsseltem Backup
await window.dataEncryption.importKeyFromBackup(keyData);

// Import aus verschlüsseltem Backup
await window.dataEncryption.importKeyFromBackup(
  keyData,
  "MeinSicheresPasswort123!"
);
```

### Keys löschen

```javascript
// WARNUNG: Verschlüsselte Daten können danach nicht mehr entschlüsselt werden!
window.dataEncryption.clearKeys();
```

## Status prüfen

```javascript
const status = window.dataEncryption.getStatus();
console.log(status);
// {
//   supported: true,
//   keyGenerated: true,
//   algorithm: 'AES-GCM',
//   keyLength: 256,
//   ready: true
// }
```

## Browser-Kompatibilität

### Unterstützte Browser

- ✅ Chrome/Edge 37+
- ✅ Firefox 34+
- ✅ Safari 11+
- ✅ Opera 24+

### Fallback-Verhalten

Wenn die Web Crypto API nicht verfügbar ist:

- Daten werden **unverschlüsselt** gespeichert
- `encrypted: false` Flag im gespeicherten Objekt
- Console-Warnung wird ausgegeben
- Funktionalität bleibt erhalten

## Migration bestehender Daten

Alte unverschlüsselte Daten werden beim ersten Zugriff automatisch verschlüsselt:

```javascript
// Alte Daten laden
const oldTasks = localStorage.getItem("gartenplaner_tasks");

// Mit SafeStorage neu speichern - wird verschlüsselt
await SafeStorage.setItem("gartenplaner_tasks", JSON.parse(oldTasks));
```

## Security Best Practices

### ✅ Do's

1. **Verwende immer SafeStorage** für sensible Daten
2. **Exportiere Keys regelmäßig** für Backups
3. **Verschlüssele Key-Backups** mit starkem Passwort
4. **Rotiere Keys periodisch** (6-12 Monate)
5. **Teste Verschlüsselung** mit encryption-test.html
6. **Überprüfe Browser-Support** vor kritischen Operationen

### ❌ Don'ts

1. **Speichere Keys nicht in Git** oder Cloud-Storage
2. **Verwende keine schwachen Passwörter** für Key-Export
3. **Teile Keys nicht unverschlüsselt**
4. **Lösche Keys nicht ohne Backup**
5. **Verlasse dich nicht auf Client-Verschlüsselung allein** - verwende HTTPS!

## Testing

### Automatische Tests

Öffne `encryption-test.html` im Browser:

```bash
# Tests umfassen:
- Text verschlüsseln/entschlüsseln
- JSON-Objekte verschlüsseln
- Arrays verschlüsseln
- Sonderzeichen und Unicode
- Große Datenmengen (1000+ Objekte)
- Verschlüsselungsformat validieren
- Fallback-Verhalten
```

### Manuelle Tests

```javascript
// Test in Browser Console
const test = async () => {
  const original = { test: "data", value: 123 };
  const encrypted = await window.dataEncryption.encrypt(original);
  const decrypted = await window.dataEncryption.decrypt(encrypted);
  console.log(
    "Erfolg:",
    JSON.stringify(original) === JSON.stringify(decrypted)
  );
};
test();
```

## Troubleshooting

### Problem: "Verschlüsselung nicht verfügbar"

**Ursache**: Browser unterstützt Web Crypto API nicht

**Lösung**:

1. Browser aktualisieren
2. HTTPS verwenden (nicht HTTP oder file://)
3. Fallback-Modus akzeptieren (Warnung beachten)

### Problem: "Key nicht verfügbar"

**Ursache**: Key wurde gelöscht oder nicht geladen

**Lösung**:

1. Seite neu laden (Key wird automatisch generiert)
2. Key aus Backup importieren
3. Neue Key-Generierung mit `rotateKey()`

### Problem: "Entschlüsselung fehlgeschlagen"

**Ursache**: Falscher Key, korrupte Daten oder falsches Format

**Lösung**:

1. Key-Backup importieren
2. Daten neu generieren
3. Error-Logs prüfen (Console)

### Problem: "Storage quota exceeded"

**Ursache**: Verschlüsselte Daten sind größer als Originale

**Lösung**:

1. Storage-Monitoring prüfen (storage-test.html)
2. Alte Daten archivieren oder löschen
3. Key-Rotation durchführen (kompaktere Keys)

## Performance

### Verschlüsselungs-Overhead

- **Kleine Daten (< 1KB)**: ~2-5ms
- **Mittlere Daten (1-10KB)**: ~5-15ms
- **Große Daten (> 100KB)**: ~50-200ms

### Storage-Overhead

Verschlüsselte Daten sind ca. **30-40% größer** als unverschlüsselt:

- Original: 10KB
- Verschlüsselt: ~13-14KB (Base64 + IV + Format)

## Architektur

```flowchart
┌─────────────────────────────────────────────┐
│           App.js / User Code                │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│          SafeStorage (Wrapper)              │
│  - getItem() / setItem()                    │
│  - Automatische Ver-/Entschlüsselung        │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│      DataEncryption (encryption.js)         │
│  - encrypt() / decrypt()                    │
│  - Key-Management                           │
│  - AES-GCM mit Web Crypto API               │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│      Browser LocalStorage                   │
│  - Verschlüsselte Daten: Base64             │
│  - Format: {encrypted, data, algorithm}     │
└─────────────────────────────────────────────┘
```

## Entwicklung

### Code-Reihenfolge (wichtig!)

```html
<script src="security.js"></script>
<!-- 1. Security/XSS -->
<script src="encryption.js"></script>
<!-- 2. Encryption -->
<script src="error-handler.js"></script>
<!-- 3. Error Handling + SafeStorage -->
<script src="app.js"></script>
<!-- 4. App Logic -->
```

### Debugging

```javascript
// Aktiviere Verschlüsselung-Debugging
window.dataEncryption.debug = true;

// Zeige Status
console.log(window.dataEncryption.getStatus());

// Prüfe verschlüsselte Daten
const raw = localStorage.getItem("gartenplaner_tasks");
console.log("Verschlüsselt:", JSON.parse(raw));
```

## Zukünftige Erweiterungen

- [ ] **IndexedDB-Integration** für größere Datenmengen
- [ ] **Hardware-Key-Support** (WebAuthn/FIDO2)
- [ ] **Multi-User-Verschlüsselung** mit separaten Keys
- [ ] **End-to-End-Verschlüsselung** für Cloud-Sync
- [ ] **Key-Derivation von Benutzerpasswort**
- [ ] **Automatische Key-Rotation** nach Zeitplan

## Weitere Ressourcen

- [Web Crypto API Dokumentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [AES-GCM Spezifikation](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

## Support

Bei Fragen oder Problemen:

1. Prüfe diese Dokumentation
2. Teste mit encryption-test.html
3. Überprüfe Browser-Console auf Fehler
4. Öffne ein Issue im Repository

---

**⚠️ Wichtiger Hinweis**: Client-seitige Verschlüsselung schützt Daten nur im LocalStorage. Für vollständigen Schutz ist immer auch **HTTPS**, **Server-seitige Sicherheit** und **sichere Authentifizierung** erforderlich!
