// Fälligkeitsdatum in der Oberfläche (#346): reine Datumslogik, Filter, Karten, Formularfelder.
// Die klassischen Skripte laufen in einem jsdom-Fenster (wie tests/frontend-dom.test.js).
// Die Zeitzonen-Falle (westlich von UTC zeigt `new Date('YYYY-MM-DD')` den Vortag) prüft ein eigener
// Node-Prozess mit gesetztem TZ, weil Jest die Zeitzone des laufenden Prozesses nicht mehr ändert.
const { execFileSync } = require('node:child_process');
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
  title: 'Tomaten',
  employee: 'Ada',
  location: 'Beet',
  description: '',
  status: 'pending',
  recurrence: 'none',
  subtasks: [],
  ...overrides,
});

describe('date helpers', () => {
  let app;
  beforeEach(() => ({ app } = createApp()));

  test('parseDueDate builds the local calendar day, strictly', () => {
    const date = app.parseDueDate('2026-03-15');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2026, 2, 15,
    ]);
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '2026-3-5',
      '2026-03-15T10:00:00Z',
      '15.03.2026',
      '',
      null,
      undefined,
      20260315,
      HOSTILE,
    ]) {
      expect(app.parseDueDate(bad)).toBeNull();
    }
  });

  test('formatDueDate prints the German date of that day in any time zone', () => {
    expect(app.formatDueDate('2026-03-15')).toBe('So., 15.03.2026');
    expect(app.formatDueDate('2026-01-01')).toBe('Do., 01.01.2026');
    expect(app.formatDueDate('2026-02-30')).toBe('');
    expect(app.formatDueDate(null)).toBe('');
  });

  test('todayString and formatIsoDate use local parts', () => {
    const evening = new Date(2026, 2, 14, 22, 30);
    expect(app.todayString(evening)).toBe('2026-03-14');
    expect(app.formatIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('getDueStatus', () => {
    const status = (dueDate, extra = {}) =>
      app.getDueStatus({ dueDate, status: 'pending', ...extra }, '2026-03-15');
    expect(status(undefined)).toBe('none');
    expect(status(null)).toBe('none');
    expect(status('kaputt')).toBe('none');
    expect(status('2026-03-14')).toBe('overdue');
    expect(status('2026-03-15')).toBe('today');
    expect(status('2026-03-16')).toBe('week');
    expect(status('2026-03-21')).toBe('week');
    expect(status('2026-03-22')).toBe('later');
    expect(status('2026-03-01', { status: 'completed' })).toBe('done');
    expect(status('2026-03-01', { status: 'in-progress' })).toBe('overdue');
    // Wochenende über den Monatswechsel
    expect(
      app.getDueStatus(
        { dueDate: '2026-04-05', status: 'pending' },
        '2026-03-30',
      ),
    ).toBe('week');
    expect(
      app.getDueStatus(
        { dueDate: '2026-04-06', status: 'pending' },
        '2026-03-30',
      ),
    ).toBe('later');
  });

  test('compareDueDates sorts ascending with undated tasks last', () => {
    const list = [
      { id: 'a', dueDate: '2026-03-20' },
      { id: 'b' },
      { id: 'c', dueDate: '2026-03-10' },
      { id: 'd', dueDate: 'kaputt' },
    ];
    expect(
      [...list].sort((x, y) => app.compareDueDates(x, y)).map((t) => t.id),
    ).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe.each(['America/Los_Angeles', 'Pacific/Auckland', 'UTC'])(
  'time zone %s',
  (zone) => {
    test('the due date never shifts by a day', () => {
      const script = `
        const fs = require('node:fs');
        const vm = require('node:vm');
        const context = vm.createContext({ GartenPlaner: function () {} });
        vm.runInContext(fs.readFileSync(${JSON.stringify(path.join(ROOT, 'src/js/task-filters.js'))}, 'utf8'), context);
        const proto = context.GartenPlaner.prototype;
        const date = proto.parseDueDate('2026-03-15');
        console.log(JSON.stringify({
          day: [date.getFullYear(), date.getMonth() + 1, date.getDate()],
          text: proto.formatDueDate('2026-03-15'),
          today: proto.todayString.call(proto, new Date(2026, 2, 14, 23, 30)),
          early: proto.todayString.call(proto, new Date(2026, 2, 15, 0, 30)),
          // new Date('2026-03-15') ist UTC-Mitternacht und wäre hier der Vortag:
          naive: new Date('2026-03-15').getDate(),
        }));`;
      const out = JSON.parse(
        execFileSync(process.execPath, ['-e', script], {
          env: { ...process.env, TZ: zone },
          encoding: 'utf8',
        }),
      );
      expect(out.day).toEqual([2026, 3, 15]);
      expect(out.text).toBe('So., 15.03.2026');
      expect(out.today).toBe('2026-03-14');
      expect(out.early).toBe('2026-03-15');
      if (zone === 'America/Los_Angeles') expect(out.naive).toBe(14);
    });
  },
);

describe('Security.validateInput.dueDate and validateTask', () => {
  test('mirrors the server rules', () => {
    createApp();
    const valid = run(
      'Security.validateInput.dueDate.bind(Security.validateInput)',
    );
    for (const ok of ['2026-03-15', '2024-02-29', '2000-01-01', '2100-12-31']) {
      expect(valid(ok)).toBe(true);
    }
    for (const bad of [
      '2026-02-30',
      '2025-02-29',
      '1999-12-31',
      '2101-01-01',
      '2026-03-15T00:00:00Z',
      '15.03.2026',
      '',
      null,
    ]) {
      expect(valid(bad)).toBe(false);
    }
  });

  test('validateTask accepts null/missing and rejects a bad date', () => {
    createApp();
    const result = (dueDate) =>
      JSON.parse(
        run(
          `JSON.stringify(Security.validateTask({title:'a',location:'b',status:'pending',dueDate:${JSON.stringify(dueDate)}}))`,
        ),
      );
    expect(result(null).valid).toBe(true);
    expect(result('2026-03-15').valid).toBe(true);
    const bad = result('2026-02-30');
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/Fälligkeitsdatum/);
  });
});

describe('task card due date', () => {
  function card(overrides, today = '2026-03-15') {
    const { app, document } = createApp();
    app.todayString = () => today;
    document.body.innerHTML = app.createTaskCard(task(overrides));
    return document.body.querySelector('.task-card');
  }

  test('shows the German date with a text label and a machine readable value', () => {
    const element = card({ dueDate: '2026-03-20' });
    const due = element.querySelector('.task-due-date');
    expect(due.textContent).toContain('Fällig am:');
    expect(due.textContent).toContain('Fr., 20.03.2026');
    expect(due.querySelector('time').getAttribute('datetime')).toBe(
      '2026-03-20',
    );
    expect(due.classList.contains('due-week')).toBe(true);
    expect(due.querySelector('.due-flag')).toBeNull();
    expect(due.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  test('overdue and today carry a visible text flag, not only a color', () => {
    const overdue = card({ dueDate: '2026-03-10' }).querySelector(
      '.task-due-date',
    );
    expect(overdue.classList.contains('due-overdue')).toBe(true);
    expect(overdue.querySelector('.due-flag').textContent).toBe('Überfällig');
    const today = card({ dueDate: '2026-03-15' }).querySelector(
      '.task-due-date',
    );
    expect(today.classList.contains('due-today')).toBe(true);
    expect(today.querySelector('.due-flag').textContent).toBe('Heute fällig');
  });

  test('a completed task keeps its date but is never flagged', () => {
    const due = card({
      dueDate: '2026-03-01',
      status: 'completed',
    }).querySelector('.task-due-date');
    expect(due.classList.contains('due-done')).toBe(true);
    expect(due.querySelector('.due-flag')).toBeNull();
  });

  test('tasks without a (valid) date render nothing, hostile values stay inert', () => {
    for (const dueDate of [undefined, null, '', 'kaputt', HOSTILE]) {
      const element = card({ dueDate });
      expect(element.querySelector('.task-due-date')).toBeNull();
      expect(element.querySelector('img, b, script')).toBeNull();
    }
  });
});

describe('renderTasks with due date filter and sorting', () => {
  function page() {
    const ctx = createApp(
      '<!doctype html><html><body><div id="tasksList"></div></body></html>',
    );
    ctx.app.todayString = () => '2026-03-15';
    ctx.app.tasks = [
      task({ id: 'a', title: 'Spät', dueDate: '2026-04-30', sortOrder: 1 }),
      task({ id: 'b', title: 'Ohne', sortOrder: 2 }),
      task({ id: 'c', title: 'Gestern', dueDate: '2026-03-14', sortOrder: 3 }),
      task({ id: 'd', title: 'Heute', dueDate: '2026-03-15', sortOrder: 4 }),
      task({
        id: 'e',
        title: 'Erledigt',
        dueDate: '2026-03-01',
        status: 'completed',
        sortOrder: 5,
      }),
    ];
    const titles = () =>
      [...ctx.document.querySelectorAll('.task-card .task-title')].map(
        (el) => el.textContent,
      );
    return { ...ctx, titles };
  }

  test('manual order stays the default and cards are draggable', () => {
    const { app, document, titles } = page();
    app.renderTasks();
    expect(titles()).toEqual(['Spät', 'Ohne', 'Gestern', 'Heute', 'Erledigt']);
    expect(document.querySelector('.task-card').getAttribute('draggable')).toBe(
      'true',
    );
  });

  test('sorting by due date puts undated tasks last and disables dragging', () => {
    const { app, document, titles } = page();
    app.sortBy = 'dueDate';
    app.renderTasks();
    expect(titles()).toEqual(['Erledigt', 'Gestern', 'Heute', 'Spät', 'Ohne']);
    expect(document.querySelector('.task-card').getAttribute('draggable')).toBe(
      'false',
    );
    expect(document.querySelector('.drag-handle')).toBeNull();
  });

  test.each([
    ['overdue', ['Gestern']],
    ['today', ['Heute']],
    ['week', ['Heute']],
    ['none', ['Ohne']],
    ['', ['Spät', 'Ohne', 'Gestern', 'Heute', 'Erledigt']],
  ])('filter %p', (filter, expected) => {
    const { app, titles } = page();
    app.currentFilter.due = filter;
    app.renderTasks();
    expect(titles()).toEqual(expected);
  });

  test('the due filter combines with the other filters', () => {
    const { app, titles } = page();
    app.tasks[2].employee = 'Max';
    app.currentFilter.due = 'overdue';
    app.currentFilter.employee = 'Ada';
    app.renderTasks();
    expect(titles()).toEqual([]);
  });
});

describe('page markup for the due date', () => {
  const read = (name) =>
    fs.readFileSync(path.join(ROOT, 'public', name), 'utf8');

  test('create form: labelled optional date input with an alert region', () => {
    const { window } = createApp(read('index.html'));
    const { document } = window;
    const input = document.getElementById('taskDueDate');
    expect(input.type).toBe('date');
    expect(input.required).toBe(false);
    expect(
      document.querySelector('label[for="taskDueDate"]').textContent,
    ).toMatch(/Fällig am/);
    const error = document.getElementById('taskDueDateError');
    expect(error.getAttribute('role')).toBe('alert');
  });

  test('edit dialog and dashboard: date field, due filter, sorting and overdue count', () => {
    const { window } = createApp(read('dashboard.html'));
    const { document } = window;
    expect(document.getElementById('editTaskDueDate').type).toBe('date');
    expect(
      document.querySelector('#editModal label[for="editTaskDueDate"]'),
    ).not.toBeNull();
    for (const id of ['filterDue', 'sortTasks']) {
      expect(document.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
    expect(
      [...document.querySelectorAll('#filterDue option')].map((o) => o.value),
    ).toEqual(['', 'overdue', 'today', 'week', 'none']);
    expect(document.getElementById('statOverdue')).not.toBeNull();
  });

  test('_setFieldError wires aria attributes and clears them again', () => {
    const { app, window } = createApp(read('index.html'));
    const { document } = window;
    const input = document.getElementById('taskDueDate');
    app._setFieldError('taskDueDate', 'Bitte ein gültiges Datum wählen.');
    expect(document.getElementById('taskDueDateError').textContent).toBe(
      'Bitte ein gültiges Datum wählen.',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('taskDueDateError');
    expect(input.classList.contains('invalid')).toBe(true);
    app._setFieldError('taskDueDate', '');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(
      document.getElementById('taskDueDateError').classList.contains('visible'),
    ).toBe(false);
  });
});

describe('overdue count on the dashboard', () => {
  test('counts open tasks that are past due, 0 in the archive', () => {
    const { app, document } = createApp(
      '<!doctype html><html><body><span id="statOverdue">x</span></body></html>',
    );
    app.todayString = () => '2026-03-15';
    app.tasks = [
      task({ id: 'a', dueDate: '2026-03-14' }),
      task({ id: 'b', dueDate: '2026-03-15' }),
      task({ id: 'c', dueDate: '2026-03-01', status: 'completed' }),
      task({ id: 'd' }),
    ];
    app.updateStatistics();
    expect(document.getElementById('statOverdue').textContent).toBe('1');
    app.showArchive = true;
    app.updateStatistics();
    expect(document.getElementById('statOverdue').textContent).toBe('0');
  });
});

describe('forms send and store the due date', () => {
  function formPage(html, useAPI = false) {
    const ctx = createApp(`<!doctype html><html><body>${html}</body></html>`);
    const { window, app } = ctx;
    window.TaskAPI = { createTask: jest.fn(), updateTask: jest.fn() };
    Object.assign(app, {
      useAPI,
      showNotification: jest.fn(),
      announce: jest.fn(),
      setButtonLoading: jest.fn(),
      updateStatistics: jest.fn(),
      updateEmployeeFilter: jest.fn(),
      updateLocationFilter: jest.fn(),
      renderCreateSubtasksList: jest.fn(),
      renderTasks: jest.fn(),
    });
    load('task-state.js');
    return { ...ctx, api: window.TaskAPI };
  }

  const createForm = (
    dueDate = '',
  ) => `<form id="taskForm"><button type="submit"></button>
    <input id="taskTitle" value="Neu"><input id="taskEmployee" value="">
    <input id="taskLocation" value="Beet"><textarea id="taskDescription"></textarea>
    <input type="date" id="taskDueDate" value="${dueDate}">
    <span id="taskDueDateError"></span></form>`;

  test('addTask sends dueDate (or null) to the API and stores it locally', async () => {
    const { app, api } = formPage(createForm('2026-03-15'), true);
    api.createTask.mockResolvedValue({ id: 'srv', dueDate: '2026-03-15' });
    await app.addTask();
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: '2026-03-15' }),
    );
    expect(app.tasks[0].dueDate).toBe('2026-03-15');

    const local = formPage(createForm(''));
    await local.app.addTask();
    expect(local.app.tasks[0].dueDate).toBeNull();
  });

  test('addTask without a date field still works (other pages)', async () => {
    const { app, api } = formPage(
      `<form id="taskForm"><button type="submit"></button>
       <input id="taskTitle" value="Neu"><input id="taskEmployee" value="">
       <input id="taskLocation" value="Beet"><textarea id="taskDescription"></textarea></form>`,
      true,
    );
    api.createTask.mockResolvedValue({ id: 'srv' });
    await app.addTask();
    expect(api.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: null }),
    );
  });

  test('an out of range date is rejected with an inline message, nothing is sent', async () => {
    const { app, api, document } = formPage(createForm('1999-01-01'), true);
    jest.spyOn(dom.window.console, 'warn').mockImplementation(() => {});
    await app.addTask();
    expect(api.createTask).not.toHaveBeenCalled();
    const error = document.getElementById('taskDueDateError');
    expect(error.textContent).toMatch(/gültiges Datum/);
    expect(
      document.getElementById('taskDueDate').getAttribute('aria-invalid'),
    ).toBe('true');
    expect(document.activeElement.id).toBe('taskDueDate');
  });

  const editForm = (
    dueDate,
  ) => `<form id="editTaskForm"><button type="submit"></button></form>
    <input id="editTaskTitle" value="Titel"><input id="editTaskEmployee" value="Ada">
    <input id="editTaskLocation" value="Beet"><textarea id="editTaskDescription"></textarea>
    <input type="date" id="editTaskDueDate" value="${dueDate}">`;

  test('saveEditedTask sets, changes and removes the date and logs it locally', async () => {
    const base = {
      id: 'a',
      title: 'Titel',
      employee: 'Ada',
      location: 'Beet',
      description: '',
      status: 'pending',
    };
    const set = formPage(editForm('2026-03-15'));
    set.app.tasks = [{ ...base }];
    await set.app.saveEditedTask('a');
    expect(set.app.tasks[0].dueDate).toBe('2026-03-15');
    expect(set.app.tasks[0].history[0].details.changes).toEqual([
      'Fälligkeit: kein Termin → "2026-03-15"',
    ]);

    const removed = formPage(editForm(''), true);
    removed.app.tasks = [{ ...base, dueDate: '2026-03-15' }];
    removed.api.updateTask.mockResolvedValue({});
    await removed.app.saveEditedTask('a');
    expect(removed.api.updateTask).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ dueDate: null }),
    );
    expect(removed.app.tasks[0].dueDate).toBeNull();

    const same = formPage(editForm('2026-03-15'));
    same.app.tasks = [{ ...base, dueDate: '2026-03-15' }];
    await same.app.saveEditedTask('a');
    expect(same.app.tasks[0].history || []).toHaveLength(0);
  });
});
