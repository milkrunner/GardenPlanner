// security.js: Escaping, Eingabevalidierung und Aufgabenvalidierung. Ersetzt die
// frühere manuelle Seite tests/security-test.html.
const { createBrowser } = require('./helpers/browser-scripts');

let browser;
let Security;
beforeEach(() => {
  browser = createBrowser();
  browser.load('config.js', 'security.js');
  Security = browser.run('Security');
  jest.spyOn(browser.window.console, 'warn').mockImplementation(() => {});
});
afterEach(() => browser.close());

describe('escapeHtml', () => {
  test.each([
    [
      "<script>alert('XSS')</script>",
      '&lt;script&gt;alert(&#039;XSS&#039;)&lt;&#x2F;script&gt;',
    ],
    [
      "<img src=x onerror='alert(1)'>",
      '&lt;img src=x onerror=&#039;alert(1)&#039;&gt;',
    ],
    ['Test "quoted" text', 'Test &quot;quoted&quot; text'],
    ['a & b', 'a &amp; b'],
    [null, ''],
    [undefined, ''],
    [42, '42'],
  ])('%j -> %j', (input, expected) => {
    expect(Security.escapeHtml(input)).toBe(expected);
  });
});

describe('Eingabevalidierung', () => {
  test.each([
    ['Normale Aufgabe', 1, 200, true],
    ['', 1, 200, false],
    ['   ', 1, 200, false],
    ['x'.repeat(200), 1, 200, true],
    ['x'.repeat(201), 1, 200, false],
    [123, 1, 200, false],
  ])('text(%j, %i, %i) -> %s', (value, min, max, expected) => {
    expect(Security.validateInput.text(value, min, max)).toBe(expected);
  });

  test('email, date, option, number und id', () => {
    const v = Security.validateInput;
    expect(v.email('ada@example.org')).toBe(true);
    expect(v.email('ada@example')).toBe(false);
    expect(v.date('2025-03-01')).toBe(true);
    expect(v.date('kein Datum')).toBe(false);
    expect(v.option('a', ['a', 'b'])).toBe(true);
    expect(v.option('c', ['a', 'b'])).toBe(false);
    expect(v.number('5', 1, 10)).toBe(true);
    expect(v.number('11', 1, 10)).toBe(false);
    expect(v.number('0', 1, 10)).toBe(false);
    expect(v.number('abc')).toBe(false);
    expect(v.id('task_1-a')).toBe(true);
    expect(v.id('task 1;')).toBe(false);
  });
});

describe('validateTask', () => {
  const valid = {
    title: 'Tomaten gießen',
    employee: 'Max Mustermann',
    location: 'Gewächshaus 1',
    description: 'Alle Pflanzen wässern',
    status: 'pending',
  };

  test('akzeptiert eine gültige Aufgabe', () => {
    expect(Security.validateTask(valid)).toEqual({ valid: true, errors: [] });
  });

  test.each([
    ['fehlender Titel', { title: '' }, 'Titel'],
    ['zu langer Titel', { title: 'x'.repeat(201) }, 'Titel'],
    ['fehlender Standort', { location: '' }, 'Standort'],
    [
      'zu lange Beschreibung',
      { description: 'x'.repeat(2001) },
      'Beschreibung',
    ],
    ['zu langer Mitarbeitername', { employee: 'x'.repeat(101) }, 'Mitarbeiter'],
    ['ungültiger Status', { status: 'invalid_status' }, 'Status'],
    ['ungültige Priorität', { priority: 'dringend' }, 'Priorität'],
    ['ungültiges Datum', { dueDate: 'morgen früh' }, 'Fälligkeitsdatum'],
  ])('lehnt %s ab', (_name, overrides, fragment) => {
    const result = Security.validateTask({ ...valid, ...overrides });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain(fragment);
  });
});

describe('Sanitizing-Helfer', () => {
  test('sanitizeUrl erlaubt nur http, https und mailto', () => {
    expect(Security.sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
    expect(Security.sanitizeUrl('data:text/html,<b>x</b>')).toBe('about:blank');
    expect(Security.sanitizeUrl('https://example.com')).toBe(
      'https://example.com',
    );
    expect(Security.sanitizeUrl('mailto:a@b.de')).toBe('mailto:a@b.de');
    expect(Security.sanitizeUrl('')).toBe('');
  });

  test('sanitizeText trimmt und behandelt null/undefined', () => {
    expect(Security.sanitizeText('   Text mit Leerzeichen   ')).toBe(
      'Text mit Leerzeichen',
    );
    expect(Security.sanitizeText(null)).toBe('');
    expect(Security.sanitizeText(undefined)).toBe('');
    expect(Security.sanitizeText(7)).toBe('7');
  });

  test('sanitizeTemplateData escaped Strings und String-Listen', () => {
    expect(
      Security.sanitizeTemplateData({
        a: '<b>',
        list: ['<i>', 3],
        n: 1,
      }),
    ).toEqual({ a: '&lt;b&gt;', list: ['&lt;i&gt;', 3], n: 1 });
    expect(Security.sanitizeTemplateData(null)).toBeNull();
    expect(Security.sanitizeTemplateData('x')).toBe('x');
  });

  test('sanitizeEventHandler entfernt gefährliche Protokolle', () => {
    expect(Security.sanitizeEventHandler('javascript:alert(1)')).toBe('');
    expect(Security.sanitizeEventHandler('data:text/html,x')).toBe('');
    expect(Security.sanitizeEventHandler('doSomething()')).toBe(
      'doSomething()',
    );
  });

  test('setTextContent und setAttribute schreiben escapte Werte', () => {
    const el = browser.document.createElement('div');
    Security.setTextContent(el, '  <b>x</b> ');
    expect(el.textContent).toBe('<b>x</b>');
    expect(el.children).toHaveLength(0);
    Security.setAttribute(el, 'title', '"><script>');
    expect(el.getAttribute('title')).toBe('&quot;&gt;&lt;script&gt;');
    expect(() => Security.setTextContent(null, 'x')).not.toThrow();
  });

  test('createSafeElement parst genau ein Element', () => {
    const el = Security.createSafeElement('  <p class="a">Hi</p>');
    expect(el.tagName).toBe('P');
    expect(el.textContent).toBe('Hi');
  });
});

describe('Speicherdaten und Security-Events', () => {
  test('validateStorageData prüft JSON und Größe', () => {
    const errorBoundary = { handleError: jest.fn() };
    browser.window.errorBoundary = errorBoundary;
    expect(Security.validateStorageData('k', '{"a":1}')).toBe(true);
    expect(Security.validateStorageData('k', { a: 1 })).toBe(true);
    expect(Security.validateStorageData('k', '{kaputt')).toBe(false);
    expect(errorBoundary.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'validation' }),
    );
    expect(
      Security.validateStorageData('k', 'x'.repeat(5 * 1024 * 1024 + 1)),
    ).toBe(false);
  });

  test('generateNonce liefert 32 Hex-Zeichen', () => {
    browser.window.crypto.getRandomValues =
      require('node:crypto').webcrypto.getRandomValues.bind(
        require('node:crypto').webcrypto,
      );
    const nonce = Security.generateNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  test('logSecurityEvent nutzt den Logger, meldet Fehler an die ErrorBoundary', () => {
    const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    browser.window.logger = logger;
    browser.window.errorBoundary = { handleError: jest.fn() };
    Security.logSecurityEvent('error', 'schlimm', { a: 1 });
    Security.logSecurityEvent('warning', 'hm');
    Security.logSecurityEvent('info', 'ok');
    expect(logger.error).toHaveBeenCalledWith('schlimm', 'security', { a: 1 });
    expect(logger.warn).toHaveBeenCalledWith('hm', 'security', {});
    expect(logger.info).toHaveBeenCalledWith('ok', 'security', {});
    expect(browser.window.errorBoundary.handleError).toHaveBeenCalledTimes(1);
  });

  test('logSecurityEvent fällt ohne Logger auf console.warn zurück', () => {
    Security.logSecurityEvent('warning', 'hm');
    expect(browser.window.console.warn).toHaveBeenCalledWith(
      '[Security]',
      expect.objectContaining({ message: 'hm' }),
    );
  });
});
