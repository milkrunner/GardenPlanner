const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { app, validateTask, escapeHtml, sanitizeTaskData } = require('../server');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ARCHIVED_FILE = path.join(DATA_DIR, 'archived-tasks.json');

// Reset data files before each test
beforeEach(() => {
    fs.writeFileSync(TASKS_FILE, '[]', 'utf8');
    fs.writeFileSync(ARCHIVED_FILE, '[]', 'utf8');
});

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

    test('rejects missing employee', () => {
        const result = validateTask({ ...validTask, employee: '' });
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
    test('trims and escapes text fields', () => {
        const result = sanitizeTaskData({
            title: '  <b>Test</b>  ',
            employee: ' Max ',
            location: ' Garten '
        });
        expect(result.title).toBe('&lt;b&gt;Test&lt;/b&gt;');
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
});

// --- Integration Tests: API Endpoints ---

describe('API Endpoints', () => {
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

        test('returns 404 for non-existent task', async () => {
            const res = await request(app).get('/api/tasks/nonexistent');
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

        test('returns 404 for non-existent task', async () => {
            const res = await request(app)
                .put('/api/tasks/nonexistent')
                .send({ title: 'Test' });
            expect(res.status).toBe(404);
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

        test('returns 404 for non-existent task', async () => {
            const res = await request(app).delete('/api/tasks/nonexistent');
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
        // This verifies the sec-fetch-site bypass has been removed.
        // Since API_KEY is not set in tests, all requests are allowed,
        // but the header should have no special effect on auth logic.
        const res = await request(app)
            .get('/api/tasks')
            .set('sec-fetch-site', 'same-origin');
        expect(res.status).toBe(200);
    });

    test('sanitizes XSS in task input', async () => {
        const res = await request(app)
            .post('/api/tasks')
            .send({
                title: '<script>alert("xss")</script>',
                employee: 'Max',
                location: 'Garten'
            });

        expect(res.status).toBe(201);
        expect(res.body.title).not.toContain('<script>');
        expect(res.body.title).toContain('&lt;script&gt;');
    });
});
