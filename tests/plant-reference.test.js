// Optionale Pflanzenreferenz an Aufgaben (#347): Validierung, Bibliothek, verwaiste Referenz, Filter, Altdaten,
// Wiederholung, Export/Import. Storage ist pro Suite isoliert (tests/setup.js).
const request = require('supertest');
const fs = require('node:fs');

const { app, resetCaches } = require('../src/server/app');
const store = require('../src/server/storage/json-store');
const { PLANTS_FILE } = require('../src/server/services/plant-service');
const {
  validateTask,
  sanitizeTaskData,
  isValidPlantId,
  parsePlantFilter,
} = require('../src/server/validation/task-validator');

const readTasks = () => JSON.parse(fs.readFileSync(store.TASKS_FILE, 'utf8'));
const base = { title: 'Tomaten gießen', location: 'Gewächshaus' };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const create = async (extra = {}) => {
  const res = await request(app)
    .post('/api/tasks')
    .send({ ...base, ...extra });
  expect(res.status).toBe(201);
  return res.body;
};
const put = (id, body) => request(app).put(`/api/tasks/${id}`).send(body);

beforeEach(() => {
  fs.writeFileSync(store.TASKS_FILE, '[]');
  fs.writeFileSync(store.ARCHIVED_FILE, '[]');
  fs.rmSync(PLANTS_FILE, { force: true });
  resetCaches();
});

describe('isValidPlantId', () => {
  test.each(['tomato', 'bush-bean', 'a1', 'x'])('accepts %s', (value) =>
    expect(isValidPlantId(value)).toBe(true),
  );

  test.each([
    '',
    'Tomato',
    'tomato ',
    'to mato',
    'tomato-',
    '-tomato',
    'to--mato',
    '../tomato',
    'tomä',
    'a'.repeat(61),
    5,
    null,
    undefined,
    {},
    ['tomato'],
  ])('rejects %p', (value) => expect(isValidPlantId(value)).toBe(false));
});

describe('validateTask, sanitizeTaskData and parsePlantFilter with plantId', () => {
  test('plantId is optional, null counts as "no plant"', () => {
    expect(validateTask(base).valid).toBe(true);
    expect(validateTask({ ...base, plantId: null }).valid).toBe(true);
    expect(validateTask({ ...base, plantId: 'tomato' }).valid).toBe(true);
    expect(validateTask({ plantId: null }, true).valid).toBe(true);
  });

  test('an invalid plantId yields a message naming the field', () => {
    for (const plantId of ['', 'Tomate!', 5, 'a'.repeat(61)]) {
      const result = validateTask({ ...base, plantId });
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/Pflanzen-ID/);
    }
  });

  test('sanitize keeps a slug and null, and leaves a missing field out', () => {
    expect(sanitizeTaskData({ plantId: 'tomato' }).plantId).toBe('tomato');
    expect(sanitizeTaskData({ plantId: null })).toHaveProperty('plantId', null);
    expect(sanitizeTaskData({ title: 'x' })).not.toHaveProperty('plantId');
  });

  test('parsePlantFilter ignores empty values and rejects bad formats', () => {
    expect(parsePlantFilter({}).plantId).toBeNull();
    expect(parsePlantFilter(undefined).valid).toBe(true);
    expect(parsePlantFilter({ plantId: '' }).plantId).toBeNull();
    expect(parsePlantFilter({ plantId: 'tomato' })).toMatchObject({
      valid: true,
      plantId: 'tomato',
    });
    expect(parsePlantFilter({ plantId: 'Tom ato' }).valid).toBe(false);
    expect(parsePlantFilter({ plantId: ['tomato'] }).valid).toBe(false);
  });
});

describe('POST /api/tasks with plantId', () => {
  test('stores and returns a valid reference; later reads show it', async () => {
    const task = await create({ plantId: 'tomato' });
    expect(task.plantId).toBe('tomato');
    expect(task.history[0].details.plantId).toBe('tomato');
    expect(readTasks()[0].plantId).toBe('tomato');
    const single = await request(app).get(`/api/tasks/${task.id}`).expect(200);
    expect(single.body.plantId).toBe('tomato');
  });

  test('omitting the field or sending null means no plant', async () => {
    expect((await create()).plantId).toBeNull();
    const explicit = await create({ plantId: null });
    expect(explicit.plantId).toBeNull();
    expect(explicit.history[0].details).not.toHaveProperty('plantId');
  });

  test('an unknown plant is rejected with 400 and nothing is written', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ ...base, plantId: 'dragonfruit' });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/dragonfruit.*nicht vorhanden/);
    expect(readTasks()).toEqual([]);
  });

  test.each(['', 'Tomato', 5, '../x'])(
    'rejects the malformed reference %p with 400',
    async (plantId) => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ ...base, plantId });
      expect(res.status).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/Pflanzen-ID/);
      expect(readTasks()).toEqual([]);
    },
  );

  test('plants of the data directory library count as existing', async () => {
    const custom = {
      id: 'wasabi',
      name: 'Wasabi',
      category: 'Gemüse',
      icon: '🌿',
    };
    fs.writeFileSync(PLANTS_FILE, JSON.stringify([custom]));
    expect((await create({ plantId: 'wasabi' })).plantId).toBe('wasabi');
    // plants.json ersetzt die Standardpflanzen: tomato gibt es dann nicht mehr
    await request(app)
      .post('/api/tasks')
      .send({ ...base, plantId: 'tomato' })
      .expect(400);
  });

  test('a damaged plants.json falls back to the defaults for the check', async () => {
    fs.writeFileSync(PLANTS_FILE, '{ kaputt');
    expect((await create({ plantId: 'tomato' })).plantId).toBe('tomato');
  });
});

describe('PUT /api/tasks/:id with plantId', () => {
  test('sets, changes and removes the reference and records each change in the history', async () => {
    const task = await create();

    expect(
      (await put(task.id, { plantId: 'tomato' }).expect(200)).body,
    ).toMatchObject({
      plantId: 'tomato',
    });
    expect(
      (await put(task.id, { plantId: 'basil' }).expect(200)).body.plantId,
    ).toBe('basil');
    const removed = await put(task.id, { plantId: null }).expect(200);
    expect(removed.body.plantId).toBeNull();
    expect(readTasks()[0].plantId).toBeNull();

    const changes = removed.body.history
      .filter((entry) => entry.action === 'edited')
      .map((entry) => entry.details.changes);
    expect(changes).toEqual([
      ['Pflanze: keine Pflanze → "tomato"'],
      ['Pflanze: "tomato" → "basil"'],
      ['Pflanze: "basil" → keine Pflanze'],
    ]);
  });

  test('a PUT without plantId or with the same value leaves it untouched and adds no history', async () => {
    const task = await create({ plantId: 'tomato' });
    const other = await put(task.id, { notes: 'x' }).expect(200);
    expect(other.body.plantId).toBe('tomato');
    const same = await put(task.id, { plantId: 'tomato' }).expect(200);
    expect(same.body.history).toHaveLength(other.body.history.length);
  });

  test('an unknown plant is rejected with 400 and the task stays unchanged, even for other fields', async () => {
    const task = await create({ plantId: 'tomato' });
    const res = await put(task.id, { title: 'Neu', plantId: 'dragonfruit' });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/dragonfruit/);
    const fresh = (await request(app).get(`/api/tasks/${task.id}`).expect(200))
      .body;
    expect(fresh.title).toBe('Tomaten gießen');
    expect(fresh.plantId).toBe('tomato');
    expect(readTasks()[0].title).toBe('Tomaten gießen');
  });

  test.each(['', 'Tomato', 7])(
    'rejects the malformed reference %p with 400',
    async (plantId) => {
      const task = await create();
      await put(task.id, { plantId }).expect(400);
    },
  );
});

describe('a removed plant (orphaned reference)', () => {
  test('the task stays valid: reading, editing other fields, resending the same reference', async () => {
    const task = await create({ plantId: 'tomato' });
    await request(app).delete('/api/plants/tomato').expect(204);

    const single = await request(app).get(`/api/tasks/${task.id}`).expect(200);
    expect(single.body.plantId).toBe('tomato');
    expect(
      (await request(app).get('/api/tasks').expect(200)).body,
    ).toHaveLength(1);

    // Bearbeiten-Dialog sendet die unveränderte, verwaiste Kennung mit
    const edited = await put(task.id, {
      title: 'Umbenannt',
      plantId: 'tomato',
    }).expect(200);
    expect(edited.body).toMatchObject({
      title: 'Umbenannt',
      plantId: 'tomato',
    });

    // Die Referenz lässt sich entfernen, aber nicht erneut auf die gelöschte Pflanze setzen
    const other = await create();
    await put(other.id, { plantId: 'tomato' }).expect(400);
    expect(
      (await put(task.id, { plantId: null }).expect(200)).body.plantId,
    ).toBeNull();
  });

  test('can still be filtered by the removed slug', async () => {
    const task = await create({ plantId: 'tomato' });
    await create({ plantId: 'basil' });
    await request(app).delete('/api/plants/tomato').expect(204);
    const res = await request(app).get('/api/tasks?plantId=tomato').expect(200);
    expect(res.body.map((t) => t.id)).toEqual([task.id]);
  });
});

describe('plantId filter', () => {
  test('GET /api/tasks?plantId returns only matching tasks and combines with other filters', async () => {
    const a = await create({ title: 'A', plantId: 'tomato' });
    const b = await create({
      title: 'B',
      plantId: 'tomato',
      status: 'completed',
    });
    await create({ title: 'C', plantId: 'basil' });
    await create({ title: 'D' });

    const res = await request(app).get('/api/tasks?plantId=tomato').expect(200);
    expect(res.body.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());

    const open = await request(app)
      .get('/api/tasks?plantId=tomato&status=completed')
      .expect(200);
    expect(open.body.map((t) => t.id)).toEqual([b.id]);
  });

  test('filters before the pagination', async () => {
    await create({ title: 'A', plantId: 'tomato' });
    await create({ title: 'B', plantId: 'basil' });
    await create({ title: 'C', plantId: 'tomato' });
    const res = await request(app)
      .get('/api/tasks?plantId=tomato&page=1&limit=1')
      .expect(200);
    expect(res.body).toMatchObject({ total: 2, pages: 2 });
    expect(res.body.data).toHaveLength(1);
  });

  test('a valid slug without matches or without a plant yields an empty list', async () => {
    await create({ plantId: 'tomato' });
    expect(
      (await request(app).get('/api/tasks?plantId=carrot').expect(200)).body,
    ).toEqual([]);
  });

  test('an empty value is ignored, a malformed one is rejected with 400', async () => {
    await create({ plantId: 'tomato' });
    await create();
    expect(
      (await request(app).get('/api/tasks?plantId=').expect(200)).body,
    ).toHaveLength(2);
    const bad = await request(app)
      .get('/api/tasks?plantId=Tom%20ato')
      .expect(400);
    expect(bad.body.error).toMatch(/plantId/);
  });

  test('POST /api/tasks/search accepts plantId in the body together with other filters', async () => {
    const a = await create({ plantId: 'tomato', employee: 'Lisa' });
    await create({ plantId: 'tomato', employee: 'Max' });
    await create({ plantId: 'basil', employee: 'Lisa' });
    const res = await request(app)
      .post('/api/tasks/search')
      .send({ plantId: 'tomato', employee: 'Lisa' })
      .expect(200);
    expect(res.body.map((t) => t.id)).toEqual([a.id]);
    await request(app)
      .post('/api/tasks/search')
      .send({ plantId: 5 })
      .expect(400);
    expect(
      (
        await request(app)
          .post('/api/tasks/search')
          .send({ plantId: '' })
          .expect(200)
      ).body,
    ).toHaveLength(3);
  });
});

describe('legacy data and archive', () => {
  test('tasks stored without the field stay valid and are not migrated', async () => {
    const legacy = {
      id: uuid(1),
      title: 'Alt',
      employee: '',
      location: 'Garten',
      description: '',
      notes: '',
      status: 'pending',
      priority: 'medium',
      recurrence: 'none',
      createdAt: '2026-01-01T10:00:00.000Z',
      subtasks: [],
      history: [],
    };
    fs.writeFileSync(store.TASKS_FILE, JSON.stringify([legacy]));
    resetCaches();

    const res = await request(app).get('/api/tasks').expect(200);
    expect(res.body[0]).not.toHaveProperty('plantId');
    expect(
      (await request(app).get('/api/tasks?plantId=tomato').expect(200)).body,
    ).toEqual([]);

    await put(legacy.id, { notes: 'x' }).expect(200);
    expect(readTasks()[0]).not.toHaveProperty('plantId');
    // null auf eine Aufgabe ohne Referenz ist keine Änderung: kein Historieneintrag, kein neues Feld
    const cleared = await put(legacy.id, { plantId: null }).expect(200);
    expect(
      cleared.body.history.every((e) => !/Pflanze/.test(JSON.stringify(e))),
    ).toBe(true);
    expect(readTasks()[0]).not.toHaveProperty('plantId');
  });

  test('archiving and restoring keeps the reference', async () => {
    const task = await create({ plantId: 'tomato' });
    await request(app).post(`/api/tasks/${task.id}/archive`).expect(200);
    const archived = (await request(app).get('/api/archived-tasks').expect(200))
      .body;
    expect(archived[0].plantId).toBe('tomato');
    await request(app).post(`/api/tasks/${task.id}/unarchive`).expect(200);
    expect(readTasks()[0].plantId).toBe('tomato');
  });
});

describe('recurring tasks keep the plant', () => {
  test.each([
    ['tomato', 'tomato'],
    [undefined, null],
  ])(
    'the follow-up of a task with plantId %p gets %p',
    async (plantId, expected) => {
      const task = await create({ recurrence: 'weekly', plantId });
      const res = await put(task.id, { status: 'completed' }).expect(200);
      expect(res.body.followUp.plantId).toBe(expected);
      expect(
        readTasks().find((t) => t.id === res.body.followUp.id).plantId,
      ).toBe(expected);
    },
  );

  test('an orphaned reference is copied to the follow-up', async () => {
    const task = await create({ recurrence: 'daily', plantId: 'tomato' });
    await request(app).delete('/api/plants/tomato').expect(204);
    const res = await put(task.id, { status: 'completed' }).expect(200);
    expect(res.body.followUp.plantId).toBe('tomato');
  });
});

describe('export and import keep plantId (#347)', () => {
  const bundleTask = (n, extra = {}) => ({
    id: uuid(n),
    title: `Aufgabe ${n}`,
    employee: '',
    location: 'Garten',
    description: '',
    notes: '',
    status: 'pending',
    priority: 'medium',
    recurrence: 'none',
    createdAt: '2026-01-01T10:00:00.000Z',
    subtasks: [],
    history: [],
    ...extra,
  });
  const importBundle = (tasks, archivedTasks = []) =>
    request(app)
      .post('/api/import')
      .send({ formatVersion: 1, tasks, archivedTasks, plants: null });

  test('round trip of referenced, unreferenced and archived tasks', async () => {
    const withPlant = await create({ plantId: 'tomato' });
    const without = await create({ title: 'Ohne' });
    const archived = await create({ title: 'Archiv', plantId: 'basil' });
    await request(app).post(`/api/tasks/${archived.id}/archive`).expect(200);

    const exported = (await request(app).get('/api/export').expect(200)).body;
    fs.writeFileSync(store.TASKS_FILE, '[]');
    fs.writeFileSync(store.ARCHIVED_FILE, '[]');
    resetCaches();
    await request(app).post('/api/import').send(exported).expect(200);

    const tasks = (await request(app).get('/api/tasks').expect(200)).body;
    expect(tasks.find((t) => t.id === withPlant.id).plantId).toBe('tomato');
    expect(tasks.find((t) => t.id === without.id).plantId).toBeNull();
    expect(
      (await request(app).get('/api/archived-tasks').expect(200)).body[0]
        .plantId,
    ).toBe('basil');
  });

  test('bundles from before #347 import without gaining the field', async () => {
    await importBundle([bundleTask(1)]).expect(200);
    expect(readTasks()[0]).not.toHaveProperty('plantId');
  });

  test('a reference to a plant missing in this library is accepted (orphaned)', async () => {
    await importBundle([bundleTask(1, { plantId: 'gone-plant' })]).expect(200);
    expect(readTasks()[0].plantId).toBe('gone-plant');
  });

  test.each(['', 'Tomato', 5])(
    'a malformed plantId %p rejects the whole bundle and writes nothing',
    async (plantId) => {
      const res = await importBundle([
        bundleTask(1),
        bundleTask(2, { plantId }),
      ]).expect(400);
      expect(res.body.errors.join(' ')).toMatch(/tasks\[1\]: Pflanzen-ID/);
      expect(readTasks()).toEqual([]);
    },
  );
});
