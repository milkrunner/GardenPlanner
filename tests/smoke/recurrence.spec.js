// Wiederholende Aufgaben: die Folgeaufgabe entsteht auf dem Server, die Oberfläche übernimmt sie (#327).
// Eigener Server pro Test (harness.js): das API-Rate-Limit zählt auch die Seitenaufrufe.
const { test, expect } = require('@playwright/test');
const { startApp } = require('./harness');

let app;
test.beforeEach(async () => {
  app = await startApp('gardenplanner-recurrence-');
});
test.afterEach(async () => {
  if (app) await app.stop();
  app = undefined;
});

test('completing a recurring task shows the follow-up created by the server', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    route.request().url().startsWith(app.baseURL)
      ? route.continue()
      : route.abort(),
  );
  const created = await request.post(`${app.baseURL}/api/tasks`, {
    data: {
      title: 'Smoke Wiederholung',
      location: 'Testbeet',
      recurrence: 'weekly',
    },
  });
  expect(created.status()).toBe(201);
  await page.goto(`${app.baseURL}/dashboard`);
  const cards = page
    .locator('.task-card')
    .filter({ hasText: 'Smoke Wiederholung' });
  await expect(cards).toHaveCount(1);
  const completed = page.waitForResponse(
    (response) =>
      response.url().startsWith(`${app.baseURL}/api/tasks/`) &&
      response.request().method() === 'PUT',
  );
  const complete = { name: 'Als erledigt markieren', exact: true };
  await cards.first().getByRole('button', complete).click();
  expect((await completed).status()).toBe(200);
  // Folgeaufgabe sofort sichtbar (aus der PUT-Antwort) und nach dem Neuladen weiterhin da
  await expect(cards).toHaveCount(2);
  await expect(cards.getByRole('button', complete)).toHaveCount(1);
  await page.reload();
  await expect(cards).toHaveCount(2);
  await expect(cards.getByRole('button', complete)).toHaveCount(1);
  const tasks = await (await request.get(`${app.baseURL}/api/tasks`)).json();
  expect(tasks.map((task) => task.status).sort()).toEqual([
    'completed',
    'pending',
  ]);
  expect(errors).toEqual([]);
});
