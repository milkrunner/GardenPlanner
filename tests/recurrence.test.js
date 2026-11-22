// Wiederholende Aufgaben im Service-Layer (#327): Folgeaufgabe beim Abschluss per PUT, Monatsende,
// Idempotenz, Historie und Atomarität. Storage/Logs sind pro Suite isoliert (tests/setup.js).
const request = require('supertest');
const fs = require('node:fs');

const { app, resetCaches } = require('../src/server/app');
const store = require('../src/server/storage/json-store');
const {
  calculateNextDue,
  addMonthsClamped,
} = require('../src/server/services/recurrence');

const readTasks = () => JSON.parse(fs.readFileSync(store.TASKS_FILE, 'utf8'));

async function create(extra = {}) {
  const res = await request(app)
    .post('/api/tasks')
    .send({
      title: 'Beete gießen',
      employee: 'Lisa',
      location: 'Gewächshaus',
      description: 'Morgens',
      notes: 'Wenig Wasser',
      priority: 'high',
      subtasks: ['Kanne füllen', { text: 'Tomaten', completed: true }],
      ...extra,
    });
  expect(res.status).toBe(201);
  return res.body;
}

const complete = (id, extra = {}) =>
  request(app)
    .put(`/api/tasks/${id}`)
    .send({ status: 'completed', ...extra });

beforeEach(() => {
  fs.writeFileSync(store.TASKS_FILE, '[]');
  fs.writeFileSync(store.ARCHIVED_FILE, '[]');
  resetCaches();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('calculateNextDue', () => {
  test.each([
    ['daily', '2025-03-10T08:30:00.000Z', '2025-03-11T08:30:00.000Z'],
    ['weekly', '2025-03-10T08:30:00.000Z', '2025-03-17T08:30:00.000Z'],
    ['monthly', '2025-03-10T08:30:00.000Z', '2025-04-10T08:30:00.000Z'],
    ['daily', '2025-12-31T23:00:00.000Z', '2026-01-01T23:00:00.000Z'],
    ['weekly', '2025-12-28T10:00:00.000Z', '2026-01-04T10:00:00.000Z'],
    ['monthly', '2025-12-15T10:00:00.000Z', '2026-01-15T10:00:00.000Z'],
  ])('%s from %s', (recurrence, from, expected) => {
    expect(calculateNextDue(recurrence, from)).toBe(expected);
  });

  test.each([
    ['31. Jan + 1 Monat = 28. Feb', '2025-01-31T12:00:00.000Z', '2025-02-28'],
    [
      '31. Jan + 1 Monat im Schaltjahr = 29. Feb',
      '2024-01-31T12:00:00.000Z',
      '2024-02-29',
    ],
    ['29. Jan + 1 Monat = 28. Feb', '2025-01-29T12:00:00.000Z', '2025-02-28'],
    [
      '30. Jan + 1 Monat im Schaltjahr',
      '2024-01-30T12:00:00.000Z',
      '2024-02-29',
    ],
    ['31. Mär + 1 Monat = 30. Apr', '2025-03-31T12:00:00.000Z', '2025-04-30'],
    ['30. Apr + 1 Monat = 30. Mai', '2025-04-30T12:00:00.000Z', '2025-05-30'],
    ['31. Dez + 1 Monat = 31. Jan', '2025-12-31T12:00:00.000Z', '2026-01-31'],
    [
      '29. Feb (Schaltjahr) + 1 Monat = 29. Mär',
      '2024-02-29T12:00:00.000Z',
      '2024-03-29',
    ],
  ])('monthly: %s', (_name, from, day) => {
    expect(calculateNextDue('monthly', from)).toBe(`${day}T12:00:00.000Z`);
  });

  test('keeps the time of day and does not depend on the process time zone', () => {
    const from = '2025-01-31T23:59:59.999Z';
    expect(calculateNextDue('monthly', from)).toBe('2025-02-28T23:59:59.999Z');
    expect(addMonthsClamped(new Date(from), 13).toISOString()).toBe(
      '2026-02-28T23:59:59.999Z',
    );
  });

  test('returns null for none, unknown values and invalid dates', () => {
    expect(calculateNextDue('none', '2025-01-01T00:00:00.000Z')).toBeNull();
    expect(calculateNextDue('yearly', '2025-01-01T00:00:00.000Z')).toBeNull();
    expect(calculateNextDue(undefined)).toBeNull();
    expect(calculateNextDue('daily', 'kein Datum')).toBeNull();
  });
});

describe('completing a recurring task via PUT (#327)', () => {
  test.each(['daily', 'weekly', 'monthly'])(
    'creates one pending follow-up for %s in the same response and file',
    async (recurrence) => {
      const original = await create({ recurrence });
      const res = await complete(original.id);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(original.id);
      expect(res.body.status).toBe('completed');
      expect(res.body.completedAt).toEqual(expect.any(String));

      const followUp = res.body.followUp;
      expect(followUp).toMatchObject({
        title: 'Beete gießen',
        employee: 'Lisa',
        location: 'Gewächshaus',
        description: 'Morgens',
        notes: 'Wenig Wasser',
        priority: 'high',
        status: 'pending',
        recurrence,
        recurrenceOf: original.id,
      });
      expect(followUp.id).not.toBe(original.id);
      expect(followUp.completedAt).toBeUndefined();
      expect(followUp.subtasks.map((s) => s.completed)).toEqual([false, false]);
      expect(followUp.subtasks.map((s) => s.text)).toEqual([
        'Kanne füllen',
        'Tomaten',
      ]);
      expect(followUp.nextDue).toBe(
        calculateNextDue(recurrence, res.body.completedAt),
      );
      expect(res.body.followUpId).toBe(followUp.id);

      const stored = readTasks();
      expect(stored).toHaveLength(2);
      expect(stored.find((t) => t.id === original.id).status).toBe('completed');
      expect(stored.find((t) => t.id === followUp.id)).toEqual(followUp);

      const list = await request(app).get('/api/tasks');
      expect(list.body.map((t) => t.status).sort()).toEqual([
        'completed',
        'pending',
      ]);
    },
  );

  test('nextDue is completion time plus the interval', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(new Date('2025-01-31T09:00:00.000Z'));
    const original = await create({ recurrence: 'monthly' });
    const res = await complete(original.id);
    expect(res.body.completedAt).toBe('2025-01-31T09:00:00.000Z');
    expect(res.body.followUp.nextDue).toBe('2025-02-28T09:00:00.000Z');
  });

  test('month end in a leap year ends on 29 February', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(new Date('2024-01-31T09:00:00.000Z'));
    const original = await create({ recurrence: 'monthly' });
    const res = await complete(original.id);
    expect(res.body.followUp.nextDue).toBe('2024-02-29T09:00:00.000Z');
  });

  test.each(['none', undefined])(
    'creates nothing when recurrence is %s',
    async (recurrence) => {
      const original = await create(recurrence ? { recurrence } : {});
      const res = await complete(original.id);
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('followUp');
      expect(res.body).not.toHaveProperty('followUpId');
      expect(readTasks()).toHaveLength(1);
    },
  );

  test('uses a recurrence that is set in the same PUT', async () => {
    const original = await create();
    const res = await complete(original.id, { recurrence: 'weekly' });
    expect(res.body.followUp.recurrence).toBe('weekly');
    expect(readTasks()).toHaveLength(2);
  });

  test('a recurrence removed in the same PUT creates nothing', async () => {
    const original = await create({ recurrence: 'daily' });
    const res = await complete(original.id, { recurrence: 'none' });
    expect(res.body).not.toHaveProperty('followUp');
    expect(readTasks()).toHaveLength(1);
  });

  test('moving to in-progress or pending creates nothing', async () => {
    const original = await create({ recurrence: 'daily' });
    for (const status of ['in-progress', 'pending']) {
      const res = await request(app)
        .put(`/api/tasks/${original.id}`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('followUp');
    }
    expect(readTasks()).toHaveLength(1);
  });

  test('creating a task that is already completed does not create a follow-up', async () => {
    await create({ recurrence: 'daily', status: 'completed' });
    expect(readTasks()).toHaveLength(1);
  });

  test('the follow-up can recur itself', async () => {
    const original = await create({ recurrence: 'daily' });
    const first = await complete(original.id);
    const second = await complete(first.body.followUp.id);
    expect(second.body.followUp.recurrenceOf).toBe(first.body.followUp.id);
    expect(readTasks()).toHaveLength(3);
  });
});

describe('idempotency (#327)', () => {
  test('repeating the PUT on a completed task creates no second follow-up', async () => {
    const original = await create({ recurrence: 'weekly' });
    const first = await complete(original.id);
    const before = readTasks();

    const again = await complete(original.id);
    expect(again.status).toBe(200);
    expect(again.body).not.toHaveProperty('followUp');
    expect(again.body.completedAt).toBe(first.body.completedAt);
    expect(readTasks()).toEqual(before);
  });

  test('completed -> completed together with another edit creates nothing', async () => {
    const original = await create({ recurrence: 'daily' });
    await complete(original.id);
    const res = await complete(original.id, { title: 'Umbenannt' });
    expect(res.body.title).toBe('Umbenannt');
    expect(res.body).not.toHaveProperty('followUp');
    expect(readTasks()).toHaveLength(2);
  });

  test('concurrent completions create exactly one follow-up', async () => {
    const original = await create({ recurrence: 'daily' });
    const results = await Promise.all([
      complete(original.id),
      complete(original.id),
      complete(original.id),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.followUp)).toHaveLength(1);
    expect(readTasks()).toHaveLength(2);
  });

  test('reopening and completing again keeps the single follow-up', async () => {
    const original = await create({ recurrence: 'daily' });
    await complete(original.id);
    await request(app)
      .put(`/api/tasks/${original.id}`)
      .send({ status: 'pending' })
      .expect(200);
    const res = await complete(original.id);
    expect(res.body).not.toHaveProperty('followUp');
    expect(readTasks()).toHaveLength(2);
  });
});

describe('history (#327)', () => {
  test('original gets completed entry with the follow-up id, follow-up starts with created', async () => {
    const original = await create({ recurrence: 'weekly' });
    const res = await complete(original.id);
    const { followUp } = res.body;

    const actions = res.body.history.map((h) => h.action);
    expect(actions).toEqual(['created', 'completed']);
    expect(res.body.history[1].details).toEqual({
      from: 'pending',
      to: 'completed',
      followUpId: followUp.id,
    });

    expect(followUp.history).toHaveLength(1);
    expect(followUp.history[0]).toMatchObject({
      action: 'created',
      details: {
        title: 'Beete gießen',
        employee: 'Lisa',
        location: 'Gewächshaus',
        recurrenceOf: original.id,
      },
    });
  });

  test('the completed entry stays the status change when the PUT also edits fields', async () => {
    const original = await create({ recurrence: 'daily' });
    const res = await complete(original.id, { title: 'Neu' });
    expect(res.body.history.map((h) => h.action)).toEqual([
      'created',
      'completed',
      'edited',
    ]);
    expect(res.body.history[1].details.followUpId).toBe(res.body.followUp.id);
    expect(res.body.followUp.title).toBe('Neu');
  });

  test('no follow-up marker in history without recurrence', async () => {
    const original = await create();
    const res = await complete(original.id);
    expect(res.body.history[1].details).toEqual({
      from: 'pending',
      to: 'completed',
    });
  });
});

describe('atomicity (#327)', () => {
  test('a failing write persists neither the status change nor the follow-up', async () => {
    const original = await create({ recurrence: 'daily' });
    const before = readTasks();

    const spy = jest
      .spyOn(fs.promises, 'writeFile')
      .mockRejectedValue(
        Object.assign(new Error('EIO: simulated'), { code: 'EIO' }),
      );
    const failed = await complete(original.id);
    expect(failed.status).toBe(500);
    spy.mockRestore();

    expect(readTasks()).toEqual(before);
    expect(fs.existsSync(store.TASKS_FILE + '.tmp')).toBe(false);
    const list = await request(app).get('/api/tasks');
    expect(list.body).toHaveLength(1);
    expect(list.body[0].status).toBe('pending');
    expect(list.body[0]).not.toHaveProperty('followUpId');

    // Retry works and then creates the single follow-up
    const retry = await complete(original.id);
    expect(retry.status).toBe(200);
    expect(retry.body.followUp).toBeDefined();
    expect(readTasks()).toHaveLength(2);
  });

  test('a failing rename leaves the previous file intact', async () => {
    const original = await create({ recurrence: 'daily' });
    const before = fs.readFileSync(store.TASKS_FILE, 'utf8');
    jest
      .spyOn(fs.promises, 'rename')
      .mockRejectedValue(
        Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' }),
      );
    const failed = await complete(original.id);
    expect(failed.status).toBe(500);
    jest.restoreAllMocks();
    expect(fs.readFileSync(store.TASKS_FILE, 'utf8')).toBe(before);
  });

  test('validation errors and unknown ids change nothing', async () => {
    const original = await create({ recurrence: 'daily' });
    const before = readTasks();
    await request(app)
      .put(`/api/tasks/${original.id}`)
      .send({ status: 'bogus' })
      .expect(400);
    await complete('00000000-0000-4000-a000-000000000000').expect(404);
    expect(readTasks()).toEqual(before);
  });
});
