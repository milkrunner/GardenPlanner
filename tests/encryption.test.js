/**
 * Jest tests for src/js/encryption.js (client-side DataEncryption class)
 * Migrated from tests/encryption-test.html (#147)
 *
 * The source file is a browser script that uses Web Crypto API, IndexedDB,
 * localStorage, btoa/atob.  We create a minimal mock environment to load
 * the class, then test the functions that are feasible in Node.js.
 *
 * Node.js provides crypto.subtle (Web Crypto) natively, so actual
 * encrypt/decrypt round-trips work without a browser.
 */

const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

// ---------------------------------------------------------------------------
// Helpers: btoa / atob polyfills for Node
// ---------------------------------------------------------------------------

function btoa(str) {
    return Buffer.from(str, 'binary').toString('base64');
}

function atob(b64) {
    return Buffer.from(b64, 'base64').toString('binary');
}

// ---------------------------------------------------------------------------
// Bootstrap: set up minimal browser globals, eval encryption.js
// ---------------------------------------------------------------------------

let DataEncryption;

beforeAll(() => {
    // In-memory stores to replace localStorage and IndexedDB
    const storage = {};
    const fakeLocalStorage = {
        getItem: (key) => (key in storage ? storage[key] : null),
        setItem: (key, value) => { storage[key] = String(value); },
        removeItem: (key) => { delete storage[key]; },
    };

    // Fake IndexedDB: stores values in a plain object
    const idbStore = {};
    const fakeIndexedDB = {
        open: () => {
            const request = {};
            // Simulate async success on next tick
            setTimeout(() => {
                const db = {
                    objectStoreNames: { contains: (name) => name in idbStore },
                    createObjectStore: (name) => { idbStore[name] = {}; },
                    transaction: (storeName, mode) => {
                        const store = {
                            put: (value, key) => {
                                if (!idbStore[storeName]) idbStore[storeName] = {};
                                idbStore[storeName][key] = value;
                                const req = {};
                                setTimeout(() => req.onsuccess && req.onsuccess(), 0);
                                return req;
                            },
                            get: (key) => {
                                const val = idbStore[storeName] ? idbStore[storeName][key] : undefined;
                                const req = { result: val || null };
                                setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0);
                                return req;
                            },
                            delete: (key) => {
                                if (idbStore[storeName]) delete idbStore[storeName][key];
                                const req = {};
                                setTimeout(() => req.onsuccess && req.onsuccess(), 0);
                                return req;
                            },
                        };
                        const tx = {
                            objectStore: () => store,
                            oncomplete: null,
                            onerror: null,
                        };
                        setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
                        return tx;
                    },
                    close: () => {},
                };
                // fire upgradeneeded then onsuccess
                if (request.onupgradeneeded) {
                    request.onupgradeneeded({ target: { result: db } });
                }
                if (request.onsuccess) {
                    request.onsuccess({ target: { result: db } });
                }
            }, 0);
            return request;
        },
    };

    const fakeWindow = {
        GP: {},
        APP_CONFIG: {
            encryption: {
                algorithm: 'AES-GCM',
                keyLength: 256,
                ivLength: 12,
                saltLength: 16,
                iterations: 100000,
            },
        },
        crypto: webcrypto,
        errorBoundary: null,
        dataEncryption: null,
    };

    const sandbox = {
        window: fakeWindow,
        console,
        Object,
        String,
        Array,
        Uint8Array,
        TextEncoder,
        TextDecoder,
        JSON,
        Date,
        Promise,
        setTimeout,
        btoa,
        atob,
        localStorage: fakeLocalStorage,
        indexedDB: fakeIndexedDB,
        crypto: webcrypto,
        performance: { now: () => Date.now() },
    };

    const code = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'js', 'encryption.js'),
        'utf8',
    );

    // The file auto-instantiates `new DataEncryption()` which calls async init.
    // We capture the class but will instantiate manually in tests so we can
    // await init properly.
    //
    // Strategy: replace the auto-init lines at the bottom so the class is
    // defined but not auto-instantiated during eval.
    const patchedCode = code
        .replace(
            /\/\/ Auto-Initialisierung[\s\S]*?Object\.freeze\(DataEncryption\.prototype\);/,
            '// Auto-init disabled for tests\nObject.freeze(DataEncryption.prototype);',
        );

    const wrapper = new Function(...Object.keys(sandbox), patchedCode);
    wrapper(...Object.values(sandbox));

    DataEncryption = fakeWindow.DataEncryption;
});

// ---------------------------------------------------------------------------
// Utility functions (arrayBufferToBase64 / base64ToArrayBuffer)
// These are on the prototype so we can test via an instance.
// ---------------------------------------------------------------------------

describe('DataEncryption utility functions', () => {
    let enc;

    beforeAll(() => {
        // Create instance but don't init (isSupported will be false without
        // window.crypto in the constructor's checkSupport). We override to test
        // pure helper methods.
        enc = Object.create(DataEncryption.prototype);
    });

    test('arrayBufferToBase64 round-trips with base64ToArrayBuffer', () => {
        const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        const b64 = enc.arrayBufferToBase64(original);
        expect(typeof b64).toBe('string');

        const back = enc.base64ToArrayBuffer(b64);
        expect(back).toEqual(original);
    });

    test('base64ToArrayBuffer handles empty string', () => {
        const result = enc.base64ToArrayBuffer(btoa(''));
        expect(result.length).toBe(0);
    });

    test('arrayBufferToBase64 produces valid base64', () => {
        const data = new Uint8Array([0, 127, 255]);
        const b64 = enc.arrayBufferToBase64(data);
        // Should not throw when decoded
        expect(() => atob(b64)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('DataEncryption.getStatus', () => {
    test('returns status object with expected properties', () => {
        const enc = Object.create(DataEncryption.prototype);
        enc.isSupported = true;
        enc.keyGenerated = false;
        enc.algorithm = 'AES-GCM';
        enc.keyLength = 256;

        const status = enc.getStatus();
        expect(status).toEqual({
            supported: true,
            keyGenerated: false,
            algorithm: 'AES-GCM',
            keyLength: 256,
            ready: false,
        });
    });

    test('ready is true when supported and key is generated', () => {
        const enc = Object.create(DataEncryption.prototype);
        enc.isSupported = true;
        enc.keyGenerated = true;
        enc.algorithm = 'AES-GCM';
        enc.keyLength = 256;

        expect(enc.getStatus().ready).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Encrypt / Decrypt round-trip using real Web Crypto
// ---------------------------------------------------------------------------

describe('DataEncryption encrypt/decrypt round-trip', () => {
    let enc;

    beforeAll(async () => {
        // Manually construct and set up a working instance with real crypto
        enc = Object.create(DataEncryption.prototype);
        enc.algorithm = 'AES-GCM';
        enc.keyLength = 256;
        enc.ivLength = 12;
        enc.saltLength = 16;
        enc.iterations = 100000;
        enc.isSupported = true;
        enc.keyGenerated = false;
        enc.encryptionKey = null;

        // Generate a real AES-GCM key
        enc.encryptionKey = await webcrypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt'],
        );
        enc.keyGenerated = true;
    });

    test('encrypts and decrypts a string', async () => {
        const original = 'Hallo Welt';
        const encrypted = await enc.encrypt(original);
        expect(encrypted.encrypted).toBe(true);
        expect(encrypted.algorithm).toBe('AES-GCM');
        expect(typeof encrypted.data).toBe('string');

        const decrypted = await enc.decrypt(encrypted);
        expect(decrypted).toBe(original);
    });

    test('encrypts and decrypts a JSON object', async () => {
        const original = { name: 'Test', value: 123, nested: { key: 'value' } };
        const encrypted = await enc.encrypt(original);
        const decrypted = await enc.decrypt(encrypted);
        expect(decrypted).toEqual(original);
    });

    test('encrypts and decrypts an array', async () => {
        const original = [1, 2, 3, 'test', { id: 5 }];
        const encrypted = await enc.encrypt(original);
        const decrypted = await enc.decrypt(encrypted);
        expect(decrypted).toEqual(original);
    });

    test('encrypts and decrypts an empty string', async () => {
        const original = '';
        const encrypted = await enc.encrypt(original);
        const decrypted = await enc.decrypt(encrypted);
        expect(decrypted).toBe(original);
    });

    test('encrypts and decrypts special characters', async () => {
        const original = 'äöü ß €@# <script>alert("XSS")</script>';
        const encrypted = await enc.encrypt(original);
        const decrypted = await enc.decrypt(encrypted);
        expect(decrypted).toBe(original);
    });

    test('encrypted output has correct format', async () => {
        const encrypted = await enc.encrypt('test');
        expect(encrypted).toEqual(
            expect.objectContaining({
                encrypted: true,
                data: expect.any(String),
                algorithm: 'AES-GCM',
                version: 1,
            }),
        );
    });

    test('decrypt returns data directly for unencrypted payloads', async () => {
        const plain = { encrypted: false, data: 'test' };
        const result = await enc.decrypt(plain);
        expect(result).toBe('test');
    });

    test('decrypt returns input as-is for non-object input', async () => {
        expect(await enc.decrypt('just a string')).toBe('just a string');
        expect(await enc.decrypt(null)).toBe(null);
        expect(await enc.decrypt(42)).toBe(42);
    });

    test('each encryption produces different ciphertext (unique IV)', async () => {
        const data = 'same data';
        const enc1 = await enc.encrypt(data);
        const enc2 = await enc.encrypt(data);
        expect(enc1.data).not.toBe(enc2.data);
    });

    test('encrypts a large object (1000 entries)', async () => {
        const original = {
            items: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Item ${i}` })),
        };
        const encrypted = await enc.encrypt(original);
        const decrypted = await enc.decrypt(encrypted);
        expect(decrypted).toEqual(original);
    });
});

// ---------------------------------------------------------------------------
// Fallback behavior when encryption is not available
// ---------------------------------------------------------------------------

describe('DataEncryption fallback (no key)', () => {
    let enc;

    beforeAll(() => {
        enc = Object.create(DataEncryption.prototype);
        enc.algorithm = 'AES-GCM';
        enc.keyLength = 256;
        enc.ivLength = 12;
        enc.isSupported = false;
        enc.keyGenerated = false;
        enc.encryptionKey = null;
    });

    test('encrypt returns unencrypted data when not supported', async () => {
        const result = await enc.encrypt('hello');
        expect(result.encrypted).toBe(false);
        expect(result.data).toBe('hello');
    });

    test('decrypt returns null when key not available for encrypted data', async () => {
        const fakeEncrypted = { encrypted: true, data: 'base64data', algorithm: 'AES-GCM' };
        const result = await enc.decrypt(fakeEncrypted);
        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Input validation in encrypt
// ---------------------------------------------------------------------------

describe('DataEncryption input validation', () => {
    let enc;

    beforeAll(async () => {
        enc = Object.create(DataEncryption.prototype);
        enc.algorithm = 'AES-GCM';
        enc.keyLength = 256;
        enc.ivLength = 12;
        enc.isSupported = true;
        enc.keyGenerated = true;
        enc.encryptionKey = await webcrypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt'],
        );
    });

    test('encrypt handles null gracefully (fallback)', async () => {
        const result = await enc.encrypt(null);
        // The encrypt method throws for null/undefined and catches -> returns fallback
        expect(result.encrypted).toBe(false);
        expect(result.data).toBeNull();
        expect(result).toHaveProperty('error');
    });

    test('encrypt handles undefined gracefully (fallback)', async () => {
        const result = await enc.encrypt(undefined);
        expect(result.encrypted).toBe(false);
        expect(result).toHaveProperty('error');
    });

    test('decrypt validates encrypted data format', async () => {
        const badData = { encrypted: true, data: null };
        const result = await enc.decrypt(badData);
        expect(result).toBeNull();
    });

    test('decrypt detects data too short', async () => {
        // Create a base64 string that decodes to fewer than ivLength (12) bytes
        const shortData = btoa('short');
        const result = await enc.decrypt({ encrypted: true, data: shortData });
        expect(result).toBeNull();
    });
});
