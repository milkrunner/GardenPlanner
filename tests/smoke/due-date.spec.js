// Fälligkeitsdatum in Chromium gegen den echten Server (#346): anlegen, ändern, entfernen, filtern, sortieren.
// Eigener Server pro Test (harness.js): das API-Rate-Limit zählt auch die Seitenaufrufe.
const { test, expect } = require('@playwright/test');
const { startApp } = require('./harness');

let app;
test.beforeEach(async () => {
  app = await startApp('gardenplanner-due-');
});
test.afterEach(async () => {
  if (app) await app.stop();
  app = undefined;
});

async function offline(page) {
  await page.route('**/*', (route) =>
    route.request().url().startsWith(app.baseURL)
      ? route.continue()
      : route.abort(),
  );
}
const storedTasks = async (request) =>
  (await request.get(`${app.baseURL}/api/tasks`)).json();

test('create, edit and remove a due date through the UI', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await offline(page);
  await page.goto(`${app.baseURL}/index`);

  // Anlegen mit Datum (Feld ist beschriftet und per Label erreichbar)
  await page.locator('#taskTitle').fill('Smoke Termin');
  await page.locator('#taskLocation').fill('Testbeet');
  await page.getByLabel('Fällig am').fill('2020-03-15');
  const created = page.waitForResponse(
    (response) =>
      response.url() === `${app.baseURL}/api/tasks` &&
      response.request().method() === 'POST',
  );
  await page.locator('#taskForm button[type="submit"]').click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().dueDate).toBe('2020-03-15');
  await expect(page.locator('#taskDueDate')).toHaveValue('');
  expect((await storedTasks(request))[0].dueDate).toBe('2020-03-15');

  // Karte: deutsches Datum, Überfällig-Hinweis als Text, Kennzahl im Dashboard
  await page.goto(`${app.baseURL}/dashboard`);
  const card = page.locator('.task-card').filter({ hasText: 'Smoke Termin' });
  await expect(card.locator('.task-due-date')).toContainText('15.03.2020');
  await expect(card.locator('.task-due-date')).toContainText('Überfällig');
  await expect(page.locator('#statOverdue')).toHaveText('1');

  // Ändern im Bearbeiten-Dialog
  await card
    .getByRole('button', { name: 'Aufgabe bearbeiten', exact: true })
    .click();
  await expect(page.locator('#editTaskDueDate')).toHaveValue('2020-03-15');
  await page.getByLabel('Fällig am (optional)').fill('2099-12-31');
  await page.locator('#editTaskForm button[type="submit"]').click();
  await expect(card.locator('.task-due-date')).toContainText('31.12.2099');
  await expect(card.locator('.task-due-date')).not.toContainText('Überfällig');
  await expect(page.locator('#statOverdue')).toHaveText('0');
  await expect
    .poll(async () => (await storedTasks(request))[0].dueDate)
    .toBe('2099-12-31');

  // Entfernen: Feld leeren speichert null, die Karte zeigt kein Datum mehr
  await card
    .getByRole('button', { name: 'Aufgabe bearbeiten', exact: true })
    .click();
  await page.locator('#editTaskDueDate').fill('');
  await page.locator('#editTaskForm button[type="submit"]').click();
  await expect(card.locator('.task-due-date')).toHaveCount(0);
  await expect
    .poll(async () => (await storedTasks(request))[0].dueDate)
    .toBeNull();
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card.locator('.task-due-date')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dashboard filters and sorts by due date', async ({ page, request }) => {
  await offline(page);
  for (const [title, dueDate] of [
    ['Spaeter', '2099-06-01'],
    ['Ohne Termin', null],
    ['Ueberfaellig', '2020-01-01'],
  ]) {
    const res = await request.post(`${app.baseURL}/api/tasks`, {
      data: { title, location: 'Beet', dueDate },
    });
    expect(res.status()).toBe(201);
  }
  await page.goto(`${app.baseURL}/dashboard`);
  const titles = page.locator('.task-card .task-title');
  await expect(titles).toHaveText(['Spaeter', 'Ohne Termin', 'Ueberfaellig']);

  await page.getByLabel('Nach Fälligkeit:').selectOption('overdue');
  await expect(titles).toHaveText(['Ueberfaellig']);
  await page.getByLabel('Nach Fälligkeit:').selectOption('none');
  await expect(titles).toHaveText(['Ohne Termin']);
  await page.getByLabel('Nach Fälligkeit:').selectOption('');

  await page.getByLabel('Sortierung:').selectOption('dueDate');
  await expect(titles).toHaveText(['Ueberfaellig', 'Spaeter', 'Ohne Termin']);
  await expect(page.locator('.task-card').first()).toHaveAttribute(
    'draggable',
    'false',
  );
  await page.getByLabel('Sortierung:').selectOption('manual');
  await expect(titles).toHaveText(['Spaeter', 'Ohne Termin', 'Ueberfaellig']);
});
