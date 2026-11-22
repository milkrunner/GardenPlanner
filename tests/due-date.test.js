// Fälligkeitsdatum je Aufgabe (#344): Validierung, API, Historie, Filter/Sortierung, Altdaten, Export/Import.
// Wiederholung und `dueDate` der Folgeaufgabe stehen in tests/recurrence.test.js. Storage ist pro Suite isoliert.
const request = require('supertest');
const fs = require('node:fs');

const { app, resetCaches } = require('../src/server/app');
const store = require('../src/server/storage/json-store');
const {
  validateTask,
  sanitizeTaskData,
  isValidDueDate,
  parseDueFilter,
  applyDueFilter,
} = require('../src/server/validation/task-validator');

const readTasks = () => JSON.parse(fs.readFileSync(store.TASKS_FILE, 'utf8'));
const base = { title: 'Beete gießen', location: 'Garten' };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const create = async (extra = {}) => {
  const res = await request(app)
    .post('/api/tasks')
    .send({ ...base, ...extra });
  expect(res.status).toBe(201);
  return res.body;
};

beforeEach(() => {
  fs.writeFileSync(store.TASKS_FILE, '[]');
  fs.writeFileSync(store.ARCHIVED_FILE, '[]');
  resetCaches();
});

describe('isValidDueDate', () => {
  test.each(['2026-03-15', '2024-02-29', '2000-01-01', '2100-12-31'])(
    'accepts %s',
    (value) => expect(isValidDueDate(value)).toBe(true),
  );

  test.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '1999-12-31',
    '2101-01-01',
    '2026-3-5',
    '26-03-15',
    '2026-03-15T10:00:00Z',
    '2026-03-15 ',
    '15.03.2026',
    '',
    20260315,
    null,
    undefined,
    {},
    ['2026-03-15'],
    true,
  ])('rejects %p', (value) => expect(isValidDueDate(value)).toBe(false));
});

describe('validateTask and sanitizeTaskData with dueDate', () => {
  test('dueDate is optional, null counts as "no due date"', () => {
    expect(validateTask(base).valid).toBe(true);
    expect(validateTask({ ...base, dueDate: null }).valid).toBe(true);
    expect(validateTask({ ...base, dueDate: '2026-03-15' }).valid).toBe(true);
    expect(validateTask({ dueDate: '2026-03-15' }, true).valid).toBe(true);
    expect(validateTask({ dueDate: null }, true).valid).toBe(true);
  });

  test('an invalid dueDate yields a message naming the field', () => {
    for (const dueDate of ['2026-02-30', '', 'morgen', 5, '1999-01-01']) {
      const result = validateTask({ ...base, dueDate });
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/Fälligkeitsdatum/);
    }
  });

  test('sanitize keeps a date and null, and leaves a missing field out', () => {
    expect(sanitizeTaskData({ dueDate: '2026-03-15' }).dueDate).toBe(
      '2026-03-15',
    );
    expect(sanitizeTaskData({ dueDate: null })).toHaveProperty('dueDate', null);
    expect(sanitizeTaskData({ title: 'x' })).not.toHaveProperty('dueDate');
  });
});

describe('POST /api/tasks with dueDate', () => {
  test('stores and returns the date; later reads show it', async () => {
    const task = await create({ dueDate: '2026-03-15' });
    expect(task.dueDate).toBe('2026-03-15');
    expect(task.history[0].details.dueDate).toBe('2026-03-15');
    expect(readTasks()[0].dueDate).toBe('2026-03-15');
    const single = await request(app).get(`/api/tasks/${task.id}`).expect(200);
    expect(single.body.dueDate).toBe('2026-03-15');
  });

  test('omitting the field or sending null means no due date', async () => {
    expect((await create()).dueDate).toBeNull();
    const explicit = await create({ dueDate: null });
    expect(explicit.dueDate).toBeNull();
    expect(explicit.history[0].details).not.toHaveProperty('dueDate');
  });

  test.each(['2026-02-30', '', '2026-03-15T00:00:00Z', 20260315, '2101-01-01'])(
    'rejects %p with 400 and errors',
    async (dueDate) => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ ...base, dueDate });
      expect(res.status).toBe(400);
      expect(res.body.errors.join(' ')).toMatch(/Fälligkeitsdatum/);
      expect(readTasks()).toEqual([]);
    },
  );
});

describe('PUT /api/tasks/:id with dueDate', () => {
  const put = (id, body) => request(app).put(`/api/tasks/${id}`).send(body);

  test('sets, changes and removes the date and records each change in the history', async () => {
    const task = await create();

    const set = await put(task.id, { dueDate: '2026-03-15' }).expect(200);
    expect(set.body.dueDate).toBe('2026-03-15');

    const changed = await put(task.id, { dueDate: '2026-04-01' }).expect(200);
    expect(changed.body.dueDate).toBe('2026-04-01');

    const removed = await put(task.id, { dueDate: null }).expect(200);
    expect(removed.body.dueDate).toBeNull();
    expect(readTasks()[0].dueDate).toBeNull();

    const changes = removed.body.history
      .filter((entry) => entry.action === 'edited')
      .map((entry) => entry.details.changes);
    expect(changes).toEqual([
      ['Fälligkeit: kein Termin → "2026-03-15"'],
      ['Fälligkeit: "2026-03-15" → "2026-04-01"'],
      ['Fälligkeit: "2026-04-01" → kein Termin'],
    ]);
  });

  test('a partial update without dueDate leaves it untouched, and vice versa', async () => {
    const task = await create({ dueDate: '2026-03-15' });
    const renamed = await put(task.id, { title: 'Neu' }).expect(200);
    expect(renamed.body.dueDate).toBe('2026-03-15');

    const dated = await put(task.id, { dueDate: '2026-05-05' }).expect(200);
    expect(dated.body.title).toBe('Neu');
    expect(dated.body.priority).toBe('medium');
  });

  test('an unchanged date adds no history entry', async () => {
    const task = await create({ dueDate: '2026-03-15' });
    const same = await put(task.id, { dueDate: '2026-03-15' }).expect(200);
    expect(same.body.history).toHaveLength(1);
    const nothing = await put(task.id, { dueDate: null }).expect(200);
    const again = await put(task.id, { dueDate: null }).expect(200);
    expect(again.body.history).toHaveLength(nothing.body.history.length);
  });

  test('an invalid date returns 400 and changes nothing', async () => {
    const task = await create({ dueDate: '2026-03-15' });
    const res = await put(task.id, { dueDate: '2026-02-30', title: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.errors.join(' ')).toMatch(/Fälligkeitsdatum/);
    const stored = readTasks()[0];
    expect(stored.dueDate).toBe('2026-03-15');
    expect(stored.title).toBe(base.title);
  });
});

describe('tasks created before #344 stay valid', () => {
  const legacy = {
    id: uuid(1),
    title: 'Altbestand',
    employee: '',
    location: 'Garten',
    description: '',
    notes: '',
    status: 'pending',
    priority: 'medium',
    recurrence: 'none',
    createdAt: '2025-01-01T10:00:00.000Z',
    subtasks: [],
    history: [],
  };

  beforeEach(() => {
    fs.writeFileSync(store.TASKS_FILE, JSON.stringify([legacy]));
    resetCaches();
  });

  test('they are listed unchanged and can get a date later', async () => {
    const list = await request(app).get('/api/tasks').expect(200);
    expect(list.body).toEqual([legacy]);
    expect(list.body[0]).not.toHaveProperty('dueDate');

    const res = await request(app)
      .put(`/api/tasks/${legacy.id}`)
      .send({ dueDate: '2026-06-01' })
      .expect(200);
    expect(res.body.dueDate).toBe('2026-06-01');
    expect(res.body.history[0].details.changes).toEqual([
      'Fälligkeit: kein Termin → "2026-06-01"',
    ]);
  });

  test('removing a date from a task that has none is not a change', async () => {
    const res = await request(app)
      .put(`/api/tasks/${legacy.id}`)
      .send({ dueDate: null })
      .expect(200);
    expect(res.body.history).toHaveLength(0);
  });

  test('completing a recurring old task falls back to the completion day', async () => {
    fs.writeFileSync(
      store.TASKS_FILE,
      JSON.stringify([{ ...legacy, recurrence: 'daily' }]),
    );
    resetCaches();
    const res = await request(app)
      .put(`/api/tasks/${legacy.id}`)
      .send({ status: 'completed' })
      .expect(200);
    const tomorrow = new Date(res.body.completedAt);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    expect(res.body.followUp.dueDate).toBe(tomorrow.toISOString().slice(0, 10));
  });
});

describe('parseDueFilter and applyDueFilter', () => {
  const tasks = [
    { id: 'a', dueDate: '2026-03-20' },
    { id: 'b' },
    { id: 'c', dueDate: '2026-03-10' },
    { id: 'd', dueDate: null },
    { id: 'e', dueDate: '2026-03-10' },
  ];
  const ids = (list) => list.map((t) => t.id).join('');

  test('empty or missing parameters mean no filter', () => {
    expect(parseDueFilter({})).toEqual({
      valid: true,
      errors: [],
      filter: { dueFrom: null, dueTo: null, sort: null },
    });
    expect(parseDueFilter(undefined).valid).toBe(true);
    expect(parseDueFilter({ dueFrom: '', sort: '' }).valid).toBe(true);
  });

  test('invalid values are reported', () => {
    expect(parseDueFilter({ dueFrom: '2026-02-30' }).valid).toBe(false);
    expect(parseDueFilter({ dueTo: ['2026-03-01'] }).valid).toBe(false);
    expect(parseDueFilter({ sort: 'title' }).valid).toBe(false);
  });

  test('range is inclusive and drops tasks without a date', () => {
    const filter = (extra) => parseDueFilter(extra).filter;
    expect(ids(applyDueFilter(tasks, filter({ dueFrom: '2026-03-10' })))).toBe(
      'ace',
    );
    expect(ids(applyDueFilter(tasks, filter({ dueFrom: '2026-03-11' })))).toBe(
      'a',
    );
    expect(ids(applyDueFilter(tasks, filter({ dueTo: '2026-03-10' })))).toBe(
      'ce',
    );
    expect(
      ids(
        applyDueFilter(
          tasks,
          filter({ dueFrom: '2026-03-10', dueTo: '2026-03-10' }),
        ),
      ),
    ).toBe('ce');
  });

  test('sorting is stable, ascending, tasks without date last, input untouched', () => {
    const sorted = applyDueFilter(
      tasks,
      parseDueFilter({ sort: 'dueDate' }).filter,
    );
    expect(ids(sorted)).toBe('ceabd');
    expect(ids(tasks)).toBe('abcde');
  });
});

describe('GET /api/tasks and POST /api/tasks/search by due date', () => {
  beforeEach(async () => {
    await create({ title: 'Spät', dueDate: '2026-03-20', employee: 'Lisa' });
    await create({ title: 'Ohne', employee: 'Lisa' });
    await create({ title: 'Früh', dueDate: '2026-03-10', employee: 'Max' });
    await create({ title: 'Mitte', dueDate: '2026-03-15', employee: 'Lisa' });
  });

  const titles = (res) =>
    (Array.isArray(res.body) ? res.body : res.body.data).map((t) => t.title);

  test('dueFrom and dueTo filter inclusively', async () => {
    const from = await request(app).get('/api/tasks?dueFrom=2026-03-15');
    expect(titles(from).sort()).toEqual(['Mitte', 'Spät']);
    const to = await request(app).get('/api/tasks?dueTo=2026-03-15');
    expect(titles(to).sort()).toEqual(['Früh', 'Mitte']);
    const both = await request(app).get(
      '/api/tasks?dueFrom=2026-03-11&dueTo=2026-03-19',
    );
    expect(titles(both)).toEqual(['Mitte']);
  });

  test('sort=dueDate orders ascending with undated tasks last', async () => {
    const res = await request(app).get('/api/tasks?sort=dueDate').expect(200);
    expect(titles(res)).toEqual(['Früh', 'Mitte', 'Spät', 'Ohne']);
  });

  test('without parameters the order is unchanged', async () => {
    const res = await request(app).get('/api/tasks').expect(200);
    expect(titles(res)).toEqual(['Spät', 'Ohne', 'Früh', 'Mitte']);
  });

  test('filters combine with status and pagination (sort before paging)', async () => {
    const page = await request(app)
      .get('/api/tasks?sort=dueDate&page=1&limit=2')
      .expect(200);
    expect(titles(page)).toEqual(['Früh', 'Mitte']);
    expect(page.body.total).toBe(4);
    const next = await request(app)
      .get('/api/tasks?sort=dueDate&page=2&limit=2')
      .expect(200);
    expect(titles(next)).toEqual(['Spät', 'Ohne']);

    const mine = await request(app).get(
      '/api/tasks?status=pending&dueFrom=2026-03-12',
    );
    expect(titles(mine).sort()).toEqual(['Mitte', 'Spät']);
  });

  test.each([
    '/api/tasks?dueFrom=2026-02-30',
    '/api/tasks?dueTo=morgen',
    '/api/tasks?dueFrom=2026-03-01&dueFrom=2026-03-02',
    '/api/tasks?sort=title',
  ])('rejects %s with 400', async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('search accepts the same fields in the body', async () => {
    const res = await request(app)
      .post('/api/tasks/search')
      .send({ employee: 'Lisa', dueFrom: '2026-03-12', sort: 'dueDate' })
      .expect(200);
    expect(titles(res)).toEqual(['Mitte', 'Spät']);

    const sorted = await request(app)
      .post('/api/tasks/search')
      .send({ employee: 'Lisa', sort: 'dueDate', limit: 10 })
      .expect(200);
    expect(titles(sorted)).toEqual(['Mitte', 'Spät', 'Ohne']);
  });

  test('search rejects invalid values with 400', async () => {
    for (const body of [
      { dueFrom: '2026-13-01' },
      { dueTo: 5 },
      { sort: 'x' },
    ]) {
      const res = await request(app).post('/api/tasks/search').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual(expect.any(String));
    }
  });
});

describe('export and import keep dueDate (#344)', () => {
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

  const importBundle = (tasks, archivedTasks = [], query = '') =>
    request(app)
      .post(`/api/import${query}`)
      .send({ formatVersion: 1, tasks, archivedTasks, plants: null });

  test('round trip of dated, undated and archived tasks', async () => {
    const dated = await create({ title: 'Mit', dueDate: '2026-03-15' });
    const undated = await create({ title: 'Ohne' });
    const archived = await create({ title: 'Archiv', dueDate: '2026-04-01' });
    await request(app).post(`/api/tasks/${archived.id}/archive`).expect(200);

    const exported = (await request(app).get('/api/export').expect(200)).body;
    expect(exported.tasks.find((t) => t.id === dated.id).dueDate).toBe(
      '2026-03-15',
    );
    expect(exported.archivedTasks[0].dueDate).toBe('2026-04-01');

    fs.writeFileSync(store.TASKS_FILE, '[]');
    fs.writeFileSync(store.ARCHIVED_FILE, '[]');
    resetCaches();
    await request(app).post('/api/import').send(exported).expect(200);

    const tasks = (await request(app).get('/api/tasks').expect(200)).body;
    expect(tasks.find((t) => t.id === dated.id).dueDate).toBe('2026-03-15');
    expect(tasks.find((t) => t.id === undated.id).dueDate).toBeNull();
    const archive = (await request(app).get('/api/archived-tasks').expect(200))
      .body;
    expect(archive[0].dueDate).toBe('2026-04-01');
  });

  test('bundles from before #344 import without gaining a date', async () => {
    await importBundle([bundleTask(1)]).expect(200);
    expect(readTasks()[0]).not.toHaveProperty('dueDate');
  });

  test('an explicit null survives the import', async () => {
    await importBundle([bundleTask(1, { dueDate: null })]).expect(200);
    expect(readTasks()[0].dueDate).toBeNull();
  });

  test.each(['2026-02-30', '2026-03-15T00:00:00Z', '', 20260315])(
    'an invalid dueDate %p rejects the whole bundle and writes nothing',
    async (dueDate) => {
      const res = await importBundle([
        bundleTask(1),
        bundleTask(2, { dueDate }),
      ]).expect(400);
      expect(res.body.errors.join(' ')).toMatch(/tasks\[1\]: Fälligkeitsdatum/);
      expect(readTasks()).toEqual([]);
    },
  );
});
