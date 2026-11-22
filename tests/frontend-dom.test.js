// DOM, escaping and accessibility regressions for the classic browser scripts.
// Scripts run in a jsdom window via vm so top-level const/class declarations
// are shared between scripts exactly like in the browser.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HOSTILE = '<img src=x onerror=alert(1)><b>fett</b>"\'&';
let dom;

function createWindow(html = '<!doctype html><html><body></body></html>') {
  dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  return dom.window;
}
function load(window, ...files) {
  for (const file of files) {
    const filename = path.join(ROOT, 'src/js', file);
    new vm.Script(fs.readFileSync(filename, 'utf8'), { filename }).runInContext(
      dom.getInternalVMContext(),
    );
  }
}
function run(window, code) {
  return new vm.Script(code).runInContext(dom.getInternalVMContext());
}
function renderer(html) {
  const window = createWindow(html);
  load(window, 'config.js', 'security.js');
  run(window, 'class GartenPlaner {}');
  load(window, 'task-renderer.js');
  const app = run(window, 'new GartenPlaner()');
  Object.assign(app, {
    tasks: [],
    archivedTasks: [],
    showArchive: false,
    bulkMode: false,
    selectedTasks: new Set(),
    tempSubtasks: [],
    undoStack: [],
  });
  return { window, app, document: window.document };
}
function accessibleName(element) {
  return (
    element.getAttribute('aria-label') ||
    element.textContent.trim() ||
    element.getAttribute('title') ||
    ''
  ).trim();
}
afterEach(() => {
  if (dom) dom.window.close();
  dom = undefined;
});

describe('debug logging (#281)', () => {
  test('GP.debug stays silent unless explicitly enabled', () => {
    const window = createWindow();
    load(window, 'config.js');
    const spy = jest
      .spyOn(window.console, 'debug')
      .mockImplementation(() => {});
    window.GP.debug('hidden');
    expect(spy).not.toHaveBeenCalled();
    window.localStorage.setItem('gp_debug', 'true');
    window.GP.debug('via storage');
    window.localStorage.removeItem('gp_debug');
    window.GP_DEBUG = true;
    window.GP.debug('via flag');
    expect(spy.mock.calls).toEqual([['via storage'], ['via flag']]);
  });
  test('production scripts never call console.log', () => {
    const dir = path.join(ROOT, 'src/js');
    const offenders = fs
      .readdirSync(dir)
      .filter((file) =>
        /console\.log\(/.test(fs.readFileSync(path.join(dir, file), 'utf8')),
      );
    expect(offenders).toEqual([]);
  });
  test('logger honors DEBUG level only in debug mode', () => {
    const window = createWindow();
    jest.spyOn(window.console, 'debug').mockImplementation(() => {});
    load(window, 'config.js', 'logger.js');
    expect(window.logger.config.minLevel).toBe(1);
    window.close();
    const debugWindow = createWindow();
    jest.spyOn(debugWindow.console, 'debug').mockImplementation(() => {});
    debugWindow.GP_DEBUG = true;
    load(debugWindow, 'config.js', 'logger.js');
    expect(debugWindow.logger.config.minLevel).toBe(0);
  });
});

describe('task cards (#287/#288)', () => {
  const task = {
    id: 't1',
    title: HOSTILE,
    employee: HOSTILE,
    location: HOSTILE,
    description: HOSTILE,
    status: 'pending',
    recurrence: 'weekly',
    subtasks: [{ id: 1, text: HOSTILE, completed: false }],
  };
  function card(overrides = {}, archived = false) {
    const { app, document } = renderer();
    app.showArchive = archived;
    document.body.innerHTML = app.createTaskCard({ ...task, ...overrides });
    return document.body.querySelector('.task-card');
  }

  test('untrusted task data is rendered as text, never as markup', () => {
    const element = card();
    expect(element.querySelector('img, b, script')).toBeNull();
    expect(element.querySelector('.task-title').textContent).toBe(HOSTILE);
    expect(element.querySelector('.task-description').textContent).toBe(
      HOSTILE,
    );
    expect(element.getAttribute('aria-label')).toBe(`Aufgabe: ${HOSTILE}`);
  });
  test.each([false, true])(
    'every svg is decorative and every button named (archived=%s)',
    (archived) => {
      const element = card({ archivedAt: '2025-01-01T00:00:00Z' }, archived);
      element.querySelectorAll('svg').forEach((svg) => {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      });
      const buttons = [...element.querySelectorAll('button')];
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach((button) => expect(accessibleName(button)).not.toBe(''));
    },
  );
  test('icons next to meta text get a text equivalent', () => {
    const meta = card().querySelector('.task-meta').textContent;
    expect(meta).toContain('Mitarbeiter:');
    expect(meta).toContain('Standort:');
  });
});

describe('DOM builders keep untrusted text inert (#288)', () => {
  test('employee/location filters and charts', () => {
    const { app, document } = renderer(`
      <select id="filterEmployee"></select><select id="filterLocation"></select>
      <div id="employeeChart"></div><div id="locationChart"></div>`);
    app.tasks = [{ employee: HOSTILE, location: HOSTILE }];
    app.updateEmployeeFilter();
    app.updateLocationFilter();
    app.updateEmployeeChart();
    app.updateLocationChart();
    const options = [...document.querySelectorAll('#filterEmployee option')];
    expect(options.map((o) => o.textContent)).toEqual([
      'Alle Mitarbeiter',
      HOSTILE,
    ]);
    expect(options[1].value).toBe(HOSTILE);
    expect(
      document.querySelector('#filterLocation option:last-child').textContent,
    ).toBe(HOSTILE);
    expect(
      document.querySelector('#employeeChart .chart-bar-label').textContent,
    ).toBe(HOSTILE);
    expect(
      document.querySelector('#locationChart .chart-bar-label').title,
    ).toBe(HOSTILE);
    expect(document.querySelector('img, b')).toBeNull();
  });
  test('history timeline renders stored task data as text', () => {
    const { app, document } = renderer('<div id="historyTimeline"></div>');
    app.getAllHistory = () => [
      {
        timestamp: new Date().toISOString(),
        action: 'edited',
        taskTitle: HOSTILE,
        taskEmployee: HOSTILE,
        details: { changes: [`Titel: "${HOSTILE}" → "<u>neu</u>"`, 'Zeile 2'] },
      },
      {
        timestamp: new Date().toISOString(),
        action: 'created',
        taskTitle: 'x',
        taskEmployee: 'y',
        details: { employee: HOSTILE, location: HOSTILE },
      },
    ];
    app.renderHistory();
    const timeline = document.getElementById('historyTimeline');
    expect(timeline.querySelector('img, b, u')).toBeNull();
    expect(timeline.querySelector('.history-task-title').textContent).toBe(
      `"${HOSTILE}"`,
    );
    expect(timeline.querySelector('.history-details br')).not.toBeNull();
    expect(timeline.querySelectorAll('.history-item')).toHaveLength(2);
  });
  test('empty states are built from text', () => {
    const { app, document } = renderer('<div id="tasksList"></div>');
    app.getFilteredTasks = () => [];
    app.renderTasks();
    expect(document.querySelector('#tasksList h3').textContent).toBe(
      'Noch keine Aufgaben vorhanden',
    );
    expect(document.querySelector('#tasksList a').getAttribute('href')).toBe(
      'index.html',
    );
    expect(
      document.querySelector('.empty-state-icon').getAttribute('aria-hidden'),
    ).toBe('true');
  });
  test('subtask controls are labelled and wired', () => {
    const { app, document } = renderer(
      '<div id="subtasksList"></div><div id="subtasksListCreate"></div>',
    );
    const toggled = [];
    const deleted = [];
    app.toggleSubtask = (_task, id) => toggled.push(id);
    app.deleteSubtask = (_task, id) => deleted.push(id);
    app.renderSubtasksInModal({
      subtasks: [{ id: 7, text: HOSTILE, completed: true }],
    });
    const checkbox = document.querySelector('#subtasksList .subtask-checkbox');
    const remove = document.querySelector('#subtasksList .btn-delete-subtask');
    expect(checkbox.checked).toBe(true);
    expect(checkbox.getAttribute('aria-label')).toBe(
      `Teilaufgabe erledigt: ${HOSTILE}`,
    );
    expect(remove.getAttribute('aria-label')).toBe(
      `Teilaufgabe löschen: ${HOSTILE}`,
    );
    expect(remove.querySelector('svg').getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(document.querySelector('.subtask-text').textContent).toBe(HOSTILE);
    checkbox.dispatchEvent(new dom.window.Event('change'));
    remove.click();
    expect([toggled, deleted]).toEqual([[7], [7]]);
    app.tempSubtasks = [];
    app.renderCreateSubtasksList();
    expect(
      document.querySelector('#subtasksListCreate .no-subtasks'),
    ).not.toBeNull();
  });
  test('setButtonLoading restores the original children', () => {
    const { app, document } = renderer(
      '<button id="b"><span class="keep">Speichern</span></button>',
    );
    const button = document.getElementById('b');
    const keep = button.querySelector('.keep');
    app.setButtonLoading(button, true, 'Speichert...');
    app.setButtonLoading(button, true, 'Speichert...'); // idempotent
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(
      button.querySelector('.btn-spinner').getAttribute('aria-hidden'),
    ).toBe('true');
    expect(button.textContent.trim()).toBe('Speichert...');
    app.setButtonLoading(button, false);
    expect(button.querySelector('.keep')).toBe(keep);
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
  test('undo notification is text-only with named controls', () => {
    const { app, document } = renderer();
    app._showUndoNotification(HOSTILE);
    const note = document.querySelector('.undo-notification');
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.querySelector('.undo-message').textContent).toBe(HOSTILE);
    expect(note.querySelector('img, b')).toBeNull();
    note
      .querySelectorAll('button')
      .forEach((b) => expect(accessibleName(b)).not.toBe(''));
    clearTimeout(app.undoTimeout);
  });
});

describe('confirm dialog keyboard behavior', () => {
  const MODAL = `
    <button id="opener">open</button>
    <div id="confirmModal" role="alertdialog" aria-hidden="true" style="display:none">
      <h2 id="confirmModalTitle"></h2><div id="confirmModalIcon"></div><p id="confirmModalMessage"></p>
      <button id="confirmCancelBtn">c</button><button id="confirmOkBtn">o</button>
    </div>`;
  test('message is text with line breaks, Escape cancels and focus returns', async () => {
    const { app, document, window } = renderer(MODAL);
    const opener = document.getElementById('opener');
    opener.focus();
    const result = app.showConfirm({
      title: 'T',
      message: `Zeile <b>1</b>\nZeile 2`,
      cancelText: 'Abbrechen',
    });
    const modal = document.getElementById('confirmModal');
    expect(modal.getAttribute('aria-hidden')).toBe('false');
    expect(modal.querySelector('b')).toBeNull();
    expect(document.getElementById('confirmModalMessage').innerHTML).toBe(
      'Zeile &lt;b&gt;1&lt;/b&gt;<br>Zeile 2',
    );
    modal.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await expect(result).resolves.toBe(false);
    expect(modal.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(opener);
  });
  test('Tab wraps inside the dialog', async () => {
    const { app, document, window } = renderer(MODAL);
    app._trapFocus = jest.fn(app._trapFocus);
    const result = app.showConfirm({ message: 'x', cancelText: 'Nein' });
    const modal = document.getElementById('confirmModal');
    modal.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );
    expect(app._trapFocus).toHaveBeenCalled();
    document.getElementById('confirmOkBtn').click();
    await expect(result).resolves.toBe(true);
  });
});

describe('other scripts', () => {
  test('log viewer rows are keyboard reachable and inert', () => {
    const window = createWindow(
      '<table><tbody id="logTableBody"></tbody></table>',
    );
    load(window, 'log-viewer.js');
    const row = run(window, 'logViewer').createLogRow({
      id: '"><i>id</i>',
      timestamp: Date.now(),
      level: 'INFO',
      category: HOSTILE,
      message: HOSTILE,
      context: {},
    });
    window.document.getElementById('logTableBody').appendChild(row);
    expect(row.tabIndex).toBe(0);
    expect(row.dataset.logId).toBe('"><i>id</i>');
    expect(row.querySelector('.log-message').textContent).toBe(HOSTILE);
    expect(window.document.querySelector('i, img, b')).toBeNull();
  });
  test('error toast shows the message as text and can be closed', () => {
    const window = createWindow();
    window.GP = {};
    load(window, 'config.js', 'security.js', 'error-handler.js');
    window.errorBoundary.showErrorNotification({
      message: HOSTILE,
      type: 'runtime',
    });
    const toast = window.document.querySelector('.error-toast');
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.querySelector('img, b')).toBeNull();
    const close = toast.querySelector('.error-toast-close');
    expect(close.getAttribute('aria-label')).toBeTruthy();
    expect(close.hasAttribute('onclick')).toBe(false);
    close.click();
    expect(window.document.querySelector('.error-toast')).toBeNull();
  });
  test('plant library cards are keyboard operable dialog openers', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/plants.html'), 'utf8');
    const window = createWindow(html);
    const plants = [
      {
        id: 'p"1',
        name: HOSTILE,
        category: HOSTILE,
        icon: '🍅',
        difficulty: 'easy',
        sun: 'full',
        water: 'low',
        season: ['summer'],
        spacing: HOSTILE,
        germination: '1',
        harvest: '2',
        tips: HOSTILE,
        companions: [HOSTILE],
        avoid: [],
      },
    ];
    window.fetch = async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes('categories') ? [HOSTILE] : plants,
    });
    load(window, 'config.js', 'security.js', 'api.js', 'plants.js');
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const { document } = window;
    const category = document.querySelectorAll('.category-btn');
    expect(category).toHaveLength(2);
    expect(category[1].textContent).toBe(HOSTILE);
    expect(category[0].getAttribute('aria-pressed')).toBe('true');
    const card = document.querySelector('.plant-card');
    expect(card.getAttribute('role')).toBe('button');
    expect(card.tabIndex).toBe(0);
    // WCAG 2.5.3: der zugängliche Name enthält den gesamten sichtbaren Text
    const accessibleName = card.getAttribute('aria-label');
    const visible = [
      card.querySelector('.plant-card-name'),
      card.querySelector('.plant-card-category'),
      ...card.querySelectorAll('.plant-tag'),
    ].map((node) => node.textContent);
    expect(visible).toHaveLength(5);
    visible.forEach((text) => expect(accessibleName).toContain(text));
    card.focus();
    card.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    const modal = document.getElementById('plantModal');
    expect(modal.style.display).toBe('flex');
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(document.activeElement.className).toBe('plant-modal-close');
    expect(modal.querySelector('img, b')).toBeNull();
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(modal.style.display).toBe('none');
    expect(document.activeElement).toBe(card);
  });

  describe('plant library maintenance (#330)', () => {
    const plant = {
      id: 'tomato',
      name: HOSTILE,
      category: HOSTILE,
      icon: '🍅',
      difficulty: 'easy',
      sun: 'full',
      water: 'low',
      season: ['summer'],
      spacing: '50 cm',
      germination: '1',
      harvest: '2',
      tips: HOSTILE,
      companions: [HOSTILE],
      avoid: [],
    };
    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
    // Loads the real plants page and scripts; `respond(url, options)` answers writes.
    async function plantPage(respond) {
      const html = fs.readFileSync(
        path.join(ROOT, 'public/plants.html'),
        'utf8',
      );
      const window = createWindow(html);
      const calls = [];
      window.fetch = async (url, options = {}) => {
        const method = options.method || 'GET';
        calls.push({ url: String(url), method, body: options.body });
        let result = { status: 200, body: [plant] };
        if (String(url).includes('categories')) {
          result = { status: 200, body: [HOSTILE] };
        } else if (method !== 'GET') {
          result = respond(String(url), options);
        }
        return {
          ok: result.status < 400,
          status: result.status,
          json: async () => result.body,
        };
      };
      load(window, 'config.js', 'security.js', 'api.js', 'plants.js');
      // jsdom fires DOMContentLoaded itself once the scripts are loaded (init must run once).
      await tick();
      return { window, document: window.document, calls };
    }
    const fill = (document, id, value) => {
      document.getElementById(id).value = value;
    };
    const submit = async (window, form) => {
      form.dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      );
      await tick();
    };

    test('add form is a labelled modal dialog and validates before sending', async () => {
      const { window, document, calls } = await plantPage(() => ({
        status: 201,
        body: { ...plant, id: 'neu', name: 'Neu' },
      }));
      const add = document.getElementById('plantAddBtn');
      add.focus();
      add.click();
      const dialog = document.getElementById('plantFormModal');
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(
        document.getElementById(dialog.getAttribute('aria-labelledby'))
          .textContent,
      ).toBe('Pflanze hinzufügen');
      expect(document.activeElement.id).toBe('plantForm-name');
      dialog.querySelectorAll('input, select, textarea').forEach((control) => {
        const label = control.id
          ? dialog.querySelector(`label[for="${control.id}"]`)
          : control.closest('label');
        expect(label).not.toBeNull();
      });
      // Category suggestions come from the server and stay text.
      const option = dialog.querySelector('#plantFormCategories option');
      expect(option.value).toBe(HOSTILE);
      expect(dialog.querySelector('img, b')).toBeNull();

      const form = dialog.querySelector('form');
      await submit(window, form);
      const alert = dialog.querySelector('[role="alert"]');
      expect(alert.textContent).toContain('Name muss angegeben werden');
      expect(alert.textContent).toContain('Kategorie muss angegeben werden');
      expect(
        document.getElementById('plantForm-name').getAttribute('aria-invalid'),
      ).toBe('true');
      expect(document.activeElement.id).toBe('plantForm-name');
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

      fill(document, 'plantForm-name', 'Neu <b>');
      fill(document, 'plantForm-category', 'Gemüse');
      await submit(window, form);
      expect(alert.textContent).toContain('spitzen Klammern');
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

      fill(document, 'plantForm-name', ' Neu ');
      fill(document, 'plantForm-companions', 'Salat\n\n  Spinat  \n');
      dialog.querySelector('input[value="autumn"]').checked = true;
      await submit(window, form);
      const post = calls.find((c) => c.method === 'POST');
      expect(post.url).toBe('/api/plants');
      expect(JSON.parse(post.body)).toMatchObject({
        name: 'Neu',
        category: 'Gemüse',
        season: ['autumn'],
        companions: ['Salat', 'Spinat'],
      });
      expect(document.getElementById('plantFormModal')).toBeNull();
      expect(document.getElementById('plantNotice').textContent).toContain(
        'Neu',
      );
      // Library and category filter are reloaded after saving.
      expect(
        calls.filter((c) => c.url.includes('plant-categories')).length,
      ).toBe(2);
    });

    test('server errors are shown as readable text and keep the form open', async () => {
      let answer = {
        status: 400,
        body: { errors: [`Name ${HOSTILE}, kaputt`, 'Icon zu lang'] },
      };
      const { window, document } = await plantPage(() => answer);
      document.getElementById('plantAddBtn').click();
      fill(document, 'plantForm-name', 'Neu');
      fill(document, 'plantForm-category', 'Gemüse');
      const form = document.querySelector('#plantFormModal form');
      await submit(window, form);
      const alert = document.getElementById('plantFormError');
      expect(alert.querySelectorAll('li')).toHaveLength(2);
      expect(alert.querySelector('li').textContent).toBe(
        `Name ${HOSTILE}, kaputt`,
      );
      expect(alert.querySelector('img, b')).toBeNull();
      expect(document.getElementById('plantFormModal')).not.toBeNull();
      expect(form.querySelector('button[type="submit"]').disabled).toBe(false);
      answer = { status: 409, body: { error: 'Plant with ID "neu" exists' } };
      await submit(window, form);
      expect(alert.textContent).toContain('bereits eine Pflanze');
      expect(alert.textContent).not.toContain('Plant with ID');
    });

    test('edit prefills with stored values as text, Escape restores focus', async () => {
      const { window, document, calls } = await plantPage((url) => ({
        status: 200,
        body: { ...plant, id: url.split('/').pop(), name: 'Neu' },
      }));
      const card = document.querySelector('.plant-card');
      card.focus();
      card.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      document.querySelector('.plant-edit-btn').click();
      // The detail dialog is closed while the form is open.
      expect(document.getElementById('plantModal').style.display).toBe('none');
      const dialog = document.getElementById('plantFormModal');
      expect(dialog.querySelector('h2').textContent).toBe('Pflanze bearbeiten');
      expect(document.getElementById('plantForm-name').value).toBe(HOSTILE);
      expect(document.getElementById('plantForm-companions').value).toBe(
        HOSTILE,
      );
      expect(dialog.querySelector('input[value="summer"]').checked).toBe(true);
      expect(dialog.querySelector('img, b')).toBeNull();
      dialog.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(document.getElementById('plantFormModal')).toBeNull();
      expect(document.activeElement).toBe(card);
      expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);

      document.querySelector('.plant-card').click();
      document.querySelector('.plant-edit-btn').click();
      fill(document, 'plantForm-name', 'Neu');
      fill(document, 'plantForm-category', 'Gemüse');
      fill(document, 'plantForm-companions', 'Salat');
      fill(document, 'plantForm-tips', 'Tipp');
      await submit(window, document.querySelector('#plantFormModal form'));
      const put = calls.find((c) => c.method === 'PUT');
      expect(put.url).toBe('/api/plants/tomato');
      expect(JSON.parse(put.body).name).toBe('Neu');
    });

    test('delete asks for confirmation in an alertdialog and only then calls the API', async () => {
      const { window, document, calls } = await plantPage(() => ({
        status: 204,
        body: null,
      }));
      document.querySelector('.plant-card').click();
      document.querySelector('.plant-delete-btn').click();
      const dialog = document.getElementById('plantDeleteModal');
      expect(dialog.getAttribute('role')).toBe('alertdialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.querySelector('#plantDeleteMessage').textContent).toContain(
        HOSTILE,
      );
      expect(dialog.querySelector('img, b')).toBeNull();
      expect(document.activeElement.textContent).toBe('Abbrechen');
      expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
      dialog.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(document.getElementById('plantDeleteModal')).toBeNull();
      expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);

      document.querySelector('.plant-card').click();
      document.querySelector('.plant-delete-btn').click();
      document.querySelector('#plantDeleteModal .btn-danger').click();
      await tick();
      expect(calls.find((c) => c.method === 'DELETE').url).toBe(
        '/api/plants/tomato',
      );
      expect(document.getElementById('plantDeleteModal')).toBeNull();
      expect(document.getElementById('plantNotice').textContent).toContain(
        'gelöscht',
      );
      expect(document.activeElement.id).toBe('plantAddBtn');
    });

    test('a failed delete keeps the dialog open and explains the 404', async () => {
      const { document } = await plantPage(() => ({
        status: 404,
        body: { error: 'Plant not found' },
      }));
      document.querySelector('.plant-card').click();
      document.querySelector('.plant-delete-btn').click();
      document.querySelector('#plantDeleteModal .btn-danger').click();
      await tick();
      const alert = document.getElementById('plantDeleteError');
      expect(alert.getAttribute('role')).toBe('alert');
      expect(alert.textContent).toContain('gibt es nicht mehr');
      expect(document.getElementById('plantDeleteModal')).not.toBeNull();
    });
  });
});

describe('static page markup', () => {
  const pages = fs
    .readdirSync(path.join(ROOT, 'public'))
    .filter((f) => f.endsWith('.html'));
  test.each(pages)(
    '%s: decorative svgs hidden, controls named, no inline handlers',
    (page) => {
      const window = createWindow(
        fs.readFileSync(path.join(ROOT, 'public', page), 'utf8'),
      );
      const { document } = window;
      document.querySelectorAll('svg').forEach((svg) => {
        const hidden = svg.getAttribute('aria-hidden') === 'true';
        const labelled =
          svg.getAttribute('role') === 'img' && svg.getAttribute('aria-label');
        expect(hidden || labelled).toBe(true);
      });
      document.querySelectorAll('button, a[href]').forEach((el) => {
        expect(
          `${page}: ${el.outerHTML.slice(0, 80)} -> ${accessibleName(el)}`,
        ).not.toMatch(/-> $/);
      });
      expect(
        document.querySelectorAll(
          '[onclick], [onchange], [oninput], [onkeydown]',
        ),
      ).toHaveLength(0);
      document
        .querySelectorAll('[role="dialog"], [role="alertdialog"]')
        .forEach((dialog) => {
          expect(dialog.getAttribute('aria-modal')).toBe('true');
          expect(
            dialog.getAttribute('aria-label') ||
              dialog.getAttribute('aria-labelledby'),
          ).toBeTruthy();
        });
      document
        .querySelectorAll('select, input:not([type="hidden"]), textarea')
        .forEach((control) => {
          const labelled =
            control.getAttribute('aria-label') ||
            control.getAttribute('aria-labelledby') ||
            (control.id &&
              document.querySelector(`label[for="${control.id}"]`)) ||
            control.closest('label');
          expect(
            `${page}#${control.id || control.name || control.type}: ${Boolean(labelled)}`,
          ).toMatch(/true$/);
        });
      expect(document.querySelectorAll('main')).toHaveLength(1);
    },
  );
});

describe('script loading and integrity (#323)', () => {
  test('jsPDF uses the official cdnjs SRI hash and is not blocked by a malformed one', () => {
    const html = fs.readFileSync(
      path.join(ROOT, 'public/dashboard.html'),
      'utf8',
    );
    const tag = html.match(/<script[^>]*jspdf\.umd\.min\.js[^>]*>/s)[0];
    const integrity = tag.match(/integrity="(sha512-[^"]+)"/)[1];
    // sha512 digests are 64 bytes = 88 base64 characters ending in "==".
    expect(integrity).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
    // Official value from https://api.cdnjs.com/libraries/jspdf/2.5.1?fields=sri
    expect(integrity).toBe(
      'sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==',
    );
  });

  test.each(['index', 'dashboard', 'statistics', 'plants', 'logs'])(
    '%s loads auth-gate.js after api.js and before app.js',
    (page) => {
      const html = fs.readFileSync(
        path.join(ROOT, 'public', `${page}.html`),
        'utf8',
      );
      const order = ['api.js', 'auth-gate.js', 'app.js'].map((name) =>
        html.indexOf(`../src/js/${name}"`),
      );
      expect(order.every((index) => index > -1)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    },
  );
});

describe('TaskAPI task filters (#325)', () => {
  function recorded() {
    const window = createWindow();
    const calls = [];
    window.fetch = (url, options = {}) => {
      calls.push({ url, options });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      });
    };
    load(window, 'config.js', 'api.js');
    return { api: window.TaskAPI, calls };
  }

  test('status stays a query parameter', async () => {
    const { api, calls } = recorded();
    await api.getTasks({ status: 'pending' });
    expect(calls[0].url).toMatch(/\/tasks\?status=pending$/);
    expect(calls[0].options.method).toBeUndefined();
  });

  test('employee and location never appear in the URL, they go to POST /tasks/search', async () => {
    const { api, calls } = recorded();
    await api.getTasks({
      status: 'pending',
      employee: 'Max',
      location: 'Garten',
    });
    expect(calls[0].url).toMatch(/\/tasks\/search$/);
    expect(calls[0].url).not.toMatch(/Max|Garten/);
    expect(calls[0].options.method).toBe('POST');
    expect(JSON.parse(calls[0].options.body)).toEqual({
      status: 'pending',
      employee: 'Max',
      location: 'Garten',
    });
  });
});

describe('TaskAPI error typing (#324)', () => {
  function api(fetchImpl) {
    const window = createWindow();
    window.fetch = fetchImpl;
    load(window, 'config.js', 'api.js');
    return window.TaskAPI;
  }

  test('network failures are flagged, HTTP errors carry their status', async () => {
    await expect(
      api(() => Promise.reject(new TypeError('fetch failed')))._fetch('/tasks'),
    ).rejects.toMatchObject({ network: true });

    const failing = api(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Kaputt' }),
      }),
    );
    await expect(failing._fetch('/tasks')).rejects.toMatchObject({
      status: 500,
      message: 'Kaputt',
    });
  });

  test('a 401 asks the gate once and retries with the new key', async () => {
    const calls = [];
    const window = createWindow();
    window.fetch = (url, options) => {
      calls.push(options.headers['X-API-Key'] || '');
      return Promise.resolve(
        calls.length === 1
          ? { ok: false, status: 401, json: () => Promise.resolve({}) }
          : { ok: true, status: 200, json: () => Promise.resolve([]) },
      );
    };
    load(window, 'config.js', 'api.js');
    window.GP.Auth = {
      handleUnauthorized: jest.fn(async () => {
        window.TaskAPI.setApiKey('neu');
        return true;
      }),
    };
    await expect(window.TaskAPI._fetch('/tasks')).resolves.toEqual([]);
    expect(calls).toEqual(['', 'neu']);
    expect(window.GP.Auth.handleUnauthorized).toHaveBeenCalledTimes(1);
  });
});
