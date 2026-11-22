// Wochenansicht (#348): Wochenberechnung (Jahreswechsel, Sommerzeit), Zuordnung der Aufgaben,
// Darstellung nur über DOM-Builder (Escaping) und Bedienung. Die klassischen Skripte laufen in jsdom.
// Sommerzeit prüft ein eigener Node-Prozess mit gesetztem TZ (Jest ändert die Zeitzone nicht mehr).
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createBrowser } = require('./helpers/browser-scripts');

const ROOT = path.join(__dirname, '..');
const HOSTILE = '<img src=x onerror=alert(1)><b>fett</b>"\'&';

const WEEK_HTML = `
  <div class="tasks-header-actions"></div>
  <button class="view-btn active" data-view="list" aria-pressed="true">Liste</button>
  <button class="view-btn" data-view="week" aria-pressed="false">Woche</button>
  <div id="tasksList"></div>
  <div id="tasksWeek" hidden>
    <h3 id="weekTitle" tabindex="-1"></h3>
    <div id="weekGrid"></div>
    <div id="weekUndated"></div>
  </div>`;

let browser;
afterEach(() => {
  if (browser) browser.close();
  browser = undefined;
});

function createApp(html = WEEK_HTML, today = '2026-11-18') {
  browser = createBrowser({ html });
  browser.load('config.js', 'security.js');
  browser.run('class GartenPlaner {}');
  browser.load('task-state.js', 'task-filters.js', 'task-renderer.js');
  browser.load('task-week.js');
  const app = browser.run('new GartenPlaner()');
  Object.assign(app, {
    tasks: [],
    archivedTasks: [],
    showArchive: false,
    bulkMode: false,
    selectedTasks: new Set(),
    currentFilter: { employee: '', location: '', status: '', due: '' },
    sortBy: 'manual',
    searchQuery: '',
    currentView: 'list',
    weekStart: '',
    updateBulkToolbar() {},
  });
  app.todayString = () => today; // Mittwoch, KW 47
  return { app, document: browser.document };
}

const task = (overrides = {}) => ({
  id: 't1',
  title: 'Tomaten',
  employee: 'Ada',
  location: 'Beet',
  status: 'pending',
  ...overrides,
});

describe('week calculation', () => {
  let app;
  beforeEach(() => ({ app } = createApp()));

  test('the week starts on Monday and Sunday belongs to the week before', () => {
    expect(app.getWeekStart('2026-11-16')).toBe('2026-11-16'); // Montag
    expect(app.getWeekStart('2026-11-18')).toBe('2026-11-16');
    expect(app.getWeekStart('2026-11-22')).toBe('2026-11-16'); // Sonntag
    expect(app.getWeekStart('2026-11-23')).toBe('2026-11-23');
    expect(app.getWeekStart('kaputt')).toBeNull();
    expect(app.getWeekStart(HOSTILE)).toBeNull();
  });

  test('getWeekDays returns seven consecutive days across a year change', () => {
    expect(app.getWeekDays('2025-12-29')).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(app.getWeekStart('2026-01-01')).toBe('2025-12-29');
    expect(app.getWeekDays('kaputt')).toEqual([]);
  });

  test('leap day and month ends', () => {
    expect(app.shiftIsoDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(app.shiftIsoDate('2025-02-28', 1)).toBe('2025-03-01');
    expect(app.shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(app.shiftIsoDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('ISO calendar week numbers incl. year boundaries', () => {
    const week = (iso) => app.getIsoWeekNumber(iso);
    expect(week('2026-11-18')).toBe(47);
    expect(week('2026-01-01')).toBe(1); // Donnerstag: KW 1
    expect(week('2025-12-29')).toBe(1); // gehört schon zu KW 1/2026
    expect(week('2024-12-30')).toBe(1); // KW 1/2025
    expect(week('2027-01-03')).toBe(53); // Sonntag, noch KW 53/2026
    expect(week('2021-01-03')).toBe(53); // KW 53/2020
    expect(week('2021-01-04')).toBe(1);
    expect(week('2026-12-28')).toBe(53);
    expect(week('kaputt')).toBeNull();
  });

  test('formatWeekTitle', () => {
    expect(app.formatWeekTitle('2026-11-16')).toBe(
      'KW 47: 16.11.2026 – 22.11.2026',
    );
    expect(app.formatWeekTitle('2025-12-29')).toBe(
      'KW 1: 29.12.2025 – 04.01.2026',
    );
    expect(app.formatWeekTitle('kaputt')).toBe('');
  });

  test('groupTasksByWeek assigns days, undated and ignores other weeks', () => {
    const tasks = [
      task({ id: 'a', dueDate: '2026-11-16' }),
      task({ id: 'b', dueDate: '2026-11-22', status: 'completed' }),
      task({ id: 'c', dueDate: '2026-11-22' }),
      task({ id: 'd', dueDate: '2026-11-23' }), // nächste Woche
      task({ id: 'e', dueDate: '2026-11-15' }), // Vorwoche
      task({ id: 'f' }),
      task({ id: 'g', dueDate: null, status: 'completed' }),
      task({ id: 'h', dueDate: 'kaputt' }),
      task({ id: 'i', dueDate: null }),
    ];
    const groups = app.groupTasksByWeek(tasks, '2026-11-16');
    expect(groups.days).toHaveLength(7);
    expect(groups.byDay['2026-11-16'].map((t) => t.id)).toEqual(['a']);
    // offene vor erledigten
    expect(groups.byDay['2026-11-22'].map((t) => t.id)).toEqual(['c', 'b']);
    expect(groups.undated.map((t) => t.id)).toEqual(['f', 'h', 'i', 'g']);
    const placed = [
      ...groups.days.flatMap((day) => groups.byDay[day]),
      ...groups.undated,
    ].map((t) => t.id);
    expect(placed).not.toContain('d');
    expect(placed).not.toContain('e');
  });
});

describe.each([
  // [Zone, Montag der Woche mit Umstellung, erwartete Tage]
  [
    'Europe/Berlin', // Sommerzeit beginnt So, 29.03.2026 (23-h-Tag)
    '2026-03-23',
    [
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ],
  ],
  [
    'Europe/Berlin', // Sommerzeit endet So, 25.10.2026 (25-h-Tag)
    '2026-10-19',
    [
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ],
  ],
  [
    'America/New_York', // Sommerzeit beginnt So, 08.03.2026
    '2026-03-02',
    [
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ],
  ],
  [
    'Pacific/Auckland', // Umstellung, Jahreswechsel zugleich
    '2025-12-29',
    [
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ],
  ],
])('time zone %s', (zone, monday, expected) => {
  test(`week of ${monday} has seven distinct days`, () => {
    const script = `
      const fs = require('node:fs');
      const vm = require('node:vm');
      const context = vm.createContext({ GartenPlaner: function () {} });
      for (const file of ['task-filters.js', 'task-week.js']) {
        vm.runInContext(fs.readFileSync(${JSON.stringify(path.join(ROOT, 'src/js'))} + '/' + file, 'utf8'), context);
      }
      const proto = context.GartenPlaner.prototype;
      const sunday = proto.shiftIsoDate(${JSON.stringify(monday)}, 6);
      console.log(JSON.stringify({
        days: proto.getWeekDays(${JSON.stringify(monday)}),
        startFromSunday: proto.getWeekStart(sunday),
        startFromMonday: proto.getWeekStart(${JSON.stringify(monday)}),
        next: proto.shiftIsoDate(sunday, 1),
      }));`;
    const out = JSON.parse(
      execFileSync(process.execPath, ['-e', script], {
        env: { ...process.env, TZ: zone },
        encoding: 'utf8',
      }),
    );
    expect(out.days).toEqual(expected);
    expect(out.startFromSunday).toBe(monday);
    expect(out.startFromMonday).toBe(monday);
    expect(out.next).toBe(plusWeek(monday));
  });
});

// Montag + 7 Tage, ohne Zeitzonenabhängigkeit berechnet
function plusWeek(monday) {
  const [y, m, d] = monday.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
}

describe('renderWeek', () => {
  function weekApp(tasks) {
    const ctx = createApp();
    ctx.app.tasks = tasks;
    ctx.app.currentView = 'week';
    ctx.app.renderTasks();
    return ctx;
  }

  test('renders the current week with the task on the right day', () => {
    const { app, document } = weekApp([
      task({ id: 'a', title: 'Gießen', dueDate: '2026-11-18' }),
      task({ id: 'b', title: 'Später', dueDate: '2026-11-30' }),
      task({ id: 'c', title: 'Irgendwann' }),
    ]);
    expect(app.weekStart).toBe('2026-11-16');
    expect(document.getElementById('weekTitle').textContent).toBe(
      'KW 47: 16.11.2026 – 22.11.2026',
    );
    const days = document.querySelectorAll('.week-day');
    expect(days).toHaveLength(7);
    const wednesday = days[2];
    expect(wednesday.querySelector('time').getAttribute('datetime')).toBe(
      '2026-11-18',
    );
    expect(wednesday.querySelector('h4').textContent).toContain('Mittwoch');
    expect(wednesday.getAttribute('aria-current')).toBe('date');
    expect(wednesday.querySelector('.week-today-flag').textContent).toBe(
      'Heute',
    );
    expect(wednesday.querySelector('.week-task-title').textContent).toBe(
      'Gießen',
    );
    expect(document.querySelectorAll('.week-day .week-task')).toHaveLength(1);
    expect(document.querySelector('.week-day p.week-empty').textContent).toBe(
      'Keine Aufgaben',
    );
    expect(
      [...document.querySelectorAll('#weekUndated .week-task-title')].map(
        (el) => el.textContent,
      ),
    ).toEqual(['Irgendwann']);
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  });

  test('every day is a labelled section and tasks are real buttons', () => {
    const { document } = weekApp([
      task({ id: 'a', dueDate: '2026-11-18', title: 'Gießen' }),
    ]);
    document.querySelectorAll('.week-day').forEach((section) => {
      const heading = document.getElementById(
        section.getAttribute('aria-labelledby'),
      );
      expect(heading.tagName).toBe('H4');
    });
    const button = document.querySelector('.week-task');
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.textContent).toContain('Standort: Beet');
    expect(button.textContent).toContain('Mitarbeiter: Ada');
  });

  test('state is text: completed and overdue tasks carry a flag', () => {
    const { document } = weekApp([
      task({ id: 'a', title: 'Alt', dueDate: '2026-11-16' }),
      task({
        id: 'b',
        title: 'Fertig',
        dueDate: '2026-11-16',
        status: 'completed',
      }),
      task({ id: 'c', title: 'Morgen', dueDate: '2026-11-19' }),
      task({ id: 'd', title: 'Ohne', status: 'completed' }),
    ]);
    const flag = (title) =>
      [...document.querySelectorAll('.week-task')]
        .find(
          (el) => el.querySelector('.week-task-title').textContent === title,
        )
        .querySelector('.week-task-flag')?.textContent;
    expect(flag('Alt')).toBe('Überfällig');
    expect(flag('Fertig')).toBe('Erledigt');
    expect(flag('Morgen')).toBeUndefined();
    expect(flag('Ohne')).toBe('Erledigt');
  });

  test('untrusted task data stays text', () => {
    const { document } = weekApp([
      task({
        id: 'x"><img src=x>',
        title: HOSTILE,
        employee: HOSTILE,
        location: HOSTILE,
        dueDate: '2026-11-17',
      }),
      task({ id: 'u', title: HOSTILE, dueDate: HOSTILE }),
    ]);
    const root = document.getElementById('tasksWeek');
    expect(root.querySelector('img, b')).toBeNull();
    expect(root.querySelector('.week-task-title').textContent).toBe(HOSTILE);
    expect(root.textContent).toContain(HOSTILE);
    // ungültiges Datum: Aufgabe steht ohne Termin
    expect(
      root.querySelector('#weekUndated .week-task-title').textContent,
    ).toBe(HOSTILE);
  });

  test('uses the active tasks only, never the archive, and respects filters and search', () => {
    const { app, document } = weekApp([
      task({ id: 'a', title: 'Ada-Aufgabe', dueDate: '2026-11-17' }),
      task({
        id: 'b',
        title: 'Max-Aufgabe',
        employee: 'Max',
        dueDate: '2026-11-17',
      }),
    ]);
    app.archivedTasks = [
      task({ id: 'z', title: 'Archiviert', dueDate: '2026-11-17' }),
    ];
    app.showArchive = true;
    const titles = () =>
      [...document.querySelectorAll('.week-task-title')].map(
        (el) => el.textContent,
      );
    app.renderTasks();
    expect(titles()).toEqual(['Ada-Aufgabe', 'Max-Aufgabe']);
    app.currentFilter.employee = 'Max';
    app.renderTasks();
    expect(titles()).toEqual(['Max-Aufgabe']);
    app.currentFilter.employee = '';
    app.searchQuery = 'ada';
    app.renderTasks();
    expect(titles()).toEqual(['Ada-Aufgabe']);
  });

  test('empty undated list shows a message', () => {
    const { document } = weekApp([]);
    expect(document.querySelector('#weekUndated p').textContent).toBe(
      'Keine Aufgaben ohne Termin.',
    );
  });

  test('clicking a task opens the edit dialog for that task', () => {
    const { app, document } = weekApp([
      task({ id: 'abc', dueDate: '2026-11-18' }),
    ]);
    const opened = [];
    app.openEditModal = (id) => opened.push(id);
    document.querySelector('.week-task').click();
    expect(opened).toEqual(['abc']);
  });

  test('a re-render keeps the focus on the same task', () => {
    const { app, document } = weekApp([
      task({ id: 'abc', dueDate: '2026-11-18' }),
    ]);
    document.querySelector('.week-task').focus();
    app.tasks[0].dueDate = '2026-11-20'; // wie nach dem Ändern im Dialog
    app.renderTasks();
    const button = document.querySelector('.week-task');
    expect(document.activeElement).toBe(button);
    expect(button.closest('.week-day').querySelector('time').dateTime).toBe(
      '2026-11-20',
    );
    // Aufgabe verlässt die Woche: Fokus wandert auf die Überschrift
    app.tasks[0].dueDate = '2026-12-20';
    app.renderTasks();
    expect(document.activeElement).toBe(document.getElementById('weekTitle'));
  });
});

describe('navigation and view switch', () => {
  test('previous, next and today move by whole weeks over the year end', () => {
    const { app, document } = createApp(WEEK_HTML, '2026-12-30');
    app.currentView = 'week';
    app.renderWeek();
    expect(app.weekStart).toBe('2026-12-28');
    app.shiftWeek(1);
    expect(app.weekStart).toBe('2027-01-04');
    expect(document.getElementById('weekTitle').textContent).toBe(
      'KW 1: 04.01.2027 – 10.01.2027',
    );
    app.shiftWeek(-2);
    expect(app.weekStart).toBe('2026-12-21');
    app.goToCurrentWeek();
    expect(app.weekStart).toBe('2026-12-28');
    expect(document.getElementById('weekTitle').textContent).toBe(
      'KW 53: 28.12.2026 – 03.01.2027',
    );
  });

  test('setView toggles the containers, aria-pressed and the list actions', () => {
    const { app, document } = createApp();
    const list = document.getElementById('tasksList');
    const week = document.getElementById('tasksWeek');
    const [listBtn, weekBtn] = document.querySelectorAll('.view-btn');
    app.setView('week');
    expect(app.currentView).toBe('week');
    expect(list.hidden).toBe(true);
    expect(week.hidden).toBe(false);
    expect(weekBtn.getAttribute('aria-pressed')).toBe('true');
    expect(weekBtn.classList.contains('active')).toBe(true);
    expect(listBtn.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.tasks-header-actions').hidden).toBe(true);
    expect(document.querySelectorAll('.week-day')).toHaveLength(7);
    app.setView('list');
    expect(app.currentView).toBe('list');
    expect(list.hidden).toBe(false);
    expect(week.hidden).toBe(true);
    expect(listBtn.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.tasks-header-actions').hidden).toBe(false);
    app.setView('unbekannt');
    expect(app.currentView).toBe('list');
  });

  test('switching to the week leaves archive and bulk mode', () => {
    const { app } = createApp();
    app.showArchive = true;
    app.bulkMode = true;
    const calls = [];
    app.toggleArchiveView = () => {
      calls.push('archive');
      app.showArchive = false;
    };
    app.toggleBulkMode = () => {
      calls.push('bulk');
      app.bulkMode = false;
    };
    app.setView('week');
    expect(calls).toEqual(['archive', 'bulk']);
  });

  test('without the week markup (other pages) setView does nothing', () => {
    const { app } = createApp('<div id="tasksList"></div>');
    app.setView('week');
    expect(app.currentView).toBe('list');
  });
});
