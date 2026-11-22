// Statische Auslieferung (#338): Seiten, public/ und die Browser-Dateien src/js und src/css werden
// ausgeliefert, tests/, docs/ und der Server-Quelltext src/server nie.
const request = require('supertest');
const { app } = require('../src/server/app');

describe('statische Pfade', () => {
  test.each([
    '/tests/',
    '/tests/security-test.html',
    '/docs/',
    '/docs/openapi.json',
    '/docs/API.md',
    '/src/server/config.js',
    '/src/server/app.js',
    '/src/server/defaults/default-plants.json',
    '/src/',
    '/src/js/../server/config.js',
  ])('%s wird nicht ausgeliefert', async (url) => {
    expect((await request(app).get(url)).status).toBe(404);
  });

  test.each([
    '/',
    '/dashboard',
    '/statistics',
    '/plants',
    '/logs',
    '/public/index.html',
    '/src/js/app.js',
    '/src/css/styles.css',
  ])('%s wird ausgeliefert', async (url) => {
    expect((await request(app).get(url)).status).toBe(200);
  });
});
