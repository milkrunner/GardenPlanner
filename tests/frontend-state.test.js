// Zustandslogik der klassischen Frontend-Skripte (task-state.js, task-filters.js,
// task-export.js, Sortierung in task-renderer.js). Die echten Skripte laufen in
// einer jsdom-Umgebung; TaskAPI, Dialoge und Benachrichtigungen sind Mocks.
// Wiederholende Aufgaben (recurrence) sind bewusst nicht Teil dieser Datei.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const TASKS_KEY = 'gartenplaner_tasks';
const ARCHIVE_KEY = 'gartenplaner_archived_tasks';
let dom;

function load(...files) {
  for (const file of files) {
    // filename: die V8-Coverage ordnet das Skript so dem Quelltext zu.
    const filename = path.join(ROOT, 'src/js', file);
    new vm.Script(fs.readFileSync(filename, 'utf8'), { filename }).runInContext(
      dom.getInternalVMContext(),
    );
  }
}
function run(code) {
  return new vm.Script(code).runInContext(dom.getInternalVMContext());
}

function networkError() {
  return Object.assign(new Error('Server nicht erreichbar'), { network: true });
}
function httpError(status, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { status });
}
function task(id, overrides = {}) {
  return {
    id,
    title: `Aufgabe ${id}`,
    employee: 'Ada',
    location: 'Beet',
    description: '',
    status: 'pending',
    ...overrides,
  };
}

// Erzeugt eine Seite mit den echten Skripten; alles, was DOM/Netz berührt und
// nicht Gegenstand des Tests ist, wird durch Mocks ersetzt.
function setup({ html = '', useAPI = false, renderer = false } = {}) {
  dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  load('config.js', 'security.js');
  run('class GartenPlaner {}');
  load('task-state.js', 'task-filters.js', 'task-export.js');
  if (renderer) load('task-renderer.js');
  window.GP.Auth = { setStatus: jest.fn(), enterKeyAndReload: jest.fn() };
  window.confirm = jest.fn(() => true);
  window.TaskAPI = {
    getTasks: jest.fn(),
    getArchivedTasks: jest.fn(),
    createTask: jest.fn(),
    updateTask: jest.fn(),
    deleteTask: jest.fn(),
    archiveTask: jest.fn(),
    unarchiveTask: jest.fn(),
    deleteArchivedTask: jest.fn(),
  };
  jest.spyOn(window.console, 'error').mockImplementation(() => {});
  jest.spyOn(window.console, 'warn').mockImplementation(() => {});

  const app = run('new GartenPlaner()');
  Object.assign(app, {
    tasks: [],
    archivedTasks: [],
    showArchive: false,
    currentFilter: {},
    searchQuery: '',
    selectedTasks: new Set(),
    tempSubtasks: [],
    undoStack: [],
    useAPI,
    showNotification: jest.fn(),
    showConfirm: jest.fn(() => Promise.resolve(true)),
    announce: jest.fn(),
    setButtonLoading: jest.fn(),
    updateStatistics: jest.fn(),
    updateEmployeeFilter: jest.fn(),
    updateLocationFilter: jest.fn(),
    renderCreateSubtasksList: jest.fn(),
  });
  if (!renderer) app.renderTasks = jest.fn();
  return { window, app, document: window.document, api: window.TaskAPI };
}
const stored = (window, key) => JSON.parse(window.localStorage.getItem(key));

afterEach(() => {
  if (dom) dom.window.close();
  dom = undefined;
  jest.restoreAllMocks();
});

describe('Archivieren und Wiederherstellen (lokal)', () => {
  test('archiveTask verschiebt die Aufgabe, setzt archivedAt und speichert beides', async () => {
    const { app, window } = setup();
    app.tasks = [task('a'), task('b')];
    await app.archiveTask('a');
    expect(app.tasks.map((t) => t.id)).toEqual(['b']);
    expect(app.archivedTasks.map((t) => t.id)).toEqual(['a']);
    expect(app.archivedTasks[0].archivedAt).toEqual(expect.any(String));
    expect(app.archivedTasks[0].history.at(-1).action).toBe('archived');
    expect(stored(window, TASKS_KEY).map((t) => t.id)).toEqual(['b']);
    expect(stored(window, ARCHIVE_KEY).map((t) => t.id)).toEqual(['a']);
    expect(app.renderTasks).toHaveBeenCalled();
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('archiviert'),
    );
  });

  test('abgebrochene Rückfrage lässt alles unverändert', async () => {
    const { app, window } = setup();
    window.confirm.mockReturnValue(false);
    app.tasks = [task('a')];
    await app.archiveTask('a');
    expect(app.tasks).toHaveLength(1);
    expect(app.archivedTasks).toEqual([]);
    expect(window.localStorage.getItem(TASKS_KEY)).toBeNull();
    expect(app.showNotification).not.toHaveBeenCalled();
  });

  test('unbekannte ID meldet einen Fehler statt zu archivieren', async () => {
    const { app } = setup();
    stubErrorBoundary(app);
    app.tasks = [task('a')];
    await app.archiveTask('fehlt');
    expect(app.tasks).toHaveLength(1);
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Fehler beim Archivieren'),
      'error',
    );
  });

  test('unarchiveTask stellt die Aufgabe ohne archivedAt wieder her', async () => {
    const { app, window } = setup();
    app.archivedTasks = [task('a', { archivedAt: '2025-01-01T00:00:00Z' })];
    await app.unarchiveTask('a');
    expect(app.archivedTasks).toEqual([]);
    expect(app.tasks).toHaveLength(1);
    expect(app.tasks[0]).not.toHaveProperty('archivedAt');
    expect(app.tasks[0].history.at(-1).action).toBe('unarchived');
    expect(stored(window, TASKS_KEY)).toHaveLength(1);
    expect(stored(window, ARCHIVE_KEY)).toEqual([]);
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('wiederhergestellt'),
    );
  });

  test('unarchiveTask mit unbekannter ID und abgelehnter Rückfrage', async () => {
    const { app, window } = setup();
    stubErrorBoundary(app);
    app.archivedTasks = [task('a')];
    await app.unarchiveTask('fehlt');
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Fehler beim Wiederherstellen'),
      'error',
    );
    app.showNotification.mockClear();
    window.confirm.mockReturnValue(false);
    await app.unarchiveTask('a');
    expect(app.archivedTasks).toHaveLength(1);
    expect(app.tasks).toEqual([]);
    expect(app.showNotification).not.toHaveBeenCalled();
  });

  test('deleteArchivedTask entfernt nur lokal, wenn keine API genutzt wird', async () => {
    const { app, window, api } = setup();
    app.archivedTasks = [task('a'), task('b')];
    await app.deleteArchivedTask('a');
    expect(api.deleteArchivedTask).not.toHaveBeenCalled();
    expect(app.archivedTasks.map((t) => t.id)).toEqual(['b']);
    expect(stored(window, ARCHIVE_KEY).map((t) => t.id)).toEqual(['b']);
  });

  test('toggleArchiveView schaltet Ansicht, Titel und Bulk-Modus um', () => {
    const { app, document } = setup({
      html: `<button id="toggleArchiveBtn"></button>
        <h2 id="tasksHeaderTitle"></h2><button id="bulkModeBtn"></button>`,
    });
    app.toggleBulkMode = jest.fn();
    app.bulkMode = true;
    app.toggleArchiveView();
    expect(app.showArchive).toBe(true);
    expect(document.getElementById('tasksHeaderTitle').textContent).toBe(
      'Archivierte Aufgaben',
    );
    expect(document.getElementById('bulkModeBtn').style.display).toBe('none');
    expect(app.toggleBulkMode).toHaveBeenCalledTimes(1);
    app.bulkMode = false;
    app.toggleArchiveView();
    expect(app.showArchive).toBe(false);
    expect(document.getElementById('tasksHeaderTitle').textContent).toBe(
      'Alle Aufgaben',
    );
    expect(document.getElementById('bulkModeBtn').style.display).toBe('block');
  });
});

describe('Archivieren und Wiederherstellen (API)', () => {
  test('archiveTask übernimmt die Serverantwort', async () => {
    const { app, api } = setup({ useAPI: true });
    app.tasks = [task('a'), task('b')];
    api.archiveTask.mockResolvedValue(
      task('a', { archivedAt: '2025-02-02T00:00:00Z' }),
    );
    await app.archiveTask('a');
    expect(api.archiveTask).toHaveBeenCalledWith('a');
    expect(app.tasks.map((t) => t.id)).toEqual(['b']);
    expect(app.archivedTasks[0].archivedAt).toBe('2025-02-02T00:00:00Z');
  });

  test('Serverfehler beim Archivieren lässt beide Listen unverändert', async () => {
    const { app, api, window } = setup({ useAPI: true });
    stubErrorBoundary(app);
    app.tasks = [task('a')];
    api.archiveTask.mockRejectedValue(httpError(500));
    await app.archiveTask('a');
    expect(app.tasks).toHaveLength(1);
    expect(app.archivedTasks).toEqual([]);
    expect(window.errorBoundary.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ function: 'archiveTask' }),
    );
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Fehler beim Archivieren'),
      'error',
    );
  });

  test('unarchiveTask übernimmt die Serverantwort, Fehler lassen den Zustand', async () => {
    const { app, api } = setup({ useAPI: true });
    stubErrorBoundary(app);
    app.archivedTasks = [task('a', { archivedAt: 'x' })];
    api.unarchiveTask.mockRejectedValueOnce(networkError());
    await app.unarchiveTask('a');
    expect(app.archivedTasks).toHaveLength(1);
    expect(app.tasks).toEqual([]);
    api.unarchiveTask.mockResolvedValue(task('a'));
    await app.unarchiveTask('a');
    expect(app.archivedTasks).toEqual([]);
    expect(app.tasks.map((t) => t.id)).toEqual(['a']);
  });

  test('deleteArchivedTask löscht per API, bei Fehler bleibt die Aufgabe', async () => {
    const { app, api } = setup({ useAPI: true });
    stubErrorBoundary(app);
    app.archivedTasks = [task('a')];
    api.deleteArchivedTask.mockRejectedValueOnce(httpError(500));
    await app.deleteArchivedTask('a');
    expect(app.archivedTasks).toHaveLength(1);
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Fehler beim Löschen'),
      'error',
    );
    api.deleteArchivedTask.mockResolvedValue(null);
    await app.deleteArchivedTask('a');
    expect(api.deleteArchivedTask).toHaveBeenLastCalledWith('a');
    expect(app.archivedTasks).toEqual([]);
  });
});

describe('Laden, Offline-Fallback und Fehlertypisierung', () => {
  const OFFLINE = expect.stringContaining('lokale Kopie');

  test('Serverdaten werden geladen und als lokale Kopie gesichert', async () => {
    const { app, window, api } = setup({ useAPI: true });
    api.getTasks.mockResolvedValue([task('a')]);
    api.getArchivedTasks.mockResolvedValue([task('z')]);
    expect(await app.loadTasks()).toEqual([task('a')]);
    expect(await app.loadArchivedTasks()).toEqual([task('z')]);
    expect(stored(window, TASKS_KEY)).toEqual([task('a')]);
    expect(stored(window, ARCHIVE_KEY)).toEqual([task('z')]);
    expect(window.GP.Auth.setStatus).not.toHaveBeenCalled();
  });

  test('nur ein Netzwerkfehler nutzt die lokale Kopie und meldet das sichtbar', async () => {
    const { app, window, api } = setup({ useAPI: true });
    window.localStorage.setItem(TASKS_KEY, JSON.stringify([task('lokal')]));
    window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify([task('alt')]));
    api.getTasks.mockRejectedValue(networkError());
    api.getArchivedTasks.mockRejectedValue(networkError());
    expect((await app.loadTasks()).map((t) => t.id)).toEqual(['lokal']);
    expect((await app.loadArchivedTasks()).map((t) => t.id)).toEqual(['alt']);
    expect(window.GP.Auth.setStatus).toHaveBeenCalledTimes(2);
    expect(window.GP.Auth.setStatus).toHaveBeenCalledWith('offline', OFFLINE);
  });

  test('HTTP 401 wird nicht durch die lokale Kopie maskiert und bietet den Key-Dialog an', async () => {
    const { app, window, api } = setup({ useAPI: true });
    window.localStorage.setItem(TASKS_KEY, JSON.stringify([task('veraltet')]));
    api.getTasks.mockRejectedValue(httpError(401, 'Unauthorized'));
    expect(await app.loadTasks()).toEqual([]);
    const [kind, text, action] = window.GP.Auth.setStatus.mock.calls[0];
    expect(kind).toBe('auth');
    expect(text).toContain('API-Key');
    expect(action.label).toBe('API-Key eingeben');
    action.run();
    expect(window.GP.Auth.enterKeyAndReload).toHaveBeenCalledTimes(1);
  });

  test('HTTP 500 wird mit Fehlertext gemeldet und nicht lokal ersetzt', async () => {
    const { app, window, api } = setup({ useAPI: true });
    window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify([task('alt')]));
    api.getArchivedTasks.mockRejectedValue(httpError(500, 'Kaputt'));
    expect(await app.loadArchivedTasks()).toEqual([]);
    expect(window.GP.Auth.setStatus).toHaveBeenCalledWith(
      'error',
      'Archiv konnten nicht geladen werden: Kaputt',
    );
  });

  test('handleLoadFailure liefert immer eine leere Liste', () => {
    const { app, window } = setup();
    expect(app.handleLoadFailure(httpError(503), 'Aufgaben')).toEqual([]);
    expect(window.GP.Auth.setStatus).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Aufgaben konnten nicht geladen werden'),
    );
    // Ohne Auth-Gate (z. B. Seiten ohne auth-gate.js) darf nichts werfen.
    delete window.GP.Auth;
    expect(app.handleLoadFailure(httpError(401), 'Aufgaben')).toEqual([]);
    expect(() => app.announceOfflineFallback()).not.toThrow();
  });

  test.each([
    ['ohne Eintrag', null, []],
    ['mit kaputtem JSON', '{kaputt', []],
    ['mit Nicht-Array', '{"a":1}', []],
    ['mit gültiger Liste', JSON.stringify([task('x')]), [task('x')]],
  ])('ohne API: lokale Kopie %s', async (_name, raw, expected) => {
    const { app, window } = setup();
    if (raw !== null) {
      window.localStorage.setItem(TASKS_KEY, raw);
      window.localStorage.setItem(ARCHIVE_KEY, raw);
    }
    expect(await app.loadTasks()).toEqual(expected);
    expect(await app.loadArchivedTasks()).toEqual(expected);
    expect(window.GP.Auth.setStatus).not.toHaveBeenCalled();
  });

  test('saveTasks/saveArchivedTasks melden Speicherfehler und werfen weiter', async () => {
    const { app, window } = setup();
    stubErrorBoundary(app);
    jest.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota');
    });
    await expect(app.saveTasks()).rejects.toThrow('Quota');
    await expect(app.saveArchivedTasks()).rejects.toThrow('Quota');
    expect(window.errorBoundary.handleError).toHaveBeenCalledTimes(2);
    expect(app.showNotification).toHaveBeenCalledTimes(2);
  });
});

describe('Aufgaben ändern', () => {
  test('toggleTaskStatus wechselt lokal zwischen offen und erledigt (mit Historie)', async () => {
    const { app, window } = setup();
    app.tasks = [task('a')];
    await app.toggleTaskStatus('a');
    expect(app.tasks[0].status).toBe('completed');
    expect(app.tasks[0].completedAt).toEqual(expect.any(String));
    await app.toggleTaskStatus('a');
    expect(app.tasks[0].status).toBe('pending');
    expect(app.tasks[0].completedAt).toBeNull();
    expect(app.tasks[0].history.map((h) => h.action)).toEqual([
      'completed',
      'reopened',
    ]);
    expect(stored(window, TASKS_KEY)[0].status).toBe('pending');
  });

  test('toggleTaskStatus per API schickt den neuen Status, Fehler ändern nichts', async () => {
    const { app, api } = setup({ useAPI: true });
    stubErrorBoundary(app);
    app.tasks = [task('a')];
    api.updateTask.mockRejectedValueOnce(httpError(500));
    await app.toggleTaskStatus('a');
    expect(app.tasks[0].status).toBe('pending');
    api.updateTask.mockResolvedValue({});
    await app.toggleTaskStatus('a');
    expect(api.updateTask).toHaveBeenLastCalledWith('a', {
      status: 'completed',
    });
    expect(app.tasks[0].status).toBe('completed');
  });

  test('deleteTask löscht nach Bestätigung, sonst nicht (API und lokal)', async () => {
    const { app, api, window } = setup({ useAPI: true });
    app.tasks = [task('a'), task('b')];
    app.showConfirm.mockResolvedValueOnce(false);
    await app.deleteTask('a');
    expect(app.tasks).toHaveLength(2);
    expect(api.deleteTask).not.toHaveBeenCalled();
    api.deleteTask.mockResolvedValue(null);
    await app.deleteTask('a');
    expect(api.deleteTask).toHaveBeenCalledWith('a');
    expect(app.tasks.map((t) => t.id)).toEqual(['b']);
    expect(stored(window, TASKS_KEY).map((t) => t.id)).toEqual(['b']);
  });

  test('addTask legt lokal eine Aufgabe mit Historie an', async () => {
    const { app, document, window } = setup({
      html: `<form id="taskForm"><button type="submit"></button>
        <input id="taskTitle">
        <input id="taskEmployee">
        <input id="taskLocation">
        <textarea id="taskDescription"></textarea></form>`,
    });
    document.getElementById('taskTitle').value = '  Tomaten  ';
    document.getElementById('taskEmployee').value = 'Ada';
    document.getElementById('taskLocation').value = 'Beet';
    await app.addTask();
    expect(app.tasks).toHaveLength(1);
    expect(app.tasks[0]).toMatchObject({
      title: 'Tomaten',
      employee: 'Ada',
      location: 'Beet',
      status: 'pending',
    });
    expect(app.tasks[0].history[0].action).toBe('created');
    expect(stored(window, TASKS_KEY)).toHaveLength(1);
    expect(document.getElementById('taskTitle').value).toBe('');
    expect(app.announce).toHaveBeenCalledWith(
      expect.stringContaining('Tomaten'),
    );
    // Beim Laden/Beenden der Schaltfläche bleibt der Ladezustand sauber.
    expect(app.setButtonLoading).toHaveBeenLastCalledWith(
      expect.anything(),
      false,
    );
  });

  test('addTask per API verwendet die Serverantwort; ungültige Eingaben werden abgelehnt', async () => {
    const { app, api } = setup({
      useAPI: true,
      html: `<form id="taskForm"><button type="submit"></button>
        <input id="taskTitle" value="Neu"><input id="taskEmployee" value="">
        <input id="taskLocation" value="Beet"><textarea id="taskDescription"></textarea></form>`,
    });
    app.tempSubtasks = [{ id: 1, text: 'Gießen', completed: false }];
    api.createTask.mockResolvedValue({ ...task('srv'), subtasks: [] });
    await app.addTask();
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Neu',
        subtasks: [{ text: 'Gießen', completed: false }],
      }),
    );
    expect(app.tasks.map((t) => t.id)).toEqual(['srv']);

    api.createTask.mockClear();
    app.showNotification.mockClear();
    app.useAPI = true;
    dom.window.document.getElementById('taskTitle').value = '   ';
    await app.addTask();
    expect(api.createTask).not.toHaveBeenCalled();
    expect(app.tasks).toHaveLength(1);
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Titel'),
      'error',
    );
  });

  test('addTask zeigt Serverfehler an und gibt das Rate-Limit zurück', async () => {
    const { app, api, window } = setup({
      useAPI: true,
      html: `<form id="taskForm"><button type="submit"></button>
        <input id="taskTitle" value="Neu"><input id="taskEmployee" value="">
        <input id="taskLocation" value="Beet"><textarea id="taskDescription"></textarea></form>`,
    });
    stubErrorBoundary(app);
    window.rateLimiter = {
      checkLimit: jest.fn(() => ({ allowed: true })),
      rollbackRequest: jest.fn(),
      showRateLimitWarning: jest.fn(),
    };
    api.createTask.mockRejectedValue(httpError(500));
    await app.addTask();
    expect(app.tasks).toEqual([]);
    expect(window.rateLimiter.rollbackRequest).toHaveBeenCalledWith(
      'taskCreate',
    );
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Fehler beim Hinzufügen'),
      'error',
    );

    window.rateLimiter.checkLimit.mockReturnValue({
      allowed: false,
      resetMs: 1000,
    });
    api.createTask.mockClear();
    await app.addTask();
    expect(api.createTask).not.toHaveBeenCalled();
    expect(window.rateLimiter.showRateLimitWarning).toHaveBeenCalledWith(
      'taskCreate',
      1000,
    );
  });

  test('saveEditedTask übernimmt Änderungen und protokolliert sie lokal', async () => {
    const { app } = setup({
      html: `<form id="editTaskForm"><button type="submit"></button></form>
        <input id="editTaskTitle" value="Neuer Titel">
        <input id="editTaskEmployee" value="Max">
        <input id="editTaskLocation" value="Wiese">
        <textarea id="editTaskDescription">Text</textarea>`,
    });
    app.tasks = [task('a')];
    await app.saveEditedTask('a');
    expect(app.tasks[0]).toMatchObject({
      title: 'Neuer Titel',
      employee: 'Max',
      location: 'Wiese',
      description: 'Text',
    });
    const [entry] = app.tasks[0].history;
    expect(entry.action).toBe('edited');
    expect(entry.details.changes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Titel'),
        expect.stringContaining('Mitarbeiter'),
        expect.stringContaining('Standort'),
        'Beschreibung geändert',
      ]),
    );
  });

  test('saveEditedTask lehnt ungültige Daten und unbekannte IDs ab', async () => {
    const { app, api } = setup({
      useAPI: true,
      html: `<form id="editTaskForm"><button type="submit"></button></form>
        <input id="editTaskTitle" value=""><input id="editTaskEmployee" value="">
        <input id="editTaskLocation" value="Beet"><textarea id="editTaskDescription"></textarea>`,
    });
    stubErrorBoundary(app);
    app.tasks = [task('a')];
    await app.saveEditedTask('a');
    expect(api.updateTask).not.toHaveBeenCalled();
    expect(app.tasks[0].title).toBe('Aufgabe a');
    await app.saveEditedTask('fehlt');
    expect(app.showNotification).toHaveBeenLastCalledWith(
      expect.stringContaining('Fehler beim Speichern'),
      'error',
    );
  });

  test('clearAllData verlangt zwei Bestätigungen', async () => {
    const { app, window } = setup();
    app.tasks = [task('a')];
    app.showConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await app.clearAllData();
    expect(app.tasks).toHaveLength(1);
    app.showConfirm.mockResolvedValue(true);
    await app.clearAllData();
    expect(app.tasks).toEqual([]);
    expect(stored(window, TASKS_KEY)).toEqual([]);
  });
});

describe('Mehrfachauswahl und Rückgängig', () => {
  function bulk() {
    const env = setup();
    env.app._registerUndo = jest.fn((action) => env.app.undoStack.push(action));
    env.app.tasks = [
      task('a'),
      task('b', { status: 'completed', completedAt: 'alt' }),
      task('c'),
    ];
    return env;
  }

  test('ohne Auswahl wird gewarnt und nichts verändert', async () => {
    const { app } = bulk();
    app.bulkCompleteTasksAction();
    app.bulkUncompleteTasksAction();
    await app.bulkDeleteTasksAction();
    await app.bulkArchiveTasksAction();
    expect(app.showNotification).toHaveBeenCalledTimes(4);
    expect(app.tasks).toHaveLength(3);
    expect(app._registerUndo).not.toHaveBeenCalled();
  });

  test('Erledigen und Reaktivieren lassen sich rückgängig machen', () => {
    const { app } = bulk();
    app.selectedTasks = new Set(['a', 'b']);
    app.bulkCompleteTasksAction();
    expect(app.tasks.map((t) => t.status)).toEqual([
      'completed',
      'completed',
      'pending',
    ]);
    expect(app.selectedTasks.size).toBe(0);
    app.undoStack.pop().undo();
    expect(app.tasks.map((t) => t.status)).toEqual([
      'pending',
      'completed',
      'pending',
    ]);
    expect(app.tasks[1].completedAt).toBe('alt');

    app.selectedTasks = new Set(['b']);
    app.bulkUncompleteTasksAction();
    expect(app.tasks[1]).toMatchObject({
      status: 'pending',
      completedAt: null,
    });
    app.undoStack.pop().undo();
    expect(app.tasks[1]).toMatchObject({
      status: 'completed',
      completedAt: 'alt',
    });
  });

  test('Löschen und Archivieren lassen sich rückgängig machen', async () => {
    const { app } = bulk();
    app.selectedTasks = new Set(['a', 'c']);
    await app.bulkDeleteTasksAction();
    expect(app.tasks.map((t) => t.id)).toEqual(['b']);
    app.undoStack.pop().undo();
    expect(app.tasks.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);

    app.selectedTasks = new Set(['a']);
    await app.bulkArchiveTasksAction();
    expect(app.tasks.map((t) => t.id).sort()).toEqual(['b', 'c']);
    expect(app.archivedTasks.map((t) => t.id)).toEqual(['a']);
    expect(app.archivedTasks[0].archivedAt).toEqual(expect.any(String));
    app.undoStack.pop().undo();
    expect(app.archivedTasks).toEqual([]);
    expect(app.tasks.map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  test('abgelehnte Bestätigung ändert nichts', async () => {
    const { app } = bulk();
    app.showConfirm.mockResolvedValue(false);
    app.selectedTasks = new Set(['a']);
    await app.bulkDeleteTasksAction();
    await app.bulkArchiveTasksAction();
    expect(app.tasks).toHaveLength(3);
    expect(app.archivedTasks).toEqual([]);
  });
});

describe('Filter und Sortierung', () => {
  const list = [
    task('1', {
      title: 'Tomaten',
      employee: 'Ada',
      location: 'Beet',
      description: 'Gießen und Düngen',
    }),
    task('2', { title: 'Rasen', employee: 'Max', location: 'Wiese' }),
    task('3', {
      title: 'Hecke',
      employee: 'Max',
      location: '',
      status: 'completed',
    }),
  ];
  const titles = (app) => app.getFilteredTasks().map((t) => t.title);

  test('ohne Filter und Suche werden alle Aufgaben geliefert', () => {
    const { app } = setup();
    app.tasks = list;
    expect(titles(app)).toEqual(['Tomaten', 'Rasen', 'Hecke']);
  });

  test('Status-, Mitarbeiter- und Standortfilter wirken einzeln', () => {
    const { app } = setup();
    app.tasks = list;
    app.currentFilter = { status: 'completed' };
    expect(titles(app)).toEqual(['Hecke']);
    app.currentFilter = { employee: 'Max' };
    expect(titles(app)).toEqual(['Rasen', 'Hecke']);
    app.currentFilter = { location: 'Wiese' };
    expect(titles(app)).toEqual(['Rasen']);
  });

  test('Suche findet Titel, Mitarbeiter, Standort und Beschreibung, auch ohne Standort', () => {
    const { app } = setup();
    app.tasks = list;
    app.searchQuery = 'düngen';
    expect(titles(app)).toEqual(['Tomaten']);
    app.searchQuery = 'wiese';
    expect(titles(app)).toEqual(['Rasen']);
    app.searchQuery = 'max';
    expect(titles(app)).toEqual(['Rasen', 'Hecke']);
    app.searchQuery = 'gibt-es-nicht';
    expect(titles(app)).toEqual([]);
  });

  test('performSearch rendert neu und zeigt Trefferzahl und Löschen-Schaltfläche', () => {
    const { app, document } = setup({
      html: `<button id="clearSearchBtn"></button>
        <div id="searchResults" style="display:none"><span id="searchResultCount"></span></div>
        <input id="searchInput" value="max">`,
    });
    app.tasks = list;
    app.searchQuery = 'max';
    app.performSearch();
    expect(app.renderTasks).toHaveBeenCalledTimes(1);
    expect(document.getElementById('searchResultCount').textContent).toBe('2');
    expect(document.getElementById('searchResults').style.display).toBe('flex');
    expect(document.getElementById('clearSearchBtn').style.display).toBe(
      'flex',
    );
    app.clearSearch();
    expect(document.getElementById('searchInput').value).toBe('');
    expect(app.searchQuery).toBe('');
    expect(document.getElementById('searchResults').style.display).toBe('none');
    expect(document.getElementById('clearSearchBtn').style.display).toBe(
      'none',
    );
  });

  test('renderTasks sortiert nach sortOrder, sonst nach Position in der Liste', () => {
    const { app, document } = setup({
      html: '<div id="tasksList"></div>',
      renderer: true,
    });
    app.tasks = [
      task('erste', { title: 'Erste' }),
      task('zweite', { title: 'Zweite', sortOrder: 0 }),
      task('dritte', { title: 'Dritte' }),
    ];
    app.renderTasks();
    const order = () =>
      [...document.querySelectorAll('[data-task-id]')].map((el) =>
        el.getAttribute('data-task-id'),
      );
    // Gleiche Rangzahl (sortOrder 0 und Listenindex 0) bleibt in Listenreihenfolge.
    expect(order()).toEqual(['erste', 'zweite', 'dritte']);
    app.tasks[2].sortOrder = -1;
    app.renderTasks();
    expect(order()).toEqual(['dritte', 'erste', 'zweite']);
  });

  test('renderTasks zeigt Leerzustände für Aufgaben und Archiv', () => {
    const { app, document } = setup({
      html: '<div id="tasksList"></div>',
      renderer: true,
    });
    app.renderTasks();
    expect(document.getElementById('tasksList').textContent).toContain(
      'Noch keine Aufgaben vorhanden',
    );
    app.showArchive = true;
    app.renderTasks();
    expect(document.getElementById('tasksList').textContent).toContain(
      'Archiv ist leer',
    );
  });

  test('getAllHistory vereint aktive und archivierte Aufgaben, neueste zuerst', () => {
    const { app } = setup();
    app.tasks = [
      task('a', {
        history: [
          { timestamp: '2025-01-01T10:00:00Z', action: 'created' },
          { timestamp: '2025-01-03T10:00:00Z', action: 'completed' },
        ],
      }),
      task('b'),
    ];
    app.archivedTasks = [
      task('c', {
        history: [{ timestamp: '2025-01-02T10:00:00Z', action: 'archived' }],
      }),
    ];
    expect(app.getAllHistory().map((h) => [h.taskId, h.action])).toEqual([
      ['a', 'completed'],
      ['c', 'archived'],
      ['a', 'created'],
    ]);
  });
});

describe('Export und Import', () => {
  function exportEnv(options) {
    const env = setup(options);
    const { window } = env;
    window.URL.createObjectURL = jest.fn(() => 'blob:test');
    window.URL.revokeObjectURL = jest.fn();
    const anchors = [];
    jest
      .spyOn(window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function () {
        anchors.push(this);
      });
    return { ...env, anchors };
  }

  test('exportData lädt die Aufgaben als formatierte JSON-Sicherung herunter', async () => {
    const { app, window, anchors } = exportEnv();
    app.tasks = [task('a', { title: 'Tomaten' })];
    app.exportData();
    const blob = window.URL.createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/json');
    const text = await new Promise((resolve) => {
      const reader = new window.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
    expect(JSON.parse(text)).toEqual(app.tasks);
    expect(text).toContain('\n  ');
    expect(anchors).toHaveLength(1);
    expect(anchors[0].download).toMatch(
      /^gartenplaner_backup_\d{4}-\d{2}-\d{2}\.json$/,
    );
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('exportiert'),
    );
  });

  test('exportData meldet Fehler statt zu werfen', () => {
    const { app, window } = exportEnv();
    stubErrorBoundary(app);
    window.URL.createObjectURL.mockImplementation(() => {
      throw new Error('kein Blob');
    });
    app.exportData();
    expect(window.errorBoundary.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ function: 'exportData' }),
    );
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Fehler beim Exportieren'),
      'error',
    );
  });

  function fakePdf(window) {
    const doc = {
      texts: [],
      save: jest.fn(),
      addPage: jest.fn(),
      setPage: jest.fn(),
      setFontSize: jest.fn(),
      setFont: jest.fn(),
      setLineWidth: jest.fn(),
      setDrawColor: jest.fn(),
      setTextColor: jest.fn(),
      line: jest.fn(),
      splitTextToSize: jest.fn((text) => [text]),
      internal: { getNumberOfPages: () => 1 },
      text(value) {
        doc.texts.push(value);
      },
    };
    window.jspdf = { jsPDF: jest.fn(() => doc) };
    return doc;
  }

  test('exportPDF fasst die gefilterten Aufgaben zusammen und speichert die Datei', async () => {
    const { app, window } = exportEnv();
    const doc = fakePdf(window);
    app.tasks = [
      task('a', {
        title: 'Tomaten',
        description: 'Gießen',
        createdAt: '2025-01-01',
      }),
      task('b', { title: 'Rasen', status: 'completed', employee: 'Max' }),
    ];
    app.currentFilter = { employee: 'Ada' };
    await app.exportPDF();
    expect(doc.texts).toEqual(
      expect.arrayContaining([
        'Gartenplaner - Aufgabenliste',
        'Gesamt: 1 | Offen: 1 | Erledigt: 0',
        '[ ] 1. Tomaten',
        'Seite 1 von 1',
      ]),
    );
    expect(doc.texts.join('\n')).not.toContain('Rasen');
    expect(doc.save).toHaveBeenCalledWith(
      expect.stringMatching(/^gartenplaner_aufgaben_\d{4}-\d{2}-\d{2}\.pdf$/),
    );
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('PDF erfolgreich'),
    );
  });

  test('exportPDF meldet fehlende Bibliothek, leere Auswahl und Fehler', async () => {
    const { app, window } = exportEnv();
    stubErrorBoundary(app);
    await app.exportPDF();
    expect(app.showConfirm).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('nicht verfügbar'),
      }),
    );
    const doc = fakePdf(window);
    await app.exportPDF();
    expect(app.showConfirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Keine Aufgaben' }),
    );
    expect(doc.save).not.toHaveBeenCalled();
    app.tasks = [task('a')];
    doc.save.mockImplementation(() => {
      throw new Error('Disk voll');
    });
    await app.exportPDF();
    expect(app.showNotification).toHaveBeenLastCalledWith(
      expect.stringContaining('Fehler beim PDF-Export'),
      'error',
    );
  });

  async function importFile(app, window, content) {
    const file = new window.File([content], 'backup.json', {
      type: 'application/json',
    });
    const input = { files: [file], value: 'backup.json' };
    await app.importData({ target: input });
    // FileReader liefert asynchron; auf den Abschluss des onload-Handlers warten.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return input;
  }

  test('importData ersetzt die Aufgaben nach Bestätigung', async () => {
    const { app, window } = setup();
    app.tasks = [task('alt')];
    const input = await importFile(
      app,
      window,
      JSON.stringify([task('neu1'), task('neu2')]),
    );
    expect(input.value).toBe('');
    expect(app.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('2 Aufgaben'),
      }),
    );
    expect(app.tasks.map((t) => t.id)).toEqual(['neu1', 'neu2']);
    expect(stored(window, TASKS_KEY)).toHaveLength(2);
  });

  test('importData lässt die Daten bei Abbruch und bei ungültiger Datei unverändert', async () => {
    const { app, window } = setup();
    stubErrorBoundary(app);
    app.tasks = [task('alt')];
    app.showConfirm.mockResolvedValueOnce(false);
    await importFile(app, window, JSON.stringify([task('neu')]));
    expect(app.tasks.map((t) => t.id)).toEqual(['alt']);

    await importFile(app, window, '{das ist kein JSON');
    expect(app.tasks.map((t) => t.id)).toEqual(['alt']);
    expect(app.showConfirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Fehler' }),
    );
    expect(window.errorBoundary.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ function: 'importData' }),
    );
  });

  test('importData ohne Datei und mit defektem Ereignis', async () => {
    const { app, window } = setup();
    stubErrorBoundary(app);
    await app.importData({ target: { files: [] } });
    expect(app.showConfirm).not.toHaveBeenCalled();
    await app.importData({});
    expect(app.showNotification).toHaveBeenCalledWith(
      expect.stringContaining('Fehler beim Importieren'),
      'error',
    );
    expect(window.errorBoundary.handleError).toHaveBeenCalledTimes(1);
  });
});

// Hilfsfunktion: errorBoundary-Stub am Fenster der aktuellen App.
function stubErrorBoundary() {
  dom.window.errorBoundary = { handleError: jest.fn() };
}
