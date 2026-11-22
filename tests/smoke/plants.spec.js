// Plant library maintenance in real Chromium: add, edit, delete, keyboard and axe (#330).
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { startApp } = require('./harness');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const HOSTILE = '<img src=x onerror=alert(1)><b>fett</b>';

// One app per test: the API rate limit is 100 requests per 15 minutes per IP.
let app;
test.beforeEach(async () => {
  app = await startApp('gardenplanner-plants-');
});
test.afterEach(async () => {
  if (app) await app.stop();
  app = undefined;
});

async function openPlants(page, theme = 'light') {
  await page.addInitScript(
    (value) => localStorage.setItem('theme', value),
    theme,
  );
  await page.route('**/*', (route) =>
    route.request().url().startsWith(app.baseURL)
      ? route.continue()
      : route.abort(),
  );
  await page.goto(`${app.baseURL}/plants`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.plant-card').first()).toBeVisible();
}

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

async function fillForm(dialog, values) {
  for (const [label, value] of Object.entries(values)) {
    await dialog.getByLabel(label, { exact: false }).first().fill(value);
  }
}

async function listPlants(request) {
  const response = await request.get(`${app.baseURL}/api/plants`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test('add a plant: validation, persistence, category filter and focus', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openPlants(page);
  const add = page.getByRole('button', { name: /Pflanze hinzufügen/ });
  await add.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Pflanze hinzufügen' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByLabel('Name', { exact: false }).first(),
  ).toBeFocused();

  // Client-side validation: nothing is sent, the problem is announced and the field marked.
  const before = (await listPlants(request)).length;
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('Name muss angegeben werden');
  await expect(alert).toContainText('Kategorie muss angegeben werden');
  await expect(dialog.locator('#plantForm-name')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect((await listPlants(request)).length).toBe(before);

  await fillForm(dialog, {
    Name: 'Kohlrabi',
    Kategorie: 'Gemüse',
    Abstand: '25 cm',
    'Gute Nachbarn': 'Salat\nSpinat',
    Pflegetipps: 'Gleichmäßig feucht halten.',
  });
  await dialog.getByLabel('Sonne').selectOption('partial');
  await dialog.getByLabel('Frühling').check();
  await dialog.getByLabel('Herbst').check();
  // Aussaatmonate (#349): Checkboxen mit vollem Monatsnamen als zugänglichem Namen
  await dialog.getByLabel('Mai', { exact: true }).check();
  await dialog.getByLabel('März', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  const card = page.locator('.plant-card', { hasText: 'Kohlrabi' });
  await expect(card).toBeVisible();
  await expect(card).toBeFocused();
  await expect(page.locator('#plantNotice')).toContainText('Kohlrabi');
  const stored = (await listPlants(request)).find((p) => p.id === 'kohlrabi');
  expect(stored).toMatchObject({
    name: 'Kohlrabi',
    category: 'Gemüse',
    sun: 'partial',
    season: ['spring', 'autumn'],
    sowMonths: [3, 5],
    spacing: '25 cm',
    companions: ['Salat', 'Spinat'],
    tips: 'Gleichmäßig feucht halten.',
  });

  // A duplicate name maps to 409 and is explained in German; the dialog stays open.
  await add.click();
  await fillForm(dialog, { Name: 'Kohlrabi', Kategorie: 'Gemüse' });
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'bereits eine Pflanze mit dieser ID',
  );
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();
  expect(errors).toEqual([]);
});

test('new category appears in the filter after adding', async ({ page }) => {
  await openPlants(page);
  await page.getByRole('button', { name: /Pflanze hinzufügen/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Pflanze hinzufügen' });
  await fillForm(dialog, { Name: 'Feuerbohne', Kategorie: 'Kletterer' });
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
  const filter = page.locator('.category-btn', { hasText: 'Kletterer' });
  await expect(filter).toBeVisible();
  await filter.click();
  await expect(page.locator('.plant-card')).toHaveCount(1);
});

test('edit a plant: values are prefilled, hostile text stays text', async ({
  page,
  request,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const created = await request.post(`${app.baseURL}/api/plants`, {
    data: { id: 'testpflanze', name: 'Testpflanze', category: 'Test' },
  });
  expect(created.status()).toBe(201);
  await openPlants(page);
  const card = page.locator('.plant-card', { hasText: 'Testpflanze' });
  await card.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pflanze bearbeiten' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#plantForm-name')).toHaveValue('Testpflanze');
  await expect(dialog.locator('#plantForm-category')).toHaveValue('Test');

  // Angle brackets are rejected before they are sent (the server does the same).
  await dialog.locator('#plantForm-name').fill(HOSTILE);
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog.getByRole('alert')).toContainText('spitzen Klammern');
  expect((await listPlants(request)).some((p) => p.name === HOSTILE)).toBe(
    false,
  );

  await dialog.locator('#plantForm-name').fill('Testpflanze 2');
  await dialog.getByLabel('Pflegetipps').fill('Neuer Tipp');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
  const updated = page.locator('.plant-card', { hasText: 'Testpflanze 2' });
  await expect(updated).toBeFocused();
  const stored = (await listPlants(request)).find(
    (p) => p.id === 'testpflanze',
  );
  expect(stored).toMatchObject({ name: 'Testpflanze 2', tips: 'Neuer Tipp' });

  // Hostile text that is already stored (e.g. imported) renders as text in the form and cards.
  await page.route(`${app.baseURL}/api/plants*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.forEach((p) => {
      if (p.id === 'testpflanze') p.name = HOSTILE;
    });
    await route.fulfill({ response, json: body });
  });
  await page.reload();
  const hostileCard = page.locator('.plant-card', { hasText: 'fett' });
  await expect(hostileCard.locator('.plant-card-name')).toHaveText(HOSTILE);
  await hostileCard.click();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await expect(page.locator('#plantForm-name')).toHaveValue(HOSTILE);
  expect(
    await page.locator('main img, main b, .modal img, .modal b').count(),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test('delete: confirmation keeps focus safe, Escape cancels, confirm removes', async ({
  page,
  request,
}) => {
  const created = await request.post(`${app.baseURL}/api/plants`, {
    data: { id: 'loeschkandidat', name: 'Löschkandidat', category: 'Test' },
  });
  expect(created.status()).toBe(201);
  await openPlants(page);
  const card = page.locator('.plant-card', { hasText: 'Löschkandidat' });
  await card.focus();
  await page.keyboard.press('Enter');
  const deleteBtn = page.getByRole('button', { name: 'Löschen', exact: true });
  await deleteBtn.click();
  const confirm = page.getByRole('alertdialog', { name: 'Pflanze löschen?' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Löschkandidat');
  await expect(
    confirm.getByRole('button', { name: 'Abbrechen' }),
  ).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => !!document.activeElement.closest('#plantDeleteModal'),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(card).toBeFocused();
  expect(
    (await listPlants(request)).some((p) => p.id === 'loeschkandidat'),
  ).toBe(true);

  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await confirm.getByRole('button', { name: 'Löschen' }).click();
  await expect(confirm).toBeHidden();
  await expect(card).toHaveCount(0);
  await expect(page.locator('#plantNotice')).toContainText('gelöscht');
  expect(
    (await listPlants(request)).some((p) => p.id === 'loeschkandidat'),
  ).toBe(false);
  // First write copied the defaults, so the rest of the library is still there.
  expect((await listPlants(request)).length).toBeGreaterThan(10);
});

for (const theme of ['light', 'dark']) {
  test(`axe: add form, error state and delete dialog (${theme})`, async ({
    page,
  }) => {
    await openPlants(page, theme);
    await page.getByRole('button', { name: /Pflanze hinzufügen/ }).click();
    const form = page.getByRole('dialog', { name: 'Pflanze hinzufügen' });
    await expect(form).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(form.getByRole('alert')).toContainText('Name muss');
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');

    await page.locator('.plant-card').first().click();
    await page.getByRole('button', { name: 'Löschen', exact: true }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
}

test('plant detail dialog with maintenance buttons has no axe violations', async ({
  page,
}) => {
  await openPlants(page, 'dark');
  await page.locator('.plant-card').first().click();
  await expect(page.getByRole('button', { name: 'Bearbeiten' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});
