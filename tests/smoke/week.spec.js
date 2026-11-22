// Wochenansicht in Chromium gegen den echten Server (#348): Aufgabe mit Datum erscheint am richtigen Tag,
// Navigation, Datum per Dialog ändern, Bedienung per Tastatur. Eigener Server pro Test (harness.js).
const { test, expect } = require('@playwright/test');
const { startApp } = require('./harness');

let app;
test.beforeEach(async () => {
  app = await startApp('gardenplanner-week-');
});
test.afterEach(async () => {
  if (app) await app.stop();
  app = undefined;
});

const iso = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const mondayOf = (date) => addDays(date, -((date.getDay() + 6) % 7));

async function seed(request, tasks) {
  for (const data of tasks) {
    const res = await request.post(`${app.baseURL}/api/tasks`, { data });
    expect(res.status()).toBe(201);
  }
}
async function openWeek(page) {
  await page.route('**/*', (route) =>
    route.request().url().startsWith(app.baseURL)
      ? route.continue()
      : route.abort(),
  );
  await page.goto(`${app.baseURL}/dashboard`);
  await page.getByRole('button', { name: 'Woche', exact: true }).click();
}
const day = (page, date) =>
  page
    .locator('.week-day')
    .filter({ has: page.locator(`time[datetime="${iso(date)}"]`) });

test('a task with a due date appears on the right day, undated ones in their own list', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const monday = mondayOf(new Date());
  const friday = addDays(monday, 4);
  await seed(request, [
    { title: 'Freitagsarbeit', location: 'Beet', dueDate: iso(friday) },
    { title: 'Montagsarbeit', location: 'Wiese', dueDate: iso(monday) },
    { title: 'Ohne Datum', location: 'Beet' },
    {
      title: 'Naechste Woche',
      location: 'Beet',
      dueDate: iso(addDays(monday, 8)),
    },
  ]);
  await openWeek(page);

  await expect(page.locator('#tasksList')).toBeHidden();
  await expect(page.locator('#weekTitle')).toContainText('KW');
  await expect(page.locator('.week-day')).toHaveCount(7);
  await expect(day(page, friday).locator('.week-task')).toHaveText([
    /Freitagsarbeit/,
  ]);
  await expect(day(page, monday).locator('.week-task')).toHaveText([
    /Montagsarbeit/,
  ]);
  await expect(page.locator('#weekUndated .week-task')).toHaveText([
    /Ohne Datum/,
  ]);
  await expect(
    page.locator('#tasksWeek').getByText('Naechste Woche'),
  ).toHaveCount(0);

  // vor/zurück/heute
  await page.getByRole('button', { name: /Nächste Woche/ }).click();
  await expect(
    page.locator('#tasksWeek').getByText('Naechste Woche'),
  ).toBeVisible();
  await expect(
    page.locator('#tasksWeek').getByText('Freitagsarbeit'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /Vorherige Woche/ }).click();
  await page.getByRole('button', { name: /Vorherige Woche/ }).click();
  await expect(page.locator('.week-day .week-task')).toHaveCount(0);
  await page.getByRole('button', { name: 'Heute', exact: true }).click();
  await expect(day(page, friday).locator('.week-task')).toHaveCount(1);

  // heutiger Tag ist als Text markiert
  await expect(
    page.locator('.week-day[aria-current="date"] .week-today-flag'),
  ).toHaveText('Heute');

  // zurück zur Liste
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(page.locator('#tasksList')).toBeVisible();
  await expect(page.locator('#tasksWeek')).toBeHidden();
  expect(errors).toEqual([]);
});

test('change the date in the dialog by keyboard: the task moves and keeps focus', async ({
  page,
  request,
}) => {
  const monday = mondayOf(new Date());
  const tuesday = addDays(monday, 1);
  const thursday = addDays(monday, 3);
  await seed(request, [
    { title: 'Umziehen', location: 'Beet', dueDate: iso(tuesday) },
  ]);
  await openWeek(page);
  const task = day(page, tuesday).locator('.week-task');
  await task.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Aufgabe bearbeiten/ });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#editTaskDueDate')).toHaveValue(iso(tuesday));
  await page.locator('#editTaskDueDate').fill(iso(thursday));
  await page.locator('#editTaskForm button[type="submit"]').click();
  await expect(dialog).toBeHidden();
  await expect(day(page, tuesday).locator('.week-task')).toHaveCount(0);
  const moved = day(page, thursday).locator('.week-task');
  await expect(moved).toHaveCount(1);
  await expect(moved).toBeFocused();
  const stored = await (await request.get(`${app.baseURL}/api/tasks`)).json();
  expect(stored[0].dueDate).toBe(iso(thursday));

  // Datum entfernen: Aufgabe steht danach ohne Termin
  await page.keyboard.press('Enter');
  await page.locator('#editTaskDueDate').fill('');
  await page.locator('#editTaskForm button[type="submit"]').click();
  await expect(page.locator('#weekUndated .week-task')).toHaveCount(1);
});

test('week view respects filters and is usable at phone width', async ({
  page,
  request,
}) => {
  const monday = mondayOf(new Date());
  await seed(request, [
    {
      title: 'Von Ada',
      employee: 'Ada',
      location: 'Beet',
      dueDate: iso(monday),
    },
    {
      title: 'Von Max',
      employee: 'Max',
      location: 'Beet',
      dueDate: iso(monday),
    },
  ]);
  await page.setViewportSize({ width: 360, height: 740 });
  await openWeek(page);
  await expect(page.locator('.week-task')).toHaveCount(2);
  await page.locator('#filterEmployee').selectOption('Max');
  await expect(page.locator('.week-task')).toHaveText([/Von Max/]);
  await page.locator('#filterEmployee').selectOption('');
  await page.getByLabel('Aufgaben durchsuchen').fill('ada');
  await expect(page.locator('.week-task')).toHaveText([/Von Ada/]);
  // kein horizontales Scrollen der Seite
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
