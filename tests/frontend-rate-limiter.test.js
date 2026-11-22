// rate-limiter.js: Sliding-Window-Limits, Rollback, Ereignisse und Statistik.
// Ersetzt die frühere manuelle Seite tests/rate-limit-test.html.
const { createBrowser } = require('./helpers/browser-scripts');

let browser;
let limiter;
let now;
beforeEach(() => {
  browser = createBrowser();
  now = 1_000_000;
  jest.spyOn(browser.window.Date, 'now').mockImplementation(() => now);
  jest.spyOn(browser.window.console, 'warn').mockImplementation(() => {});
  jest.spyOn(browser.window.console, 'error').mockImplementation(() => {});
  browser.load('config.js', 'rate-limiter.js');
  limiter = browser.window.rateLimiter;
});
afterEach(() => browser.close());

function burst(name, count, identifier) {
  return Array.from({ length: count }, () =>
    limiter.checkLimit(name, identifier),
  );
}

describe('checkLimit', () => {
  test('erlaubt Anfragen bis zum Limit und blockiert danach', () => {
    const results = burst('taskCreate', 11);
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[0].remaining).toBe(9);
    expect(results[9].remaining).toBe(0);
    expect(results[10]).toMatchObject({
      allowed: false,
      blocked: true,
      remaining: 0,
      reason: 'rate_limit_exceeded',
    });
    expect(results[10].resetMs).toBeGreaterThan(0);
  });

  test('der Zähler zählt je Identifier getrennt (z. B. pro Aufgabe)', () => {
    burst('taskEdit', 30, 'task_1');
    expect(limiter.checkLimit('taskEdit', 'task_1').allowed).toBe(false);
    limiter.reset('taskEdit');
    expect(limiter.checkLimit('taskEdit', 'task_2').allowed).toBe(true);
    expect(limiter.getStatus('taskEdit', 'task_2').currentRequests).toBe(1);
  });

  test('nach Ablauf des Fensters sind Anfragen wieder erlaubt', () => {
    burst('export', 5);
    const blocked = limiter.checkLimit('export');
    expect(blocked.allowed).toBe(false);
    now += blocked.resetMs + 1;
    expect(limiter.checkLimit('export').allowed).toBe(true);
  });

  test('ein blockierter Limiter meldet die Restzeit ohne neues Ereignis', () => {
    const exceeded = jest.fn();
    limiter.on('limit_exceeded', exceeded);
    burst('export', 5);
    limiter.checkLimit('export');
    now += 1000;
    const again = limiter.checkLimit('export');
    expect(again.allowed).toBe(false);
    expect(exceeded).toHaveBeenCalledTimes(1);
    expect(exceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        limiter: 'export',
        maxRequests: 5,
        windowMs: 300000,
      }),
    );
  });

  test('ungültige oder unbekannte Namen blockieren nie', () => {
    expect(limiter.checkLimit('')).toMatchObject({ allowed: true });
    expect(limiter.checkLimit(null)).toMatchObject({ allowed: true });
    expect(limiter.checkLimit('gibt-es-nicht')).toMatchObject({
      allowed: true,
      remaining: Infinity,
    });
    expect(limiter.checkLimit('taskCreate', null).allowed).toBe(true);
  });

  test('Fehler im Limiter erlauben die Anfrage und melden an die ErrorBoundary', () => {
    browser.window.errorBoundary = { handleError: jest.fn() };
    limiter.limiters.get('api').requests = null;
    expect(limiter.checkLimit('api')).toMatchObject({ allowed: true });
    expect(browser.window.errorBoundary.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ function: 'checkLimit' }),
    );
  });
});

describe('rollbackRequest und withLimit', () => {
  test('rollbackRequest gibt genau eine Anfrage des Identifiers zurück', () => {
    burst('taskDelete', 3);
    limiter.rollbackRequest('taskDelete', 'default');
    expect(limiter.getStatus('taskDelete').currentRequests).toBe(2);
    limiter.rollbackRequest('taskDelete', 'unbekannt');
    limiter.rollbackRequest('gibt-es-nicht', 'default');
    expect(limiter.getStatus('taskDelete').currentRequests).toBe(2);
  });

  test('withLimit führt aus, gibt bei Fehler die Anfrage zurück und wirft', async () => {
    await expect(limiter.withLimit('api', async () => 'ok')).resolves.toBe(
      'ok',
    );
    expect(limiter.getStatus('api').currentRequests).toBe(1);
    await expect(
      limiter.withLimit('api', async () => {
        throw new Error('Netz');
      }),
    ).rejects.toThrow('Netz');
    expect(limiter.getStatus('api').currentRequests).toBe(1);
  });

  test('withLimit wirft mit Wartezeit, wenn das Limit erreicht ist, und warnt', async () => {
    burst('export', 5);
    const operation = jest.fn();
    await expect(limiter.withLimit('export', operation)).rejects.toThrow(
      /Rate limit exceeded for export\. Try again in \d+s/,
    );
    expect(operation).not.toHaveBeenCalled();
    expect(browser.window.console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Export-Limit erreicht'),
    );
  });

  test('RateLimitHelpers.wrap begrenzt eine Funktion', async () => {
    const fn = jest.fn(async (a) => a * 2);
    const wrapped = browser.window.RateLimitHelpers.wrap('export', fn);
    await expect(wrapped(21)).resolves.toBe(42);
    burst('export', 4);
    await expect(wrapped(1)).rejects.toThrow('Rate limit exceeded');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Status, Reset, Konfiguration und Statistik', () => {
  test('getStatus und getAllStatus beschreiben Auslastung und Limits', () => {
    burst('taskCreate', 5);
    expect(limiter.getStatus('taskCreate')).toMatchObject({
      name: 'taskCreate',
      maxRequests: 10,
      currentRequests: 5,
      remaining: 5,
      percentage: 50,
      blocked: false,
    });
    expect(limiter.getStatus('gibt-es-nicht')).toBeNull();
    const all = limiter.getAllStatus();
    expect(Object.keys(all)).toEqual(
      expect.arrayContaining(['storage', 'taskCreate', 'export', 'api']),
    );
  });

  test('reset und resetAll entsperren', () => {
    burst('export', 6);
    expect(limiter.getStatus('export').blocked).toBe(true);
    expect(limiter.reset('export')).toBe(true);
    expect(limiter.getStatus('export')).toMatchObject({
      blocked: false,
      currentRequests: 0,
    });
    expect(limiter.reset('gibt-es-nicht')).toBe(false);
    burst('taskCreate', 3);
    burst('taskDelete', 3);
    limiter.resetAll();
    expect(limiter.getStatistics().totalRequests).toBe(0);
  });

  test('updateLimit ändert Limit und Fenster', () => {
    expect(limiter.updateLimit('search', { maxRequests: 2 })).toBe(true);
    burst('search', 2);
    expect(limiter.checkLimit('search').allowed).toBe(false);
    expect(limiter.updateLimit('search', { windowMs: 1 })).toBe(true);
    expect(limiter.updateLimit('gibt-es-nicht', {})).toBe(false);
  });

  test('getStatistics fasst Anfragen und blockierte Limiter zusammen', () => {
    burst('taskCreate', 4);
    burst('export', 6);
    const stats = limiter.getStatistics();
    expect(stats.totalLimiters).toBe(8);
    expect(stats.totalRequests).toBe(9);
    expect(stats.blockedLimiters).toBe(1);
    expect(stats.byLimiter.taskCreate).toMatchObject({
      requests: 4,
      utilization: 40,
    });
  });

  test('cleanup entfernt alte Anfragen und entsperrt abgelaufene Blockaden', () => {
    burst('export', 6);
    now += 400000;
    limiter.cleanup();
    expect(limiter.getStatus('export')).toMatchObject({
      blocked: false,
      currentRequests: 0,
    });
  });

  test('der automatische Cleanup läuft im Intervall und stopCleanup beendet ihn', () => {
    const { window } = browser;
    limiter.stopCleanup();
    expect(limiter.cleanupInterval).toBeNull();
    const setIntervalSpy = jest.spyOn(window, 'setInterval').mockReturnValue(7);
    const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
    limiter.startCleanup(10);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10);
    burst('export', 2);
    now += 400000;
    setIntervalSpy.mock.calls[0][0]();
    expect(limiter.getStatus('export').currentRequests).toBe(0);
    limiter.stopCleanup();
    expect(clearIntervalSpy).toHaveBeenCalledWith(7);
    expect(limiter.cleanupInterval).toBeNull();
  });

  test('Ereignis-Callbacks dürfen nicht werfen, destroy räumt auf', () => {
    limiter.on('limit_exceeded', () => {
      throw new Error('Callback kaputt');
    });
    const ok = jest.fn();
    limiter.on('limit_exceeded', ok);
    burst('export', 6);
    expect(ok).toHaveBeenCalledTimes(1);
    limiter.destroy();
    expect(limiter.limiters.size).toBe(0);
    expect(limiter.cleanupInterval).toBeNull();
  });
});

describe('showRateLimitWarning', () => {
  test.each([
    ['taskCreate', 5000, 'Zu viele neue Aufgaben', '5 Sekunden'],
    ['storage', 1000, 'Zu viele Speicher-Operationen', '1 Sekunde'],
    ['export', 125000, 'Export-Limit erreicht', '2 Minuten 5s'],
    ['unbekannt', 60000, 'Rate-Limit erreicht', '1 Minute'],
  ])('%s: Titel und Zeitangabe', (name, resetMs, title, time) => {
    limiter.showRateLimitWarning(name, resetMs);
    const message = browser.window.console.warn.mock.calls.at(-1)[0];
    expect(message).toContain(title);
    expect(message).toContain(time);
  });

  test('nutzt die ErrorBoundary, wenn vorhanden (Anzeige max. 8 Sekunden)', () => {
    browser.window.errorBoundary = { showErrorNotification: jest.fn() };
    limiter.showRateLimitWarning('api', 20000);
    expect(
      browser.window.errorBoundary.showErrorNotification,
    ).toHaveBeenCalledWith(
      expect.stringContaining('Zu viele Anfragen'),
      expect.stringContaining('20 Sekunden'),
      'warning',
      8000,
    );
  });
});
