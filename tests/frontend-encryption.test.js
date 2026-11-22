// encryption.js: AES-GCM-Roundtrip, Format, Fallbacks, Schlüsselverwaltung.
// Ersetzt die frühere manuelle Seite tests/encryption-test.html. Web Crypto kommt
// aus Node (webcrypto), der Schlüsselspeicher (IndexedDB) ist eine kleine Attrappe.
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');
const { createBrowser } = require('./helpers/browser-scripts');

// Minimaler IndexedDB-Ersatz für _openKeyStore/_saveKeyToIDB/_loadKeyFromIDB/clearKeys.
function fakeIndexedDB() {
  const data = new Map();
  const later = (fn) => setTimeout(fn, 0);
  function request(compute) {
    const req = {};
    later(() => {
      req.result = compute();
      req.onsuccess?.({ target: req });
    });
    return req;
  }
  return {
    data,
    open() {
      const req = {};
      later(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore() {},
          close() {},
          transaction() {
            const tx = {
              objectStore: () => ({
                put: (value, key) =>
                  request(() => data.set(key, value) && undefined),
                get: (key) => request(() => data.get(key)),
                delete: (key) => {
                  data.delete(key);
                  later(() => tx.oncomplete?.());
                },
              }),
            };
            later(() => tx.oncomplete?.());
            return tx;
          },
        };
        req.onsuccess?.({ target: { result: db } });
      });
      return req;
    },
  };
}

let browser;
let enc;
async function setup(options = {}) {
  const crypto = 'crypto' in options ? options.crypto : webcrypto;
  const indexedDB =
    'indexedDB' in options ? options.indexedDB : fakeIndexedDB();
  browser = createBrowser({
    setup(window) {
      Object.defineProperty(window, 'crypto', {
        value: crypto,
        configurable: true,
      });
      window.indexedDB = indexedDB;
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
      jest.spyOn(window.console, 'error').mockImplementation(() => {});
      jest.spyOn(window.console, 'warn').mockImplementation(() => {});
    },
  });
  browser.window.errorBoundary = { handleError: jest.fn() };
  browser.load('config.js', 'encryption.js');
  enc = browser.window.dataEncryption;
  // Die Initialisierung (Schlüssel laden/erzeugen) läuft asynchron im Konstruktor.
  for (let i = 0; i < 50 && !enc.keyGenerated && enc.isSupported; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return { indexedDB };
}
afterEach(() => browser.close());

describe('Verschlüsseln und Entschlüsseln', () => {
  beforeEach(() => setup());

  test('ist einsatzbereit und beschreibt sich', () => {
    expect(enc.getStatus()).toEqual({
      supported: true,
      keyGenerated: true,
      algorithm: 'AES-GCM',
      keyLength: 256,
      ready: true,
    });
  });

  test.each([
    ['Text mit Emoji', 'Hallo Welt 🌍'],
    ['JSON-Objekt', { name: 'Test', value: 123, nested: { key: 'value' } }],
    ['Array', [1, 2, 3, 'test', { id: 5 }]],
    ['leerer String', ''],
    ['Sonderzeichen', '🔒 äöü ß €@# <script>alert("XSS")</script>'],
    [
      'großes Objekt',
      {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
        })),
      },
    ],
  ])('Roundtrip: %s', async (_name, original) => {
    const encrypted = await enc.encrypt(original);
    expect(encrypted.encrypted).toBe(true);
    await expect(enc.decrypt(encrypted)).resolves.toEqual(original);
  });

  test('das verschlüsselte Format enthält keinen Klartext und nutzt einen neuen IV', async () => {
    const a = await enc.encrypt('geheim');
    const b = await enc.encrypt('geheim');
    expect(a).toMatchObject({
      encrypted: true,
      algorithm: 'AES-GCM',
      version: 1,
    });
    expect(typeof a.data).toBe('string');
    expect(a.data).not.toContain('geheim');
    expect(a.data).not.toBe(b.data);
  });

  test('unverschlüsselte Daten werden unverändert durchgereicht', async () => {
    await expect(enc.decrypt({ encrypted: false, data: 'test' })).resolves.toBe(
      'test',
    );
    await expect(enc.decrypt('roh')).resolves.toBe('roh');
    await expect(enc.decrypt(null)).resolves.toBeNull();
  });

  test('manipulierte oder ungültige Daten liefern null und werden gemeldet', async () => {
    const encrypted = await enc.encrypt('geheim');
    const bytes = enc.base64ToArrayBuffer(encrypted.data);
    bytes[bytes.length - 1] ^= 0xff;
    await expect(
      enc.decrypt({ ...encrypted, data: enc.arrayBufferToBase64(bytes) }),
    ).resolves.toBeNull();
    await expect(
      enc.decrypt({ encrypted: true, data: 'AAAA' }),
    ).resolves.toBeNull();
    await expect(enc.decrypt({ encrypted: true })).resolves.toBeNull();
    const messages = browser.window.errorBoundary.handleError.mock.calls.map(
      ([info]) => info.message,
    );
    expect(messages).toEqual([
      expect.stringContaining('Decryption failed'),
      expect.stringContaining('Decryption failed'),
      expect.stringContaining('Decryption failed'),
    ]);
  });

  test('null/undefined lassen sich nicht verschlüsseln und fallen auf Klartext zurück', async () => {
    const result = await enc.encrypt(undefined);
    expect(result).toMatchObject({ encrypted: false });
    expect(result.error).toContain('undefined or null');
    expect(browser.window.errorBoundary.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ function: 'encrypt' }),
    );
  });

  test('der Schlüssel wird im Schlüsselspeicher abgelegt und beim Neustart wiederverwendet', async () => {
    const encrypted = await enc.encrypt('bleibt lesbar');
    expect(browser.window.indexedDB.data.has('enc_key')).toBe(true);
    // Zweite Instanz mit demselben Speicher entschlüsselt die Daten der ersten.
    const second = new browser.window.DataEncryption();
    for (let i = 0; i < 50 && !second.keyGenerated; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await expect(second.decrypt(encrypted)).resolves.toBe('bleibt lesbar');
  });

  test('clearKeys entfernt den Schlüssel; danach gibt es keine Verschlüsselung mehr', async () => {
    const encrypted = await enc.encrypt('x');
    browser.window.localStorage.setItem('_gartenplaner_salt', 's');
    await expect(enc.clearKeys()).resolves.toBe(true);
    expect(enc.getStatus().ready).toBe(false);
    expect(browser.window.indexedDB.data.has('enc_key')).toBe(false);
    expect(
      browser.window.localStorage.getItem('_gartenplaner_salt'),
    ).toBeNull();
    await expect(enc.encrypt('y')).resolves.toEqual({
      encrypted: false,
      data: 'y',
    });
    await expect(enc.decrypt(encrypted)).resolves.toBeNull();
  });
});

describe('Schlüsselverwaltung', () => {
  beforeEach(() => setup());

  test('rotateKey verschlüsselt gespeicherte Einträge mit einem neuen Schlüssel neu', async () => {
    const { localStorage } = browser.window;
    const entry = await enc.encrypt({ a: 1 });
    localStorage.setItem('gartenplaner_tasks', JSON.stringify(entry));
    localStorage.setItem('gartenplaner_plain', JSON.stringify([1]));
    await expect(enc.rotateKey()).resolves.toBe(true);
    const rotated = JSON.parse(localStorage.getItem('gartenplaner_tasks'));
    expect(rotated.data).not.toBe(entry.data);
    await expect(enc.decrypt(rotated)).resolves.toEqual({ a: 1 });
    expect(localStorage.getItem('gartenplaner_plain')).toBe('[1]');
    // Mit dem alten Schlüssel verschlüsselte Daten sind nicht mehr lesbar.
    await expect(enc.decrypt(entry)).resolves.toBeNull();
  });

  test('rotateKey stellt bei einem Fehler Schlüssel und Einträge wieder her', async () => {
    const { localStorage } = browser.window;
    const entry = await enc.encrypt({ a: 1 });
    localStorage.setItem('gartenplaner_tasks', JSON.stringify(entry));
    const oldKey = enc.encryptionKey;
    Object.defineProperty(enc, 'generateNewKey', {
      value: async () => {
        throw new Error('kein neuer Schlüssel');
      },
    });
    await expect(enc.rotateKey()).resolves.toBe(false);
    expect(enc.encryptionKey).toBe(oldKey);
    expect(localStorage.getItem('gartenplaner_tasks')).toBe(
      JSON.stringify(entry),
    );
    await expect(enc.decrypt(entry)).resolves.toEqual({ a: 1 });
    expect(browser.window.errorBoundary.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ function: 'rotateKey' }),
    );
  });

  test('exportKey verlangt einen Schlüssel und ein Passwort mit mindestens 8 Zeichen', async () => {
    await expect(enc.exportKey('kurz')).rejects.toThrow(
      'at least 8 characters',
    );
    await expect(enc.exportKey()).rejects.toThrow('at least 8 characters');
    const bundle = await enc.exportKey('langes-passwort');
    expect(typeof bundle).toBe('string');
    await enc.clearKeys();
    await expect(enc.exportKey('langes-passwort')).rejects.toThrow('Kein Key');
  });

  test('importKeyFromBackup lehnt ungültige Daten ab und behält den bisherigen Schlüssel', async () => {
    const oldKey = enc.encryptionKey;
    await expect(
      enc.importKeyFromBackup('', 'langes-passwort'),
    ).rejects.toThrow('Invalid key data');
    await expect(enc.importKeyFromBackup('AAAA', 'kurz')).rejects.toThrow(
      'at least 8',
    );
    const bundle = await enc.exportKey('langes-passwort');
    await expect(
      enc.importKeyFromBackup(bundle, 'falsches-passwort'),
    ).rejects.toBeDefined();
    expect(enc.encryptionKey).toBe(oldKey);
    expect(enc.getStatus().ready).toBe(true);
  });

  test('importKeyFromBackup übernimmt einen JWK-Schlüssel ohne Passwort', async () => {
    const jwk = await webcrypto.subtle.exportKey(
      'jwk',
      await webcrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      ),
    );
    await expect(enc.importKeyFromBackup(JSON.stringify(jwk))).resolves.toBe(
      true,
    );
    const encrypted = await enc.encrypt('mit importiertem Schlüssel');
    await expect(enc.decrypt(encrypted)).resolves.toBe(
      'mit importiertem Schlüssel',
    );
  });

  test('importKey akzeptiert nur JSON-Strings', async () => {
    await expect(enc.importKey({})).rejects.toThrow('Invalid key data format');
    await expect(enc.importKey('{kaputt')).rejects.toBeDefined();
    expect(browser.window.errorBoundary.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ function: 'importKey' }),
    );
  });

  test('ein alter localStorage-Schlüssel wird in den Schlüsselspeicher migriert', async () => {
    browser.close();
    const jwk = await webcrypto.subtle.exportKey(
      'jwk',
      await webcrypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      ),
    );
    const indexedDB = fakeIndexedDB();
    browser = createBrowser({
      setup(window) {
        Object.defineProperty(window, 'crypto', {
          value: webcrypto,
          configurable: true,
        });
        window.indexedDB = indexedDB;
        window.TextEncoder = TextEncoder;
        window.TextDecoder = TextDecoder;
        window.localStorage.setItem(
          '_gartenplaner_enc_key',
          JSON.stringify(jwk),
        );
      },
    });
    browser.load('config.js', 'encryption.js');
    enc = browser.window.dataEncryption;
    for (let i = 0; i < 50 && !enc.keyGenerated; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(enc.getStatus().ready).toBe(true);
    expect(
      browser.window.localStorage.getItem('_gartenplaner_enc_key'),
    ).toBeNull();
    expect(indexedDB.data.has('enc_key')).toBe(true);
  });
});

describe('Fallbacks ohne Web Crypto oder Schlüsselspeicher', () => {
  test('ohne Web Crypto bleibt die Verschlüsselung aus und Daten werden im Klartext gehalten', async () => {
    await setup({ crypto: undefined });
    expect(enc.getStatus().supported).toBeFalsy();
    expect(enc.getStatus().ready).toBeFalsy();
    await expect(enc.encrypt({ a: 1 })).resolves.toEqual({
      encrypted: false,
      data: { a: 1 },
    });
    await expect(
      enc.decrypt({ encrypted: true, data: 'AAAA' }),
    ).resolves.toBeNull();
    await expect(enc.rotateKey()).resolves.toBe(false);
    expect(browser.window.errorBoundary.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'security' }),
    );
  });

  test('schlägt die Initialisierung fehl (kein IndexedDB), wird die Verschlüsselung abgeschaltet', async () => {
    await setup({ indexedDB: undefined });
    expect(enc.getStatus()).toMatchObject({ supported: false, ready: false });
    await expect(enc.encrypt('x')).resolves.toEqual({
      encrypted: false,
      data: 'x',
    });
  });
});
