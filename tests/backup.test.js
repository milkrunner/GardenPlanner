const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');

jest.mock('../src/server/logger', () => ({
  ...jest.requireActual('../src/server/logger'),
  audit: jest.fn(),
}));
const { audit } = require('../src/server/logger');
const { app, resetCaches } = require('../src/server/app');

const DATA_DIR = process.env.DATA_DIR;
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ARCHIVED_FILE = path.join(DATA_DIR, 'archived-tasks.json');
const PLANTS_FILE = path.join(DATA_DIR, 'plants.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readRaw = (file) => fs.readFileSync(file, 'utf8');
const backups = () =>
  fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR) : [];

function bundleTask(n, extra = {}) {
  return {
    id: uuid(n),
    title: `Aufgabe ${n}`,
    employee: 'Lisa',
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
  };
}

const bundleOf = (tasks = [], archivedTasks = [], plants = null) => ({
  formatVersion: 1,
  tasks,
  archivedTasks,
  plants,
});

const customPlant = {
  id: 'kohlrabi',
  name: 'Kohlrabi',
  category: 'Gemüse',
  icon: '🥬',
  difficulty: 'easy',
  sun: 'full',
  water: 'medium',
  season: ['spring'],
  sowMonths: [3, 4],
  spacing: '25cm',
  germination: '7 Tage',
  harvest: '60 Tage',
  companions: ['Salat'],
  avoid: [],
  tips: 'Gleichmäßig gießen.',
};

function wipe() {
  fs.writeFileSync(TASKS_FILE, '[]', 'utf8');
  fs.writeFileSync(ARCHIVED_FILE, '[]', 'utf8');
  fs.rmSync(PLANTS_FILE, { force: true });
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  resetCaches();
}

function seed(tasks, archived = []) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks), 'utf8');
  fs.writeFileSync(ARCHIVED_FILE, JSON.stringify(archived), 'utf8');
  resetCaches();
}

beforeEach(wipe);

describe('GET /api/export (#329)', () => {
  test('returns a versioned bundle with tasks, archive and no custom plants', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Tomaten gießen', location: 'Beet' })
      .expect(201);
    const other = await request(app)
      .post('/api/tasks')
      .send({ title: 'Rasen', location: 'Garten' })
      .expect(201);
    await request(app).post(`/api/tasks/${other.body.id}/archive`).expect(200);

    const res = await request(app).get('/api/export').expect(200);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="gartenplaner-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual([
      'app',
      'archivedTasks',
      'exportedAt',
      'formatVersion',
      'plants',
      'tasks',
    ]);
    expect(res.body.formatVersion).toBe(1);
    expect(Number.isNaN(Date.parse(res.body.exportedAt))).toBe(false);
    expect(res.body.tasks.map((t) => t.id)).toEqual([created.body.id]);
    expect(res.body.archivedTasks.map((t) => t.id)).toEqual([other.body.id]);
    expect(res.body.plants).toBeNull();
    expect(audit).toHaveBeenCalledWith('data_exported', {
      tasks: 1,
      archivedTasks: 1,
      customPlants: 0,
    });
  });

  test('includes a custom plants.json', async () => {
    fs.writeFileSync(PLANTS_FILE, JSON.stringify([customPlant]), 'utf8');
    const res = await request(app).get('/api/export').expect(200);
    expect(res.body.plants).toEqual([customPlant]);
  });
});

describe('round trip', () => {
  test('export, import into an empty instance and compare', async () => {
    const a = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Beet vorbereiten',
        employee: 'Max',
        location: 'Beet 1',
        description: 'Umgraben',
        priority: 'high',
        subtasks: ['Spaten holen', { text: 'Kompost', completed: true }],
      })
      .expect(201);
    await request(app)
      .put(`/api/tasks/${a.body.id}`)
      .send({ status: 'completed' })
      .expect(200);
    const b = await request(app)
      .post('/api/tasks')
      .send({ title: 'Rasen mähen', location: 'Garten' })
      .expect(201);
    await request(app).post(`/api/tasks/${b.body.id}/archive`).expect(200);
    await request(app)
      .post('/api/tasks')
      .send({ title: 'Gießen', location: 'Gewächshaus' })
      .expect(201);
    fs.writeFileSync(PLANTS_FILE, JSON.stringify([customPlant]), 'utf8');

    const exported = (await request(app).get('/api/export').expect(200)).body;
    expect(exported.tasks).toHaveLength(2);
    expect(exported.archivedTasks).toHaveLength(1);

    wipe();
    expect((await request(app).get('/api/tasks')).body).toEqual([]);

    const res = await request(app)
      .post('/api/import')
      .send(exported)
      .expect(200);
    expect(res.body).toEqual({
      mode: 'create',
      imported: { tasks: 2, archivedTasks: 1, plants: 1 },
      skipped: { tasks: [], archivedTasks: [], plants: [] },
      backup: null,
    });

    const again = (await request(app).get('/api/export').expect(200)).body;
    expect(again.tasks).toEqual(exported.tasks);
    expect(again.archivedTasks).toEqual(exported.archivedTasks);
    expect(again.plants).toEqual(exported.plants);
    expect((await request(app).get('/api/plants/kohlrabi')).body.name).toBe(
      'Kohlrabi',
    );
    expect(audit).toHaveBeenCalledWith(
      'data_imported',
      expect.objectContaining({ mode: 'create', backup: null }),
    );
    // the imported instance keeps working normally
    await request(app).post(`/api/tasks/${a.body.id}/archive`).expect(200);
  });

  test('an empty bundle imports into an empty instance', async () => {
    const res = await request(app)
      .post('/api/import')
      .send(bundleOf())
      .expect(200);
    expect(res.body.imported).toEqual({
      tasks: 0,
      archivedTasks: 0,
      plants: 0,
    });
  });
});

describe('import never overwrites silently', () => {
  test('default mode answers 409 for a non-empty instance and changes nothing', async () => {
    seed([bundleTask(1, { title: 'Vorhanden' })]);
    const before = readRaw(TASKS_FILE);
    const res = await request(app)
      .post('/api/import')
      .send(bundleOf([bundleTask(2)]))
      .expect(409);
    expect(res.body.errors[0]).toMatch(/nicht leer/);
    expect(readRaw(TASKS_FILE)).toBe(before);
    expect(read(ARCHIVED_FILE)).toEqual([]);
    expect(backups()).toEqual([]);
    expect(audit).toHaveBeenCalledWith('data_import_rejected', {
      reason: 'target_not_empty',
    });
  });

  test('a non-empty archive also blocks the default mode', async () => {
    seed([], [bundleTask(1, { archivedAt: '2026-02-01T00:00:00.000Z' })]);
    await request(app)
      .post('/api/import')
      .send(bundleOf([bundleTask(2)]))
      .expect(409);
  });

  test('a bundle with plants is blocked by an existing plants.json', async () => {
    fs.writeFileSync(PLANTS_FILE, JSON.stringify([customPlant]), 'utf8');
    const before = readRaw(PLANTS_FILE);
    await request(app)
      .post('/api/import')
      .send(bundleOf([], [], [{ ...customPlant, id: 'other' }]))
      .expect(409);
    expect(readRaw(PLANTS_FILE)).toBe(before);
  });

  test('unknown modes are rejected', async () => {
    await request(app)
      .post('/api/import?mode=overwrite')
      .send(bundleOf())
      .expect(400);
    await request(app)
      .post('/api/import?mode=create')
      .send(bundleOf())
      .expect(400);
    await request(app)
      .post('/api/import?mode=merge&mode=replace')
      .send(bundleOf())
      .expect(400);
  });
});

describe('mode=merge', () => {
  test('adds new IDs, skips and reports existing ones without overwriting', async () => {
    seed(
      [bundleTask(1, { title: 'Original' })],
      [
        bundleTask(2, {
          title: 'Archiv-Original',
          archivedAt: '2026-02-01T00:00:00.000Z',
        }),
      ],
    );
    const res = await request(app)
      .post('/api/import?mode=merge')
      .send(
        bundleOf(
          [
            bundleTask(1, { title: 'Aus Bündel' }), // exists in tasks
            bundleTask(2, { title: 'Aus Bündel' }), // exists in archive
            bundleTask(3),
          ],
          [bundleTask(4, { archivedAt: '2026-03-01T00:00:00.000Z' })],
        ),
      )
      .expect(200);
    expect(res.body).toEqual({
      mode: 'merge',
      imported: { tasks: 1, archivedTasks: 1, plants: 0 },
      skipped: { tasks: [uuid(1), uuid(2)], archivedTasks: [], plants: [] },
      backup: null,
    });
    expect(read(TASKS_FILE).map((t) => [t.id, t.title])).toEqual([
      [uuid(1), 'Original'],
      [uuid(3), 'Aufgabe 3'],
    ]);
    expect(read(ARCHIVED_FILE).map((t) => t.title)).toEqual([
      'Archiv-Original',
      'Aufgabe 4',
    ]);
    expect(backups()).toEqual([]);
  });

  test('merging only known IDs writes nothing', async () => {
    seed([bundleTask(1)]);
    const before = readRaw(TASKS_FILE);
    const res = await request(app)
      .post('/api/import?mode=merge')
      .send(bundleOf([bundleTask(1)]))
      .expect(200);
    expect(res.body.imported.tasks).toBe(0);
    expect(res.body.skipped.tasks).toEqual([uuid(1)]);
    expect(readRaw(TASKS_FILE)).toBe(before);
  });

  test('plants are merged by id on top of the default library', async () => {
    const defaults = (await request(app).get('/api/plants')).body;
    const res = await request(app)
      .post('/api/import?mode=merge')
      .send(bundleOf([], [], [customPlant, { ...customPlant, id: 'tomato' }]))
      .expect(200);
    expect(res.body.imported.plants).toBe(1);
    expect(res.body.skipped.plants).toEqual(['tomato']);
    const plants = (await request(app).get('/api/plants')).body;
    expect(plants).toHaveLength(defaults.length + 1);
    expect(plants.find((p) => p.id === 'tomato')).toEqual(
      defaults.find((p) => p.id === 'tomato'),
    );
  });
});

describe('mode=replace', () => {
  test('needs an explicit confirmation', async () => {
    seed([bundleTask(1)]);
    const before = readRaw(TASKS_FILE);
    const res = await request(app)
      .post('/api/import?mode=replace')
      .send(bundleOf([bundleTask(2)]))
      .expect(400);
    expect(res.body.error).toMatch(/confirm=replace/);
    await request(app)
      .post('/api/import?mode=replace&confirm=yes')
      .send(bundleOf([bundleTask(2)]))
      .expect(400);
    expect(readRaw(TASKS_FILE)).toBe(before);
    expect(backups()).toEqual([]);
  });

  test('backs up the old files, then replaces everything', async () => {
    seed(
      [bundleTask(1, { title: 'Alt' })],
      [bundleTask(2, { archivedAt: '2026-02-01T00:00:00.000Z' })],
    );
    fs.writeFileSync(PLANTS_FILE, JSON.stringify([customPlant]), 'utf8');
    const oldTasks = readRaw(TASKS_FILE);
    const oldArchive = readRaw(ARCHIVED_FILE);
    const oldPlants = readRaw(PLANTS_FILE);

    const res = await request(app)
      .post('/api/import?mode=replace&confirm=replace')
      .send(
        bundleOf(
          [bundleTask(5, { title: 'Neu' })],
          [],
          [{ ...customPlant, id: 'neu', name: 'Neu' }],
        ),
      )
      .expect(200);
    expect(res.body.mode).toBe('replace');
    expect(res.body.imported).toEqual({
      tasks: 1,
      archivedTasks: 0,
      plants: 1,
    });
    expect(res.body.backup).toMatch(/^backups\/import-[0-9T-]+Z-[0-9a-f]{6}$/);
    expect(path.isAbsolute(res.body.backup)).toBe(false);

    const dir = path.join(DATA_DIR, res.body.backup);
    expect(readRaw(path.join(dir, 'tasks.json'))).toBe(oldTasks);
    expect(readRaw(path.join(dir, 'archived-tasks.json'))).toBe(oldArchive);
    expect(readRaw(path.join(dir, 'plants.json'))).toBe(oldPlants);

    expect(read(TASKS_FILE).map((t) => t.title)).toEqual(['Neu']);
    expect(read(ARCHIVED_FILE)).toEqual([]);
    expect(read(PLANTS_FILE).map((p) => p.id)).toEqual(['neu']);
    expect(audit).toHaveBeenCalledWith(
      'data_imported',
      expect.objectContaining({ mode: 'replace', backup: res.body.backup }),
    );
  });

  test('keeps existing plants when the bundle has none', async () => {
    seed([bundleTask(1)]);
    fs.writeFileSync(PLANTS_FILE, JSON.stringify([customPlant]), 'utf8');
    const res = await request(app)
      .post('/api/import?mode=replace&confirm=replace')
      .send(bundleOf([bundleTask(2)]))
      .expect(200);
    expect(read(PLANTS_FILE)).toEqual([customPlant]);
    expect(
      fs.existsSync(path.join(DATA_DIR, res.body.backup, 'plants.json')),
    ).toBe(false);
  });
});

describe('invalid bundles write nothing', () => {
  const invalidBodies = {
    'array instead of object': [],
    'no formatVersion': { tasks: [], archivedTasks: [] },
    'unsupported formatVersion': { ...bundleOf(), formatVersion: 2 },
    'tasks not an array': { ...bundleOf(), tasks: {} },
    'archivedTasks missing': { formatVersion: 1, tasks: [] },
    'plants not an array': { ...bundleOf(), plants: 'x' },
    'task is not an object': bundleOf(['x']),
    'id is not a UUID': bundleOf([bundleTask(1, { id: '../../etc/passwd' })]),
    'missing title': bundleOf([bundleTask(1, { title: '' })]),
    'title too long': bundleOf([bundleTask(1, { title: 'x'.repeat(201) })]),
    'invalid status': bundleOf([bundleTask(1, { status: 'bogus' })]),
    'invalid createdAt': bundleOf([bundleTask(1, { createdAt: 'gestern' })]),
    'subtask text too long': bundleOf([
      bundleTask(1, { subtasks: [{ text: 'x'.repeat(501) }] }),
    ]),
    'history entry invalid': bundleOf([
      bundleTask(1, { history: [{ action: 1 }] }),
    ]),
    'duplicate ID in tasks': bundleOf([bundleTask(1), bundleTask(1)]),
    'same ID in tasks and archive': bundleOf([bundleTask(1)], [bundleTask(1)]),
    'invalid sowMonths': bundleOf(
      [],
      [],
      [{ id: 'kohlrabi', name: 'x', category: 'y', sowMonths: [13] }],
    ),
    'invalid plant': bundleOf(
      [],
      [],
      [{ id: 'Bad Slug', name: 'x', category: 'y' }],
    ),
  };

  test.each(Object.entries(invalidBodies))('%s -> 400', async (name, body) => {
    const res = await request(app).post('/api/import').send(body).expect(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(read(TASKS_FILE)).toEqual([]);
    expect(read(ARCHIVED_FILE)).toEqual([]);
    expect(fs.existsSync(PLANTS_FILE)).toBe(false);
  });

  test('a partly invalid bundle imports nothing, not even its valid tasks', async () => {
    seed([bundleTask(9, { title: 'Vorhanden' })]);
    const before = readRaw(TASKS_FILE);
    const body = bundleOf([
      bundleTask(1),
      bundleTask(2, { priority: 'urgent' }),
      bundleTask(3),
    ]);
    for (const query of ['?mode=merge', '?mode=replace&confirm=replace']) {
      const res = await request(app)
        .post(`/api/import${query}`)
        .send(body)
        .expect(400);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0]).toMatch(/^tasks\[1\]: /);
      expect(readRaw(TASKS_FILE)).toBe(before);
    }
    expect(backups()).toEqual([]);
    expect(audit).toHaveBeenCalledWith(
      'data_import_rejected',
      expect.objectContaining({ reason: 'invalid_bundle' }),
    );
  });

  test('malformed JSON is a 400', async () => {
    await request(app)
      .post('/api/import')
      .set('Content-Type', 'application/json')
      .send('{"formatVersion": 1,')
      .expect(400);
  });

  test('a missing JSON body is a 400', async () => {
    await request(app).post('/api/import').expect(400);
  });

  test('only known fields are stored and defaults are filled in', async () => {
    const raw = {
      id: uuid(1),
      title: '  Mit Leerraum  ',
      location: 'Garten',
      createdAt: '2026-01-01T10:00:00.000Z',
      evil: '<script>alert(1)</script>',
      subtasks: ['nur Text'],
    };
    await request(app)
      .post('/api/import')
      .send(bundleOf([raw]))
      .expect(200);
    const [stored] = read(TASKS_FILE);
    expect(stored).toEqual({
      id: uuid(1),
      title: 'Mit Leerraum',
      employee: '',
      location: 'Garten',
      description: '',
      notes: '',
      status: 'pending',
      priority: 'medium',
      recurrence: 'none',
      createdAt: '2026-01-01T10:00:00.000Z',
      subtasks: [
        { id: expect.any(Number), text: 'nur Text', completed: false },
      ],
      history: [],
    });
  });

  test('errors are capped so a huge broken bundle gives a short answer', async () => {
    const tasks = Array.from({ length: 200 }, (_, i) =>
      bundleTask(i + 1, { title: '' }),
    );
    const res = await request(app)
      .post('/api/import')
      .send(bundleOf(tasks))
      .expect(400);
    expect(res.body.errors.length).toBeLessThanOrEqual(20);
  });
});

describe('size limits', () => {
  test('imports above the global 100 kB limit work, the global limit is untouched', async () => {
    const tasks = Array.from({ length: 120 }, (_, i) =>
      bundleTask(i + 1, { notes: 'n'.repeat(5000) }),
    );
    const body = bundleOf(tasks);
    expect(JSON.stringify(body).length).toBeGreaterThan(500 * 1024);
    const res = await request(app).post('/api/import').send(body).expect(200);
    expect(res.body.imported.tasks).toBe(120);

    // every other route still stops at 100 kB
    await request(app)
      .post('/api/tasks')
      .send({ title: 'x', location: 'y', notes: 'n'.repeat(150 * 1024) })
      .expect(413);
    await request(app)
      .post('/api/tasks/search')
      .send({ employee: 'x'.repeat(150 * 1024) })
      .expect(413);
  });

  test('a body above the import limit is a 413 and nothing is written', async () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      bundleTask(i + 1, { notes: 'n'.repeat(900 * 1024) }),
    );
    const res = await request(app)
      .post('/api/import')
      .send(bundleOf(tasks))
      .expect(413);
    expect(res.body.error).toBeTruthy();
    expect(read(TASKS_FILE)).toEqual([]);
  });

  test('too many tasks in one bundle are a 413', async () => {
    const stubs = Array.from({ length: 10001 }, (_, i) => ({ id: i }));
    const res = await request(app)
      .post('/api/import')
      .send(bundleOf(stubs))
      .expect(413);
    expect(res.body.errors[0]).toMatch(/mehr als 10000/);
    expect(read(TASKS_FILE)).toEqual([]);
  });
});

describe('authentication', () => {
  let secured;
  beforeAll(() => {
    process.env.API_KEY = 'backup-test-key';
    jest.isolateModules(() => {
      secured = require('../src/server/app').app;
    });
    delete process.env.API_KEY;
  });

  test('export and import need the API key', async () => {
    await request(secured).get('/api/export').expect(401);
    await request(secured).post('/api/import').send(bundleOf()).expect(401);
    await request(secured)
      .get('/api/export')
      .set('X-API-Key', 'wrong')
      .expect(401);
  });

  test('a large body without a key is rejected before it is parsed', async () => {
    const res = await request(secured)
      .post('/api/import')
      .send(bundleOf([bundleTask(1, { notes: 'n'.repeat(300 * 1024) })]))
      .expect(401);
    expect(res.body.error).toMatch(/Unauthorized/);
  });

  test('with the key, export works and never contains the key', async () => {
    const res = await request(secured)
      .get('/api/export')
      .set('X-API-Key', 'backup-test-key')
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain('backup-test-key');
    expect(res.body.formatVersion).toBe(1);
  });
});

describe('all-or-nothing on I/O errors', () => {
  const blocker = `${ARCHIVED_FILE}.tmp`;
  afterEach(() => fs.rmSync(blocker, { recursive: true, force: true }));

  test('a failing second write restores the first file', async () => {
    seed([bundleTask(1, { title: 'Vorhanden' })]);
    const before = read(TASKS_FILE);
    fs.mkdirSync(blocker); // the archive cannot be written: its temp file path is a directory

    await request(app)
      .post('/api/import?mode=merge')
      .send(
        bundleOf(
          [bundleTask(2)],
          [bundleTask(3, { archivedAt: '2026-03-01T00:00:00.000Z' })],
        ),
      )
      .expect(500);

    expect(read(TASKS_FILE)).toEqual(before);
    expect(read(ARCHIVED_FILE)).toEqual([]);
    fs.rmSync(blocker, { recursive: true });
    resetCaches();
    expect(
      (await request(app).get('/api/tasks')).body.map((t) => t.id),
    ).toEqual([uuid(1)]);
  });
});
