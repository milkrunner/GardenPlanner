// Plant CRUD, audit log and validator. Reading is covered by server-plants.test.js.
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../src/server/app');
const {
  validatePlant,
  sanitizePlantData,
  slugify,
} = require('../src/server/validation/plant-validator');

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
  sowMonths: [3, 4, 9],
  spacing: '25cm',
  germination: '5-10 Tage',
  harvest: '50-70 Tage',
  companions: ['Salat', 'Spinat'],
  avoid: ['Kohl'],
  tips: 'Gleichmäßig feucht halten.',
};

function customFile() {
  return JSON.parse(fs.readFileSync(PLANTS_FILE, 'utf8'));
}

beforeEach(() => {
  fs.rmSync(PLANTS_FILE, { force: true });
  fs.rmSync(`${PLANTS_FILE}.tmp`, { force: true });
});

describe('plant library CRUD', () => {
  describe('POST /api/plants', () => {
    test('creates a plant, derives the slug and copies the defaults on first write', async () => {
      const res = await request(app).post('/api/plants').send(validPlant);
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'kohlrabi', ...validPlant });

      const stored = customFile();
      expect(stored).toHaveLength(21);
      expect(stored.slice(0, 20)).toEqual(DEFAULTS);
      expect(stored[20]).toEqual(res.body);
      expect((await request(app).get('/api/plants/kohlrabi')).body).toEqual(
        res.body,
      );
      expect(fs.existsSync(`${PLANTS_FILE}.tmp`)).toBe(false);
    });

    test('leaves the repository defaults untouched', async () => {
      const file = path.join(
        __dirname,
        '..',
        'src',
        'server',
        'defaults',
        'default-plants.json',
      );
      const before = fs.readFileSync(file, 'utf8');
      await request(app).post('/api/plants').send(validPlant);
      await request(app).delete('/api/plants/tomato');
      expect(fs.readFileSync(file, 'utf8')).toBe(before);
    });

    test('accepts a client-supplied id and fills defaults for optional fields', async () => {
      const res = await request(app)
        .post('/api/plants')
        .send({ id: 'my-plant-2', name: 'Eigene Pflanze', category: 'Blumen' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: 'my-plant-2',
        name: 'Eigene Pflanze',
        category: 'Blumen',
        icon: '🌱',
        difficulty: 'medium',
        sun: 'full',
        water: 'medium',
        season: [],
        sowMonths: [],
        spacing: '',
        germination: '',
        harvest: '',
        companions: [],
        avoid: [],
        tips: '',
      });
    });

    test('derives a readable slug from umlauts and special characters', async () => {
      const res = await request(app)
        .post('/api/plants')
        .send({ name: 'Süße Möhre (Maxi)', category: 'Gemüse' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('susse-mohre-maxi');
    });

    test('409 on a duplicate id, also against a default plant', async () => {
      const res = await request(app)
        .post('/api/plants')
        .send({ ...validPlant, id: 'tomato' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: 'Plant with ID "tomato" already exists',
      });
      expect(fs.existsSync(PLANTS_FILE)).toBe(false);

      await request(app).post('/api/plants').send(validPlant);
      const again = await request(app).post('/api/plants').send(validPlant);
      expect(again.status).toBe(409);
      expect(customFile().filter((p) => p.id === 'kohlrabi')).toHaveLength(1);
    });

    test('409 when the derived slug collides', async () => {
      const res = await request(app)
        .post('/api/plants')
        .send({ name: 'Tomato', category: 'Gemüse' });
      expect(res.status).toBe(409);
    });

    test('400 with a list of errors for invalid input', async () => {
      const res = await request(app)
        .post('/api/plants')
        .send({ name: '', difficulty: 'impossible' });
      expect(res.status).toBe(400);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(3);
      expect(fs.existsSync(PLANTS_FILE)).toBe(false);
    });

    test('400 when no id can be derived from the name', async () => {
      const res = await request(app)
        .post('/api/plants')
        .send({ name: '🌿🌿', category: 'Kräuter' });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toMatch(/ID/);
    });

    test('400 for non-object bodies', async () => {
      const arr = await request(app).post('/api/plants').send([validPlant]);
      expect(arr.status).toBe(400);
      const none = await request(app).post('/api/plants');
      expect(none.status).toBe(400);
    });

    test('ignores unknown fields instead of storing them', async () => {
      const res = await request(app)
        .post('/api/plants')
        .send({ ...validPlant, isAdmin: true, constructor: 'x' });
      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('isAdmin');
      expect(Object.keys(res.body).sort()).toEqual(
        Object.keys({ id: 1, ...validPlant }).sort(),
      );
    });

    test('validates, sorts and de-duplicates the sowing months (#349)', async () => {
      const ok = await request(app)
        .post('/api/plants')
        .send({ ...validPlant, sowMonths: [9, 3, 3, 4] });
      expect(ok.status).toBe(201);
      expect(ok.body.sowMonths).toEqual([3, 4, 9]);

      for (const sowMonths of [
        'März',
        [0],
        [13],
        [1.5],
        ['3'],
        [null],
        { 3: true },
      ]) {
        const bad = await request(app)
          .post('/api/plants')
          .send({ ...validPlant, id: 'bad-months', sowMonths });
        expect(bad.status).toBe(400);
        expect(bad.body.errors.join(' ')).toMatch(/Aussaatmonate/);
      }
    });

    test('sanitizes whitespace and control characters', async () => {
      const res = await request(app)
        .post('/api/plants')
        .send({
          ...validPlant,
          name: '  Kohl\u0000rabi \n  Sorte\u0007 ',
          companions: [' Salat ', 'Salat', 'Spinat'],
          season: ['autumn', 'spring', 'autumn'],
          tips: '  Zeile 1\nZeile 2\u0001  ',
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Kohlrabi Sorte');
      expect(res.body.companions).toEqual(['Salat', 'Spinat']);
      expect(res.body.season).toEqual(['spring', 'autumn']);
      expect(res.body.tips).toBe('Zeile 1\nZeile 2');
    });

    test('rejects markup in text fields, so stored data never carries tags', async () => {
      const payload = '<img src=x onerror=alert(1)>';
      for (const field of [
        'name',
        'category',
        'icon',
        'spacing',
        'germination',
        'harvest',
        'tips',
      ]) {
        const res = await request(app)
          .post('/api/plants')
          .send({ ...validPlant, [field]: payload });
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).not.toContain('onerror');
      }
      for (const field of ['companions', 'avoid']) {
        const res = await request(app)
          .post('/api/plants')
          .send({ ...validPlant, [field]: [payload] });
        expect(res.status).toBe(400);
      }
      expect(fs.existsSync(PLANTS_FILE)).toBe(false);
    });

    test('concurrent creates all land in the file (lock)', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          request(app)
            .post('/api/plants')
            .send({ ...validPlant, name: `Parallel ${i}` }),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const ids = customFile().map((p) => p.id);
      expect(ids).toHaveLength(28);
      expect(new Set(ids).size).toBe(28);
    });

    test('concurrent creates with the same id yield exactly one 201', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app).post('/api/plants').send(validPlant),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
    });
  });

  describe('PUT /api/plants/:id', () => {
    test('changes only the sowing months with PUT (#349)', async () => {
      const res = await request(app)
        .put('/api/plants/tomato')
        .send({ sowMonths: [5, 3] });
      expect(res.status).toBe(200);
      expect(res.body.sowMonths).toEqual([3, 5]);
      expect(res.body.name).toBe('Tomate');
      expect(
        (
          await request(app)
            .put('/api/plants/tomato')
            .send({ sowMonths: [14] })
        ).status,
      ).toBe(400);
    });

    test('changes only the sent fields and persists them', async () => {
      const res = await request(app)
        .put('/api/plants/tomato')
        .send({ name: 'Fleischtomate', water: 'high', season: ['summer'] });
      expect(res.status).toBe(200);
      const original = DEFAULTS.find((p) => p.id === 'tomato');
      expect(res.body).toEqual({
        ...original,
        name: 'Fleischtomate',
        water: 'high',
        season: ['summer'],
      });
      expect(customFile().find((p) => p.id === 'tomato')).toEqual(res.body);
      expect(customFile()).toHaveLength(20);
      expect((await request(app).get('/api/plants/tomato')).body).toEqual(
        res.body,
      );
    });

    test('keeps the order of the library', async () => {
      await request(app).put('/api/plants/carrot').send({ tips: 'Neu' });
      expect(customFile().map((p) => p.id)).toEqual(DEFAULTS.map((p) => p.id));
    });

    test('accepts the unchanged id in the body, rejects a different one', async () => {
      const same = await request(app)
        .put('/api/plants/tomato')
        .send({ id: 'tomato', tips: 'Neu' });
      expect(same.status).toBe(200);
      const other = await request(app)
        .put('/api/plants/tomato')
        .send({ id: 'other', tips: 'x' });
      expect(other.status).toBe(400);
      expect(other.body.errors[0]).toMatch(/ID/);
      expect((await request(app).get('/api/plants/tomato')).body.tips).toBe(
        'Neu',
      );
    });

    test('an update without changes does not write the file', async () => {
      const original = DEFAULTS.find((p) => p.id === 'tomato');
      const res = await request(app)
        .put('/api/plants/tomato')
        .send({ name: original.name });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(original);
      expect(fs.existsSync(PLANTS_FILE)).toBe(false);
    });

    test('404 for an unknown plant, nothing is written', async () => {
      const res = await request(app)
        .put('/api/plants/nope')
        .send({ name: 'x' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Plant not found' });
      expect(fs.existsSync(PLANTS_FILE)).toBe(false);
    });

    test('400 for invalid values and leaves the plant as it was', async () => {
      const res = await request(app)
        .put('/api/plants/tomato')
        .send({
          name: '',
          sun: 'moon',
          season: ['monsoon'],
          companions: 'Basilikum',
        });
      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveLength(4);
      expect(fs.existsSync(PLANTS_FILE)).toBe(false);
    });

    test('400 for non-object bodies', async () => {
      const res = await request(app).put('/api/plants/tomato').send([1]);
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/plants/:id', () => {
    test('deletes a default plant and copies the remaining defaults', async () => {
      const res = await request(app).delete('/api/plants/tomato');
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect((await request(app).get('/api/plants/tomato')).status).toBe(404);
      expect(customFile().map((p) => p.id)).toEqual(
        DEFAULTS.map((p) => p.id).filter((id) => id !== 'tomato'),
      );
    });

    test('404 when deleting twice or an unknown plant', async () => {
      await request(app).delete('/api/plants/tomato');
      const again = await request(app).delete('/api/plants/tomato');
      expect(again.status).toBe(404);
      expect(again.body).toEqual({ error: 'Plant not found' });
    });

    test('the library may become empty and stays empty (no fallback to defaults)', async () => {
      fs.writeFileSync(
        PLANTS_FILE,
        JSON.stringify([{ ...validPlant, id: 'only' }]),
      );
      expect((await request(app).delete('/api/plants/only')).status).toBe(204);
      expect(customFile()).toEqual([]);
      expect((await request(app).get('/api/plants')).body).toEqual([]);
    });

    test('deleting the file resets the library to the defaults without a restart', async () => {
      await request(app).delete('/api/plants/tomato');
      expect((await request(app).get('/api/plants')).body).toHaveLength(19);
      fs.rmSync(PLANTS_FILE);
      expect((await request(app).get('/api/plants')).body).toEqual(DEFAULTS);
    });
  });

  test('a failed write keeps the previous library and leaves no temp file', async () => {
    fs.writeFileSync(
      PLANTS_FILE,
      JSON.stringify([{ ...validPlant, id: 'kohlrabi' }]),
    );
    const before = fs.readFileSync(PLANTS_FILE, 'utf8');
    const rename = jest
      .spyOn(fs.promises, 'rename')
      .mockRejectedValue(Object.assign(new Error('disk'), { code: 'EIO' }));
    const res = await request(app)
      .post('/api/plants')
      .send({ ...validPlant, name: 'Zweite' });
    rename.mockRestore();
    expect(res.status).toBe(500);
    expect(fs.readFileSync(PLANTS_FILE, 'utf8')).toBe(before);
    expect(fs.existsSync(`${PLANTS_FILE}.tmp`)).toBe(false);
    // and the lock was released: the next write works
    expect(
      (
        await request(app)
          .post('/api/plants')
          .send({ ...validPlant, name: 'Dritte' })
      ).status,
    ).toBe(201);
  });
});

describe('plant audit log', () => {
  test('create, update and delete are audited, no-ops and 404s are not', async () => {
    jest.resetModules();
    const calls = [];
    jest.doMock('../src/server/logger', () => ({
      ...jest.requireActual('../src/server/logger'),
      audit: (event, details) => calls.push([event, details]),
    }));
    const service = require('../src/server/services/plant-service');
    try {
      await service.createPlant(validPlant);
      await service.updatePlant('kohlrabi', {
        name: 'Kohlrabi blau',
        water: 'high',
      });
      await service.updatePlant('kohlrabi', { name: 'Kohlrabi blau' }); // no change
      await service.deletePlant('kohlrabi');
      await service.deletePlant('kohlrabi'); // 404
    } finally {
      jest.dontMock('../src/server/logger');
    }
    expect(calls).toEqual([
      ['plant_library_initialized', { source: 'defaults', count: 20 }],
      [
        'plant_created',
        { plantId: 'kohlrabi', name: 'Kohlrabi', category: 'Gemüse' },
      ],
      ['plant_updated', { plantId: 'kohlrabi', changes: ['name', 'water'] }],
      ['plant_deleted', { plantId: 'kohlrabi', name: 'Kohlrabi blau' }],
    ]);
  });
});

describe('validatePlant / sanitizePlantData', () => {
  test('accepts the complete default data', () => {
    for (const plant of DEFAULTS) {
      const result = validatePlant(plant, { allowId: true });
      expect({ id: plant.id, errors: result.errors }).toEqual({
        id: plant.id,
        errors: [],
      });
    }
  });

  test('requires name and category on create but not on partial updates', () => {
    expect(validatePlant({}).valid).toBe(false);
    expect(validatePlant({}).errors).toHaveLength(2);
    expect(validatePlant({}, { partial: true }).valid).toBe(true);
    expect(validatePlant({ name: '   ', category: 'x' }).valid).toBe(false);
    expect(validatePlant({ name: 'x', category: '   ' }).valid).toBe(false);
  });

  test('enforces length limits at the boundary', () => {
    const base = { name: 'x', category: 'y' };
    expect(validatePlant({ ...base, name: 'a'.repeat(60) }).valid).toBe(true);
    expect(validatePlant({ ...base, name: 'a'.repeat(61) }).valid).toBe(false);
    expect(validatePlant({ ...base, category: 'a'.repeat(41) }).valid).toBe(
      false,
    );
    expect(validatePlant({ ...base, tips: 'a'.repeat(1000) }).valid).toBe(true);
    expect(validatePlant({ ...base, tips: 'a'.repeat(1001) }).valid).toBe(
      false,
    );
    expect(validatePlant({ ...base, spacing: 'a'.repeat(31) }).valid).toBe(
      false,
    );
    expect(validatePlant({ ...base, germination: 'a'.repeat(41) }).valid).toBe(
      false,
    );
    expect(validatePlant({ ...base, harvest: 'a'.repeat(61) }).valid).toBe(
      false,
    );
    expect(
      validatePlant({ ...base, companions: Array(30).fill('a') }).valid,
    ).toBe(true);
    expect(
      validatePlant({ ...base, companions: Array(31).fill('a') }).valid,
    ).toBe(false);
    expect(validatePlant({ ...base, avoid: ['a'.repeat(61)] }).valid).toBe(
      false,
    );
    expect(validatePlant({ ...base, avoid: [''] }).valid).toBe(false);
  });

  test('counts the icon in code points, not UTF-16 units', () => {
    const base = { name: 'x', category: 'y' };
    expect(validatePlant({ ...base, icon: '🌱' }).valid).toBe(true);
    expect(validatePlant({ ...base, icon: '👩‍🌾' }).valid).toBe(true); // ZWJ sequence
    expect(validatePlant({ ...base, icon: '' }).valid).toBe(false);
    expect(validatePlant({ ...base, icon: 'abcdefghi' }).valid).toBe(false);
  });

  test('rejects wrong types', () => {
    const base = { name: 'x', category: 'y' };
    for (const patch of [
      { name: 5 },
      { category: {} },
      { icon: 1 },
      { tips: ['a'] },
      { spacing: null },
      { season: 'spring' },
      { companions: [1] },
      { avoid: {} },
      { difficulty: 1 },
    ]) {
      expect(validatePlant({ ...base, ...patch }).valid).toBe(false);
    }
  });

  test('checks the id format only when ids are allowed', () => {
    const base = { name: 'x', category: 'y' };
    for (const id of [
      'Tomate',
      'to mato',
      '-a',
      'a-',
      'a--b',
      'ä',
      '',
      'a'.repeat(41),
      5,
    ]) {
      expect(validatePlant({ ...base, id }, { allowId: true }).valid).toBe(
        false,
      );
    }
    expect(
      validatePlant({ ...base, id: 'a-b-2' }, { allowId: true }).valid,
    ).toBe(true);
    expect(validatePlant({ ...base, id: 'A b' }).valid).toBe(true); // ignored without allowId
  });

  test('sanitizePlantData only returns known, sent fields', () => {
    expect(
      sanitizePlantData({
        name: ' A ',
        other: 1,
        season: ['winter', 'spring'],
      }),
    ).toEqual({
      name: 'A',
      season: ['spring', 'winter'],
    });
  });

  test('sowMonths: empty list is allowed, sanitizing sorts and de-duplicates', () => {
    const base = { name: 'A', category: 'B' };
    expect(validatePlant({ ...base, sowMonths: [] }).valid).toBe(true);
    expect(validatePlant({ ...base, sowMonths: [12, 1] }).valid).toBe(true);
    expect(validatePlant({ ...base, sowMonths: [0] }).valid).toBe(false);
    expect(sanitizePlantData({ sowMonths: [12, 1, 12, 6] })).toEqual({
      sowMonths: [1, 6, 12],
    });
  });

  test('all default plants pass validation and carry readable sowing data (#349)', () => {
    for (const plant of DEFAULTS) {
      expect(validatePlant(plant).valid).toBe(true);
      expect(Array.isArray(plant.sowMonths)).toBe(true);
    }
  });

  test('slugify handles umlauts, sharp s, punctuation and length', () => {
    expect(slugify('Süße Möhre')).toBe('susse-mohre');
    expect(slugify('  Grünkohl (Sorte 2) ')).toBe('grunkohl-sorte-2');
    expect(slugify('Æ')).toBe('');
    expect(slugify('a'.repeat(60))).toHaveLength(40);
    expect(slugify('abc-'.repeat(20)).endsWith('-')).toBe(false);
  });
});
