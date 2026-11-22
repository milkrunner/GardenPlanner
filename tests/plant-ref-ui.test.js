// Pflanzenreferenz in der Oberfläche (#347): Auswahlfeld, Karte, Escaping, verwaiste Referenz, Bibliothek laden.
// Die klassischen Skripte laufen in einem jsdom-Fenster (wie tests/due-date-ui.test.js).
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
function load(...files) {
  for (const file of files) {
    const filename = path.join(ROOT, 'src/js', file);
    new vm.Script(fs.readFileSync(filename, 'utf8'), { filename }).runInContext(
      dom.getInternalVMContext(),
    );
  }
}
function run(code) {
  return new vm.Script(code).runInContext(dom.getInternalVMContext());
}
function createApp(html) {
  const window = createWindow(html);
  load('config.js', 'security.js');
  run('class GartenPlaner {}');
  load('task-state.js', 'task-filters.js', 'task-renderer.js');
  const app = run('new GartenPlaner()');
  Object.assign(app, {
    tasks: [],
    archivedTasks: [],
    plants: null,
    showArchive: false,
    bulkMode: false,
    selectedTasks: new Set(),
    tempSubtasks: [],
    undoStack: [],
    currentFilter: { employee: '', location: '', status: '', due: '' },
    sortBy: 'manual',
    searchQuery: '',
  });
  return { window, app, document: window.document };
}
afterEach(() => {
  if (dom) dom.window.close();
  dom = undefined;
});

const task = (overrides = {}) => ({
  id: 't1',
  title: 'Tomaten gießen',
  employee: 'Ada',
  location: 'Beet',
  description: '',
  status: 'pending',
  recurrence: 'none',
  subtasks: [],
  ...overrides,
});
const plants = [
  { id: 'tomato', name: 'Tomate', icon: '🍅' },
  { id: 'basil', name: 'Basilikum', icon: '🌿' },
  { id: 'apple', name: 'Apfel', icon: '🍎' },
];

function render(app, document, t) {
  const host = document.createElement('div');
  host.innerHTML = app.createTaskCard(t);
  return host;
}

describe('plant reference on the task card', () => {
  test('shows icon and name as a link to the plant page', () => {
    const { app, document } = createApp();
    app.plants = plants;
    const host = render(app, document, task({ plantId: 'tomato' }));
    const ref = host.querySelector('.task-plant');
    expect(ref).not.toBeNull();
    const link = ref.querySelector('a');
    expect(link.getAttribute('href')).toBe('/plants?plant=tomato');
    expect(link.textContent.trim()).toBe('🍅 Tomate');
    // Icon ist Dekoration, der zugängliche Name ist der Pflanzenname
    expect(link.querySelector('[aria-hidden="true"]').textContent).toBe('🍅');
    expect(ref.querySelector('.sr-only').textContent).toBe('Pflanze: ');
  });

  test('a removed plant shows plain text, no link and no error', () => {
    const { app, document } = createApp();
    app.plants = plants;
    const host = render(app, document, task({ plantId: 'gone' }));
    const ref = host.querySelector('.task-plant-missing');
    expect(ref.textContent).toContain('Pflanze nicht mehr vorhanden');
    expect(ref.querySelector('a')).toBeNull();
  });

  test('without a plantId or without a loaded library the card shows nothing', () => {
    const { app, document } = createApp();
    app.plants = plants;
    expect(
      render(app, document, task()).querySelector('.task-plant'),
    ).toBeNull();
    expect(
      render(app, document, task({ plantId: null })).querySelector(
        '.task-plant',
      ),
    ).toBeNull();
    app.plants = null;
    expect(
      render(app, document, task({ plantId: 'tomato' })).querySelector(
        '.task-plant',
      ),
    ).toBeNull();
  });

  test('escapes hostile plant names and icons', () => {
    const { app, document } = createApp();
    app.plants = [{ id: 'evil', name: HOSTILE, icon: HOSTILE }];
    const host = render(app, document, task({ plantId: 'evil' }));
    expect(host.querySelector('.task-plant img')).toBeNull();
    expect(host.querySelector('.task-plant b')).toBeNull();
    expect(host.querySelector('.task-plant a').textContent).toContain(
      '<img src=x onerror=alert(1)>',
    );
  });

  test('also renders in the archive', () => {
    const { app, document } = createApp();
    app.plants = plants;
    app.showArchive = true;
    const host = render(
      app,
      document,
      task({ plantId: 'basil', archivedAt: '2026-01-01T10:00:00.000Z' }),
    );
    expect(host.querySelector('.task-plant a').textContent.trim()).toBe(
      '🌿 Basilikum',
    );
  });
});

describe('populatePlantSelect', () => {
  const html =
    '<!doctype html><html><body><select id="taskPlant"></select></body></html>';

  test('lists "Keine Pflanze" first, then plants sorted by name', () => {
    const { app, document } = createApp(html);
    app.plants = plants;
    app.populatePlantSelect('taskPlant', '');
    const options = [...document.getElementById('taskPlant').options];
    expect(options.map((o) => o.value)).toEqual([
      '',
      'apple',
      'basil',
      'tomato',
    ]);
    expect(options[0].textContent).toBe('Keine Pflanze');
    expect(options[3].textContent).toBe('🍅 Tomate');
    expect(document.getElementById('taskPlant').value).toBe('');
  });

  test('preselects the current plant', () => {
    const { app, document } = createApp(html);
    app.plants = plants;
    app.populatePlantSelect('taskPlant', 'basil');
    expect(document.getElementById('taskPlant').value).toBe('basil');
  });

  test('keeps a removed plant selectable so saving does not silently drop it', () => {
    const { app, document } = createApp(html);
    app.plants = plants;
    app.populatePlantSelect('taskPlant', 'gone');
    const select = document.getElementById('taskPlant');
    expect(select.value).toBe('gone');
    expect(select.selectedOptions[0].textContent).toBe(
      'Pflanze nicht mehr vorhanden',
    );
  });

  test('without a loaded library only "Keine Pflanze" and the current reference remain', () => {
    const { app, document } = createApp(html);
    app.populatePlantSelect('taskPlant', '');
    expect(document.getElementById('taskPlant').options).toHaveLength(1);
    app.populatePlantSelect('taskPlant', 'tomato');
    const select = document.getElementById('taskPlant');
    expect(select.value).toBe('tomato');
    expect(select.selectedOptions[0].textContent).not.toMatch(/nicht mehr/);
  });

  test('renders hostile names as text, never as markup', () => {
    const { app, document } = createApp(html);
    app.plants = [{ id: 'evil', name: HOSTILE, icon: '' }];
    app.populatePlantSelect('taskPlant', '');
    const select = document.getElementById('taskPlant');
    expect(select.querySelector('img')).toBeNull();
    expect(select.options[1].textContent).toBe(HOSTILE);
  });

  test('is a no-op for a missing element', () => {
    const { app } = createApp();
    expect(() => app.populatePlantSelect('nope', 'x')).not.toThrow();
  });
});

describe('loadPlants and getPlant', () => {
  test('returns null without the API, on errors and on unexpected answers', async () => {
    const { app, window } = createApp();
    app.useAPI = false;
    expect(await app.loadPlants()).toBeNull();

    app.useAPI = true;
    window.TaskAPI = { getPlants: async () => ({ not: 'an array' }) };
    expect(await app.loadPlants()).toBeNull();

    window.TaskAPI = {
      getPlants: async () => {
        throw new Error('Server nicht erreichbar');
      },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await app.loadPlants()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('returns the library from the API', async () => {
    const { app, window } = createApp();
    app.useAPI = true;
    window.TaskAPI = { getPlants: async () => plants };
    app.plants = await app.loadPlants();
    expect(app.getPlant('basil').name).toBe('Basilikum');
    expect(app.getPlant('gone')).toBeNull();
    expect(app.getPlant(null)).toBeNull();
  });
});

describe('Security.validateTask with plantId', () => {
  test('accepts slugs, empty values and a missing field', () => {
    const { window } = createApp();
    const check = (plantId) =>
      window.Security.validateTask({
        title: 'T',
        location: 'L',
        plantId,
      }).errors;
    expect(check('tomato')).toEqual([]);
    expect(check('bush-bean')).toEqual([]);
    expect(check(null)).toEqual([]);
    expect(check(undefined)).toEqual([]);
  });

  test('rejects values that are no slug', () => {
    const { window } = createApp();
    for (const plantId of [
      'Tomato',
      'to mato',
      '../x',
      HOSTILE,
      'a'.repeat(61),
    ]) {
      const errors = window.Security.validateTask({
        title: 'T',
        location: 'L',
        plantId,
      }).errors;
      expect(errors).toContain('Ungültige Pflanzenauswahl');
    }
  });
});
