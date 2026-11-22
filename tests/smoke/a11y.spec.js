// Accessibility, keyboard and escaping smoke in real Chromium (axe-core + Express).
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { startApp } = require('./harness');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const HOSTILE = '<img src=x onerror=alert(1)><b>fett</b>';
const PAGES = ['index', 'dashboard', 'statistics', 'plants', 'logs'];

// The app rate-limits to 100 requests/15 min per IP and every page load fetches
// ~20 assets, so each test gets its own app instance and seed data.
let app;
test.beforeEach(async ({ request }) => {
  app = await startApp('gardenplanner-a11y-');
  await seed(request);
});
test.afterEach(async () => {
  if (app) await app.stop();
  app = undefined;
});

async function seed(request) {
  const created = await request.post(`${app.baseURL}/api/tasks`, {
    data: {
      title: `Tomaten ${HOSTILE}`,
      employee: `Ada ${HOSTILE}`,
      location: `Beet ${HOSTILE}`,
      description: HOSTILE,
      subtasks: [{ text: HOSTILE }],
    },
  });
  expect(created.status()).toBe(201);
  const task = await created.json();
  // Stored history of an edit contains the raw hostile text.
  const edited = await request.put(`${app.baseURL}/api/tasks/${task.id}`, {
    data: { title: `Tomaten2 ${HOSTILE}`, location: `Beet ${HOSTILE}` },
  });
  expect(edited.ok()).toBe(true);
  const done = await request.post(`${app.baseURL}/api/tasks`, {
    data: {
      title: 'Fertig',
      employee: 'Max',
      location: 'Wiese',
      status: 'completed',
    },
  });
  expect(done.status()).toBe(201);
  // Fälligkeiten (#346): überfällig, heute, später und erledigt mit Datum, damit axe jede Darstellung prüft.
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  for (const [title, employee, dueDate, status] of [
    ['Frist überfällig', 'Eva', '2020-01-01', 'pending'],
    ['Frist heute', 'Tom', today, 'pending'],
    ['Frist später', 'Uli', '2099-12-31', 'in-progress'],
    ['Frist erledigt', 'Zoe', '2020-02-02', 'completed'],
  ]) {
    const res = await request.post(`${app.baseURL}/api/tasks`, {
      data: { title, employee, location: 'Beet', dueDate, status },
    });
    expect(res.status()).toBe(201);
  }
  // Pflanzenreferenz (#347): vorhandene Pflanze (Link) und verwaiste Referenz (Text), damit axe beides prüft.
  const withPlant = await request.post(`${app.baseURL}/api/tasks`, {
    data: {
      title: 'Mit Pflanze',
      employee: 'Gert',
      location: 'Beet',
      plantId: 'tomato',
    },
  });
  expect(withPlant.status()).toBe(201);
  const temp = await request.post(`${app.baseURL}/api/plants`, {
    data: { name: 'Zierkürbis', category: 'Gemüse' },
  });
  expect(temp.status()).toBe(201);
  const orphan = await request.post(`${app.baseURL}/api/tasks`, {
    data: {
      title: 'Verwaiste Pflanze',
      employee: 'Hanna',
      location: 'Beet',
      plantId: 'zierkurbis',
    },
  });
  expect(orphan.status()).toBe(201);
  expect(
    (await request.delete(`${app.baseURL}/api/plants/zierkurbis`)).status(),
  ).toBe(204);
}

async function openPage(page, name, theme = 'light') {
  await page.addInitScript(
    (value) => localStorage.setItem('theme', value),
    theme,
  );
  await page.route('**/*', (route) =>
    route.request().url().startsWith(app.baseURL)
      ? route.continue()
      : route.abort(),
  );
  await page.goto(`${app.baseURL}/${name}`);
  await page.waitForLoadState('networkidle');
}

// Every axe rule, including color contrast, is enforced in both themes.
async function axeViolations(page) {
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

for (const theme of ['light', 'dark']) {
  for (const name of PAGES) {
    test(`axe: ${name} (${theme}) has no violations`, async ({ page }) => {
      await openPage(page, name, theme);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
}

// Wochenansicht (#348): axe in beiden Themes, auch mit Aufgaben in der Woche und feindlichen Texten.
for (const theme of ['light', 'dark']) {
  test(`axe: dashboard week view (${theme}) has no violations`, async ({
    page,
    request,
  }) => {
    const res = await request.post(`${app.baseURL}/api/tasks`, {
      data: {
        title: `Woche ${HOSTILE}`,
        employee: `Ada ${HOSTILE}`,
        location: `Beet ${HOSTILE}`,
        dueDate: [
          new Date().getFullYear(),
          String(new Date().getMonth() + 1).padStart(2, '0'),
          String(new Date().getDate()).padStart(2, '0'),
        ].join('-'),
      },
    });
    expect(res.status()).toBe(201);
    await openPage(page, 'dashboard', theme);
    await page.getByRole('button', { name: 'Woche', exact: true }).click();
    await expect(page.locator('.week-day')).toHaveCount(7);
    await expect(page.locator('.week-task').first()).toBeVisible();
    expect(await page.locator('#tasksWeek img, #tasksWeek b').count()).toBe(0);
    expect(await axeViolations(page)).toEqual([]);
  });
}

test('week view: toggle, navigation and tasks are reachable by keyboard', async ({
  page,
}) => {
  await openPage(page, 'dashboard');
  const weekToggle = page.getByRole('button', { name: 'Woche', exact: true });
  await expect(weekToggle).toHaveAttribute('aria-pressed', 'false');
  await weekToggle.focus();
  await page.keyboard.press('Enter');
  await expect(weekToggle).toHaveAttribute('aria-pressed', 'true');
  const reached = new Set();
  for (let i = 0; i < 40 && reached.size < 4; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const el = document.activeElement;
      return el.closest('#tasksWeek') ? el.textContent.trim() : '';
    });
    if (/Vorherige Woche|^Heute$|Nächste Woche|Frist/.test(label)) {
      reached.add(label.replace(/\s+/g, ' '));
    }
  }
  expect(reached.size).toBeGreaterThanOrEqual(4);
});

test('untrusted task data stays text on dashboard, statistics and filters', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openPage(page, 'dashboard');
  const card = page.locator('.task-card').filter({ hasText: 'Tomaten2' });
  await expect(card.locator('.task-title')).toHaveText(`Tomaten2 ${HOSTILE}`);
  await expect(
    page.locator('#filterEmployee option', { hasText: 'Ada' }),
  ).toHaveText(`Ada ${HOSTILE}`);
  expect(await page.locator('main img, main b, main u').count()).toBe(0);

  await openPage(page, 'statistics');
  const history = page.locator('#historyTimeline');
  await expect(history).toContainText(`Tomaten2 ${HOSTILE}`);
  await expect(
    page.locator('#employeeChart .chart-bar-label').first(),
  ).toContainText('Ada');
  expect(await page.locator('main img, main b').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('theme toggle exposes its state and keeps one stable name', async ({
  page,
}) => {
  await openPage(page, 'dashboard');
  const toggle = page.locator('#themeToggle');
  const name = await toggle.getAttribute('aria-label');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('aria-label', name);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('edit dialog: keyboard open, focus, Escape and focus return', async ({
  page,
}) => {
  await openPage(page, 'dashboard');
  const editBtn = page
    .locator('.task-card')
    .filter({ hasText: 'Tomaten2' })
    .getByRole('button', { name: 'Aufgabe bearbeiten', exact: true });
  await editBtn.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Aufgabe bearbeiten/ });
  await expect(dialog).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  // Subtask controls carry the (untrusted) text in their accessible names.
  await expect(
    dialog.getByRole('button', { name: `Teilaufgabe löschen: ${HOSTILE}` }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('checkbox', { name: `Teilaufgabe erledigt: ${HOSTILE}` }),
  ).toBeVisible();
  // Focus stays inside the dialog while tabbing.
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => !!document.activeElement.closest('#editModal')),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(editBtn).toBeFocused();
});

test('confirm dialog: focus lands on cancel, Tab is trapped, Escape keeps the task', async ({
  page,
}) => {
  await openPage(page, 'dashboard');
  const card = page.locator('.task-card').filter({ hasText: 'Fertig' });
  const deleteBtn = card.getByRole('button', {
    name: 'Aufgabe löschen',
    exact: true,
  });
  await deleteBtn.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#confirmCancelBtn')).toBeFocused();
  // Regression: the confirm button once used an undefined variable and was transparent.
  await expect(page.locator('#confirmOkBtn')).not.toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => !!document.activeElement.closest('#confirmModal'),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(deleteBtn).toBeFocused();
  await expect(card).toBeVisible();
});

// #387: Header, Schließen-Symbol und Buttons der Dialoge nutzten undefinierte Variablen
// (transparent, im hellen Theme weißer Text auf weißem Grund).
for (const theme of ['light', 'dark']) {
  test(`edit and confirm dialogs have visible headers and no axe violations (${theme})`, async ({
    page,
  }) => {
    await openPage(page, 'dashboard', theme);
    const completed = page.locator('.task-card').filter({ hasText: 'Fertig' });
    await expect(completed.locator('.uncomplete-btn')).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    expect(await axeViolations(page)).toEqual([]);

    await page
      .locator('.task-card')
      .filter({ hasText: 'Tomaten2' })
      .getByRole('button', { name: 'Aufgabe bearbeiten', exact: true })
      .click();
    await expect(page.locator('#editModal .modal-header')).not.toHaveCSS(
      'background-image',
      'none',
    );
    await expect(
      page.locator('#editModal .btn-secondary').first(),
    ).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');

    await completed
      .getByRole('button', { name: 'Aufgabe löschen', exact: true })
      .click();
    await expect(
      page.locator('#confirmModal .confirm-modal-header'),
    ).not.toHaveCSS('background-image', 'none');
    expect(await axeViolations(page)).toEqual([]);
  });
}

test('task cards and their actions are reachable by keyboard', async ({
  page,
}) => {
  await openPage(page, 'dashboard');
  const names = new Set();
  for (let i = 0; i < 40 && names.size < 3; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() =>
      document.activeElement.getAttribute('aria-label'),
    );
    if (
      label &&
      /^Aufgabe (bearbeiten|löschen|archivieren)|^Als erledigt|^Aufgabe reaktivieren/.test(
        label,
      )
    ) {
      names.add(label);
    }
  }
  expect(names.size).toBeGreaterThanOrEqual(3);
});

test('plant library: card opens a modal dialog by keyboard and returns focus', async ({
  page,
}) => {
  await openPage(page, 'plants');
  const card = page.locator('.plant-card').first();
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
  const pressed = page.locator('.category-btn[aria-pressed="true"]');
  await expect(pressed).toHaveCount(1);
  await page.locator('.category-btn').nth(1).click();
  await expect(pressed).toHaveCount(1);
  await expect(page.locator('.category-btn').nth(1)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('log viewer: buttons work under CSP and rows open details by keyboard', async ({
  page,
}) => {
  await openPage(page, 'logs');
  await expect(page.getByRole('main')).toBeVisible();
  await page.getByRole('button', { name: /Aktualisieren/ }).click();
  const row = page.locator('#logTableBody tr[data-log-id]').first();
  await expect(row).toBeVisible();
  await row.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Log-Details' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#logDetailCloseBtn')).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(row).toBeFocused();
});
