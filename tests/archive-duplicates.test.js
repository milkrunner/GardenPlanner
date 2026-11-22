// Archive/unarchive partial failures (#339): a failed second write leaves a task in tasks.json AND
// archived-tasks.json. The duplicate is resolved deterministically (newer state wins, only the losing
// copy is removed) before the next archive/unarchive and at start-up, and logged in the audit log.
const request = require('supertest');
const fs = require('node:fs');

jest.mock('../src/server/logger', () => ({
  ...jest.requireActual('../src/server/logger'),
  audit: jest.fn(),
}));

const { audit } = require('../src/server/logger');
const { app, resetCaches } = require('../src/server/app');
const store = require('../src/server/storage/json-store');
const {
  repairArchiveDuplicates,
} = require('../src/server/services/task-service');

const readFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const ids = (file) => readFile(file).map((t) => t.id);
const realWriteFile = fs.promises.writeFile.bind(fs.promises);

async function createTask(title) {
  const res = await request(app)
    .post('/api/tasks')
    .send({ title, employee: 'Max', location: 'Garten' });
  expect(res.status).toBe(201);
  return res.body;
}

// Lets the n-th writeFile (1 = destination file, 2 = source file) fail once.
function failNthWrite(n) {
  let calls = 0;
  return jest.spyOn(fs.promises, 'writeFile').mockImplementation((...args) => {
    calls += 1;
    return calls === n
      ? Promise.reject(
          Object.assign(new Error('EIO: simulated'), { code: 'EIO' }),
        )
      : realWriteFile(...args);
  });
}

const stamp = (minute) =>
  `2026-01-01T10:${String(minute).padStart(2, '0')}:00.000Z`;
const stored = (id, history, extra = {}) => ({
  id,
  title: `Task ${id}`,
  createdAt: stamp(0),
  history: history.map(([minute, action]) => ({
    timestamp: stamp(minute),
    action,
    details: {},
  })),
  ...extra,
});
const writeState = (tasks, archived) => {
  fs.writeFileSync(store.TASKS_FILE, JSON.stringify(tasks));
  fs.writeFileSync(store.ARCHIVED_FILE, JSON.stringify(archived));
  resetCaches();
};

beforeEach(() => {
  writeState([], []);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('failed archive/unarchive leaves a duplicate that is cleaned up (#339)', () => {
  test('failed archive: next archive keeps the archived copy and removes the stale active one', async () => {
    const t = await createTask('Duplicate');
    const other = await createTask('Other');
    failNthWrite(2);
    await request(app).post(`/api/tasks/${t.id}/archive`).expect(500);
    jest.restoreAllMocks();
    resetCaches();

    // The partial failure left the task in both files (never lost)
    expect(ids(store.TASKS_FILE)).toContain(t.id);
    expect(ids(store.ARCHIVED_FILE)).toEqual([t.id]);

    await request(app).post(`/api/tasks/${other.id}/archive`).expect(200);

    expect(ids(store.TASKS_FILE)).toEqual([]);
    expect(ids(store.ARCHIVED_FILE).sort()).toEqual([t.id, other.id].sort());
    const kept = readFile(store.ARCHIVED_FILE).find((x) => x.id === t.id);
    expect(kept.archivedAt).toBeDefined();
    expect(audit).toHaveBeenCalledWith('archive_duplicate_resolved', {
      taskId: t.id,
      kept: 'archive',
      removed: 'tasks',
    });
  });

  test('failed unarchive: next operation keeps the restored task and removes the archive copy', async () => {
    const t = await createTask('Restore me');
    const other = await createTask('Other');
    await request(app).post(`/api/tasks/${t.id}/archive`).expect(200);
    failNthWrite(2);
    await request(app).post(`/api/tasks/${t.id}/unarchive`).expect(500);
    jest.restoreAllMocks();
    resetCaches();
    expect(ids(store.TASKS_FILE)).toContain(t.id);
    expect(ids(store.ARCHIVED_FILE)).toEqual([t.id]);

    await request(app).post(`/api/tasks/${other.id}/archive`).expect(200);

    expect(ids(store.TASKS_FILE)).toEqual([t.id]);
    expect(ids(store.ARCHIVED_FILE)).toEqual([other.id]);
    expect(readFile(store.TASKS_FILE)[0].archivedAt).toBeUndefined();
    expect(audit).toHaveBeenCalledWith('archive_duplicate_resolved', {
      taskId: t.id,
      kept: 'tasks',
      removed: 'archive',
    });
  });

  test('retrying the failed archive is resolved first: the task is archived exactly once', async () => {
    const t = await createTask('Retry');
    failNthWrite(2);
    await request(app).post(`/api/tasks/${t.id}/archive`).expect(500);
    jest.restoreAllMocks();
    resetCaches();

    // The repair runs before the lookup: the task is already archived, the retry reports 404
    await request(app).post(`/api/tasks/${t.id}/archive`).expect(404);
    expect(ids(store.TASKS_FILE)).toEqual([]);
    expect(ids(store.ARCHIVED_FILE)).toEqual([t.id]);
    const listed = await request(app).get('/api/archived-tasks');
    expect(listed.body.map((x) => x.id)).toEqual([t.id]);
  });

  test('a read of the lists after the failure still shows the task (never lost)', async () => {
    const t = await createTask('Visible');
    failNthWrite(2);
    await request(app).post(`/api/tasks/${t.id}/archive`).expect(500);
    jest.restoreAllMocks();
    resetCaches();
    const [active, archived] = await Promise.all([
      request(app).get('/api/tasks'),
      request(app).get('/api/archived-tasks'),
    ]);
    expect(active.body.map((x) => x.id)).toEqual([t.id]);
    expect(archived.body.map((x) => x.id)).toEqual([t.id]);
  });
});

describe('repairArchiveDuplicates (#339)', () => {
  test('newer copy wins by last activity; only the losing copy is removed', async () => {
    writeState(
      [
        // archived copy is newer (archived at minute 5) -> tasks copy removed
        stored('a', [[1, 'created']]),
        // tasks copy is newer (unarchived at minute 9) -> archive copy removed
        stored('b', [
          [1, 'created'],
          [9, 'unarchived'],
        ]),
        // edited after the failed archive (minute 7 > archived at 5) -> tasks copy wins
        stored('c', [
          [1, 'created'],
          [7, 'edited'],
        ]),
        stored('only-active', [[1, 'created']]),
      ],
      [
        stored(
          'a',
          [
            [1, 'created'],
            [5, 'archived'],
          ],
          { archivedAt: stamp(5) },
        ),
        stored(
          'b',
          [
            [1, 'created'],
            [3, 'archived'],
          ],
          { archivedAt: stamp(3) },
        ),
        stored(
          'c',
          [
            [1, 'created'],
            [5, 'archived'],
          ],
          { archivedAt: stamp(5) },
        ),
        stored('only-archived', [[1, 'created']], { archivedAt: stamp(2) }),
      ],
    );

    const resolved = await repairArchiveDuplicates();

    expect(resolved).toEqual([
      { taskId: 'a', kept: 'archive', removed: 'tasks' },
      { taskId: 'b', kept: 'tasks', removed: 'archive' },
      { taskId: 'c', kept: 'tasks', removed: 'archive' },
    ]);
    expect(ids(store.TASKS_FILE)).toEqual(['b', 'c', 'only-active']);
    expect(ids(store.ARCHIVED_FILE)).toEqual(['a', 'only-archived']);
    expect(audit).toHaveBeenCalledTimes(3);
    // second run finds nothing and writes nothing
    const writeSpy = jest.spyOn(fs.promises, 'writeFile');
    expect(await repairArchiveDuplicates()).toEqual([]);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  test('equal timestamps: longer history wins, then the archive copy', async () => {
    writeState(
      [
        stored('longer', [
          [1, 'created'],
          [4, 'edited'],
          [4, 'edited'],
        ]),
        stored('same', [
          [1, 'created'],
          [4, 'archived'],
        ]),
      ],
      [
        stored(
          'longer',
          [
            [1, 'created'],
            [4, 'archived'],
          ],
          { archivedAt: stamp(4) },
        ),
        stored(
          'same',
          [
            [1, 'created'],
            [4, 'archived'],
          ],
          { archivedAt: stamp(4) },
        ),
      ],
    );
    await repairArchiveDuplicates();
    expect(ids(store.TASKS_FILE)).toEqual(['longer']);
    expect(ids(store.ARCHIVED_FILE)).toEqual(['same']);
  });

  test('numeric and string ids are treated as the same task; invalid timestamps do not throw', async () => {
    writeState(
      [
        {
          id: 7,
          title: 'n',
          history: [{ timestamp: 'nope', action: 'x' }, null],
        },
      ],
      [{ id: '7', title: 'n', archivedAt: stamp(3), history: [] }],
    );
    await repairArchiveDuplicates();
    expect(readFile(store.TASKS_FILE)).toEqual([]);
    expect(ids(store.ARCHIVED_FILE)).toEqual(['7']);
  });

  test('a failing write during the repair deletes nothing and is retried on the next operation', async () => {
    writeState(
      [stored('x', [[1, 'created']])],
      [
        stored(
          'x',
          [
            [1, 'created'],
            [5, 'archived'],
          ],
          { archivedAt: stamp(5) },
        ),
      ],
    );
    jest
      .spyOn(fs.promises, 'writeFile')
      .mockRejectedValue(Object.assign(new Error('EIO'), { code: 'EIO' }));
    await expect(repairArchiveDuplicates()).rejects.toThrow('EIO');
    jest.restoreAllMocks();
    resetCaches();

    // Both copies are still there
    expect(ids(store.TASKS_FILE)).toEqual(['x']);
    expect(ids(store.ARCHIVED_FILE)).toEqual(['x']);

    expect(await repairArchiveDuplicates()).toHaveLength(1);
    expect(ids(store.TASKS_FILE)).toEqual([]);
    expect(ids(store.ARCHIVED_FILE)).toEqual(['x']);
  });

  test('locks are released afterwards', async () => {
    writeState(
      [stored('y', [[1, 'created']])],
      [
        stored(
          'y',
          [
            [1, 'created'],
            [5, 'archived'],
          ],
          { archivedAt: stamp(5) },
        ),
      ],
    );
    await repairArchiveDuplicates();
    await store.acquireLock(store.TASKS_FILE, 50);
    store.releaseLock(store.TASKS_FILE);
    await store.acquireLock(store.ARCHIVED_FILE, 50);
    store.releaseLock(store.ARCHIVED_FILE);
  });
});
