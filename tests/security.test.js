/**
 * Jest tests for src/js/security.js (client-side Security module)
 * Migrated from tests/security-test.html (#147)
 *
 * The source file is a browser script that attaches a Security object to
 * window.  We eval it inside a controlled scope so all functions become
 * available without modifying the source.
 */

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Bootstrap: create the minimal browser globals that security.js expects,
// then eval the file so `Security` lands on our fake `window`.
// ---------------------------------------------------------------------------

let Security;

beforeAll(() => {
    // Minimal window / DOM shims
    const fakeWindow = {
        GP: {},
        location: { origin: 'http://localhost:3000' },
        crypto: require('node:crypto'),
        errorBoundary: null,
        logger: null,
    };

    // security.js calls document.createElement('template') in createSafeElement.
    // We do NOT need that for tests; provide a stub so the file loads.
    const fakeDocument = {
        createElement: () => ({
            innerHTML: '',
            content: { firstChild: null },
        }),
    };

    // Build a sandbox with the globals security.js references
    const sandbox = {
        window: fakeWindow,
        document: fakeDocument,
        crypto: fakeWindow.crypto,
        console,
        Object,
        String,
        Array,
        Uint8Array,
        JSON,
        Date,
        Blob: class Blob {
            constructor(parts) {
                this.size = parts.reduce((s, p) => s + (typeof p === 'string' ? Buffer.byteLength(p, 'utf8') : p.length), 0);
            }
        },
        URL: globalThis.URL,
    };

    const code = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'js', 'security.js'),
        'utf8',
    );

    // Wrap in a function so `window`, `document` etc. resolve to our sandbox
    const wrapper = new Function(...Object.keys(sandbox), code);
    wrapper(...Object.values(sandbox));

    Security = fakeWindow.Security;
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('Security.escapeHtml', () => {
    test('escapes script tags', () => {
        expect(Security.escapeHtml(`<script>alert('XSS')</script>`))
            .toBe('&lt;script&gt;alert(&#039;XSS&#039;)&lt;&#x2F;script&gt;');
    });

    test('escapes image tag with onerror', () => {
        expect(Security.escapeHtml(`<img src=x onerror='alert(1)'>`))
            .toBe('&lt;img src=x onerror=&#039;alert(1)&#039;&gt;');
    });

    test('escapes double quotes', () => {
        expect(Security.escapeHtml('Test "quoted" text'))
            .toBe('Test &quot;quoted&quot; text');
    });

    test('escapes ampersand', () => {
        expect(Security.escapeHtml('a & b')).toBe('a &amp; b');
    });

    test('escapes forward slashes', () => {
        expect(Security.escapeHtml('a/b')).toBe('a&#x2F;b');
    });

    test('returns empty string for null', () => {
        expect(Security.escapeHtml(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
        expect(Security.escapeHtml(undefined)).toBe('');
    });

    test('converts numbers to string', () => {
        expect(Security.escapeHtml(42)).toBe('42');
    });
});

// ---------------------------------------------------------------------------
// sanitizeText
// ---------------------------------------------------------------------------

describe('Security.sanitizeText', () => {
    test('trims whitespace', () => {
        expect(Security.sanitizeText('   Text mit Leerzeichen   '))
            .toBe('Text mit Leerzeichen');
    });

    test('returns empty string for null', () => {
        expect(Security.sanitizeText(null)).toBe('');
    });

    test('returns empty string for undefined', () => {
        expect(Security.sanitizeText(undefined)).toBe('');
    });

    test('converts number to trimmed string', () => {
        expect(Security.sanitizeText(123)).toBe('123');
    });
});

// ---------------------------------------------------------------------------
// sanitizeUrl
// ---------------------------------------------------------------------------

describe('Security.sanitizeUrl', () => {
    test('blocks javascript: protocol', () => {
        expect(Security.sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
    });

    test('allows https URLs', () => {
        expect(Security.sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    test('allows http URLs', () => {
        expect(Security.sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    test('allows mailto URLs', () => {
        expect(Security.sanitizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
    });

    test('blocks data: protocol', () => {
        expect(Security.sanitizeUrl('data:text/html,<h1>Hi</h1>')).toBe('about:blank');
    });

    test('returns empty string for empty input', () => {
        expect(Security.sanitizeUrl('')).toBe('');
    });

    test('returns empty string for null', () => {
        expect(Security.sanitizeUrl(null)).toBe('');
    });
});

// ---------------------------------------------------------------------------
// validateInput.text
// ---------------------------------------------------------------------------

describe('Security.validateInput.text', () => {
    test('accepts valid text within bounds', () => {
        expect(Security.validateInput.text('Normale Aufgabe', 1, 200)).toBe(true);
    });

    test('rejects empty string when minLength is 1', () => {
        expect(Security.validateInput.text('', 1, 200)).toBe(false);
    });

    test('rejects text exceeding maxLength', () => {
        expect(Security.validateInput.text('x'.repeat(201), 1, 200)).toBe(false);
    });

    test('accepts text at exact maxLength', () => {
        expect(Security.validateInput.text('x'.repeat(200), 1, 200)).toBe(true);
    });

    test('rejects non-string input', () => {
        expect(Security.validateInput.text(123, 1, 200)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateInput.email
// ---------------------------------------------------------------------------

describe('Security.validateInput.email', () => {
    test('accepts valid email', () => {
        expect(Security.validateInput.email('test@example.com')).toBe(true);
    });

    test('rejects email without @', () => {
        expect(Security.validateInput.email('invalid')).toBe(false);
    });

    test('rejects email without domain', () => {
        expect(Security.validateInput.email('test@')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateInput.date
// ---------------------------------------------------------------------------

describe('Security.validateInput.date', () => {
    test('accepts valid ISO date', () => {
        expect(Security.validateInput.date('2024-01-15')).toBe(true);
    });

    test('rejects invalid date string', () => {
        expect(Security.validateInput.date('not-a-date')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateInput.option
// ---------------------------------------------------------------------------

describe('Security.validateInput.option', () => {
    test('accepts value in allowed list', () => {
        expect(Security.validateInput.option('pending', ['pending', 'completed'])).toBe(true);
    });

    test('rejects value not in allowed list', () => {
        expect(Security.validateInput.option('invalid', ['pending', 'completed'])).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateInput.number
// ---------------------------------------------------------------------------

describe('Security.validateInput.number', () => {
    test('accepts valid number', () => {
        expect(Security.validateInput.number(5, 1, 10)).toBe(true);
    });

    test('rejects NaN', () => {
        expect(Security.validateInput.number('abc')).toBe(false);
    });

    test('rejects number below min', () => {
        expect(Security.validateInput.number(0, 1, 10)).toBe(false);
    });

    test('rejects number above max', () => {
        expect(Security.validateInput.number(11, 1, 10)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateInput.id
// ---------------------------------------------------------------------------

describe('Security.validateInput.id', () => {
    test('accepts alphanumeric with dashes and underscores', () => {
        expect(Security.validateInput.id('task_123-abc')).toBe(true);
    });

    test('rejects id with spaces', () => {
        expect(Security.validateInput.id('task 123')).toBe(false);
    });

    test('rejects id with special characters', () => {
        expect(Security.validateInput.id('task<script>')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateTask
// ---------------------------------------------------------------------------

describe('Security.validateTask', () => {
    const validTask = {
        title: 'Tomaten giessen',
        employee: 'Max Mustermann',
        location: 'Gewaechshaus 1',
        description: 'Alle Pflanzen waessern',
        status: 'pending',
    };

    test('accepts valid task', () => {
        const result = Security.validateTask(validTask);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('rejects task with empty title', () => {
        const result = Security.validateTask({ ...validTask, title: '' });
        expect(result.valid).toBe(false);
    });

    test('rejects task with invalid status', () => {
        const result = Security.validateTask({ ...validTask, status: 'invalid_status' });
        expect(result.valid).toBe(false);
    });

    test('rejects task with invalid priority', () => {
        const result = Security.validateTask({ ...validTask, priority: 'critical' });
        expect(result.valid).toBe(false);
    });

    test('accepts task with valid priority', () => {
        const result = Security.validateTask({ ...validTask, priority: 'high' });
        expect(result.valid).toBe(true);
    });

    test('rejects task with missing location', () => {
        const result = Security.validateTask({ ...validTask, location: '' });
        expect(result.valid).toBe(false);
    });

    test('rejects task with description over 2000 chars', () => {
        const result = Security.validateTask({ ...validTask, description: 'x'.repeat(2001) });
        expect(result.valid).toBe(false);
    });

    test('rejects task with employee over 100 chars', () => {
        const result = Security.validateTask({ ...validTask, employee: 'x'.repeat(101) });
        expect(result.valid).toBe(false);
    });

    test('accepts task with invalid dueDate', () => {
        const result = Security.validateTask({ ...validTask, dueDate: 'not-a-date' });
        expect(result.valid).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// sanitizeEventHandler
// ---------------------------------------------------------------------------

describe('Security.sanitizeEventHandler', () => {
    test('blocks javascript: in handler', () => {
        expect(Security.sanitizeEventHandler('javascript:alert(1)')).toBe('');
    });

    test('blocks data: in handler', () => {
        expect(Security.sanitizeEventHandler('data:text/html,test')).toBe('');
    });

    test('allows safe handler string', () => {
        expect(Security.sanitizeEventHandler('doSomething()')).toBe('doSomething()');
    });
});

// ---------------------------------------------------------------------------
// sanitizeTemplateData
// ---------------------------------------------------------------------------

describe('Security.sanitizeTemplateData', () => {
    test('escapes string values in object', () => {
        const result = Security.sanitizeTemplateData({ name: '<b>Test</b>' });
        expect(result.name).toBe('&lt;b&gt;Test&lt;&#x2F;b&gt;');
    });

    test('escapes strings in arrays', () => {
        const result = Security.sanitizeTemplateData({ items: ['<b>A</b>', 'B'] });
        expect(result.items[0]).toBe('&lt;b&gt;A&lt;&#x2F;b&gt;');
        expect(result.items[1]).toBe('B');
    });

    test('passes through non-string values', () => {
        const result = Security.sanitizeTemplateData({ count: 42 });
        expect(result.count).toBe(42);
    });

    test('returns non-object input as-is', () => {
        expect(Security.sanitizeTemplateData('hello')).toBe('hello');
        expect(Security.sanitizeTemplateData(null)).toBe(null);
    });
});
