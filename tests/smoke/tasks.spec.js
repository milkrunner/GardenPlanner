const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let root;
let server;
let baseURL;
test.beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gardenplanner-smoke-'));
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = path.join(root, 'data');
  process.env.LOG_DIR = path.join(root, 'logs');
  process.env.LOG_LEVEL = 'silent';
  delete process.env.API_KEY;
  const { app } = require('../../src/server/app');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  if (server)
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  if (root) fs.rmSync(root, { recursive: true, force: true });
});
test('create, edit and archive persist across reloads', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  // The task flow must work without third-party network services.
  await page.route('**/*', (route) =>
    route.request().url().startsWith(baseURL)
      ? route.continue()
      : route.abort(),
  );
  await page.goto(baseURL);
  await page.locator('#taskTitle').fill('Smoke Tomaten');
  await page.locator('#taskLocation').fill('Testbeet');
  const created = page.waitForResponse(
    (response) =>
      response.url() === `${baseURL}/api/tasks` &&
      response.request().method() === 'POST',
  );
  await page.locator('#taskForm button[type="submit"]').click();
  expect((await created).status()).toBe(201);
  await page.goto(`${baseURL}/dashboard`);
  let card = page.locator('.task-card').filter({ hasText: 'Smoke Tomaten' });
  await expect(card).toBeVisible();
  await page.reload();
  await expect(card).toBeVisible();
  await card
    .getByRole('button', { name: 'Aufgabe bearbeiten', exact: true })
    .click();
  await page.locator('#editTaskTitle').fill('Smoke Gurken');
  await page.locator('#editTaskForm button[type="submit"]').click();
  card = page.locator('.task-card').filter({ hasText: 'Smoke Gurken' });
  await expect(card).toBeVisible();
  await card
    .getByRole('button', { name: 'Aufgabe archivieren', exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await page.locator('#toggleArchiveBtn').click();
  await expect(card).toBeVisible();
  const archived = await (
    await request.get(`${baseURL}/api/archived-tasks`)
  ).json();
  expect(archived.some((task) => task.title === 'Smoke Gurken')).toBe(true);
  const active = await (await request.get(`${baseURL}/api/tasks`)).json();
  expect(active).toEqual([]);
  expect(errors).toEqual([]);
});
