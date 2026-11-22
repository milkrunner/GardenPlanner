// With API_KEY set the UI must ask for the key, use it, and never mask failures (#322, #324).
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { startApp } = require('./harness');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const KEY = 'smoke-test-key-123';
let app;
test.beforeEach(async () => {
  app = await startApp('gardenplanner-auth-', { apiKey: KEY });
});
test.afterEach(async () => {
  if (app) await app.stop();
  app = undefined;
});

async function open(page, name = 'dashboard', beforeGoto) {
  await page.route('**/*', (route) =>
    route.request().url().startsWith(app.baseURL)
      ? route.continue()
      : route.abort(),
  );
  // Routes registered later win, so test-specific stubs go in after the catch-all.
  if (beforeGoto) await beforeGoto();
  await page.goto(`${app.baseURL}/${name}`);
}

test('asks for the API key, loads server data with it and remembers it', async ({
  page,
  request,
}) => {
  const created = await request.post(`${app.baseURL}/api/tasks`, {
    headers: { 'X-API-Key': KEY },
    data: { title: 'Serveraufgabe', employee: 'Ada', location: 'Beet' },
  });
  expect(created.status()).toBe(201);

  await open(page);
  const dialog = page.getByRole('dialog', { name: 'API-Key erforderlich' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'API-Key' })).toBeFocused();

  await page.getByRole('textbox', { name: 'API-Key' }).fill('falsch');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toContainText('abgelehnt');

  await page.getByRole('textbox', { name: 'API-Key' }).fill(KEY);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator('.task-card', { hasText: 'Serveraufgabe' }),
  ).toBeVisible();
  await expect(page.locator('#gpStatusBar')).toHaveCount(0);

  // Reload: stored key is verified silently, no dialog.
  await page.reload();
  await expect(
    page.locator('.task-card', { hasText: 'Serveraufgabe' }),
  ).toBeVisible();
  await expect(page.locator('#apiKeyModal')).toHaveCount(0);
});

test('declining shows an error bar instead of stale local data', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'gartenplaner_tasks',
      JSON.stringify([
        {
          id: 'x',
          title: 'Veraltet',
          employee: '',
          location: 'A',
          status: 'pending',
          createdAt: new Date().toISOString(),
          history: [],
          subtasks: [],
        },
      ]),
    ),
  );
  await open(page);
  await page.getByRole('button', { name: 'Später' }).click();
  const bar = page.locator('#gpStatusBar');
  await expect(bar).toContainText('API-Key fehlt');
  await expect(bar).toHaveAttribute('role', 'alert');
  await expect(page.locator('.task-card', { hasText: 'Veraltet' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('plants page authenticates too', async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem('gardenplanner_api_key', key),
    KEY,
  );
  await open(page, 'plants');
  await expect(page.locator('#plantGrid .plant-card').first()).toBeVisible();
});

test('a server error is reported, not hidden behind local data', async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem('gardenplanner_api_key', key),
    KEY,
  );
  await open(page, 'dashboard', async () => {
    await page.route('**/api/tasks', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":"Interner Fehler"}',
      }),
    );
  });
  await expect(page.locator('#gpStatusBar')).toContainText(
    'Aufgaben konnten nicht geladen werden',
  );
});

test('a network failure falls back to the local copy and says so', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem('gardenplanner_api_key', key);
    localStorage.setItem(
      'gartenplaner_tasks',
      JSON.stringify([
        {
          id: 'y',
          title: 'Lokale Kopie',
          employee: '',
          location: 'A',
          status: 'pending',
          createdAt: new Date().toISOString(),
          history: [],
          subtasks: [],
        },
      ]),
    );
  }, KEY);
  await open(page, 'dashboard', () =>
    page.route('**/api/tasks', (route) => route.abort('connectionfailed')),
  );
  await expect(page.locator('#gpStatusBar')).toContainText('lokale Kopie');
  await expect(
    page.locator('.task-card', { hasText: 'Lokale Kopie' }),
  ).toBeVisible();
});

for (const theme of ['light', 'dark']) {
  test(`key dialog has no axe violations (${theme})`, async ({ page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem('theme', value),
      theme,
    );
    await open(page, 'index');
    await expect(
      page.getByRole('dialog', { name: 'API-Key erforderlich' }),
    ).toBeVisible();
    // Let entrance animations finish: mid-fade colors yield false contrast results.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      ),
    );
    await page.evaluate(AXE);
    const violations = await page.evaluate(async () => {
      const result = await window.axe.run(
        document.querySelector('#apiKeyModal'),
      );
      return result.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      );
    });
    expect(violations).toEqual([]);
  });
}
