// Aussaat- und Ernte-Vorschläge (#349): Datumsrechnung (Jahreswechsel, Schaltjahr, Sommerzeit, fehlende oder
// unlesbare Angaben), Darstellung (Escaping) und Übernahme ins Formular. Die klassischen Skripte laufen in jsdom.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const HOSTILE = '<img src=x onerror=alert(1)><b>fett</b>"\'&';
let dom;

const FORM = `
  <form id="taskForm">
    <input id="taskTitle" /><span id="taskTitleError"></span>
    <input id="taskLocation" /><span id="taskLocationError"></span>
    <input id="taskDueDate" type="date" /><span id="taskDueDateError"></span>
    <select id="taskPlant"><option value="">Keine Pflanze</option></select>
    <textarea id="taskDescription"></textarea>
  </form>
  <ul id="suggestionsList"></ul>`;

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
function createApp(plants = []) {
  dom = new JSDOM(`<!doctype html><html><body>${FORM}</body></html>`, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  load('config.js', 'security.js');
  run('class GartenPlaner {}');
  load(
    'task-state.js',
    'task-filters.js',
    'task-renderer.js',
    'task-suggestions.js',
  );
  const app = run('new GartenPlaner()');
  app.plants = plants;
  window.announcer = window.document.createElement('div');
  window.document.body.appendChild(window.announcer);
  return { app, window, document: window.document };
}
afterEach(() => {
  if (dom) dom.window.close();
  dom = undefined;
});

const plant = (overrides = {}) => ({
  id: 'tomato',
  name: 'Tomate',
  icon: '🍅',
  season: ['spring', 'summer'],
  sowMonths: [2, 3, 4],
  germination: '7-14 Tage',
  harvest: '60-85 Tage',
  ...overrides,
});

describe('parseDurationDays', () => {
  let app;
  beforeEach(() => ({ app } = createApp()));

  test('reads ranges, single values and weeks', () => {
    expect(app.parseDurationDays('7-14 Tage')).toEqual({ min: 7, max: 14 });
    expect(app.parseDurationDays('60–85 Tage')).toEqual({ min: 60, max: 85 });
    expect(app.parseDurationDays(' 10 Tage')).toEqual({ min: 10, max: 10 });
    expect(app.parseDurationDays('14 Tagen')).toEqual({ min: 14, max: 14 });
    expect(app.parseDurationDays('1-2 Wochen')).toEqual({ min: 7, max: 14 });
    expect(app.parseDurationDays('3 Wochen')).toEqual({ min: 21, max: 21 });
    expect(app.parseDurationDays('90 Tage (ab Pflanzung)')).toEqual({
      min: 90,
      max: 90,
    });
  });

  test('unreadable or implausible values give null', () => {
    for (const bad of [
      'mehrjährig',
      'mehrjährig (ab Jahr 3)',
      '-',
      '',
      '   ',
      '14-7 Tage',
      '0 Tage',
      '7-14',
      '7-14 Tageszeiten',
      'ca. 7 Tage',
      '1000 Tage',
      null,
      undefined,
      42,
      {},
      HOSTILE,
    ]) {
      expect(app.parseDurationDays(bad)).toBeNull();
    }
  });
});

describe('getSowMonths', () => {
  let app;
  beforeEach(() => ({ app } = createApp()));

  test('prefers sowMonths, sorted and unique', () => {
    expect(app.getSowMonths(plant({ sowMonths: [9, 3, 3] }))).toEqual([3, 9]);
  });

  test('falls back to the season when sowMonths is missing, empty or unusable', () => {
    const expected = [3, 4, 5, 6, 7, 8];
    expect(app.getSowMonths(plant({ sowMonths: undefined }))).toEqual(expected);
    expect(app.getSowMonths(plant({ sowMonths: [] }))).toEqual(expected);
    expect(app.getSowMonths(plant({ sowMonths: [0, 13, 'x'] }))).toEqual(
      expected,
    );
    expect(
      app.getSowMonths(plant({ sowMonths: [], season: ['winter'] })),
    ).toEqual([1, 2, 12]);
  });

  test('nothing usable gives an empty list', () => {
    expect(app.getSowMonths({ id: 'x' })).toEqual([]);
    expect(app.getSowMonths(plant({ sowMonths: [], season: [] }))).toEqual([]);
    expect(
      app.getSowMonths(
        plant({ sowMonths: [], season: ['monsoon', '__proto__'] }),
      ),
    ).toEqual([]);
    expect(app.getSowMonths(null)).toEqual([]);
  });
});

describe('findSowDate', () => {
  let app;
  beforeEach(() => ({ app } = createApp()));

  test('today when the current month fits', () => {
    expect(app.findSowDate([3, 4], '2026-03-17')).toEqual({
      date: '2026-03-17',
      now: true,
    });
  });

  test('the first of the next fitting month, also across New Year', () => {
    expect(app.findSowDate([3, 4], '2026-02-10')).toEqual({
      date: '2026-03-01',
      now: false,
    });
    expect(app.findSowDate([1, 2], '2026-12-20')).toEqual({
      date: '2027-01-01',
      now: false,
    });
    expect(app.findSowDate([3], '2026-04-01')).toEqual({
      date: '2027-03-01',
      now: false,
    });
  });

  test('no months or an invalid date give null', () => {
    expect(app.findSowDate([], '2026-03-17')).toBeNull();
    expect(app.findSowDate([3], '2026-02-30')).toBeNull();
    expect(app.findSowDate(null, '2026-03-17')).toBeNull();
  });
});

describe('getPlantingSuggestion', () => {
  let app;
  beforeEach(() => ({ app } = createApp()));

  test('sowing possible now: harvest from sow date plus the minimum duration', () => {
    const s = app.getPlantingSuggestion(plant(), '2026-03-15');
    expect(s).toEqual({
      plantId: 'tomato',
      sowDate: '2026-03-15',
      sowNow: true,
      sowMonths: [2, 3, 4],
      germinationDays: { min: 7, max: 14 },
      harvest: {
        from: '2026-05-14',
        to: '2026-06-08',
        days: { min: 60, max: 85 },
      },
    });
  });

  test('window starts within 30 days: suggestion with the start date', () => {
    const s = app.getPlantingSuggestion(plant(), '2026-01-20');
    expect(s.sowNow).toBe(false);
    expect(s.sowDate).toBe('2026-02-01');
    expect(s.harvest.from).toBe('2026-04-02'); // 2026 is no leap year
  });

  test('window further away than 30 days gives no suggestion', () => {
    expect(app.getPlantingSuggestion(plant(), '2026-12-15')).toBeNull();
    // 30 Tage Vorlauf: der 2. Januar reicht bis zum 1. Februar, der 1. Januar nicht
    expect(app.getPlantingSuggestion(plant(), '2026-01-02')).not.toBeNull();
    expect(app.getPlantingSuggestion(plant(), '2026-01-01')).toBeNull();
  });

  test('New Year: window in January found from December, harvest in the next year', () => {
    const winter = plant({ sowMonths: [1], harvest: '30 Tage' });
    const s = app.getPlantingSuggestion(winter, '2026-12-28');
    expect(s.sowDate).toBe('2027-01-01');
    expect(s.harvest.from).toBe('2027-01-31');
    const late = plant({ sowMonths: [12], harvest: '60-85 Tage' });
    const t = app.getPlantingSuggestion(late, '2026-12-10');
    expect(t.harvest).toMatchObject({ from: '2027-02-08', to: '2027-03-05' });
  });

  test('leap year: Feb 29 exists in 2028 and not in 2027', () => {
    const p = plant({ sowMonths: [2], harvest: '60 Tage' });
    expect(app.getPlantingSuggestion(p, '2028-02-01').harvest.from).toBe(
      '2028-04-01',
    );
    expect(app.getPlantingSuggestion(p, '2027-02-01').harvest.from).toBe(
      '2027-04-02',
    );
    const short = plant({ sowMonths: [2], harvest: '28 Tage' });
    expect(app.getPlantingSuggestion(short, '2028-02-01').harvest.from).toBe(
      '2028-02-29',
    );
    expect(app.getPlantingSuggestion(short, '2027-02-01').harvest.from).toBe(
      '2027-03-01',
    );
  });

  test('missing or unreadable harvest and germination data: no harvest date, sowing stays', () => {
    for (const harvest of [undefined, '', '-', 'mehrjährig', 'bald', null]) {
      const s = app.getPlantingSuggestion(
        plant({ harvest, germination: undefined }),
        '2026-03-15',
      );
      expect(s.sowDate).toBe('2026-03-15');
      expect(s.harvest).toBeNull();
      expect(s.germinationDays).toBeNull();
    }
  });

  test('a harvest date beyond the due date limit (2100) is dropped', () => {
    const s = app.getPlantingSuggestion(
      plant({ sowMonths: [12], harvest: '999 Tage' }),
      '2100-12-05',
    );
    expect(s.sowDate).toBe('2100-12-05');
    expect(s.harvest).toBeNull();
  });

  test('unusable plants and dates give null', () => {
    expect(app.getPlantingSuggestion(null, '2026-03-15')).toBeNull();
    expect(app.getPlantingSuggestion({}, '2026-03-15')).toBeNull();
    expect(
      app.getPlantingSuggestion(
        plant({ sowMonths: [], season: [] }),
        '2026-03-15',
      ),
    ).toBeNull();
    expect(app.getPlantingSuggestion(plant(), 'heute')).toBeNull();
    expect(
      app.getPlantingSuggestion(plant({ id: 7 }), '2026-03-15'),
    ).toBeNull();
  });
});

describe('getPlantingSuggestions', () => {
  test('now first, then by start date, then by name; non-arrays give an empty list', () => {
    const { app } = createApp();
    const plants = [
      plant({ id: 'z-later', name: 'Zwiebel', sowMonths: [4] }),
      plant({ id: 'b-now', name: 'Bohne', sowMonths: [3] }),
      plant({ id: 'a-now', name: 'Apfel', sowMonths: [3] }),
      plant({ id: 'none', name: 'Nichts', sowMonths: [], season: [] }),
      plant({ id: 'far', name: 'Fern', sowMonths: [9] }),
    ];
    const ids = app
      .getPlantingSuggestions(plants, '2026-03-20')
      .map((e) => e.plant.id);
    expect(ids).toEqual(['a-now', 'b-now', 'z-later']);
    expect(app.getPlantingSuggestions(null, '2026-03-20')).toEqual([]);
    expect(app.getPlantingSuggestions({}, '2026-03-20')).toEqual([]);
  });
});

describe('formatMonthRanges', () => {
  test('groups consecutive months, also over the year boundary', () => {
    const { app } = createApp();
    expect(app.formatMonthRanges([3, 4, 5])).toBe('März–Mai');
    expect(app.formatMonthRanges([5, 3, 4, 4])).toBe('März–Mai');
    expect(app.formatMonthRanges([3, 5])).toBe('März, Mai');
    expect(app.formatMonthRanges([12, 1, 2])).toBe('Dezember–Februar');
    expect(app.formatMonthRanges([1, 2, 6, 11, 12])).toBe(
      'Juni, November–Februar',
    );
    expect(app.formatMonthRanges([7])).toBe('Juli');
    expect(app.formatMonthRanges([])).toBe('');
  });
});

describe('buildSuggestionTask', () => {
  test('sowing and harvesting tasks carry plant, date and a hint about the accuracy', () => {
    const { app } = createApp();
    const p = plant();
    const s = app.getPlantingSuggestion(p, '2026-03-15');
    const sow = app.buildSuggestionTask(p, s, 'sow');
    expect(sow).toMatchObject({
      title: 'Tomate aussäen',
      dueDate: '2026-03-15',
      plantId: 'tomato',
    });
    expect(sow.description).toContain('Februar–April');
    expect(sow.description).toContain('Keimung nach ca. 7–14 Tagen');
    expect(sow.description).toContain('ohne regionales Klima');
    const harvest = app.buildSuggestionTask(p, s, 'harvest');
    expect(harvest).toMatchObject({
      title: 'Tomate ernten',
      dueDate: '2026-05-14',
      plantId: 'tomato',
    });
    expect(harvest.description).toContain('60–85 Tage nach Aussaat');
  });

  test('harvest without a computable date falls back to sowing', () => {
    const { app } = createApp();
    const p = plant({ harvest: 'mehrjährig' });
    const s = app.getPlantingSuggestion(p, '2026-03-15');
    expect(app.buildSuggestionTask(p, s, 'harvest').title).toBe(
      'Tomate aussäen',
    );
  });
});

describe('applySuggestion (nothing is created without confirmation)', () => {
  const today = () => run('new Date()');

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('fills the form, selects the plant, focuses the missing location and creates nothing', () => {
    const { app, document, window } = createApp([
      plant({ sowMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    ]);
    window.TaskAPI = { createTask: jest.fn() };
    app.populatePlantSelect('taskPlant', '');
    app.addTask = jest.fn();
    expect(app.applySuggestion('tomato', 'sow')).toBe(true);
    expect(document.getElementById('taskTitle').value).toBe('Tomate aussäen');
    expect(document.getElementById('taskDueDate').value).toBe(
      app.todayString(today()),
    );
    expect(document.getElementById('taskPlant').value).toBe('tomato');
    expect(document.getElementById('taskDescription').value).toContain(
      'Richtwert',
    );
    expect(document.activeElement.id).toBe('taskLocation');
    jest.advanceTimersByTime(150);
    expect(window.announcer.textContent).toContain('Standort ergänzen');
    expect(window.TaskAPI.createTask).not.toHaveBeenCalled();
    expect(app.addTask).not.toHaveBeenCalled();
  });

  test('harvest suggestion takes the harvest date; an entered location is kept', () => {
    const { app, document } = createApp([
      plant({ sowMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }),
    ]);
    document.getElementById('taskLocation').value = 'Beet 3';
    const expected = app.getPlantingSuggestion(
      app.plants[0],
      app.todayString(today()),
    ).harvest.from;
    expect(app.applySuggestion('tomato', 'harvest')).toBe(true);
    expect(document.getElementById('taskTitle').value).toBe('Tomate ernten');
    expect(document.getElementById('taskDueDate').value).toBe(expected);
    expect(document.getElementById('taskLocation').value).toBe('Beet 3');
    expect(document.activeElement.id).toBe('taskTitle');
  });

  test('unknown plant or one without a suggestion changes nothing', () => {
    const { app, document } = createApp([plant({ sowMonths: [], season: [] })]);
    expect(app.applySuggestion('missing', 'sow')).toBe(false);
    expect(app.applySuggestion('tomato', 'sow')).toBe(false);
    expect(document.getElementById('taskTitle').value).toBe('');
  });
});

describe('renderSuggestions', () => {
  const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  test('renders plant data as text only, with buttons named after the plant', () => {
    const { app, document } = createApp([
      plant({
        id: 'evil',
        name: HOSTILE,
        icon: '<b>x</b>',
        sowMonths: ALL_YEAR,
        harvest: HOSTILE,
      }),
    ]);
    app.renderSuggestions();
    const list = document.getElementById('suggestionsList');
    expect(list.querySelector('img, b')).toBeNull();
    expect(list.textContent).toContain(HOSTILE);
    const [sow] = list.querySelectorAll('button');
    expect(sow.textContent).toBe('Aussaat übernehmen');
    expect(sow.getAttribute('aria-label')).toBe(
      `Aussaat übernehmen: ${HOSTILE}`,
    );
    expect(sow.dataset.plantId).toBe('evil');
    expect(list.querySelectorAll('button')).toHaveLength(1); // harvest not computable
    expect(list.textContent).toContain('kein Erntetermin berechenbar');
  });

  test('shows a harvest button when the date can be computed', () => {
    const { app, document } = createApp([plant({ sowMonths: ALL_YEAR })]);
    app.renderSuggestions();
    const labels = [
      ...document.querySelectorAll('#suggestionsList button'),
    ].map((b) => b.textContent);
    expect(labels).toEqual(['Aussaat übernehmen', 'Ernte übernehmen']);
  });

  test('explains the empty state and the missing library', () => {
    const { app, document } = createApp([plant({ sowMonths: [], season: [] })]);
    app.renderSuggestions();
    expect(document.getElementById('suggestionsList').textContent).toContain(
      'keine Vorschläge',
    );
    app.plants = null;
    app.renderSuggestions();
    expect(document.getElementById('suggestionsList').textContent).toContain(
      'nicht verfügbar',
    );
  });
});

describe.each(['America/Los_Angeles', 'Pacific/Auckland', 'UTC'])(
  'time zone %s',
  (zone) => {
    test('dates stay calendar days across daylight saving changes', () => {
      const script = `
        const fs = require('node:fs');
        const vm = require('node:vm');
        const context = vm.createContext({ GartenPlaner: function () {} });
        for (const f of ['task-filters.js', 'task-suggestions.js']) {
          vm.runInContext(fs.readFileSync(${JSON.stringify(path.join(ROOT, 'src/js'))} + '/' + f, 'utf8'), context);
        }
        const proto = context.GartenPlaner.prototype;
        const p = (m, h) => ({ id: 'x', name: 'X', sowMonths: m, harvest: h });
        console.log(JSON.stringify([
          proto.getPlantingSuggestion(p([3], '60 Tage'), '2026-03-01').harvest.from,
          proto.getPlantingSuggestion(p([10], '30 Tage'), '2026-10-20').harvest.from,
          proto.getPlantingSuggestion(p([9], '40 Tage'), '2026-09-15').harvest.from,
          proto.getPlantingSuggestion(p([4], '40 Tage'), '2026-04-01').harvest.from,
        ]));`;
      const out = JSON.parse(
        execFileSync(process.execPath, ['-e', script], {
          env: { ...process.env, TZ: zone },
          encoding: 'utf8',
        }),
      );
      expect(out).toEqual([
        '2026-04-30',
        '2026-11-19',
        '2026-10-25',
        '2026-05-11',
      ]);
    });
  },
);
