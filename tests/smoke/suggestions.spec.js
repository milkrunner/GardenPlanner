// Aussaat- und Ernte-Vorschläge in Chromium gegen den echten Server (#349): Liste aus den Standardpflanzen zu einem
// festen Datum, "Übernehmen" füllt nur das Formular (es wird nichts angelegt), erst Absenden speichert, plus axe
// (hell/dunkel). Eigener Server pro Test (harness.js): das API-Rate-Limit zählt auch die Seitenaufrufe.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { startApp } = require('./harness');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

let app;
test.beforeEach(async () => {
  app = await startApp('gardenplanner-suggestions-');
});
test.afterEach(async () => {
  if (app) await app.stop();
  app = undefined;
});

async function prepare(page, theme = 'light') {
  await page.addInitScript(
    (value) => localStorage.setItem('theme', value),
    theme,
  );
  // 15. März 2026, 12:00 Uhr Ortszeit: Tomate (Feb-Apr) ist im Aussaatfenster, Zucchini (Apr-Mai) beginnt in 17 Tagen
  await page.clock.setFixedTime(new Date(2026, 2, 15, 12, 0, 0));
  await page.route('**/*', (route) =>
    route.request().url().startsWith(app.baseURL)
      ? route.continue()
      : route.abort(),
  );
}
const storedTasks = async (request) =>
  (await request.get(`${app.baseURL}/api/tasks`)).json();

async function axeViolations(page) {
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

test('suggestions fill the form and only the submit creates a task', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page);
  await page.goto(`${app.baseURL}/index`);

  const section = page.getByRole('region', { name: 'Empfohlene Aufgaben' });
  await expect(section).toContainText('allgemeinen Richtwerten');
  await expect(section).toContainText('ohne');
  const tomato = section.locator('.suggestion-item', { hasText: 'Tomate' });
  await expect(tomato).toContainText('Aussaat: jetzt möglich');
  await expect(tomato).toContainText('frühestens ab');
  // Pflanzen mit Fenster ab April erscheinen mit Startdatum, solche ohne baldiges Fenster nicht
  await expect(
    section.locator('.suggestion-item', { hasText: 'Zucchini' }),
  ).toContainText('möglich ab');
  await expect(
    section.locator('.suggestion-item', { hasText: 'Bohne' }),
  ).toHaveCount(0);
  // Mehrjährige Pflanzen ohne Erntedauer: kein Erntetermin
  await expect(
    section.locator('.suggestion-item', { hasText: 'Lavendel' }),
  ).toContainText('kein Erntetermin berechenbar');
  expect(await axeViolations(page)).toEqual([]);

  // Übernehmen: Formular gefüllt, Standort leer und fokussiert, nichts gespeichert
  await section
    .getByRole('button', { name: 'Aussaat übernehmen: Tomate' })
    .click();
  await expect(page.locator('#taskTitle')).toHaveValue('Tomate aussäen');
  await expect(page.locator('#taskDueDate')).toHaveValue('2026-03-15');
  await expect(page.locator('#taskPlant')).toHaveValue('tomato');
  await expect(page.locator('#taskDescription')).toHaveValue(/Richtwert/);
  await expect(page.locator('#taskLocation')).toBeFocused();
  expect(await storedTasks(request)).toEqual([]);

  // Die Nutzerin ändert den Titel, ergänzt den Standort und bestätigt
  await page.locator('#taskTitle').fill('Tomaten vorziehen');
  await page.locator('#taskLocation').fill('Fensterbank');
  const created = page.waitForResponse(
    (response) =>
      response.url() === `${app.baseURL}/api/tasks` &&
      response.request().method() === 'POST',
  );
  await page.locator('#taskForm button[type="submit"]').click();
  expect((await created).status()).toBe(201);
  const [task] = await storedTasks(request);
  expect(task).toMatchObject({
    title: 'Tomaten vorziehen',
    location: 'Fensterbank',
    plantId: 'tomato',
    dueDate: '2026-03-15',
  });

  // Ernte: 60 Tage nach der Aussaat am 15.03. (Mindestdauer der Tomate)
  await section
    .getByRole('button', { name: 'Ernte übernehmen: Tomate' })
    .click();
  await expect(page.locator('#taskTitle')).toHaveValue('Tomate ernten');
  await expect(page.locator('#taskDueDate')).toHaveValue('2026-05-14');
  expect(await storedTasks(request)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('suggestions page is accessible in the dark theme and follows the library', async ({
  page,
  request,
}) => {
  await prepare(page, 'dark');
  // Eigene Bibliothek ohne Aussaatmonate: Saison (Sommer) gilt, im März gibt es keinen Vorschlag für sie
  expect(
    (
      await request.post(`${app.baseURL}/api/plants`, {
        data: {
          name: 'Kürbis-Test',
          category: 'Gemüse',
          season: ['summer'],
          harvest: 'mehrjährig',
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto(`${app.baseURL}/index`);
  const section = page.getByRole('region', { name: 'Empfohlene Aufgaben' });
  await expect(
    section.locator('.suggestion-item', { hasText: 'Tomate' }),
  ).toBeVisible();
  await expect(
    section.locator('.suggestion-item', { hasText: 'Kürbis-Test' }),
  ).toHaveCount(0);
  expect(await axeViolations(page)).toEqual([]);
});
