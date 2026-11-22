// Pflanzenreferenz an Aufgaben in Chromium gegen den echten Server (#347): Auswahl im Formular, Karte mit Link,
// Ändern und Entfernen im Bearbeiten-Dialog, verwaiste Referenz nach dem Löschen der Pflanze, Pflanzenseite per Link.
// Eigener Server pro Test (harness.js): das API-Rate-Limit zählt auch die Seitenaufrufe.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { startApp } = require('./harness');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

let app;
test.beforeEach(async () => {
  app = await startApp('gardenplanner-plantref-');
});
test.afterEach(async () => {
  if (app) await app.stop();
  app = undefined;
});

async function offline(page, theme = 'light') {
  await page.addInitScript(
    (value) => localStorage.setItem('theme', value),
    theme,
  );
  await page.route('**/*', (route) =>
    route.request().url().startsWith(app.baseURL)
      ? route.continue()
      : route.abort(),
  );
}
const storedTasks = async (request) =>
  (await request.get(`${app.baseURL}/api/tasks`)).json();

async function axeViolations(page) {
  // Einblend-Animationen abwarten: Farben mitten im Überblenden ergeben falsche Kontrastwerte.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  await page.evaluate(AXE);
  const result = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
      },
    }),
  );
  return result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
}

test('choose, change, remove and orphan a plant reference through the UI', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await offline(page);
  await page.goto(`${app.baseURL}/index`);

  // Anlegen: Auswahl ist beschriftet, "Keine Pflanze" ist die Vorgabe, Standardpflanzen stehen zur Wahl
  const select = page.getByLabel('Pflanze', { exact: false });
  await expect(select).toHaveValue('');
  await expect(select.locator('option').first()).toHaveText('Keine Pflanze');
  await page.locator('#taskTitle').fill('Tomaten gießen');
  await page.locator('#taskLocation').fill('Gewächshaus');
  await page.locator('#taskPlant').selectOption('tomato');
  const created = page.waitForResponse(
    (response) =>
      response.url() === `${app.baseURL}/api/tasks` &&
      response.request().method() === 'POST',
  );
  await page.locator('#taskForm button[type="submit"]').click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().plantId).toBe('tomato');
  await expect(page.locator('#taskPlant')).toHaveValue('');
  expect((await storedTasks(request))[0].plantId).toBe('tomato');

  // Karte: Icon und Name als Link zur Pflanzenseite
  await page.goto(`${app.baseURL}/dashboard`);
  const card = page.locator('.task-card'); // einzige Aufgabe, bleibt nach dem Umbenennen gültig
  const link = card.locator('.task-plant a');
  await expect(link).toContainText('Tomate');
  await expect(link).toHaveAttribute('href', '/plants?plant=tomato');
  expect(await axeViolations(page)).toEqual([]);

  // Ändern im Bearbeiten-Dialog
  await card
    .getByRole('button', { name: 'Aufgabe bearbeiten', exact: true })
    .click();
  await expect(page.locator('#editTaskPlant')).toHaveValue('tomato');
  await page.getByLabel('Pflanze (optional)').selectOption('basil');
  await page.locator('#editTaskForm button[type="submit"]').click();
  await expect(card.locator('.task-plant a')).toContainText('Basilikum');
  await expect
    .poll(async () => (await storedTasks(request))[0].plantId)
    .toBe('basil');

  // Pflanze wird gelöscht: Aufgabe bleibt gültig, Karte nennt die verwaiste Referenz als Text
  expect(
    (await request.delete(`${app.baseURL}/api/plants/basil`)).status(),
  ).toBe(204);
  await page.reload();
  await expect(card.locator('.task-plant-missing')).toContainText(
    'Pflanze nicht mehr vorhanden',
  );
  await expect(card.locator('.task-plant a')).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);

  // Bearbeiten ohne die Referenz anzufassen behält sie; Entfernen speichert null
  await card
    .getByRole('button', { name: 'Aufgabe bearbeiten', exact: true })
    .click();
  await expect(page.locator('#editTaskPlant')).toHaveValue('basil');
  await page.locator('#editTaskTitle').fill('Basilikum gießen');
  await page.locator('#editTaskForm button[type="submit"]').click();
  await expect(card.locator('.task-title')).toHaveText('Basilikum gießen');
  await expect
    .poll(async () => (await storedTasks(request))[0].title)
    .toBe('Basilikum gießen');
  expect((await storedTasks(request))[0].plantId).toBe('basil');

  await card
    .getByRole('button', { name: 'Aufgabe bearbeiten', exact: true })
    .click();
  await page.locator('#editTaskPlant').selectOption('');
  await page.locator('#editTaskForm button[type="submit"]').click();
  await expect(card.locator('.task-plant-missing')).toHaveCount(0);
  await expect
    .poll(async () => (await storedTasks(request))[0].plantId)
    .toBeNull();
  expect(errors).toEqual([]);
});

test('the card link opens the plant details; a removed plant shows a notice', async ({
  page,
  request,
}) => {
  await offline(page, 'dark');
  const res = await request.post(`${app.baseURL}/api/tasks`, {
    data: { title: 'Tomaten gießen', location: 'Beet', plantId: 'tomato' },
  });
  expect(res.status()).toBe(201);

  await page.goto(`${app.baseURL}/dashboard`);
  await page.locator('.task-plant a').click();
  await expect(page).toHaveURL(/\/plants\?plant=tomato$/);
  const modal = page.locator('#plantModal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#plantModalTitle')).toContainText('Tomate');
  expect(await axeViolations(page)).toEqual([]);

  await page.goto(`${app.baseURL}/plants?plant=gone-plant`);
  await expect(page.locator('#plantNotice')).toContainText(
    'nicht mehr vorhanden',
  );
  await expect(modal).toBeHidden();
});
