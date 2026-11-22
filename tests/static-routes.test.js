// Statische Auslieferung (#338): Seiten, public/ und src/ werden ausgeliefert,
// tests/ und docs/ nie (die manuellen Testseiten sind entfernt).
const request = require('supertest');
const { app } = require('../src/server/app');

describe('statische Pfade', () => {
  test.each([
    '/tests/',
    '/tests/security-test.html',
    '/docs/',
    '/docs/openapi.json',
    '/docs/API.md',
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
  ])('%s wird ausgeliefert', async (url) => {
    expect((await request(app).get(url)).status).toBe(200);
  });
});
