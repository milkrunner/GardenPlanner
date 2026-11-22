// Reverse proxy support (#334): TRUST_PROXY decides whether X-Forwarded-For is honoured for
// req.ip, the rate-limit key and the audit log. The setting is read when app.js is imported, so
// every case loads a fresh module graph.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const request = require('supertest');

const { checkStartupConfig, parseTrustProxy } = require('../src/server/config');

const ENV_KEYS = ['TRUST_PROXY', 'API_KEY'];
const savedEnv = {};
for (const key of ENV_KEYS) savedEnv[key] = process.env[key];

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  jest.resetModules();
  jest.dontMock('../src/server/logger');
});

// Loads app.js with the given environment; `audit` is captured to inspect the logged client IP.
function loadApp(env = {}) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const audit = jest.fn();
  let app;
  jest.isolateModules(() => {
    const logger = jest.requireActual('../src/server/logger');
    jest.doMock('../src/server/logger', () => ({ ...logger, audit }));
    ({ app } = require('../src/server/app'));
  });
  return { app, audit };
}

const remaining = (res) => Number(res.headers['ratelimit-remaining']);

describe('parseTrustProxy', () => {
  test.each([[undefined], [''], ['  '], ['false'], ['FALSE'], ['0']])(
    '%p keeps trust proxy off',
    (raw) => {
      expect(parseTrustProxy(raw)).toEqual({ ok: true, value: false });
    },
  );

  test('true is accepted but warns about spoofable X-Forwarded-For', () => {
    const result = parseTrustProxy('true');
    expect(result).toMatchObject({ ok: true, value: true });
    expect(result.warning).toMatch(/spoof/);
  });

  test.each([
    ['1', 1],
    [' 2 ', 2],
    ['loopback', ['loopback']],
    ['Loopback, uniquelocal', ['loopback', 'uniquelocal']],
    ['10.0.0.0/8', ['10.0.0.0/8']],
    ['127.0.0.1, ::1, fd00::/8', ['127.0.0.1', '::1', 'fd00::/8']],
  ])('%p is accepted as %p without warning', (raw, value) => {
    expect(parseTrustProxy(raw)).toEqual({ ok: true, value });
  });

  test.each([
    ['yes'],
    ['-1'],
    ['1.5'],
    ['99999999999999999999'],
    ['33'],
    ['10.0.0.0/33'],
    ['::1/129'],
    ['10.0.0.0/8/8'],
    ['10.0.0.256'],
    ['loopback,'],
    ['loopback,,1'],
    ['example.com'],
  ])('%p is rejected with a clear message and a safe value', (raw) => {
    const result = parseTrustProxy(raw);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
    expect(result.error).toMatch(/Invalid TRUST_PROXY/);
  });
});

describe('start-up check', () => {
  test('an invalid TRUST_PROXY refuses to start, also with API_KEY', () => {
    const result = checkStartupConfig({ API_KEY: 'k', TRUST_PROXY: 'maybe' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/TRUST_PROXY/);
  });

  test('TRUST_PROXY=true adds a warning, a hop count does not', () => {
    const env = { NODE_ENV: 'production', API_KEY: 'k' };
    expect(checkStartupConfig({ ...env, TRUST_PROXY: 'true' }).warning).toMatch(
      /TRUST_PROXY=true/,
    );
    expect(checkStartupConfig({ ...env, TRUST_PROXY: '1' }).warning).toBeNull();
    expect(checkStartupConfig(env).warning).toBeNull();
  });

  test('warnings are combined with the authentication warning', () => {
    const result = checkStartupConfig({ TRUST_PROXY: 'true' });
    expect(result.warning).toMatch(/No API_KEY/);
    expect(result.warning).toMatch(/TRUST_PROXY=true/);
  });
});

describe('server.js start-up', () => {
  test('exits with code 1 and a clear message on an invalid TRUST_PROXY', () => {
    const child = spawnSync(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        PATH: process.env.PATH,
        DATA_DIR: process.env.DATA_DIR,
        LOG_DIR: process.env.LOG_DIR,
        LOG_LEVEL: 'silent',
        PORT: '0',
        TRUST_PROXY: 'maybe',
      },
      encoding: 'utf8',
      timeout: 15000,
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toMatch(/FATAL: Invalid TRUST_PROXY value "maybe"/);
  });
});

describe('X-Forwarded-For handling (#334)', () => {
  beforeEach(() => {
    // express-rate-limit complains about X-Forwarded-For while trust proxy is off; expected here
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('default (off): forged X-Forwarded-For does not create new rate-limit buckets', async () => {
    const { app } = loadApp({ TRUST_PROXY: undefined });
    expect(app.get('trust proxy')).toBe(false);

    const first = await request(app)
      .get('/api/tasks')
      .set('X-Forwarded-For', '203.0.113.1');
    const second = await request(app)
      .get('/api/tasks')
      .set('X-Forwarded-For', '203.0.113.2');
    expect(second.status).toBe(200);
    expect(remaining(second)).toBe(remaining(first) - 1);
  });

  test('TRUST_PROXY=1: each forwarded client gets its own rate-limit bucket', async () => {
    const { app } = loadApp({ TRUST_PROXY: '1' });
    expect(app.get('trust proxy')).toBe(1);

    const first = await request(app)
      .get('/api/tasks')
      .set('X-Forwarded-For', '203.0.113.1');
    const other = await request(app)
      .get('/api/tasks')
      .set('X-Forwarded-For', '203.0.113.2');
    const again = await request(app)
      .get('/api/tasks')
      .set('X-Forwarded-For', '203.0.113.1');
    expect(remaining(other)).toBe(remaining(first));
    expect(remaining(again)).toBe(remaining(first) - 1);
  });

  test('an invalid TRUST_PROXY falls back to off in app.js', () => {
    const { app } = loadApp({ TRUST_PROXY: 'bogus' });
    expect(app.get('trust proxy')).toBe(false);
  });

  test.each([
    ['unset', undefined, '::ffff:127.0.0.1', '203.0.113.7'],
    ['1', '1', '203.0.113.7', '203.0.113.7'],
  ])(
    'audit log client IP with TRUST_PROXY=%s',
    async (_name, trustProxy, expectedIp, forwarded) => {
      const { app, audit } = loadApp({
        TRUST_PROXY: trustProxy,
        API_KEY: 'secret',
      });
      await request(app)
        .get('/api/tasks')
        .set('X-Forwarded-For', forwarded)
        .set('X-API-Key', 'wrong')
        .expect(401);

      expect(audit).toHaveBeenCalledWith(
        'auth_failure',
        expect.objectContaining({ ip: expect.any(String) }),
      );
      const { ip } = audit.mock.calls[0][1];
      if (trustProxy === undefined) {
        // the proxy (socket peer) address, never the forged header value
        expect(ip).not.toBe(forwarded);
        expect(ip).toMatch(/127\.0\.0\.1|::1/);
      } else {
        expect(ip).toBe(expectedIp);
      }
    },
  );

  test('with a hop count the last untrusted entry wins, spoofed leading entries are ignored', async () => {
    const { app, audit } = loadApp({ TRUST_PROXY: '1', API_KEY: 'secret' });
    await request(app)
      .get('/api/tasks')
      .set('X-Forwarded-For', '198.51.100.99, 203.0.113.7')
      .set('X-API-Key', 'wrong')
      .expect(401);
    expect(audit.mock.calls[0][1].ip).toBe('203.0.113.7');
  });
});
