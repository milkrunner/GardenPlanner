const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the real classic browser script without starting timers or a DOM.
function filtered(overrides = {}) {
  const context = vm.createContext({ GartenPlaner: function () {} });
  // Mit filename, damit die V8-Coverage das Skript dem Quelltext zuordnen kann.
  const filename = path.join(__dirname, '../src/js/task-filters.js');
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  const state = {
    tasks: [
      {
        title: 'Tomaten',
        employee: 'Ada',
        location: 'Beet',
        status: 'pending',
      },
      {
        title: 'Rasen',
        employee: 'Max',
        location: 'Wiese',
        status: 'completed',
      },
    ],
    archivedTasks: [
      {
        title: 'Archiv',
        employee: 'Ada',
        location: 'Beet',
        status: 'completed',
      },
    ],
    currentFilter: {},
    searchQuery: '',
    showArchive: false,
    ...overrides,
  };
  return context.GartenPlaner.prototype.getFilteredTasks
    .call(state)
    .map((task) => task.title);
}
test('combines employee, location, status and case-insensitive search', () => {
  expect(
    filtered({
      currentFilter: { employee: 'Ada', location: 'Beet', status: 'pending' },
      searchQuery: 'TOM',
    }),
  ).toEqual(['Tomaten']);
  expect(
    filtered({ currentFilter: { employee: 'Ada' }, searchQuery: 'Rasen' }),
  ).toEqual([]);
});
test('archive view uses archived rather than active tasks', () => {
  expect(filtered({ showArchive: true })).toEqual(['Archiv']);
});
