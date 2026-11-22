const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { app, resetCaches } = require('../src/server/app');

const spec = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.json'), 'utf8'),
);
const DATA_DIR = process.env.DATA_DIR;
const METHODS = ['get', 'post', 'put', 'delete'];

// --- Routes registered in Express, as "METHOD /api/path/{param}" ---

function mountPath(layer) {
  return layer.regexp.source
    .replace(/^\^/, '')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\\\//g, '/');
}

function collectRoutes(stack, prefix = '') {
  const found = [];
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        found.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`);
      }
    } else if (layer.name === 'router' && layer.handle.stack) {
      found.push(
        ...collectRoutes(layer.handle.stack, prefix + mountPath(layer)),
      );
    }
  }
  return found;
}

function expressApiRoutes() {
  return collectRoutes(app._router.stack)
    .map((route) => route.replace(/:(\w+)/g, '{$1}').replace(/\/$/, ''))
    .filter((route) => route.split(' ')[1].startsWith('/api/'))
    .filter((route) => !route.endsWith('/api/test-error')) // only exists under NODE_ENV=test
    .sort();
}

function specRoutes() {
  return Object.entries(spec.paths)
    .flatMap(([url, item]) =>
      METHODS.filter((m) => item[m]).map((m) => `${m.toUpperCase()} ${url}`),
    )
    .sort();
}

// --- Minimal schema check (types, required, enum, oneOf/allOf, $ref, nullable) ---

function resolve(schema) {
  if (!schema.$ref) return schema;
  return schema.$ref
    .replace('#/', '')
    .split('/')
    .reduce((node, key) => node[key], spec);
}

function check(schema, value, where) {
  const s = resolve(schema);
  if (value === null) {
    if (s.nullable) return [];
    return [`${where}: null not allowed`];
  }
  if (s.oneOf) {
    const results = s.oneOf.map((option) => check(option, value, where));
    return results.some((r) => r.length === 0)
      ? []
      : [`${where}: matches none of oneOf`];
  }
  if (s.allOf) return s.allOf.flatMap((part) => check(part, value, where));
  const errors = [];
  if (s.enum && !s.enum.includes(value))
    errors.push(`${where}: ${value} not in enum`);
  if (s.type === 'array') {
    if (!Array.isArray(value)) return [`${where}: expected array`];
    value.forEach((item, i) =>
      errors.push(...check(s.items || {}, item, `${where}[${i}]`)),
    );
  } else if (s.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value))
      return [`${where}: expected object`];
    for (const key of s.required || []) {
      if (!(key in value)) errors.push(`${where}.${key}: missing`);
    }
    for (const [key, sub] of Object.entries(s.properties || {})) {
      if (key in value)
        errors.push(...check(sub, value[key], `${where}.${key}`));
    }
  } else if (s.type === 'integer') {
    if (!Number.isInteger(value)) errors.push(`${where}: expected integer`);
  } else if (s.type === 'number') {
    if (typeof value !== 'number') errors.push(`${where}: expected number`);
  } else if (s.type && typeof value !== s.type) {
    errors.push(`${where}: expected ${s.type}`);
  }
  return errors;
}

function responseSchema(method, url, status) {
  const op = spec.paths[url][method.toLowerCase()];
  const response = resolve(op.responses[status] || {});
  return { documented: Boolean(op.responses[status]), response };
}

beforeEach(() => {
  for (const file of ['tasks.json', 'archived-tasks.json', 'plants.json']) {
    fs.rmSync(path.join(DATA_DIR, file), { force: true });
  }
  resetCaches();
});

describe('OpenAPI spec (#326)', () => {
  test('is a well-formed OpenAPI 3 document', () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBeTruthy();
    expect(JSON.stringify(spec)).not.toMatch(/\$ref":"#\/(?!components\/)/);
  });

  test('documents exactly the routes the server registers', () => {
    expect(specRoutes()).toEqual(expressApiRoutes());
  });

  test('every $ref resolves', () => {
    const refs = JSON.stringify(spec).match(/"\$ref":"[^"]+"/g) || [];
    expect(refs.length).toBeGreaterThan(0);
    for (const entry of refs) {
      const target = entry.slice('"$ref":"'.length, -1);
      expect(() => resolve({ $ref: target })).not.toThrow();
      expect(resolve({ $ref: target })).toBeDefined();
    }
  });

  describe('real responses match the documented schemas', () => {
    const validTask = {
      title: 'Rasen mähen',
      employee: 'Max',
      location: 'Garten',
    };
    const missing = '00000000-0000-4000-a000-000000000000';

    async function expectMatches(method, url, res) {
      const { documented, response } = responseSchema(
        method,
        url,
        String(res.status),
      );
      expect({
        route: `${method} ${url}`,
        status: res.status,
        documented,
      }).toEqual({
        route: `${method} ${url}`,
        status: res.status,
        documented: true,
      });
      const json = response.content && response.content['application/json'];
      if (json)
        expect(
          check(json.schema, res.body, `${method} ${url} ${res.status}`),
        ).toEqual([]);
    }

    test('task endpoints', async () => {
      const created = await request(app)
        .post('/api/tasks')
        .send({ ...validTask, subtasks: ['a', { text: 'b' }] });
      await expectMatches('POST', '/api/tasks', created);
      const id = created.body.id;

      await expectMatches(
        'POST',
        '/api/tasks',
        await request(app).post('/api/tasks').send({ title: '' }),
      );
      await expectMatches(
        'GET',
        '/api/tasks',
        await request(app).get('/api/tasks'),
      );
      await expectMatches(
        'GET',
        '/api/tasks',
        await request(app).get('/api/tasks?page=1&limit=5'),
      );
      await expectMatches(
        'GET',
        '/api/tasks',
        await request(app).get('/api/tasks?employee=Max'),
      );
      await expectMatches(
        'POST',
        '/api/tasks/search',
        await request(app).post('/api/tasks/search').send({ employee: 'Max' }),
      );
      await expectMatches(
        'GET',
        '/api/tasks',
        await request(app).get('/api/tasks?dueFrom=2026-01-01&sort=dueDate'),
      );
      await expectMatches(
        'GET',
        '/api/tasks',
        await request(app).get('/api/tasks?dueFrom=2026-02-30'),
      );
      await expectMatches(
        'POST',
        '/api/tasks/search',
        await request(app).post('/api/tasks/search').send({ sort: 'title' }),
      );
      const dated = await request(app)
        .post('/api/tasks')
        .send({ ...validTask, dueDate: '2026-03-15', recurrence: 'daily' });
      expect(dated.body.dueDate).toBe('2026-03-15');
      await expectMatches('POST', '/api/tasks', dated);
      await expectMatches(
        'POST',
        '/api/tasks',
        await request(app)
          .post('/api/tasks')
          .send({ ...validTask, dueDate: '2026-02-30' }),
      );
      const cleared = await request(app)
        .put(`/api/tasks/${dated.body.id}`)
        .send({ dueDate: null });
      expect(cleared.body.dueDate).toBeNull();
      await expectMatches('PUT', '/api/tasks/{id}', cleared);
      await expectMatches(
        'POST',
        '/api/tasks/search',
        await request(app)
          .post('/api/tasks/search')
          .send({ employee: 'Max', page: 1, limit: 1 }),
      );
      await expectMatches(
        'GET',
        '/api/tasks/{id}',
        await request(app).get(`/api/tasks/${id}`),
      );
      await expectMatches(
        'GET',
        '/api/tasks/{id}',
        await request(app).get('/api/tasks/nope'),
      );
      await expectMatches(
        'GET',
        '/api/tasks/{id}',
        await request(app).get(`/api/tasks/${missing}`),
      );
      await expectMatches(
        'PUT',
        '/api/tasks/{id}',
        await request(app)
          .put(`/api/tasks/${id}`)
          .send({ status: 'completed' }),
      );
      const recurring = await request(app)
        .post('/api/tasks')
        .send({ ...validTask, recurrence: 'weekly' });
      const recurred = await request(app)
        .put(`/api/tasks/${recurring.body.id}`)
        .send({ status: 'completed' });
      expect(recurred.body.followUp).toBeDefined();
      await expectMatches('PUT', '/api/tasks/{id}', recurred);
      await expectMatches(
        'PUT',
        '/api/tasks/{id}',
        await request(app).put(`/api/tasks/${id}`).send({ status: 'bogus' }),
      );
      await expectMatches(
        'PUT',
        '/api/tasks/{id}',
        await request(app).put(`/api/tasks/${missing}`).send({ title: 'x' }),
      );
    });

    test('archive endpoints', async () => {
      const { body: task } = await request(app)
        .post('/api/tasks')
        .send(validTask);
      await expectMatches(
        'POST',
        '/api/tasks/{id}/archive',
        await request(app).post(`/api/tasks/${task.id}/archive`),
      );
      await expectMatches(
        'POST',
        '/api/tasks/{id}/archive',
        await request(app).post(`/api/tasks/${missing}/archive`),
      );
      await expectMatches(
        'GET',
        '/api/archived-tasks',
        await request(app).get('/api/archived-tasks'),
      );
      await expectMatches(
        'POST',
        '/api/tasks/{id}/unarchive',
        await request(app).post(`/api/tasks/${task.id}/unarchive`),
      );
      await expectMatches(
        'POST',
        '/api/tasks/{id}/unarchive',
        await request(app).post(`/api/tasks/${missing}/unarchive`),
      );

      await request(app).post(`/api/tasks/${task.id}/archive`);
      await expectMatches(
        'DELETE',
        '/api/archived-tasks/{id}',
        await request(app).delete(`/api/archived-tasks/${task.id}`),
      );
      await expectMatches(
        'DELETE',
        '/api/archived-tasks/{id}',
        await request(app).delete(`/api/archived-tasks/${task.id}`),
      );
    });

    test('delete task', async () => {
      const { body: task } = await request(app)
        .post('/api/tasks')
        .send(validTask);
      await expectMatches(
        'DELETE',
        '/api/tasks/{id}',
        await request(app).delete(`/api/tasks/${task.id}`),
      );
      await expectMatches(
        'DELETE',
        '/api/tasks/{id}',
        await request(app).delete(`/api/tasks/${task.id}`),
      );
    });

    test('plant and auth endpoints', async () => {
      await expectMatches(
        'GET',
        '/api/auth/status',
        await request(app).get('/api/auth/status'),
      );
      await expectMatches(
        'GET',
        '/api/plants',
        await request(app).get('/api/plants?category=Obst'),
      );
      await expectMatches(
        'GET',
        '/api/plants/{id}',
        await request(app).get('/api/plants/tomato'),
      );
      await expectMatches(
        'GET',
        '/api/plants/{id}',
        await request(app).get('/api/plants/nope'),
      );
      await expectMatches(
        'GET',
        '/api/plant-categories',
        await request(app).get('/api/plant-categories'),
      );
    });

    test('export and import endpoints', async () => {
      const { body: task } = await request(app)
        .post('/api/tasks')
        .send(validTask);
      const exported = await request(app).get('/api/export');
      await expectMatches('GET', '/api/export', exported);
      const bundle = exported.body;
      const post = (query, body) =>
        request(app).post(`/api/import${query}`).send(body);

      await expectMatches('POST', '/api/import', await post('', bundle)); // 409
      await expectMatches(
        'POST',
        '/api/import',
        await post('?mode=merge', bundle),
      );
      await expectMatches(
        'POST',
        '/api/import',
        await post('?mode=replace&confirm=replace', bundle),
      );
      await expectMatches(
        'POST',
        '/api/import',
        await post('?mode=replace', bundle),
      );
      await expectMatches(
        'POST',
        '/api/import',
        await post('?mode=bogus', bundle),
      );
      await expectMatches(
        'POST',
        '/api/import',
        await post('?mode=merge', { formatVersion: 1, tasks: [{}] }),
      );
      await expectMatches(
        'POST',
        '/api/import',
        await post('?mode=merge', {
          formatVersion: 1,
          tasks: Array.from({ length: 10001 }, () => ({})),
          archivedTasks: [],
        }),
      );

      await request(app).delete(`/api/tasks/${task.id}`);
      await expectMatches('POST', '/api/import', await post('', bundle)); // 200, empty instance
      await expectMatches(
        'POST',
        '/api/import',
        await request(app)
          .post('/api/import')
          .send({ formatVersion: 1, tasks: 'x', archivedTasks: [] }),
      );
      await expectMatches(
        'POST',
        '/api/import',
        await request(app)
          .post('/api/import')
          .send({
            formatVersion: 1,
            tasks: [],
            archivedTasks: [],
            padding: 'x'.repeat(6 * 1024 * 1024),
          }),
      );
    });

    test('plant write endpoints', async () => {
      const plant = {
        name: 'Kohlrabi',
        category: 'Gemüse',
        season: ['spring'],
      };
      await expectMatches(
        'POST',
        '/api/plants',
        await request(app).post('/api/plants').send(plant),
      );
      await expectMatches(
        'POST',
        '/api/plants',
        await request(app).post('/api/plants').send(plant),
      ); // 409
      await expectMatches(
        'POST',
        '/api/plants',
        await request(app).post('/api/plants').send({ name: '' }),
      ); // 400
      await expectMatches(
        'PUT',
        '/api/plants/{id}',
        await request(app).put('/api/plants/kohlrabi').send({ water: 'high' }),
      );
      await expectMatches(
        'PUT',
        '/api/plants/{id}',
        await request(app).put('/api/plants/kohlrabi').send({ sun: 'moon' }),
      );
      await expectMatches(
        'PUT',
        '/api/plants/{id}',
        await request(app).put('/api/plants/nope').send({ water: 'high' }),
      );
      await expectMatches(
        'DELETE',
        '/api/plants/{id}',
        await request(app).delete('/api/plants/kohlrabi'),
      );
      await expectMatches(
        'DELETE',
        '/api/plants/{id}',
        await request(app).delete('/api/plants/kohlrabi'),
      );
      await expectMatches(
        'POST',
        '/api/plants',
        await request(app)
          .post('/api/plants')
          .send({ ...plant, tips: 'x'.repeat(200000) }),
      ); // 413
    });

    test('oversized body is documented as 413', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ ...validTask, description: 'x'.repeat(200000) });
      await expectMatches('POST', '/api/tasks', res);
    });
  });
});
