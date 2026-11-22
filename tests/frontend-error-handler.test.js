// error-handler.js: ErrorBoundary (Protokoll, Callbacks, Meldungen, Speicher-
// überwachung), safeExecute/safeAsync, SafeStorage und SafeDOM. Ersetzt die
// früheren manuellen Seiten tests/error-test.html und tests/storage-test.html.
const { createBrowser } = require('./helpers/browser-scripts');

let browser;
let eb;
beforeEach(() => {
  browser = createBrowser({
    setup(window) {
      // Die Skripte rufen console.error/warn bei jedem behandelten Fehler auf.
      jest.spyOn(window.console, 'error').mockImplementation(() => {});
      jest.spyOn(window.console, 'warn').mockImplementation(() => {});
    },
  });
  browser.load('config.js', 'error-handler.js');
  eb = browser.window.errorBoundary;
});
afterEach(() => browser.close());

const runtime = (message, extra = {}) => ({
  type: 'runtime',
  message,
  timestamp: new Date().toISOString(),
  ...extra,
});
const toasts = () => browser.document.querySelectorAll('.error-toast');

describe('ErrorBoundary', () => {
  test('handleError protokolliert im Speicher und in localStorage', () => {
    eb.handleError(runtime('Etwas ist schiefgelaufen'));
    expect(eb.getErrors()).toHaveLength(1);
    const stored = JSON.parse(
      browser.window.localStorage.getItem('gartenplaner_errors'),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].message).toBe('Etwas ist schiefgelaufen');
    expect(toasts()).toHaveLength(0);
  });

  test('das Protokoll ist auf maxErrors und 100 gespeicherte Einträge begrenzt', () => {
    for (let i = 0; i < 120; i++) eb.handleError(runtime(`Fehler ${i}`));
    expect(eb.getErrors()).toHaveLength(50);
    expect(eb.getErrors()[0].message).toBe('Fehler 70');
    expect(
      JSON.parse(browser.window.localStorage.getItem('gartenplaner_errors')),
    ).toHaveLength(100);
  });

  test('getErrorStats zählt nach Typ und liefert die letzten fünf', () => {
    ['runtime', 'runtime', 'storage', 'promise', 'runtime', 'storage'].forEach(
      (type, i) => eb.handleError({ type, message: `m${i}` }),
    );
    const stats = eb.getErrorStats();
    expect(stats.total).toBe(6);
    expect(stats.byType).toEqual({ runtime: 3, storage: 2, promise: 1 });
    expect(stats.recent.map((e) => e.message)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
    ]);
  });

  test('clearErrors leert Speicher und localStorage', () => {
    eb.handleError(runtime('x'));
    eb.clearErrors();
    expect(eb.getErrors()).toEqual([]);
    expect(
      browser.window.localStorage.getItem('gartenplaner_errors'),
    ).toBeNull();
  });

  test('getErrors liefert eine Kopie', () => {
    eb.handleError(runtime('x'));
    eb.getErrors().pop();
    expect(eb.getErrors()).toHaveLength(1);
  });

  test('onError-Callbacks erhalten nur ihren Typ, Fehler darin werden abgefangen', () => {
    const runtimeCb = jest.fn();
    const storageCb = jest.fn();
    eb.onError('runtime', () => {
      throw new Error('Callback kaputt');
    });
    eb.onError('runtime', runtimeCb);
    eb.onError('storage', storageCb);
    eb.handleError(runtime('a'));
    expect(runtimeCb).toHaveBeenCalledTimes(1);
    expect(storageCb).not.toHaveBeenCalled();
  });

  test('globale error- und unhandledrejection-Ereignisse werden erfasst', () => {
    const { window } = browser;
    window.dispatchEvent(
      new window.ErrorEvent('error', { message: 'Boom', filename: 'a.js' }),
    );
    const rejection = new window.Event('unhandledrejection');
    rejection.reason = new Error('abgelehnt');
    window.dispatchEvent(rejection);
    const rejectionNoReason = new window.Event('unhandledrejection');
    window.dispatchEvent(rejectionNoReason);
    expect(eb.getErrors().map((e) => [e.type, e.message])).toEqual([
      ['runtime', 'Boom'],
      ['promise', 'abgelehnt'],
      ['promise', 'Unhandled Promise Rejection'],
    ]);
  });

  test.each([
    ['localStorage voll', true],
    ['QuotaExceeded: quota exceeded', true],
    ['Cannot read property x of undefined', true],
    ['null is not an object', true],
    ['Netzwerk kurz weg', false],
    ['', false],
  ])('isCriticalError(%j) -> %s', (message, expected) => {
    expect(eb.isCriticalError({ message })).toBe(expected);
  });

  test('kritische Fehler zeigen eine verständliche, escapte Meldung', () => {
    eb.handleError(runtime('<b>Cannot read property</b> von undefined'));
    expect(toasts()).toHaveLength(1);
    const toast = toasts()[0];
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.querySelector('b')).toBeNull();
    expect(toast.textContent).toContain('Datenfehler');
    toast.querySelector('.error-toast-close').click();
    expect(toasts()).toHaveLength(0);
  });

  test.each([
    ['localStorage voll', 'Browser-Speicher'],
    ['quota exceeded', 'Browser-Speicher'],
    ['Network down', 'Netzwerkfehler'],
    ['fetch failed', 'Netzwerkfehler'],
    ['undefined is not a function', 'Datenfehler'],
    ['irgendwas', 'unerwarteter Fehler'],
    [undefined, 'unerwarteter Fehler'],
  ])('getUserFriendlyMessage(%j)', (message, fragment) => {
    expect(eb.getUserFriendlyMessage({ message })).toContain(fragment);
  });

  test('Speicherfehler lösen ein Aufräumen aus (nur die letzten 10 Fehler bleiben)', () => {
    const { localStorage } = browser.window;
    localStorage.setItem(
      'gartenplaner_errors',
      JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ i }))),
    );
    localStorage.setItem(
      'gartenplaner_presence',
      JSON.stringify({ alt: 1, neu: Date.now() }),
    );
    eb.cleanupStorage();
    expect(
      JSON.parse(localStorage.getItem('gartenplaner_errors')),
    ).toHaveLength(10);
    expect(
      Object.keys(JSON.parse(localStorage.getItem('gartenplaner_presence'))),
    ).toEqual(['neu']);
  });

  test('ein Fehler mit "Cannot read property" stößt ein erneutes Rendern an', () => {
    const { window } = browser;
    const timers = [];
    jest.spyOn(window, 'setTimeout').mockImplementation((fn) => {
      timers.push(fn);
      return timers.length;
    });
    window.gartenPlaner = { renderTasks: jest.fn() };
    eb.handleError(runtime('Cannot read property x'));
    timers.forEach((fn) => fn());
    expect(window.gartenPlaner.renderTasks).toHaveBeenCalledTimes(1);
  });
});

describe('Speicherüberwachung', () => {
  function fill(bytes) {
    browser.window.localStorage.setItem('fuell', 'x'.repeat(bytes));
  }

  test('getStorageUsage beschreibt Größe, Einträge und Gartenplaner-Details', () => {
    browser.window.localStorage.setItem('gartenplaner_tasks', '[1,2,3]');
    browser.window.localStorage.setItem('fremd', 'abc');
    const usage = eb.getStorageUsage();
    expect(usage.itemCount).toBe(2);
    expect(usage.estimatedQuotaMB).toBe('5.00');
    expect(Object.keys(usage.details)).toEqual(['gartenplaner_tasks']);
    expect(usage.details.gartenplaner_tasks.preview).toBe('[1,2,3]');
    expect(usage.isWarning).toBe(false);
    expect(usage.isCritical).toBe(false);
  });

  test('checkStorageQuota: frei, Warnung (>75 %), blockiert (>90 %)', () => {
    const warn = jest
      .spyOn(eb, 'showStorageWarning')
      .mockImplementation(() => {});
    expect(eb.checkStorageQuota()).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    fill(Math.ceil(5 * 1024 * 1024 * 0.8));
    expect(eb.checkStorageQuota()).toBe(true);
    expect(warn).toHaveBeenLastCalledWith('warning', expect.any(Object));

    fill(Math.ceil(5 * 1024 * 1024 * 0.95));
    expect(eb.checkStorageQuota()).toBe(false);
    expect(warn).toHaveBeenLastCalledWith('critical', expect.any(Object));
  });

  test('checkStorageQuota blockiert, wenn die Nutzung nicht ermittelbar ist', () => {
    jest.spyOn(eb, 'getStorageUsage').mockReturnValue(null);
    expect(eb.checkStorageQuota()).toBe(false);
  });

  test('showStorageWarning zeigt die Warnung und protokolliert sie', () => {
    eb.showStorageWarning('warning', {
      usagePercent: '80.00',
      totalSizeMB: '4.00',
      estimatedQuotaMB: '5.00',
    });
    expect(toasts().length).toBeGreaterThan(0);
    expect(browser.window.console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Storage warning'),
      expect.any(Object),
    );
  });

  test('das Monitoring läuft periodisch und lässt sich stoppen', () => {
    const { window } = browser;
    eb.stopStorageMonitoring();
    expect(eb.storageMonitorInterval).toBeNull();
    const setIntervalSpy = jest.spyOn(window, 'setInterval').mockReturnValue(5);
    const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
    const check = jest.spyOn(eb, 'checkStorageQuota').mockReturnValue(true);
    eb.startStorageMonitoring(2);
    expect(check).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 120000);
    setIntervalSpy.mock.calls[0][0]();
    expect(check).toHaveBeenCalledTimes(2);
    eb.stopStorageMonitoring();
    expect(clearIntervalSpy).toHaveBeenCalledWith(5);
  });
});

describe('safeExecute und safeAsync', () => {
  test('safeExecute gibt das Ergebnis zurück oder den Fallback und meldet den Fehler', () => {
    const { window } = browser;
    expect(window.safeExecute((a, b) => a + b)(1, 2)).toBe(3);
    function kaputt() {
      throw new Error('kaputt');
    }
    expect(window.safeExecute(kaputt, 'fallback')()).toBe('fallback');
    expect(eb.getErrors().at(-1)).toMatchObject({
      type: 'runtime',
      message: 'kaputt',
      function: 'kaputt',
    });
  });

  test('safeAsync gibt das Ergebnis zurück oder den Fallback und meldet den Fehler', async () => {
    const { window } = browser;
    await expect(window.safeAsync(async () => 'ok')()).resolves.toBe('ok');
    await expect(
      window.safeAsync(async () => {
        throw new Error('async kaputt');
      }, 'fallback')(),
    ).resolves.toBe('fallback');
    expect(eb.getErrors().at(-1)).toMatchObject({
      type: 'async',
      message: 'async kaputt',
    });
  });
});

describe('SafeStorage', () => {
  const store = () => browser.window.SafeStorage;
  const raw = (key) => browser.window.localStorage.getItem(key);

  test('shouldEncrypt gilt nur für gartenplaner_-Schlüssel, nicht für interne', () => {
    expect(store().shouldEncrypt('gartenplaner_tasks')).toBe(true);
    expect(store().shouldEncrypt('_gartenplaner_salt')).toBe(false);
    expect(store().shouldEncrypt('andere')).toBe(false);
  });

  test('setItem/getItem speichern JSON, Standardwert bei fehlendem Eintrag', async () => {
    await expect(store().setItem('test_key', { a: 1 })).resolves.toBe(true);
    expect(raw('test_key')).toBe('{"a":1}');
    await expect(store().getItem('test_key')).resolves.toEqual({ a: 1 });
    await expect(store().getItem('fehlt', 'std')).resolves.toBe('std');
  });

  test('verschlüsselt, wenn die Verschlüsselung bereitsteht, und entschlüsselt beim Lesen', async () => {
    const { window } = browser;
    window.dataEncryption = {
      isSupported: true,
      encrypt: jest.fn(async () => ({ encrypted: true, data: 'geheim' })),
      decrypt: jest.fn(async () => ({ a: 1 })),
    };
    await store().setItem('gartenplaner_tasks', { a: 1 });
    expect(raw('gartenplaner_tasks')).toBe(
      '{"encrypted":true,"data":"geheim"}',
    );
    await expect(store().getItem('gartenplaner_tasks')).resolves.toEqual({
      a: 1,
    });
    window.dataEncryption.decrypt.mockResolvedValue(null);
    await expect(store().getItem('gartenplaner_tasks', 'std')).resolves.toBe(
      'std',
    );
  });

  test('setItem respektiert Rate-Limit und blockierte Speichermenge', async () => {
    const { window } = browser;
    window.rateLimiter = {
      checkLimit: jest.fn(() => ({ allowed: false, resetMs: 500 })),
      showRateLimitWarning: jest.fn(),
      rollbackRequest: jest.fn(),
    };
    await expect(store().setItem('gartenplaner_x', 1)).resolves.toBe(false);
    expect(raw('gartenplaner_x')).toBeNull();
    window.rateLimiter.checkLimit.mockReturnValue({ allowed: true });
    jest.spyOn(eb, 'checkStorageQuota').mockReturnValue(false);
    await expect(store().setItem('gartenplaner_x', 1)).resolves.toBe(false);
    expect(raw('gartenplaner_x')).toBeNull();
    // Fremde Schlüssel unterliegen weder Limit noch Quota-Sperre.
    await expect(store().setItem('fremd', 1)).resolves.toBe(true);
  });

  test('Schreibfehler geben das Limit zurück, melden und räumen bei Quota auf', async () => {
    const { window } = browser;
    window.rateLimiter = {
      checkLimit: jest.fn(() => ({ allowed: true })),
      rollbackRequest: jest.fn(),
    };
    jest.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('voll'), { name: 'QuotaExceededError' });
    });
    const cleanup = jest
      .spyOn(eb, 'cleanupStorage')
      .mockImplementation(() => {});
    const warning = jest
      .spyOn(eb, 'showStorageWarning')
      .mockImplementation(() => {});
    await expect(store().setItem('gartenplaner_x', 1)).resolves.toBe(false);
    expect(window.rateLimiter.rollbackRequest).toHaveBeenCalledWith(
      'storage',
      'gartenplaner_x',
    );
    expect(cleanup).toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith('critical', expect.any(Object));
    expect(eb.getErrors().at(-1)).toMatchObject({ type: 'storage' });
  });

  test('getItem meldet kaputte Daten und liefert den Standardwert', async () => {
    browser.window.localStorage.setItem('kaputt', '{nicht json');
    await expect(store().getItem('kaputt', 'std')).resolves.toBe('std');
    expect(eb.getErrors().at(-1)).toMatchObject({
      type: 'storage',
      key: 'kaputt',
    });
  });

  test('removeItem und clear', () => {
    browser.window.localStorage.setItem('a', '1');
    expect(store().removeItem('a')).toBe(true);
    browser.window.localStorage.setItem('b', '1');
    expect(store().clear()).toBe(true);
    expect(browser.window.localStorage.length).toBe(0);
    jest
      .spyOn(browser.window.Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new Error('nein');
      });
    expect(store().removeItem('a')).toBe(false);
  });
});

describe('SafeDOM', () => {
  const dom = () => browser.window.SafeDOM;

  test('Abfragen liefern null bzw. eine leere Liste statt zu werfen', () => {
    expect(dom().querySelector('#gibt-es-nicht')).toBeNull();
    expect(dom().querySelector('###')).toBeNull();
    expect(dom().querySelectorAll('###')).toEqual([]);
    browser.document.body.innerHTML = '<p class="a"></p><p class="a"></p>';
    expect(dom().querySelectorAll('.a')).toHaveLength(2);
  });

  test('Schreibzugriffe auf fehlende Elemente sind harmlos', () => {
    expect(dom().setTextContent(null, 'x')).toBe(false);
    expect(dom().setInnerHTML(null, 'x')).toBe(false);
    expect(dom().addEventListener(null, 'click', () => {})).toBeUndefined();
    const el = browser.document.createElement('div');
    expect(dom().setTextContent(el, 'Text')).toBe(true);
    expect(dom().setInnerHTML(el, '<b>x</b>')).toBe(true);
    expect(el.innerHTML).toBe('<b>x</b>');
  });

  test('Event-Handler werden abgesichert: Fehler landen in der ErrorBoundary', () => {
    const el = browser.document.createElement('button');
    dom().addEventListener(el, 'click', function klickFehler() {
      throw new Error('Handler kaputt');
    });
    expect(() => el.click()).not.toThrow();
    expect(eb.getErrors().at(-1)).toMatchObject({
      message: 'Handler kaputt',
      function: 'klickFehler',
    });
  });
});
