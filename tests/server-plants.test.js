// Reading, searching and the damaged-file behavior. CRUD lives in server-plants-crud.test.js; both are
// split because every suite gets its own app instance and the API allows 100 requests per 15 minutes.
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../src/server/app');
const { logger } = require('../src/server/logger');
const plantService = require('../src/server/services/plant-service');

const PLANTS_FILE = path.join(process.env.DATA_DIR, 'plants.json');
const DEFAULTS = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'src',
      'server',
      'defaults',
      'default-plants.json',
    ),
    'utf8',
  ),
);

const validPlant = {
  name: 'Kohlrabi',
  category: 'Gemüse',
  icon: '🥬',
  difficulty: 'easy',
  sun: 'partial',
  water: 'medium',
  season: ['spring', 'autumn'],
  spacing: '25cm',
  germination: '5-10 Tage',
  harvest: '50-70 Tage',
  companions: ['Salat', 'Spinat'],
  avoid: ['Kohl'],
  tips: 'Gleichmäßig feucht halten.',
};

beforeEach(() => {
  fs.rmSync(PLANTS_FILE, { force: true });
  fs.rmSync(`${PLANTS_FILE}.tmp`, { force: true });
});

describe('plant library reading', () => {
  test('serves the 20 built-in defaults without a plants.json', async () => {
    const res = await request(app).get('/api/plants');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULTS);
    expect(res.body).toHaveLength(20);
    expect(fs.existsSync(PLANTS_FILE)).toBe(false);
  });

  test('a plants.json overrides the defaults completely', async () => {
    fs.writeFileSync(
      PLANTS_FILE,
      JSON.stringify([{ ...validPlant, id: 'kohlrabi' }]),
    );
    const res = await request(app).get('/api/plants');
    expect(res.body.map((p) => p.id)).toEqual(['kohlrabi']);
  });

  test('an empty plants.json is a deliberately empty library, not a fallback', async () => {
    fs.writeFileSync(PLANTS_FILE, '[]');
    expect((await request(app).get('/api/plants')).body).toEqual([]);
    expect((await request(app).get('/api/plant-categories')).body).toEqual([]);
  });

  describe('search', () => {
    test('matches the name regardless of case', async () => {
      for (const term of ['tomate', 'TOMATE', 'ToMaT']) {
        const res = await request(app)
          .get('/api/plants')
          .query({ search: term });
        expect(res.body.map((p) => p.id)).toContain('tomato');
      }
    });

    test('matches the category', async () => {
      const res = await request(app)
        .get('/api/plants')
        .query({ search: 'KRÄUTER' });
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((p) => p.category === 'Kräuter')).toBe(true);
    });

    test('matches the tips', async () => {
      const res = await request(app)
        .get('/api/plants')
        .query({ search: 'braunfäule' });
      expect(res.body.map((p) => p.id)).toEqual(['tomato']);
    });

    test('trims the term and ignores an empty or non-string term', async () => {
      const trimmed = await request(app)
        .get('/api/plants')
        .query({ search: '  tomate  ' });
      expect(trimmed.body.map((p) => p.id)).toContain('tomato');
      expect((await request(app).get('/api/plants?search=')).body).toHaveLength(
        20,
      );
      expect(
        (await request(app).get('/api/plants?search=%20%20')).body,
      ).toHaveLength(20);
      // ?search=a&search=b arrives as an array and is ignored instead of crashing
      expect(
        (await request(app).get('/api/plants?search=a&search=b')).body,
      ).toHaveLength(20);
    });

    test('returns an empty array when nothing matches', async () => {
      const res = await request(app)
        .get('/api/plants')
        .query({ search: 'zzz-gibt-es-nicht' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('does not treat the term as a pattern', async () => {
      const res = await request(app).get('/api/plants').query({ search: '.*' });
      expect(res.body).toEqual([]);
    });

    test('tolerates entries with missing fields in a hand-edited file', async () => {
      fs.writeFileSync(
        PLANTS_FILE,
        JSON.stringify([{ id: 'bare' }, { ...validPlant, id: 'kohlrabi' }]),
      );
      const res = await request(app)
        .get('/api/plants')
        .query({ search: 'kohl' });
      expect(res.status).toBe(200);
      expect(res.body.map((p) => p.id)).toEqual(['kohlrabi']);
      expect((await request(app).get('/api/plant-categories')).body).toEqual([
        'Gemüse',
      ]);
    });
  });

  describe('category filter', () => {
    test('compares the category exactly', async () => {
      const res = await request(app)
        .get('/api/plants')
        .query({ category: 'Obst' });
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((p) => p.category === 'Obst')).toBe(true);
      const lower = await request(app)
        .get('/api/plants')
        .query({ category: 'obst' });
      expect(lower.body).toEqual([]);
    });

    test('combines with search', async () => {
      const res = await request(app)
        .get('/api/plants')
        .query({ category: 'Gemüse', search: 'tomate' });
      expect(res.body.map((p) => p.id)).toContain('tomato');
      expect(res.body.every((p) => p.category === 'Gemüse')).toBe(true);
      const none = await request(app)
        .get('/api/plants')
        .query({ category: 'Obst', search: 'tomate' });
      expect(none.body).toEqual([]);
    });

    test('an unknown category yields an empty array', async () => {
      const res = await request(app)
        .get('/api/plants')
        .query({ category: 'Pilze' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('single plant', () => {
    test('returns the plant by id', async () => {
      const res = await request(app).get('/api/plants/tomato');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(DEFAULTS.find((p) => p.id === 'tomato'));
    });

    test('unknown ids are 404, the id match is exact', async () => {
      for (const id of ['nope', 'TOMATO', 'tomat', 'tomato%20']) {
        const res = await request(app).get(`/api/plants/${id}`);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Plant not found' });
      }
    });
  });

  test('category list is unique and sorted', async () => {
    const res = await request(app).get('/api/plant-categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(['Blumen', 'Gemüse', 'Kräuter', 'Obst']);
  });

  test('category list follows a custom library', async () => {
    fs.writeFileSync(
      PLANTS_FILE,
      JSON.stringify([
        { ...validPlant, id: 'a', category: 'Zebra' },
        { ...validPlant, id: 'b', category: 'Apfel' },
        { ...validPlant, id: 'c', category: 'Zebra' },
      ]),
    );
    expect((await request(app).get('/api/plant-categories')).body).toEqual([
      'Apfel',
      'Zebra',
    ]);
  });

  describe('damaged plants.json', () => {
    let warn;
    beforeEach(() => {
      // a valid read re-arms the warning of a previous test
      fs.writeFileSync(PLANTS_FILE, '[]');
      plantService.readPlants();
      warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    });

    test('unparsable JSON falls back to the defaults and warns', async () => {
      fs.writeFileSync(PLANTS_FILE, '{ this is not json');
      const res = await request(app).get('/api/plants');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(DEFAULTS);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatchObject({ file: PLANTS_FILE });
      expect(warn.mock.calls[0][1]).toMatch(/plants\.json/);
    });

    test('valid JSON that is not an array is treated as damaged', async () => {
      fs.writeFileSync(PLANTS_FILE, '{"plants": []}');
      const res = await request(app).get('/api/plants');
      expect(res.body).toEqual(DEFAULTS);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    test('an empty file is damaged too', async () => {
      fs.writeFileSync(PLANTS_FILE, '');
      expect((await request(app).get('/api/plants')).body).toEqual(DEFAULTS);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    test('warns once per damage episode, not on every request', async () => {
      fs.writeFileSync(PLANTS_FILE, 'oops');
      await request(app).get('/api/plants');
      await request(app).get('/api/plant-categories');
      await request(app).get('/api/plants/tomato');
      expect(warn).toHaveBeenCalledTimes(1);

      fs.writeFileSync(PLANTS_FILE, '[]');
      await request(app).get('/api/plants');
      fs.writeFileSync(PLANTS_FILE, 'oops again');
      await request(app).get('/api/plants');
      expect(warn).toHaveBeenCalledTimes(2);
    });

    test('a missing file is normal and does not warn', async () => {
      fs.rmSync(PLANTS_FILE, { force: true });
      await request(app).get('/api/plants');
      expect(warn).not.toHaveBeenCalled();
    });

    test('writes are refused with 500 and the file stays untouched', async () => {
      fs.writeFileSync(PLANTS_FILE, 'precious but damaged');
      const create = await request(app).post('/api/plants').send(validPlant);
      expect(create.status).toBe(500);
      const update = await request(app)
        .put('/api/plants/tomato')
        .send({ name: 'x' });
      expect(update.status).toBe(500);
      const remove = await request(app).delete('/api/plants/tomato');
      expect(remove.status).toBe(500);
      expect(fs.readFileSync(PLANTS_FILE, 'utf8')).toBe('precious but damaged');
    });

    test('after the file is deleted the library is writable again', async () => {
      fs.writeFileSync(PLANTS_FILE, 'broken');
      fs.rmSync(PLANTS_FILE);
      const res = await request(app).post('/api/plants').send(validPlant);
      expect(res.status).toBe(201);
    });
  });
});
