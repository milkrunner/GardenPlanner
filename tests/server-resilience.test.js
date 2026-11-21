// Backend resilience: async route errors, file I/O failures, concurrent access, lock timeouts,
// production start-up configuration and the header-only authentication model (#277 #278 #284 #285).
// Storage/log directories are isolated per suite by tests/setup.js.
const request = require('supertest');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { app, resetCaches } = require('../src/server/app');
const { asyncHandler } = require('../src/server/middleware/async-handler');
const { errorHandler } = require('../src/server/middleware/error-handler');
const { checkStartupConfig } = require('../src/server/config');
const store = require('../src/server/storage/json-store');

const ROOT = path.join(__dirname, '..');
const task = (title = 'Rasen mähen') => ({
  title,
  employee: 'Max',
  location: 'Garten',
});

const readFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const realWriteFile = fs.promises.writeFile.bind(fs.promises);

async function createTask(title) {
  const res = await request(app).post('/api/tasks').send(task(title));
  expect(res.status).toBe(201);
  return res.body;
}

function ioError(code = 'EIO') {
  return Object.assign(new Error(`${code}: simulated file system failure`), {
    code,
  });
}

beforeEach(() => {
  fs.writeFileSync(store.TASKS_FILE, '[]');
  fs.writeFileSync(store.ARCHIVED_FILE, '[]');
  resetCaches();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('asyncHandler (#277)', () => {
  test('forwards a rejected promise to next() instead of leaving it unhandled', async () => {
    const error = new Error('boom');
    const next = jest.fn();
    asyncHandler(async () => {
      throw error;
    })({}, {}, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith(error);
  });

  test('forwards a synchronous throw to next()', async () => {
    const error = new Error('sync boom');
    const next = jest.fn();
    asyncHandler(() => {
      throw error;
    })({}, {}, next);
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledWith(error);
  });

  test('no async route handler is registered without the wrapper', () => {
    // Third-party async middleware (e.g. the rate limiter) handles its own errors; only the
    // routers under src/server/routes are checked.
    const unwrapped = [];
    for (const layer of app._router.stack) {
      if (!layer.handle || !layer.handle.stack) continue;
      for (const { route } of layer.handle.stack) {
        if (!route) continue;
        for (const sub of route.stack) {
          if (sub.handle.constructor.name === 'AsyncFunction') {
            unwrapped.push(`${Object.keys(route.methods)[0]} ${route.path}`);
          }
        }
      }
    }
    expect(unwrapped).toEqual([]);
  });
});

describe('error handler', () => {
  test('delegates to Express when the response was already started', () => {
    const next = jest.fn();
    const err = new Error('late');
    errorHandler(
      err,
      { originalUrl: '/x', method: 'GET' },
      { headersSent: true },
      next,
    );
    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('file I/O failures become HTTP 500 and never corrupt state (#277 #284)', () => {
  test.each([
    ['writeFile', 'EIO'],
    ['rename', 'EACCES'],
  ])(
    'failing %s on create returns 500, keeps server alive and nothing persisted',
    async (method, code) => {
      const spy = jest
        .spyOn(fs.promises, method)
        .mockRejectedValue(ioError(code));

      const res = await request(app).post('/api/tasks').send(task());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });

      // In-memory cache must not keep the task that was never persisted
      const list = await request(app).get('/api/tasks');
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);
      expect(readFile(store.TASKS_FILE)).toEqual([]);
      expect(fs.existsSync(store.TASKS_FILE + '.tmp')).toBe(false);

      spy.mockRestore();
      const retry = await request(app).post('/api/tasks').send(task());
      expect(retry.status).toBe(201);
    },
  );

  test('update, delete, archive, unarchive and archive-delete answer 500 on write failure', async () => {
    const a = await createTask('A');
    const b = await createTask('B');
    await request(app).post(`/api/tasks/${b.id}/archive`).expect(200);

    jest.spyOn(fs.promises, 'writeFile').mockRejectedValue(ioError());
    const results = await Promise.all([
      request(app).put(`/api/tasks/${a.id}`).send({ title: 'A2' }),
      request(app).delete(`/api/tasks/${a.id}`),
      request(app).post(`/api/tasks/${a.id}/archive`),
      request(app).post(`/api/tasks/${b.id}/unarchive`),
      request(app).delete(`/api/archived-tasks/${b.id}`),
    ]);
    expect(results.map((r) => r.status)).toEqual([500, 500, 500, 500, 500]);
    jest.restoreAllMocks();

    // State on disk is untouched and reads agree with it after the failures
    const tasks = await request(app).get('/api/tasks');
    expect(tasks.body.map((t) => t.title)).toEqual(['A']);
    const archived = await request(app).get('/api/archived-tasks');
    expect(archived.body.map((t) => t.id)).toEqual([b.id]);
  });

  test('a failed archive does not lose the task or leak locks', async () => {
    const t = await createTask('Keep me');
    // Archive file is written first; make the second write (tasks file) fail
    let calls = 0;
    jest.spyOn(fs.promises, 'writeFile').mockImplementation((...args) => {
      calls += 1;
      return calls === 2 ? Promise.reject(ioError()) : realWriteFile(...args);
    });

    const res = await request(app).post(`/api/tasks/${t.id}/archive`);
    expect(res.status).toBe(500);
    jest.restoreAllMocks();
    resetCaches();

    // Task still exists on disk (at worst duplicated in the archive, never lost)
    expect(readFile(store.TASKS_FILE).map((x) => x.id)).toEqual([t.id]);

    // Locks were released: follow-up operations succeed immediately
    await request(app)
      .put(`/api/tasks/${t.id}`)
      .send({ title: 'still works' })
      .expect(200);
  });

  test('a failed unarchive does not lose the task', async () => {
    const t = await createTask('Archived');
    await request(app).post(`/api/tasks/${t.id}/archive`).expect(200);

    // Tasks file is written first; make the second write (archive file) fail
    let calls = 0;
    jest.spyOn(fs.promises, 'writeFile').mockImplementation((...args) => {
      calls += 1;
      return calls === 2 ? Promise.reject(ioError()) : realWriteFile(...args);
    });
    const res = await request(app).post(`/api/tasks/${t.id}/unarchive`);
    expect(res.status).toBe(500);
    jest.restoreAllMocks();
    resetCaches();

    const inTasks = readFile(store.TASKS_FILE).some((x) => x.id === t.id);
    const inArchive = readFile(store.ARCHIVED_FILE).some((x) => x.id === t.id);
    expect(inTasks || inArchive).toBe(true);
  });

  test('corrupt storage file yields 500 and is not overwritten with an empty list', async () => {
    fs.writeFileSync(store.TASKS_FILE, '{ not valid json');
    resetCaches();

    const read = await request(app).get('/api/tasks');
    expect(read.status).toBe(500);
    expect(read.body).toEqual({ error: 'Internal server error' });

    const write = await request(app).post('/api/tasks').send(task());
    expect(write.status).toBe(500);
    expect(fs.readFileSync(store.TASKS_FILE, 'utf8')).toBe('{ not valid json');

    // Operator repairs the file: service recovers without restart
    fs.writeFileSync(store.TASKS_FILE, '[]');
    resetCaches();
    await request(app).get('/api/tasks').expect(200);
  });

  test('read errors other than a missing file are reported', async () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw ioError('EIO');
    });
    resetCaches();
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(500);
  });

  test('a missing storage file is an empty collection', async () => {
    fs.rmSync(store.TASKS_FILE);
    resetCaches();
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('concurrent access (#284)', () => {
  test('parallel creates are all persisted without lost updates', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        request(app)
          .post('/api/tasks')
          .send(task(`T${i}`)),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);

    const onDisk = readFile(store.TASKS_FILE);
    expect(onDisk).toHaveLength(25);
    expect(new Set(onDisk.map((t) => t.id)).size).toBe(25);
    expect(fs.existsSync(store.TASKS_FILE + '.tmp')).toBe(false);
  });

  test('parallel updates of one task serialize and leave valid JSON', async () => {
    const t = await createTask('Original');
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        request(app)
          .put(`/api/tasks/${t.id}`)
          .send({ title: `V${i}` }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const [stored] = readFile(store.TASKS_FILE);
    expect(stored.title).toMatch(/^V\d+$/);
    // every title change was recorded exactly once in the history
    expect(stored.history.filter((h) => h.action === 'edited')).toHaveLength(
      15,
    );
  });

  test('archiving the same task concurrently succeeds exactly once', async () => {
    const t = await createTask('Once');
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app).post(`/api/tasks/${t.id}/archive`),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 404)).toHaveLength(5);
    expect(readFile(store.ARCHIVED_FILE)).toHaveLength(1);
    expect(readFile(store.TASKS_FILE)).toHaveLength(0);
  });

  test('concurrent archive and unarchive do not deadlock', async () => {
    const toArchive = [];
    const toRestore = [];
    for (let i = 0; i < 4; i += 1) toArchive.push(await createTask(`A${i}`));
    for (let i = 0; i < 4; i += 1) {
      const t = await createTask(`R${i}`);
      await request(app).post(`/api/tasks/${t.id}/archive`).expect(200);
      toRestore.push(t);
    }

    const started = Date.now();
    const results = await Promise.all([
      ...toArchive.map((t) => request(app).post(`/api/tasks/${t.id}/archive`)),
      ...toRestore.map((t) =>
        request(app).post(`/api/tasks/${t.id}/unarchive`),
      ),
    ]);
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
    // Opposite lock order used to block until the 5s lock timeout
    expect(Date.now() - started).toBeLessThan(3000);

    expect(
      readFile(store.TASKS_FILE)
        .map((t) => t.title)
        .sort(),
    ).toEqual(['R0', 'R1', 'R2', 'R3']);
    expect(
      readFile(store.ARCHIVED_FILE)
        .map((t) => t.title)
        .sort(),
    ).toEqual(['A0', 'A1', 'A2', 'A3']);
  });
});

// The HTTP request needs real I/O turns to reach the lock; advance the fake clock (lock timeout is
// 5s) in small steps until the response arrived.
async function settleWithFakeClock(pending) {
  let result;
  let done = false;
  pending.then((r) => {
    result = r;
    done = true;
  });
  for (let i = 0; i < 400 && !done; i += 1) {
    await jest.advanceTimersByTimeAsync(50);
    await new Promise((resolve) => setImmediate(resolve));
  }
  return result;
}

describe('lock timeouts (#284)', () => {
  test('acquireLock rejects after the timeout and the lock stays usable', async () => {
    await store.acquireLock(store.TASKS_FILE);
    await expect(store.acquireLock(store.TASKS_FILE, 50)).rejects.toThrow(
      /Lock timeout/,
    );
    store.releaseLock(store.TASKS_FILE);
    await store.acquireLock(store.TASKS_FILE, 50);
    store.releaseLock(store.TASKS_FILE);
  });

  test('a request waiting for a stuck lock answers 500, afterwards the service recovers', async () => {
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
      ],
    });
    await store.acquireLock(store.TASKS_FILE);

    const pending = request(app)
      .post('/api/tasks')
      .send(task())
      .then((r) => r);
    const res = await settleWithFakeClock(pending);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });

    store.releaseLock(store.TASKS_FILE);
    jest.useRealTimers();
    await request(app).post('/api/tasks').send(task()).expect(201);
  });

  test('archive that times out on the archive lock releases the tasks lock', async () => {
    const t = await createTask('Locked');
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
      ],
    });
    await store.acquireLock(store.ARCHIVED_FILE);

    const pending = request(app)
      .post(`/api/tasks/${t.id}/archive`)
      .then((r) => r);
    expect((await settleWithFakeClock(pending)).status).toBe(500);

    store.releaseLock(store.ARCHIVED_FILE);
    jest.useRealTimers();
    // The tasks lock must not stay held forever
    await request(app)
      .put(`/api/tasks/${t.id}`)
      .send({ title: 'free' })
      .expect(200);
  });
});

describe('start-up configuration (#278)', () => {
  test('production without API_KEY is refused', () => {
    const result = checkStartupConfig({ NODE_ENV: 'production' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/API_KEY/);
    expect(result.error).toMatch(/ALLOW_UNAUTHENTICATED/);
  });

  test('an empty API_KEY counts as unset (docker-compose passes an empty string)', () => {
    expect(checkStartupConfig({ NODE_ENV: 'production', API_KEY: '' }).ok).toBe(
      false,
    );
  });

  test('production with API_KEY starts with authentication', () => {
    expect(
      checkStartupConfig({ NODE_ENV: 'production', API_KEY: 'secret' }),
    ).toMatchObject({
      ok: true,
      authEnabled: true,
      warning: null,
    });
  });

  test('explicit opt-out allows unauthenticated production with a warning', () => {
    const result = checkStartupConfig({
      NODE_ENV: 'production',
      ALLOW_UNAUTHENTICATED: 'true',
    });
    expect(result).toMatchObject({ ok: true, authEnabled: false });
    expect(result.warning).toMatch(/WITHOUT authentication/);
  });

  test.each([['1'], ['yes'], ['TRUE'], ['']])(
    'opt-out value %p is not accepted',
    (value) => {
      expect(
        checkStartupConfig({
          NODE_ENV: 'production',
          ALLOW_UNAUTHENTICATED: value,
        }).ok,
      ).toBe(false);
    },
  );

  test.each([[undefined], ['development'], ['test']])(
    'local development (NODE_ENV=%s) stays open with warning',
    (env) => {
      const result = checkStartupConfig({ NODE_ENV: env });
      expect(result).toMatchObject({ ok: true, authEnabled: false });
      expect(result.warning).toMatch(/No API_KEY/);
    },
  );

  const childEnv = (extra) => ({
    PATH: process.env.PATH,
    DATA_DIR: process.env.DATA_DIR,
    LOG_DIR: process.env.LOG_DIR,
    LOG_LEVEL: 'silent',
    ...extra,
  });

  test('server.js exits with code 1 and a clear message in production without API_KEY', () => {
    const child = spawnSync(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: childEnv({ NODE_ENV: 'production', PORT: '0' }),
      encoding: 'utf8',
      timeout: 15000,
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toMatch(/FATAL: API_KEY is not set/);
  });

  test('server.js starts in production with API_KEY and enforces it', async () => {
    const port = await new Promise((resolve) => {
      const probe = net.createServer().listen(0, '127.0.0.1', () => {
        const { port: free } = probe.address();
        probe.close(() => resolve(free));
      });
    });
    const child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: childEnv({
        NODE_ENV: 'production',
        API_KEY: 'test-key',
        PORT: String(port),
      }),
      stdio: 'ignore',
    });
    const exited = new Promise((resolve) => child.on('exit', resolve));
    try {
      let status;
      for (let i = 0; i < 100 && status === undefined; i += 1) {
        try {
          status = (await fetch(`http://127.0.0.1:${port}/api/tasks`)).status;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      expect(status).toBe(401);
    } finally {
      child.kill('SIGTERM');
      await exited;
    }
  });
});

describe('header-only authentication, no CSRF surface (#285)', () => {
  let secured;
  beforeAll(() => {
    process.env.API_KEY = 'csrf-test-key';
    jest.isolateModules(() => {
      secured = require('../src/server/app').app;
    });
    delete process.env.API_KEY;
  });

  test('mutating requests without the X-API-Key header are rejected', async () => {
    await request(secured).post('/api/tasks').send(task()).expect(401);
    await request(secured)
      .delete('/api/tasks/00000000-0000-4000-8000-000000000000')
      .expect(401);
    await request(secured)
      .post('/api/tasks/00000000-0000-4000-8000-000000000000/archive')
      .expect(401);
  });

  test('ambient browser credentials (cookies) do not authenticate', async () => {
    const res = await request(secured)
      .post('/api/tasks')
      .set(
        'Cookie',
        'X-API-Key=csrf-test-key; api_key=csrf-test-key; session=1',
      )
      .send(task());
    expect(res.status).toBe(401);
  });

  test('wrong key is rejected, correct key accepted', async () => {
    await request(secured)
      .post('/api/tasks')
      .set('X-API-Key', 'nope')
      .send(task())
      .expect(401);
    await request(secured)
      .post('/api/tasks')
      .set('X-API-Key', 'csrf-test-key')
      .send(task())
      .expect(201);
  });

  test('the server never sets cookies and sends no CORS allow headers', async () => {
    const res = await request(secured)
      .post('/api/tasks')
      .set('X-API-Key', 'csrf-test-key')
      .set('Origin', 'https://evil.example')
      .send(task());
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();

    const preflight = await request(secured)
      .options('/api/tasks')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-api-key,content-type');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-headers']).toBeUndefined();
  });
});
