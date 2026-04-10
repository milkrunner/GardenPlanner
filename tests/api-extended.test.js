/**
 * Erweiterte API-Tests fuer GardenPlanner (#239)
 * Deckt Tasks CRUD Edge Cases, Kommentar-API, Archiv, Pflanzen,
 * Admin-Routen und Auth-Flows ab.
 */

const request = require('supertest');
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

// =====================================================
// Unit Tests: validateTask - erweiterte Edge Cases
// =====================================================

describe('validateTask - erweiterte Edge Cases', () => {
    const validTask = {
        title: 'Rasen maehen',
        employee: 'Max',
        location: 'Garten'
    };

    test('akzeptiert Task nur mit Pflichtfeldern', () => {
        const result = validateTask({ title: 'Test', location: 'Ort' });
        expect(result.valid).toBe(true);
    });

    test('lehnt title mit nur Leerzeichen ab', () => {
        const result = validateTask({ ...validTask, title: '   ' });
        expect(result.valid).toBe(false);
    });

    test('akzeptiert Titel mit genau 200 Zeichen', () => {
        const result = validateTask({ ...validTask, title: 'a'.repeat(200) });
        expect(result.valid).toBe(true);
    });

    test('lehnt Titel mit 201 Zeichen ab', () => {
        const result = validateTask({ ...validTask, title: 'a'.repeat(201) });
        expect(result.valid).toBe(false);
    });

    test('lehnt Location mit nur Leerzeichen ab', () => {
        const result = validateTask({ ...validTask, location: '   ' });
        expect(result.valid).toBe(false);
    });

    test('akzeptiert gueltige Recurrence-Werte', () => {
        for (const rec of ['none', 'daily', 'weekly', 'monthly']) {
            const result = validateTask({ ...validTask, recurrence: rec });
            expect(result.valid).toBe(true);
        }
    });

    test('lehnt ungueltige Recurrence ab', () => {
        const result = validateTask({ ...validTask, recurrence: 'yearly' });
        expect(result.valid).toBe(false);
    });

    test('lehnt Notes ueber 5000 Zeichen ab', () => {
        const result = validateTask({ ...validTask, notes: 'x'.repeat(5001) });
        expect(result.valid).toBe(false);
    });

    test('akzeptiert Notes mit genau 5000 Zeichen', () => {
        const result = validateTask({ ...validTask, notes: 'x'.repeat(5000) });
        expect(result.valid).toBe(true);
    });

    test('akzeptiert leeres Notes-Feld', () => {
        const result = validateTask({ ...validTask, notes: '' });
        expect(result.valid).toBe(true);
    });

    test('akzeptiert Partial Update ohne Location', () => {
        const result = validateTask({ title: 'Neuer Titel' }, true);
        expect(result.valid).toBe(true);
    });

    test('validiert partial update mit ungueltigem Status', () => {
        const result = validateTask({ status: 'unknown' }, true);
        expect(result.valid).toBe(false);
    });

    test('lehnt Fotos mit einer Groesse ueber 1 MB ab', () => {
        const largePhoto = 'data:image/jpeg;base64,' + 'A'.repeat(1500001);
        const result = validateTask({ ...validTask, photos: [largePhoto] });
        expect(result.valid).toBe(false);
    });

    test('sammelt mehrere Fehler gleichzeitig', () => {
        const result = validateTask({
            title: '',
            location: '',
            status: 'invalid',
            priority: 'invalid'
        });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
});

// =====================================================
// Unit Tests: escapeHtml - erweiterte Edge Cases
// =====================================================

describe('escapeHtml - erweiterte Edge Cases', () => {
    test('escaped leeren String', () => {
        expect(escapeHtml('')).toBe('');
    });

    test('escaped Zeilenumbrueche nicht', () => {
        expect(escapeHtml('Zeile 1\nZeile 2')).toBe('Zeile 1\nZeile 2');
    });

    test('escaped verschachtelte HTML-Tags', () => {
        const result = escapeHtml('<div><span class="x">text</span></div>');
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
    });

    test('escaped boolean-Wert', () => {
        expect(escapeHtml(true)).toBe('true');
    });
});

// =====================================================
// Unit Tests: sanitizeTaskData - erweiterte Edge Cases
// =====================================================

describe('sanitizeTaskData - erweiterte Edge Cases', () => {
    test('entfernt fuehrende/schliessende Leerzeichen bei allen Textfeldern', () => {
        const result = sanitizeTaskData({
            title: '  Test  ',
            employee: '  Max  ',
            location: '  Garten  ',
            description: '  Beschreibung  ',
            notes: '  Notiz  '
        });
        expect(result.title).toBe('Test');
        expect(result.employee).toBe('Max');
        expect(result.location).toBe('Garten');
        expect(result.description).toBe('Beschreibung');
        expect(result.notes).toBe('Notiz');
    });

    test('behaelt Subtasks Array bei', () => {
        const subtasks = [{ text: 'Sub 1', completed: false }];
        const result = sanitizeTaskData({ subtasks });
        expect(result.subtasks).toEqual(subtasks);
    });

    test('behaelt Enum-Felder unveraendert', () => {
        const result = sanitizeTaskData({
            status: 'completed',
            priority: 'high',
            recurrence: 'daily'
        });
        expect(result.status).toBe('completed');
        expect(result.priority).toBe('high');
        expect(result.recurrence).toBe('daily');
    });

    test('ignoriert unbekannte Felder', () => {
        const result = sanitizeTaskData({ unknownField: 'value', title: 'Test' });
        expect(result).not.toHaveProperty('unknownField');
        expect(result).toHaveProperty('title');
    });
});

// =====================================================
// Unit Tests: paginate - erweiterte Edge Cases
// =====================================================

describe('paginate - erweiterte Edge Cases', () => {
    test('gibt null zurueck bei leerem Objekt', () => {
        expect(paginate([], {})).toBeNull();
    });

    test('paginiert leeres Array korrekt', () => {
        const result = paginate([], { page: '1', limit: '10' });
        expect(result.data).toHaveLength(0);
        expect(result.total).toBe(0);
        expect(result.pages).toBe(0);
    });

    test('page 0 wird auf 1 korrigiert', () => {
        const items = [{ id: 1 }, { id: 2 }];
        const result = paginate(items, { page: '0', limit: '10' });
        expect(result.page).toBe(1);
    });

    test('limit 0 wird auf Default korrigiert', () => {
        const items = [{ id: 1 }];
        const result = paginate(items, { page: '1', limit: '0' });
        expect(result.limit).toBe(50);
    });

    test('negative page wird auf 1 korrigiert', () => {
        const items = [{ id: 1 }];
        const result = paginate(items, { page: '-1', limit: '10' });
        expect(result.page).toBe(1);
    });

    test('nur page-Parameter triggert Pagination', () => {
        const items = [{ id: 1 }, { id: 2 }];
        const result = paginate(items, { page: '1' });
        expect(result).not.toBeNull();
        expect(result.limit).toBe(50);
    });

    test('nur limit-Parameter triggert Pagination', () => {
        const items = [{ id: 1 }, { id: 2 }];
        const result = paginate(items, { limit: '1' });
        expect(result).not.toBeNull();
    });
});

// =====================================================
// Integration Tests: Task CRUD erweiterte Tests
// =====================================================

describeWithDB('Task CRUD - erweiterte Tests', () => {
    const validTask = {
        title: 'Rasen maehen',
        employee: 'Max',
        location: 'Garten',
        description: 'Vorgarten maehen'
    };

    test('erstellt Task mit allen optionalen Feldern', async () => {
        const res = await request(app)
            .post('/api/v1/tasks')
            .send({
                ...validTask,
                priority: 'high',
                recurrence: 'weekly',
                notes: 'Wichtig',
                subtasks: [{ text: 'Schritt 1', completed: false }],
                photos: ['data:image/png;base64,iVBOR']
            });

        expect(res.status).toBe(201);
        expect(res.body.priority).toBe('high');
        expect(res.body.recurrence).toBe('weekly');
        expect(res.body.subtasks).toHaveLength(1);
        expect(res.body.photos).toHaveLength(1);
    });

    test('erstellt Task mit Default-Werten', async () => {
        const res = await request(app)
            .post('/api/v1/tasks')
            .send({ title: 'Minimal', location: 'Ort' });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('pending');
        expect(res.body.priority).toBe('medium');
        expect(res.body.recurrence).toBe('none');
        expect(res.body.employee).toBe('');
        expect(res.body.subtasks).toEqual([]);
    });

    test('lehnt Task ohne Body ab', async () => {
        const res = await request(app)
            .post('/api/v1/tasks')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(true);
    });

    test('lehnt Task mit nur Leerzeichen als Titel ab', async () => {
        const res = await request(app)
            .post('/api/v1/tasks')
            .send({ title: '   ', location: 'Garten' });

        expect(res.status).toBe(400);
    });

    test('Update aendert nur angegebene Felder', async () => {
        const created = await request(app).post('/api/v1/tasks').send(validTask);
        const res = await request(app)
            .put(`/api/v1/tasks/${created.body.id}`)
            .send({ priority: 'high' });

        expect(res.status).toBe(200);
        expect(res.body.priority).toBe('high');
        expect(res.body.title).toBe(validTask.title);
        expect(res.body.employee).toBe(validTask.employee);
    });

    test('Update mit leerem Body gibt aktuellen Task zurueck', async () => {
        const created = await request(app).post('/api/v1/tasks').send(validTask);
        const res = await request(app)
            .put(`/api/v1/tasks/${created.body.id}`)
            .send({});

        expect(res.status).toBe(200);
        expect(res.body.title).toBe(validTask.title);
    });

    test('Statusaenderung setzt completedAt', async () => {
        const created = await request(app).post('/api/v1/tasks').send(validTask);

        const completed = await request(app)
            .put(`/api/v1/tasks/${created.body.id}`)
            .send({ status: 'completed' });

        expect(completed.body.completedAt).toBeDefined();

        const reopened = await request(app)
            .put(`/api/v1/tasks/${created.body.id}`)
            .send({ status: 'pending' });

        expect(reopened.body.completedAt).toBeNull();
    });

    test('Loeschen eines nicht existierenden Tasks gibt 404', async () => {
        const res = await request(app)
            .delete('/api/v1/tasks/00000000-0000-4000-a000-000000000000');
        expect(res.status).toBe(404);
    });

    test('doppeltes Loeschen gibt 404', async () => {
        const created = await request(app).post('/api/v1/tasks').send(validTask);
        await request(app).delete(`/api/v1/tasks/${created.body.id}`);
        const res = await request(app).delete(`/api/v1/tasks/${created.body.id}`);
        expect(res.status).toBe(404);
    });
});

// =====================================================
// Integration Tests: Task-Suche
// =====================================================

describeWithDB('Task-Suche - erweiterte Tests', () => {
    const tasks = [
        { title: 'Rasen maehen', employee: 'Max', location: 'Garten', status: 'pending' },
        { title: 'Hecke schneiden', employee: 'Lisa', location: 'Vorgarten', status: 'pending' },
        { title: 'Giessen', employee: 'Max', location: 'Gewaechshaus', status: 'completed' }
    ];

    beforeEach(async () => {
        for (const t of tasks) {
            await request(app).post('/api/v1/tasks').send(t);
        }
    });

    test('Suche nach Location', async () => {
        const res = await request(app)
            .post('/api/v1/tasks/search')
            .send({ location: 'Vorgarten' });

        expect(res.body).toHaveLength(1);
        expect(res.body[0].location).toBe('Vorgarten');
    });

    test('Suche nach Status und Employee kombiniert', async () => {
        const res = await request(app)
            .post('/api/v1/tasks/search')
            .send({ status: 'pending', employee: 'Max' });

        expect(res.body).toHaveLength(1);
        expect(res.body[0].title).toBe('Rasen maehen');
    });

    test('Suche ohne Treffer gibt leeres Array', async () => {
        const res = await request(app)
            .post('/api/v1/tasks/search')
            .send({ employee: 'NichtExistent' });

        expect(res.body).toHaveLength(0);
    });

    test('Suche mit ungueltigem Status wird ignoriert', async () => {
        const res = await request(app)
            .post('/api/v1/tasks/search')
            .send({ status: 'invalid' });

        expect(res.body).toHaveLength(3);
    });

    test('Statusfilter auf GET /api/v1/tasks', async () => {
        const res = await request(app).get('/api/v1/tasks?status=completed');
        expect(res.body).toHaveLength(1);
        expect(res.body[0].status).toBe('completed');
    });

    test('unguelter Statusfilter auf GET zeigt alle Tasks', async () => {
        const res = await request(app).get('/api/v1/tasks?status=ungueltig');
        expect(res.body).toHaveLength(3);
    });
});

// =====================================================
// Integration Tests: Kommentar-API (#243)
// =====================================================

describeWithDB('Kommentar-API (#243)', () => {
    const validTask = {
        title: 'Test-Aufgabe',
        location: 'Garten'
    };

    test('fuegt Kommentar hinzu und gibt 201 zurueck', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        const res = await request(app)
            .post(`/api/v1/tasks/${task.body.id}/comments`)
            .send({ text: 'Erster Kommentar' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.text).toBe('Erster Kommentar');
        expect(res.body).toHaveProperty('createdAt');
    });

    test('Kommentar erscheint im Task', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        await request(app)
            .post(`/api/v1/tasks/${task.body.id}/comments`)
            .send({ text: 'Mein Kommentar' });

        const updated = await request(app).get(`/api/v1/tasks/${task.body.id}`);
        expect(updated.body.comments).toHaveLength(1);
        expect(updated.body.comments[0].text).toBe('Mein Kommentar');
    });

    test('mehrere Kommentare werden gespeichert', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);

        await request(app).post(`/api/v1/tasks/${task.body.id}/comments`).send({ text: 'Kommentar 1' });
        await request(app).post(`/api/v1/tasks/${task.body.id}/comments`).send({ text: 'Kommentar 2' });
        await request(app).post(`/api/v1/tasks/${task.body.id}/comments`).send({ text: 'Kommentar 3' });

        const updated = await request(app).get(`/api/v1/tasks/${task.body.id}`);
        expect(updated.body.comments).toHaveLength(3);
    });

    test('lehnt leeren Kommentar ab', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        const res = await request(app)
            .post(`/api/v1/tasks/${task.body.id}/comments`)
            .send({ text: '' });

        expect(res.status).toBe(400);
    });

    test('lehnt Kommentar ohne Text ab', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        const res = await request(app)
            .post(`/api/v1/tasks/${task.body.id}/comments`)
            .send({});

        expect(res.status).toBe(400);
    });

    test('lehnt Kommentar mit nur Leerzeichen ab', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        const res = await request(app)
            .post(`/api/v1/tasks/${task.body.id}/comments`)
            .send({ text: '   ' });

        expect(res.status).toBe(400);
    });

    test('lehnt Kommentar ueber 2000 Zeichen ab', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        const res = await request(app)
            .post(`/api/v1/tasks/${task.body.id}/comments`)
            .send({ text: 'x'.repeat(2001) });

        expect(res.status).toBe(400);
    });

    test('Kommentar auf nicht existierende Aufgabe gibt 404', async () => {
        const res = await request(app)
            .post('/api/v1/tasks/00000000-0000-4000-a000-000000000000/comments')
            .send({ text: 'Test' });

        expect(res.status).toBe(404);
    });

    test('loescht einen Kommentar', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        const comment = await request(app)
            .post(`/api/v1/tasks/${task.body.id}/comments`)
            .send({ text: 'Wird geloescht' });

        const res = await request(app)
            .delete(`/api/v1/tasks/${task.body.id}/comments/${comment.body.id}`);

        expect(res.status).toBe(204);

        const updated = await request(app).get(`/api/v1/tasks/${task.body.id}`);
        expect(updated.body.comments).toHaveLength(0);
    });

    test('Loeschen eines nicht existierenden Kommentars gibt 404', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        const res = await request(app)
            .delete(`/api/v1/tasks/${task.body.id}/comments/00000000-0000-4000-a000-000000000000`);

        expect(res.status).toBe(404);
    });

    test('Kommentar-Loeschen auf nicht existierender Aufgabe gibt 404', async () => {
        const res = await request(app)
            .delete('/api/v1/tasks/00000000-0000-4000-a000-000000000000/comments/00000000-0000-4000-a000-000000000001');

        expect(res.status).toBe(404);
    });
});

// =====================================================
// Integration Tests: Archiv-API
// =====================================================

describeWithDB('Archiv-API - erweiterte Tests', () => {
    const validTask = {
        title: 'Archiv-Test',
        location: 'Garten'
    };

    test('Archivierung eines nicht existierenden Tasks gibt 404', async () => {
        const res = await request(app)
            .post('/api/v1/tasks/00000000-0000-4000-a000-000000000000/archive');
        expect(res.status).toBe(404);
    });

    test('doppelte Archivierung gibt 404 (schon archiviert)', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        await request(app).post(`/api/v1/tasks/${task.body.id}/archive`);
        const res = await request(app).post(`/api/v1/tasks/${task.body.id}/archive`);
        expect(res.status).toBe(404);
    });

    test('Wiederherstellung nicht archivierter Aufgabe gibt 404', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        const res = await request(app)
            .post(`/api/v1/tasks/${task.body.id}/unarchive`);
        expect(res.status).toBe(404);
    });

    test('archivierte Tasks erscheinen in GET /api/v1/archived-tasks', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        await request(app).post(`/api/v1/tasks/${task.body.id}/archive`);

        const archived = await request(app).get('/api/v1/archived-tasks');
        expect(archived.body).toHaveLength(1);
        expect(archived.body[0].id).toBe(task.body.id);
    });

    test('archivierte Tasks erscheinen nicht in GET /api/v1/tasks', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        await request(app).post(`/api/v1/tasks/${task.body.id}/archive`);

        const tasks = await request(app).get('/api/v1/tasks');
        expect(tasks.body).toHaveLength(0);
    });

    test('Unarchive stellt Task in aktive Liste wieder her', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        await request(app).post(`/api/v1/tasks/${task.body.id}/archive`);
        await request(app).post(`/api/v1/tasks/${task.body.id}/unarchive`);

        const tasks = await request(app).get('/api/v1/tasks');
        expect(tasks.body).toHaveLength(1);

        const archived = await request(app).get('/api/v1/archived-tasks');
        expect(archived.body).toHaveLength(0);
    });

    test('DELETE /api/v1/archived-tasks/:id loescht permanent', async () => {
        const task = await request(app).post('/api/v1/tasks').send(validTask);
        await request(app).post(`/api/v1/tasks/${task.body.id}/archive`);

        const res = await request(app)
            .delete(`/api/v1/archived-tasks/${task.body.id}`);
        expect(res.status).toBe(204);

        const archived = await request(app).get('/api/v1/archived-tasks');
        expect(archived.body).toHaveLength(0);
    });
});

// =====================================================
// Integration Tests: Pflanzen-API
// =====================================================

describe('Pflanzen-API', () => {
    test('GET /api/v1/plants gibt Array zurueck', async () => {
        const res = await request(app).get('/api/v1/plants');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('Pflanzen haben erwartete Felder', async () => {
        const res = await request(app).get('/api/v1/plants');
        if (res.body.length > 0) {
            const plant = res.body[0];
            expect(plant).toHaveProperty('id');
            expect(plant).toHaveProperty('name');
            expect(plant).toHaveProperty('category');
        }
    });

    test('Filterung nach Kategorie', async () => {
        const all = await request(app).get('/api/v1/plants');
        if (all.body.length > 0) {
            const category = all.body[0].category;
            const filtered = await request(app).get(`/api/v1/plants?category=${encodeURIComponent(category)}`);
            expect(filtered.body.length).toBeGreaterThan(0);
            filtered.body.forEach(p => expect(p.category).toBe(category));
        }
    });

    test('Suche nach Pflanzennamen', async () => {
        const all = await request(app).get('/api/v1/plants');
        if (all.body.length > 0) {
            const searchTerm = all.body[0].name.substring(0, 3).toLowerCase();
            const res = await request(app).get(`/api/v1/plants?search=${encodeURIComponent(searchTerm)}`);
            expect(res.body.length).toBeGreaterThan(0);
        }
    });

    test('GET /api/v1/plants/:id gibt 404 fuer nicht existierende Pflanze', async () => {
        const res = await request(app).get('/api/v1/plants/nicht-existent');
        expect(res.status).toBe(404);
    });

    test('GET /api/v1/plants/:id gibt einzelne Pflanze zurueck', async () => {
        const all = await request(app).get('/api/v1/plants');
        if (all.body.length > 0) {
            const res = await request(app).get(`/api/v1/plants/${all.body[0].id}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(all.body[0].id);
        }
    });

    test('GET /api/v1/plant-categories gibt Kategorien zurueck', async () => {
        const res = await request(app).get('/api/v1/plant-categories');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

// =====================================================
// Integration Tests: Auth-Status
// =====================================================

describe('Auth-Flow Tests', () => {
    test('GET /api/v1/auth/status gibt authRequired zurueck', async () => {
        const res = await request(app).get('/api/v1/auth/status');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('authRequired');
        expect(typeof res.body.authRequired).toBe('boolean');
    });

    test('POST /api/v1/auth/login ohne Credentials gibt 400', async () => {
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(true);
    });

    test('POST /api/v1/auth/login mit fehlendem Passwort gibt 400', async () => {
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ username: 'test' });

        expect(res.status).toBe(400);
    });

    test('POST /api/v1/auth/login mit fehlendem Username gibt 400', async () => {
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ password: 'test' });

        expect(res.status).toBe(400);
    });

    test('POST /api/v1/auth/logout gibt 200 zurueck', async () => {
        const res = await request(app)
            .post('/api/v1/auth/logout');

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Logged out');
    });
});

// =====================================================
// Integration Tests: UUID-Validierung auf neuen Routen
// =====================================================

describeWithDB('UUID-Validierung auf Kommentar-Routen', () => {
    test('POST /api/v1/tasks/INVALID/comments gibt 400', async () => {
        const res = await request(app)
            .post('/api/v1/tasks/not-a-uuid/comments')
            .send({ text: 'Test' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Invalid ID format/);
    });

    test('DELETE /api/v1/tasks/INVALID/comments/id gibt 400', async () => {
        const res = await request(app)
            .delete('/api/v1/tasks/not-a-uuid/comments/some-id');
        expect(res.status).toBe(400);
    });
});

// =====================================================
// Integration Tests: API-Version Konsistenz
// =====================================================

describeWithDB('API-Version Konsistenz (/api vs /api/v1)', () => {
    const validTask = {
        title: 'Version-Test',
        location: 'Garten'
    };

    test('/api und /api/v1 Tasks-Endpunkte sind konsistent', async () => {
        const v1 = await request(app).post('/api/v1/tasks').send(validTask);
        expect(v1.status).toBe(201);

        const apiTasks = await request(app).get('/api/tasks');
        const v1Tasks = await request(app).get('/api/v1/tasks');

        expect(apiTasks.body.length).toBe(v1Tasks.body.length);
    });

    test('/api/v1/plants liefert gleiche Daten wie /api/plants', async () => {
        const api = await request(app).get('/api/plants');
        const v1 = await request(app).get('/api/v1/plants');

        expect(api.body.length).toBe(v1.body.length);
    });
});

// =====================================================
// Versionsendpunkt
// =====================================================

describe('Versions-Endpunkt', () => {
    test('GET /api/version gibt Versionsnummer zurueck', async () => {
        const res = await request(app).get('/api/version');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('version');
        expect(typeof res.body.version).toBe('string');
    });
});

// =====================================================
// Statische Seiten
// =====================================================

describe('Statische Seiten', () => {
    const pages = ['/', '/index', '/dashboard', '/garden', '/plants', '/login'];

    pages.forEach(page => {
        test(`GET ${page} gibt 200 zurueck`, async () => {
            const res = await request(app).get(page);
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/html/);
        });
    });
});
