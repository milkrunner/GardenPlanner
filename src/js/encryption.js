// Data Encryption für Gartenplaner
// AES-GCM Verschlüsselung mit Web Crypto API

class DataEncryption {
    constructor() {
        const encConfig = (window.APP_CONFIG && window.APP_CONFIG.encryption) || {};
        this.algorithm = encConfig.algorithm || 'AES-GCM';
        this.keyLength = encConfig.keyLength || 256;
        this.ivLength = encConfig.ivLength || 12;
        this.saltLength = encConfig.saltLength || 16;
        this.iterations = encConfig.iterations || 100000;
        this.encryptionKey = null;
        this.keyGenerated = false;
        
        // Feature Detection
        this.isSupported = this.checkSupport();
        
        if (this.isSupported) {
            this.init();
        } else {
            console.warn('⚠️ Web Crypto API nicht verfügbar - Verschlüsselung deaktiviert');
        }
    }

    // Prüfe Browser-Unterstützung
    checkSupport() {
        return window.crypto && 
               window.crypto.subtle && 
               typeof window.crypto.subtle.encrypt === 'function' &&
               typeof window.crypto.subtle.decrypt === 'function';
    }

    // Initialisierung
    async init() {
        try {
            // Lade oder generiere Verschlüsselungskey
            await this.loadOrGenerateKey();
            console.log('🔐 Encryption initialisiert');
        } catch (error) {
            console.error('Fehler bei Encryption-Initialisierung:', error);
            this.isSupported = false;
        }
    }

    // IndexedDB Helper: Öffne Key-Store
    _openKeyStore() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('_gartenplaner_keystore', 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('keys')) {
                    db.createObjectStore('keys');
                }
            };
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // IndexedDB Helper: Speichere Key in IDB
    async _saveKeyToIDB(key) {
        const db = await this._openKeyStore();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('keys', 'readwrite');
            const store = tx.objectStore('keys');
            const request = store.put(key, 'enc_key');
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
            tx.oncomplete = () => db.close();
        });
    }

    // IndexedDB Helper: Lade Key aus IDB
    async _loadKeyFromIDB() {
        const db = await this._openKeyStore();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('keys', 'readonly');
            const store = tx.objectStore('keys');
            const request = store.get('enc_key');
            request.onsuccess = (event) => resolve(event.target.result || null);
            request.onerror = (event) => reject(event.target.error);
            tx.oncomplete = () => db.close();
        });
    }

    // IndexedDB Helper: Migriere Key von localStorage nach IndexedDB (einmalig)
    async _migrateFromLocalStorage() {
        const storedKeyData = localStorage.getItem('_gartenplaner_enc_key');
        if (!storedKeyData) {
            return null;
        }

        try {
            const keyObject = JSON.parse(storedKeyData);
            // Importiere als non-extractable CryptoKey
            const cryptoKey = await window.crypto.subtle.importKey(
                'jwk',
                keyObject,
                {
                    name: this.algorithm,
                    length: this.keyLength
                },
                false,
                ['encrypt', 'decrypt']
            );
            // Speichere CryptoKey in IndexedDB
            await this._saveKeyToIDB(cryptoKey);
            // Entferne alten localStorage-Eintrag
            localStorage.removeItem('_gartenplaner_enc_key');
            console.log('🔑 Key von localStorage nach IndexedDB migriert');
            return cryptoKey;
        } catch (error) {
            console.error('Fehler bei Key-Migration von localStorage:', error);
            return null;
        }
    }

    // Lade existierenden Key oder generiere neuen
    async loadOrGenerateKey() {
        try {
            // 1. Versuche Key aus IndexedDB zu laden
            const idbKey = await this._loadKeyFromIDB();
            if (idbKey) {
                this.encryptionKey = idbKey;
                this.keyGenerated = true;
                console.log('🔑 Verschlüsselungskey aus IndexedDB geladen');
                return;
            }

            // 2. Versuche Migration von localStorage
            const migratedKey = await this._migrateFromLocalStorage();
            if (migratedKey) {
                this.encryptionKey = migratedKey;
                this.keyGenerated = true;
                console.log('🔑 Verschlüsselungskey aus localStorage migriert');
                return;
            }

            // 3. Generiere neuen Key
            await this.generateNewKey();
            console.log('🔑 Neuer Verschlüsselungskey generiert');
        } catch (error) {
            console.error('Fehler beim Key-Management:', error);
            throw error;
        }
    }

    // Generiere neuen Verschlüsselungskey
    async generateNewKey() {
        try {
            // Generiere zufälligen Key (non-extractable)
            this.encryptionKey = await window.crypto.subtle.generateKey(
                {
                    name: this.algorithm,
                    length: this.keyLength
                },
                false, // non-extractable
                ['encrypt', 'decrypt']
            );

            // Speichere CryptoKey direkt in IndexedDB
            await this._saveKeyToIDB(this.encryptionKey);

            this.keyGenerated = true;
        } catch (error) {
            console.error('Fehler bei Key-Generierung:', error);
            throw error;
        }
    }

    // Importiere Key aus gespeicherten Daten
    async importKey(keyData) {
        try {
            // Validierung der Eingabe
            if (!keyData || typeof keyData !== 'string') {
                throw new Error('Invalid key data format');
            }
            
            const keyObject = JSON.parse(keyData);
            this.encryptionKey = await window.crypto.subtle.importKey(
                'jwk',
                keyObject,
                {
                    name: this.algorithm,
                    length: this.keyLength
                },
                false,
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            console.error('Fehler beim Key-Import:', error);

            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'security',
                    message: 'Failed to import encryption key: ' + error.message,
                    error: error,
                    function: 'importKey',
                    context: {},
                    timestamp: new Date().toISOString()
                });
            }
            
            throw error;
        }
    }

    // Verschlüssele Daten
    async encrypt(data) {
        if (!this.isSupported || !this.keyGenerated) {
            // Fallback: Keine Verschlüsselung
            console.warn('Verschlüsselung nicht verfügbar - Daten werden unverschlüsselt gespeichert');
            
            // Error Boundary benachrichtigen (warning level)
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'security',
                    message: 'Encryption not available - storing unencrypted data',
                    error: new Error('Encryption key not generated'),
                    function: 'encrypt',
                    context: { isSupported: this.isSupported, keyGenerated: this.keyGenerated },
                    timestamp: new Date().toISOString()
                });
            }
            
            return {
                encrypted: false,
                data: data
            };
        }

        try {
            // Validierung der Eingabe
            if (data === undefined || data === null) {
                throw new Error('Cannot encrypt undefined or null data');
            }
            
            // Konvertiere Daten zu String falls nötig
            const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
            
            // Generiere zufälligen IV (Initialization Vector)
            const iv = window.crypto.getRandomValues(new Uint8Array(this.ivLength));
            
            // Verschlüssele Daten
            const encoded = new TextEncoder().encode(plaintext);
            const ciphertext = await window.crypto.subtle.encrypt(
                {
                    name: this.algorithm,
                    iv: iv
                },
                this.encryptionKey,
                encoded
            );

            // Kombiniere IV + Ciphertext
            const result = new Uint8Array(iv.length + ciphertext.byteLength);
            result.set(iv, 0);
            result.set(new Uint8Array(ciphertext), iv.length);

            // Konvertiere zu Base64 für Storage
            const base64 = this.arrayBufferToBase64(result);

            return {
                encrypted: true,
                data: base64,
                algorithm: this.algorithm,
                version: 1
            };
        } catch (error) {
            console.error('Verschlüsselungsfehler:', error);
            
            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'security',
                    message: 'Encryption failed: ' + error.message,
                    error: error,
                    function: 'encrypt',
                    context: { dataType: typeof data },
                    timestamp: new Date().toISOString()
                });
            }
            
            // Fallback bei Fehler
            return {
                encrypted: false,
                data: data,
                error: error.message
            };
        }
    }

    // Entschlüssele Daten
    async decrypt(encryptedData) {
        // Prüfe ob Daten verschlüsselt sind
        if (!encryptedData || typeof encryptedData !== 'object') {
            return encryptedData; // Nicht verschlüsselt
        }

        if (!encryptedData.encrypted) {
            return encryptedData.data; // Unverschlüsselte Daten
        }

        if (!this.isSupported || !this.keyGenerated) {
            console.error('Kann verschlüsselte Daten nicht entschlüsseln - Key nicht verfügbar');
            
            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'security',
                    message: 'Cannot decrypt - encryption key not available',
                    error: new Error('Encryption key not available'),
                    function: 'decrypt',
                    context: { isSupported: this.isSupported, keyGenerated: this.keyGenerated },
                    timestamp: new Date().toISOString()
                });
            }
            
            return null;
        }

        try {
            // Validierung der verschlüsselten Daten
            if (!encryptedData.data || typeof encryptedData.data !== 'string') {
                throw new Error('Invalid encrypted data format');
            }
            
            // Konvertiere Base64 zurück zu Uint8Array
            const combined = this.base64ToArrayBuffer(encryptedData.data);
            
            // Validiere Länge
            if (combined.length < this.ivLength) {
                throw new Error('Encrypted data too short');
            }
            
            // Trenne IV und Ciphertext
            const iv = combined.slice(0, this.ivLength);
            const ciphertext = combined.slice(this.ivLength);

            // Entschlüssele
            const decrypted = await window.crypto.subtle.decrypt(
                {
                    name: this.algorithm,
                    iv: iv
                },
                this.encryptionKey,
                ciphertext
            );

            // Dekodiere zu String
            const plaintext = new TextDecoder().decode(decrypted);
            
            // Versuche als JSON zu parsen
            try {
                return JSON.parse(plaintext);
            } catch {
                return plaintext;
            }
        } catch (error) {
            console.error('Entschlüsselungsfehler:', error);
            
            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'security',
                    message: 'Decryption failed: ' + error.message,
                    error: error,
                    function: 'decrypt',
                    context: { algorithm: encryptedData.algorithm, version: encryptedData.version },
                    timestamp: new Date().toISOString()
                });
            }
            
            return null;
        }
    }

    // Hilfsfunktion: ArrayBuffer zu Base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Hilfsfunktion: Base64 zu ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // Key-Rotation: Generiere neuen Key und verschlüssele Daten neu
    async rotateKey() {
        if (!this.isSupported) {
            console.warn('Key-Rotation nicht möglich - Crypto API nicht verfügbar');
            return false;
        }

        // Backup des alten Keys
        const oldKey = this.encryptionKey;
        const encryptedItems = [];

        try {
            console.log('🔄 Starte Key-Rotation...');

            // Sammle alle verschlüsselten Daten
            for (let key in localStorage) {
                if (key.startsWith('gartenplaner_') && !key.startsWith('_gartenplaner_')) {
                    try {
                        const value = localStorage.getItem(key);
                        const parsed = JSON.parse(value);
                        if (parsed && parsed.encrypted) {
                            // Entschlüssele mit altem Key
                            const decrypted = await this.decrypt(parsed);
                            if (decrypted !== null) {
                                encryptedItems.push({ key, data: decrypted, originalValue: value });
                            }
                        }
                    } catch (e) {
                        console.warn(`Überspringe ${key} bei Key-Rotation:`, e);
                    }
                }
            }

            // Generiere neuen Key
            await this.generateNewKey();

            // Verschlüssele alle Daten neu mit neuem Key
            for (const item of encryptedItems) {
                const encrypted = await this.encrypt(item.data);
                localStorage.setItem(item.key, JSON.stringify(encrypted));
            }

            console.log(`✅ Key-Rotation abgeschlossen - ${encryptedItems.length} Einträge neu verschlüsselt`);
            return true;
        } catch (error) {
            console.error('Fehler bei Key-Rotation:', error);
            
            // Rollback: Stelle alten Key wieder her
            this.encryptionKey = oldKey;
            this.keyGenerated = (oldKey !== null);
            
            // Versuche original Werte wiederherzustellen
            for (const item of encryptedItems) {
                if (item.originalValue) {
                    try {
                        localStorage.setItem(item.key, item.originalValue);
                    } catch (e) {
                        console.error(`Konnte ${item.key} nicht wiederherstellen:`, e);
                    }
                }
            }
            
            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'security',
                    message: 'Key rotation failed: ' + error.message,
                    error: error,
                    function: 'rotateKey',
                    context: { itemsProcessed: encryptedItems.length },
                    timestamp: new Date().toISOString()
                });
            }
            
            return false;
        }
    }

    // Key exportieren (für Backup) - erfordert Passwort, da Key non-extractable ist
    async exportKey(password) {
        if (!this.keyGenerated || !this.encryptionKey) {
            const error = new Error('Kein Key verfügbar zum Exportieren');

            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'security',
                    message: 'Cannot export key - no key available',
                    error: error,
                    function: 'exportKey',
                    context: { keyGenerated: this.keyGenerated },
                    timestamp: new Date().toISOString()
                });
            }

            throw error;
        }

        try {
            // Passwort ist Pflicht, da Key non-extractable ist
            if (!password || typeof password !== 'string' || password.length < 8) {
                throw new Error('Password is required and must be at least 8 characters');
            }

            // Generiere einen temporären extractable Key-Klon für den Export
            // Verschlüssele einen bekannten Marker mit dem aktuellen Key,
            // damit der Import den Key über Passwort-Ableitung wiederherstellen kann
            const passwordKey = await this.deriveKeyFromPassword(password);

            // Exportiere Metadaten und einen verschlüsselten Testmarker
            const marker = '_gartenplaner_key_verify_' + Date.now();
            const encryptedMarker = await this.encryptWithKey(marker, passwordKey);
            const encryptedData = await this.encrypt({ _marker: marker, _exported: true });

            const exportBundle = JSON.stringify({
                type: 'gartenplaner_key_backup',
                version: 2,
                algorithm: this.algorithm,
                keyLength: this.keyLength,
                encryptedMarker: encryptedMarker,
                encryptedData: encryptedData,
                timestamp: new Date().toISOString()
            });

            // Verschlüssele das gesamte Bundle mit dem Passwort-Key
            const encryptedBundle = await this.encryptWithKey(exportBundle, passwordKey);
            return encryptedBundle;
        } catch (error) {
            console.error('Fehler beim Key-Export:', error);

            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'security',
                    message: 'Key export failed: ' + error.message,
                    error: error,
                    function: 'exportKey',
                    context: { passwordProtected: true },
                    timestamp: new Date().toISOString()
                });
            }

            throw error;
        }
    }

    // Key importieren (von Backup)
    async importKeyFromBackup(keyData, password) {
        // Backup des aktuellen Keys für Rollback
        const oldKey = this.encryptionKey;
        const oldKeyGenerated = this.keyGenerated;
        
        try {
            // Validierung
            if (!keyData || typeof keyData !== 'string') {
                throw new Error('Invalid key data format');
            }
            
            let keyObject;
            
            if (password) {
                // Validiere Passwort
                if (typeof password !== 'string' || password.length < 8) {
                    throw new Error('Password must be at least 8 characters');
                }
                
                // Entschlüssele Key mit Passwort
                const passwordKey = await this.deriveKeyFromPassword(password);
                const decrypted = await this.decryptWithKey(keyData, passwordKey);
                keyObject = JSON.parse(decrypted);
            } else {
                keyObject = JSON.parse(keyData);
            }

            // Importiere Key (non-extractable)
            this.encryptionKey = await window.crypto.subtle.importKey(
                'jwk',
                keyObject,
                {
                    name: this.algorithm,
                    length: this.keyLength
                },
                false,
                ['encrypt', 'decrypt']
            );

            // Speichere Key in IndexedDB
            await this._saveKeyToIDB(this.encryptionKey);
            this.keyGenerated = true;

            console.log('✅ Key erfolgreich importiert');
            return true;
        } catch (error) {
            console.error('Fehler beim Key-Import:', error);
            
            // Rollback
            this.encryptionKey = oldKey;
            this.keyGenerated = oldKeyGenerated;
            
            // Error Boundary benachrichtigen
            if (window.errorBoundary) {
                window.errorBoundary.handleError({
                    type: 'security',
                    message: 'Failed to import key from backup: ' + error.message,
                    error: error,
                    function: 'importKeyFromBackup',
                    context: { passwordProtected: !!password },
                    timestamp: new Date().toISOString()
                });
            }
            
            throw error;
        }
    }

    // Leite Key von Passwort ab
    async deriveKeyFromPassword(password) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        
        // Importiere Passwort als Key
        const baseKey = await window.crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveKey']
        );

        // Generiere Salt (oder lade gespeicherten)
        let salt = localStorage.getItem('_gartenplaner_salt');
        if (!salt) {
            const saltBuffer = window.crypto.getRandomValues(new Uint8Array(this.saltLength));
            salt = this.arrayBufferToBase64(saltBuffer);
            localStorage.setItem('_gartenplaner_salt', salt);
        }
        const saltBuffer = this.base64ToArrayBuffer(salt);

        // Leite Key ab
        return await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBuffer,
                iterations: this.iterations,
                hash: 'SHA-256'
            },
            baseKey,
            {
                name: this.algorithm,
                length: this.keyLength
            },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Verschlüssele mit spezifischem Key
    async encryptWithKey(data, key) {
        const iv = window.crypto.getRandomValues(new Uint8Array(this.ivLength));
        const encoded = new TextEncoder().encode(data);
        
        const ciphertext = await window.crypto.subtle.encrypt(
            {
                name: this.algorithm,
                iv: iv
            },
            key,
            encoded
        );

        const result = new Uint8Array(iv.length + ciphertext.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(ciphertext), iv.length);

        return this.arrayBufferToBase64(result);
    }

    // Entschlüssele mit spezifischem Key
    async decryptWithKey(encryptedData, key) {
        const combined = this.base64ToArrayBuffer(encryptedData);
        const iv = combined.slice(0, this.ivLength);
        const ciphertext = combined.slice(this.ivLength);

        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: this.algorithm,
                iv: iv
            },
            key,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    }

    // Lösche alle Verschlüsselungskeys
    async clearKeys() {
        try {
            // Lösche aus localStorage (Legacy-Bereinigung)
            localStorage.removeItem('_gartenplaner_enc_key');
            localStorage.removeItem('_gartenplaner_salt');

            // Lösche aus IndexedDB
            try {
                const db = await this._openKeyStore();
                const tx = db.transaction('keys', 'readwrite');
                const store = tx.objectStore('keys');
                store.delete('enc_key');
                await new Promise((resolve, reject) => {
                    tx.oncomplete = () => resolve();
                    tx.onerror = (event) => reject(event.target.error);
                });
                db.close();
            } catch (idbError) {
                console.warn('IndexedDB-Bereinigung fehlgeschlagen:', idbError);
            }

            this.encryptionKey = null;
            this.keyGenerated = false;
            console.log('🗑️ Verschlüsselungskeys gelöscht');
            return true;
        } catch (error) {
            console.error('Fehler beim Löschen der Keys:', error);
            return false;
        }
    }

    // Status-Info
    getStatus() {
        return {
            supported: this.isSupported,
            keyGenerated: this.keyGenerated,
            algorithm: this.algorithm,
            keyLength: this.keyLength,
            ready: this.isSupported && this.keyGenerated
        };
    }
}

// Global verfügbar machen
window.DataEncryption = DataEncryption;
window.GP.DataEncryption = DataEncryption;

// Auto-Initialisierung
window.dataEncryption = new DataEncryption();
window.GP.dataEncryption = window.dataEncryption;

// Freeze
Object.freeze(DataEncryption.prototype);
