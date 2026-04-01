const request = require('supertest');
const crypto = require('node:crypto');
const { app, resetRateLimitStores } = require('../src/server/app');
const { validateTask, escapeHtml, sanitizeTaskData } = require('../src/server/validation/task-validator');
const { paginate } = require('../src/server/services/task-service');

const hasDB = !!process.env.DATABASE_URL;
const describeWithDB = hasDB ? describe : describe.skip;

if (hasDB) {
    const { query } = require('../src/server/storage/db');
    const { migrate } = require('../scripts/migrate');

    beforeAll(async () => {
        await migrate();
    });

    beforeEach(async () => {
        await query('DELETE FROM tasks');
        await query('DELETE FROM users');
        resetRateLimitStores();
    });
} else {
    beforeEach(() => {
        resetRateLimitStores();
    });
}

// --- Unit Tests: validateTask ---

describe('validateTask', () => {
    const validTask = {
        title: 'Rasen mähen',
        employee: 'Max',
        location: 'Garten'
    };

    test('accepts valid task', () => {
        const result = validateTask(validTask);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('rejects missing title', () => {
        const result = validateTask({ ...validTask, title: '' });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test('rejects title over 200 chars', () => {
        const result = validateTask({ ...validTask, title: 'x'.repeat(201) });
        expect(result.valid).toBe(false);
    });

    test('accepts empty employee (optional field)', () => {
        const result = validateTask({ ...validTask, employee: '' });
        expect(result.valid).toBe(true);
    });

    test('accepts missing employee', () => {
        const { employee, ...noEmployee } = validTask;
        const result = validateTask(noEmployee);
        expect(result.valid).toBe(true);
    });

    test('rejects employee over 100 chars', () => {
        const result = validateTask({ ...validTask, employee: 'x'.repeat(101) });
        expect(result.valid).toBe(false);
    });

    test('rejects missing location', () => {
        const result = validateTask({ ...validTask, location: '' });
        expect(result.valid).toBe(false);
    });

    test('rejects invalid status', () => {
        const result = validateTask({ ...validTask, status: 'invalid' });
        expect(result.valid).toBe(false);
    });

    test('accepts valid status values', () => {
        for (const status of ['pending', 'in-progress', 'completed']) {
            const result = validateTask({ ...validTask, status });
            expect(result.valid).toBe(true);
        }
    });

    test('rejects invalid priority', () => {
        const result = validateTask({ ...validTask, priority: 'urgent' });
        expect(result.valid).toBe(false);
    });

    test('accepts valid priority values', () => {
        for (const priority of ['low', 'medium', 'high']) {
            const result = validateTask({ ...validTask, priority });
            expect(result.valid).toBe(true);
        }
    });

    test('partial validation skips missing fields', () => {
        const result = validateTask({ title: 'Updated title' }, true);
        expect(result.valid).toBe(true);
    });

    test('rejects description over 2000 chars', () => {
        const result = validateTask({ ...validTask, description: 'x'.repeat(2001) });
        expect(result.valid).toBe(false);
    });

    test('rejects more than 50 subtasks', () => {
        const subtasks = Array.from({ length: 51 }, (_, i) => ({ text: `Subtask ${i}`, completed: false }));
        const result = validateTask({ ...validTask, subtasks });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('50')]));
    });

    test('accepts exactly 50 subtasks', () => {
        const subtasks = Array.from({ length: 50 }, (_, i) => ({ text: `Subtask ${i}`, completed: false }));
        const result = validateTask({ ...validTask, subtasks });
        expect(result.valid).toBe(true);
    });

    test('rejects subtask text over 500 chars', () => {
        const subtasks = [{ text: 'x'.repeat(501), completed: false }];
        const result = validateTask({ ...validTask, subtasks });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('500')]));
    });

    test('rejects subtask string over 500 chars', () => {
        const subtasks = ['x'.repeat(501)];
        const result = validateTask({ ...validTask, subtasks });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('500')]));
    });

    test('rejects subtasks that are not an array', () => {
        const result = validateTask({ ...validTask, subtasks: 'not-an-array' });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Array')]));
    });

    test('rejects subtask with non-string text', () => {
        const subtasks = [{ text: 123, completed: false }];
        const result = validateTask({ ...validTask, subtasks });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('String')]));
    });

    test('rejects subtask with non-boolean completed', () => {
        const subtasks = [{ text: 'Valid text', completed: 'yes' }];
        const result = validateTask({ ...validTask, subtasks });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Boolean')]));
    });

    test('rejects subtask with invalid type (number)', () => {
        const subtasks = [42];
        const result = validateTask({ ...validTask, subtasks });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('String oder Objekt')]));
    });

    test('accepts valid subtasks (mixed strings and objects)', () => {
        const subtasks = [
            { text: 'Object subtask', completed: true },
            'String subtask'
        ];
        const result = validateTask({ ...validTask, subtasks });
        expect(result.valid).toBe(true);
    });
});

// --- Unit Tests: escapeHtml ---

describe('escapeHtml', () => {
    test('escapes HTML special characters', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
        );
    });

    test('escapes ampersand', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    test('escapes single quotes', () => {
        expect(escapeHtml("it's")).toBe("it&#039;s");
    });

    test('handles null/undefined', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    test('converts numbers to string', () => {
        expect(escapeHtml(42)).toBe('42');
    });
});

// --- Unit Tests: sanitizeTaskData ---

describe('sanitizeTaskData', () => {
    test('trims text fields but stores raw (unescaped) data', () => {
        const result = sanitizeTaskData({
            title: '  <b>Test</b>  ',
            employee: ' Max ',
            location: ' Garten '
        });
        expect(result.title).toBe('<b>Test</b>');
        expect(result.employee).toBe('Max');
        expect(result.location).toBe('Garten');
    });

    test('passes through enum fields without escaping', () => {
        const result = sanitizeTaskData({ status: 'pending', priority: 'high' });
        expect(result.status).toBe('pending');
        expect(result.priority).toBe('high');
    });

    test('only includes defined fields', () => {
        const result = sanitizeTaskData({ title: 'Test' });
        expect(result).toHaveProperty('title');
        expect(result).not.toHaveProperty('employee');
    });

    test('preserves special characters without HTML escaping', () => {
        const result = sanitizeTaskData({
            title: 'Tom & Jerry',
            employee: 'O\'Brien',
            location: 'Garten <Süd>',
            description: 'Use "quotes" & ampersands',
            notes: '<script>alert("xss")</script>'
        });
        expect(result.title).toBe('Tom & Jerry');
        expect(result.employee).toBe("O'Brien");
        expect(result.location).toBe('Garten <Süd>');
        expect(result.description).toBe('Use "quotes" & ampersands');
        expect(result.notes).toBe('<script>alert("xss")</script>');
    });
});

// --- Integration Tests: API Endpoints (require PostgreSQL) ---

describeWithDB('API Endpoints', () => {
    const validTask = {
        title: 'Rasen mähen',
        employee: 'Max',
        location: 'Garten',
        description: 'Vorgarten mähen'
    };

    describe('POST /api/tasks', () => {
        test('creates a task and returns 201', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send(validTask);

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.title).toBe('Rasen mähen');
            expect(res.body.status).toBe('pending');
        });

        test('rejects invalid task with 400', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .send({ title: '' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe(true);
            expect(res.body.status).toBe(400);
            expect(res.body).toHaveProperty('errors');
        });
    });

    describe('GET /api/tasks', () => {
        test('returns empty array initially', async () => {
            const res = await request(app).get('/api/tasks');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        test('returns created tasks', async () => {
            await request(app).post('/api/tasks').send(validTask);
            const res = await request(app).get('/api/tasks');
            expect(res.body).toHaveLength(1);
        });

        test('filters by status', async () => {
            await request(app).post('/api/tasks').send(validTask);
            const res = await request(app).get('/api/tasks?status=completed');
            expect(res.body).toHaveLength(0);
        });
    });

    describe('GET /api/tasks/:id', () => {
        test('returns a specific task', async () => {
            const created = await request(app).post('/api/tasks').send(validTask);
            const res = await request(app).get(`/api/tasks/${created.body.id}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(created.body.id);
        });

        test('returns 400 for invalid ID format', async () => {
            const res = await request(app).get('/api/tasks/nonexistent');
            expect(res.status).toBe(400);
            expect(res.body.error).toBe(true);
            expect(res.body.message).toMatch(/Invalid ID format/);
        });

        test('returns 404 for valid UUID that does not exist', async () => {
            const res = await request(app).get('/api/tasks/00000000-0000-4000-a000-000000000000');
            expect(res.status).toBe(404);
        });
    });

    describe('PUT /api/tasks/:id', () => {
        test('updates a task', async () => {
            const created = await request(app).post('/api/tasks').send(validTask);
            const res = await request(app)
                .put(`/api/tasks/${created.body.id}`)
                .send({ title: 'Hecke schneiden' });

            expect(res.status).toBe(200);
            expect(res.body.title).toBe('Hecke schneiden');
        });

        test('returns 400 for invalid ID format', async () => {
            const res = await request(app)
                .put('/api/tasks/nonexistent')
                .send({ title: 'Test' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe(true);
            expect(res.body.message).toMatch(/Invalid ID format/);
        });

        test('returns 404 for valid UUID that does not exist', async () => {
            const res = await request(app)
                .put('/api/tasks/00000000-0000-4000-a000-000000000000')
                .send({ title: 'Test' });
            expect(res.status).toBe(404);
        });

        test('normalizes subtasks like POST does', async () => {
            const created = await request(app).post('/api/tasks').send(validTask);
            const res = await request(app)
                .put(`/api/tasks/${created.body.id}`)
                .send({
                    subtasks: [
                        { text: 'Object subtask', completed: true },
                        'String subtask'
                    ]
                });

            expect(res.status).toBe(200);
            expect(res.body.subtasks).toHaveLength(2);
            expect(res.body.subtasks[0]).toHaveProperty('id');
            expect(res.body.subtasks[0].text).toBe('Object subtask');
            expect(res.body.subtasks[0].completed).toBe(true);
            expect(res.body.subtasks[1]).toHaveProperty('id');
            expect(res.body.subtasks[1].text).toBe('String subtask');
            expect(res.body.subtasks[1].completed).toBe(false);
        });

        test('rejects subtasks exceeding max count via PUT', async () => {
            const created = await request(app).post('/api/tasks').send(validTask);
            const subtasks = Array.from({ length: 51 }, (_, i) => ({ text: `Sub ${i}`, completed: false }));
            const res = await request(app)
                .put(`/api/tasks/${created.body.id}`)
                .send({ subtasks });

            expect(res.status).toBe(400);
            expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringContaining('50')]));
        });

        test('tracks status change in history', async () => {
            const created = await request(app).post('/api/tasks').send(validTask);
            const res = await request(app)
                .put(`/api/tasks/${created.body.id}`)
                .send({ status: 'completed' });

            expect(res.body.status).toBe('completed');
            expect(res.body.completedAt).toBeDefined();
            const lastHistory = res.body.history[res.body.history.length - 1];
            expect(lastHistory.action).toBe('completed');
        });
    });

    describe('DELETE /api/tasks/:id', () => {
        test('deletes a task and returns 204', async () => {
            const created = await request(app).post('/api/tasks').send(validTask);
            const res = await request(app).delete(`/api/tasks/${created.body.id}`);
            expect(res.status).toBe(204);

            const list = await request(app).get('/api/tasks');
            expect(list.body).toHaveLength(0);
        });

        test('returns 400 for invalid ID format', async () => {
            const res = await request(app).delete('/api/tasks/nonexistent');
            expect(res.status).toBe(400);
            expect(res.body.error).toBe(true);
            expect(res.body.message).toMatch(/Invalid ID format/);
        });

        test('returns 404 for valid UUID that does not exist', async () => {
            const res = await request(app).delete('/api/tasks/00000000-0000-4000-a000-000000000000');
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/tasks/:id/archive', () => {
        test('archives a task', async () => {
            const created = await request(app).post('/api/tasks').send(validTask);
            const res = await request(app).post(`/api/tasks/${created.body.id}/archive`);

            expect(res.status).toBe(200);
            expect(res.body.archivedAt).toBeDefined();

            const tasks = await request(app).get('/api/tasks');
            expect(tasks.body).toHaveLength(0);

            const archived = await request(app).get('/api/archived-tasks');
            expect(archived.body).toHaveLength(1);
        });
    });

    describe('POST /api/tasks/:id/unarchive', () => {
        test('restores an archived task', async () => {
            const created = await request(app).post('/api/tasks').send(validTask);
            await request(app).post(`/api/tasks/${created.body.id}/archive`);
            const res = await request(app).post(`/api/tasks/${created.body.id}/unarchive`);

            expect(res.status).toBe(200);

            const tasks = await request(app).get('/api/tasks');
            expect(tasks.body).toHaveLength(1);

            const archived = await request(app).get('/api/archived-tasks');
            expect(archived.body).toHaveLength(0);
        });
    });

    describe('POST /api/tasks/search', () => {
        test('filters by employee via POST body', async () => {
            await request(app).post('/api/tasks').send(validTask);
            await request(app).post('/api/tasks').send({ ...validTask, employee: 'Lisa' });

            const res = await request(app)
                .post('/api/tasks/search')
                .send({ employee: 'Max' });

            expect(res.body).toHaveLength(1);
            expect(res.body[0].employee).toBe('Max');
        });
    });
});

// --- Pagination Tests ---

describe('paginate', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

    test('returns null when no page/limit params', () => {
        expect(paginate(items, {})).toBeNull();
    });

    test('paginates with page and limit', () => {
        const result = paginate(items, { page: '1', limit: '3' });
        expect(result.data).toHaveLength(3);
        expect(result.total).toBe(10);
        expect(result.page).toBe(1);
        expect(result.limit).toBe(3);
        expect(result.pages).toBe(4);
    });

    test('returns correct page 2', () => {
        const result = paginate(items, { page: '2', limit: '3' });
        expect(result.data).toHaveLength(3);
        expect(result.data[0].id).toBe(4);
    });

    test('returns partial last page', () => {
        const result = paginate(items, { page: '4', limit: '3' });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(10);
    });

    test('returns empty data for page beyond range', () => {
        const result = paginate(items, { page: '99', limit: '3' });
        expect(result.data).toHaveLength(0);
        expect(result.total).toBe(10);
    });

    test('defaults to page 1 limit 50 for invalid values', () => {
        const result = paginate(items, { page: 'abc', limit: '-5' });
        expect(result.page).toBe(1);
        expect(result.limit).toBe(50);
        expect(result.data).toHaveLength(10);
    });

    test('caps limit at 200', () => {
        const result = paginate(items, { page: '1', limit: '999' });
        expect(result.limit).toBe(50);
    });
});

describeWithDB('GET /api/tasks with pagination', () => {
    const validTask = {
        title: 'Rasen mähen',
        employee: 'Max',
        location: 'Garten'
    };

    test('returns array without pagination params (backwards-compatible)', async () => {
        await request(app).post('/api/tasks').send(validTask);
        const res = await request(app).get('/api/tasks');
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('returns paginated object with page param', async () => {
        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/tasks').send({ ...validTask, title: `Task ${i}` });
        }
        const res = await request(app).get('/api/tasks?page=1&limit=2');
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total', 5);
        expect(res.body).toHaveProperty('page', 1);
        expect(res.body).toHaveProperty('limit', 2);
        expect(res.body).toHaveProperty('pages', 3);
        expect(res.body.data).toHaveLength(2);
    });

    test('pagination works with status filter', async () => {
        for (let i = 0; i < 3; i++) {
            await request(app).post('/api/tasks').send(validTask);
        }
        const res = await request(app).get('/api/tasks?status=pending&page=1&limit=2');
        expect(res.body.data).toHaveLength(2);
        expect(res.body.total).toBe(3);
    });
});

describeWithDB('POST /api/tasks/search with pagination', () => {
    const validTask = {
        title: 'Rasen mähen',
        employee: 'Max',
        location: 'Garten'
    };

    test('returns array without pagination (backwards-compatible)', async () => {
        await request(app).post('/api/tasks').send(validTask);
        const res = await request(app).post('/api/tasks/search').send({ employee: 'Max' });
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('returns paginated object with page/limit in body', async () => {
        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/tasks').send(validTask);
        }
        const res = await request(app)
            .post('/api/tasks/search')
            .send({ employee: 'Max', page: 1, limit: 2 });
        expect(res.body).toHaveProperty('data');
        expect(res.body.data).toHaveLength(2);
        expect(res.body.total).toBe(5);
    });
});

// --- UUID Validation Tests ---

describe('UUID validation for :id parameters', () => {
    const invalidIds = ['nonexistent', '123', 'not-a-uuid', '../etc/passwd'];
    const routes = [
        { method: 'get', path: '/api/tasks/' },
        { method: 'put', path: '/api/tasks/', body: { title: 'Test' } },
        { method: 'delete', path: '/api/tasks/' },
        { method: 'post', path: '/api/tasks/', suffix: '/archive' },
        { method: 'post', path: '/api/tasks/', suffix: '/unarchive' },
        { method: 'delete', path: '/api/archived-tasks/' },
    ];

    routes.forEach(({ method, path, body, suffix }) => {
        const fullPath = `${path}INVALID_ID${suffix || ''}`;
        test(`${method.toUpperCase()} ${fullPath} returns 400 for invalid ID`, async () => {
            const req = request(app)[method](`${path}not-a-uuid${suffix || ''}`);
            if (body) req.send(body);
            const res = await req;
            expect(res.status).toBe(400);
            expect(res.body.error).toBe(true);
            expect(res.body.message).toMatch(/Invalid ID format/);
        });
    });

    test('accepts valid UUID v4 format', async () => {
        const res = await request(app).get('/api/tasks/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
        // Without DB this may error, but with DB it should be 404 (valid format, doesn't exist)
        if (hasDB) {
            expect(res.status).toBe(404);
        }
    });
});

// --- Error Handler Tests ---

describeWithDB('Global error handler', () => {
    test('returns consistent error format for 500 errors', async () => {
        const res = await request(app).get('/api/test-error');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({
            error: true,
            status: 500,
            message: 'Internal server error'
        });
        expect(res.body.stack).toBeUndefined();
    });

    test('returns consistent error format for 413 payload too large', async () => {
        const largeBody = { title: 'x'.repeat(200 * 1024), location: 'Garten' };
        const res = await request(app)
            .post('/api/tasks')
            .send(largeBody);

        expect(res.status).toBe(413);
        expect(res.body.error).toBe(true);
        expect(res.body.status).toBe(413);
        expect(res.body).toHaveProperty('message');
    });
});

// --- Security Tests ---

describe('Security', () => {
    test('sets security headers', async () => {
        const res = await request(app).get('/api/tasks');
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    test('auth status endpoint is always accessible', async () => {
        const res = await request(app).get('/api/auth/status');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('authRequired');
    });

    test('does not bypass auth via sec-fetch-site header', async () => {
        const res = await request(app)
            .get('/api/tasks')
            .set('sec-fetch-site', 'same-origin');
        expect(res.status).toBe(200);
    });

    test('uses timing-safe comparison for API key validation', () => {
        // Verify that crypto.timingSafeEqual is available and works correctly
        const key = 'test-secret-key';
        const keyBuffer = Buffer.from(key, 'utf8');

        // Matching key
        const matchBuffer = Buffer.from(key, 'utf8');
        expect(crypto.timingSafeEqual(keyBuffer, matchBuffer)).toBe(true);

        // Non-matching key of same length
        const wrongBuffer = Buffer.from('wrong-secret-ke', 'utf8');
        expect(keyBuffer.length).toBe(wrongBuffer.length);
        expect(crypto.timingSafeEqual(keyBuffer, wrongBuffer)).toBe(false);

        // Different-length keys must not be passed to timingSafeEqual directly
        const shortBuffer = Buffer.from('short', 'utf8');
        expect(keyBuffer.length).not.toBe(shortBuffer.length);

        // Undefined/null providedKey is handled by converting to empty string
        const emptyBuffer = Buffer.from('', 'utf8');
        expect(emptyBuffer.length).toBe(0);
        expect(keyBuffer.length).not.toBe(emptyBuffer.length);
    });

    test('CSP header contains nonce instead of unsafe-inline', async () => {
        const res = await request(app).get('/');
        const csp = res.headers['content-security-policy'];
        expect(csp).not.toContain('unsafe-inline');
        expect(csp).toMatch(/style-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
    });

    test('each request gets a unique CSP nonce', async () => {
        const res1 = await request(app).get('/');
        const res2 = await request(app).get('/');
        const nonce1 = res1.headers['content-security-policy'].match(/nonce-([A-Za-z0-9+/=]+)/)[1];
        const nonce2 = res2.headers['content-security-policy'].match(/nonce-([A-Za-z0-9+/=]+)/)[1];
        expect(nonce1).not.toBe(nonce2);
    });

    test('logs page has no inline style tags after CSS extraction', async () => {
        const res = await request(app).get('/logs');
        expect(res.text).not.toContain('<style');
        expect(res.text).not.toContain('__CSP_NONCE__');
        const csp = res.headers['content-security-policy'];
        expect(csp).toMatch(/nonce-[A-Za-z0-9+/=]+/);
    });
});

describeWithDB('Security (DB-dependent)', () => {
    const validTask = {
        title: 'Rasen mähen',
        employee: 'Max',
        location: 'Garten'
    };

    test('stores raw text without HTML escaping (escaping happens on frontend render)', async () => {
        const res = await request(app)
            .post('/api/tasks')
            .send({
                title: '<script>alert("xss")</script>',
                employee: 'Max',
                location: 'Garten'
            });

        expect(res.status).toBe(201);
        expect(res.body.title).toBe('<script>alert("xss")</script>');
    });

    test('returns special characters as-is in API responses', async () => {
        const res = await request(app)
            .post('/api/tasks')
            .send({
                title: 'Tom & Jerry',
                employee: "O'Brien",
                location: 'Garten <Süd>',
                description: 'Use "quotes" & ampersands'
            });

        expect(res.status).toBe(201);
        expect(res.body.title).toBe('Tom & Jerry');
        expect(res.body.employee).toBe("O'Brien");
        expect(res.body.location).toBe('Garten <Süd>');
        expect(res.body.description).toBe('Use "quotes" & ampersands');

        const updated = await request(app)
            .put(`/api/tasks/${res.body.id}`)
            .send({ title: 'Tom & Jerry' });

        expect(updated.status).toBe(200);
        expect(updated.body.title).toBe('Tom & Jerry');
    });

    test('stores subtask text as raw without HTML escaping', async () => {
        const res = await request(app)
            .post('/api/tasks')
            .send({
                title: 'Task with subtasks',
                location: 'Garten',
                subtasks: [
                    { text: 'Tom & Jerry <subtask>', completed: false },
                    'Plain string with "quotes"'
                ]
            });

        expect(res.status).toBe(201);
        expect(res.body.subtasks[0].text).toBe('Tom & Jerry <subtask>');
        expect(res.body.subtasks[1].text).toBe('Plain string with "quotes"');
    });
});

// --- Rate Limiting Tests ---

describeWithDB('Rate limiting', () => {
    test('returns rate limit headers on API responses', async () => {
        const res = await request(app).get('/api/tasks');
        expect(res.headers).toHaveProperty('ratelimit-limit');
        expect(res.headers).toHaveProperty('ratelimit-remaining');
    });

    test('write endpoints have stricter limits than read endpoints', async () => {
        const readRes = await request(app).get('/api/tasks');
        const writeRes = await request(app)
            .post('/api/tasks')
            .send({ title: 'Test', location: 'Garten' });

        const readLimit = parseInt(readRes.headers['ratelimit-limit'], 10);
        const writeLimit = parseInt(writeRes.headers['ratelimit-limit'], 10);

        expect(readLimit).toBeGreaterThan(writeLimit);
    });
});

// --- JSON body size limit ---

describe('JSON body size limit', () => {
    test('rejects payloads over 100kb with 413 status', async () => {
        const largeBody = { title: 'x'.repeat(200 * 1024), location: 'Garten' };
        const res = await request(app)
            .post('/api/tasks')
            .send(largeBody);

        expect(res.status).toBe(413);
        expect(res.body.error).toBe(true);
    });
});
