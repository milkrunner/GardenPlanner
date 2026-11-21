const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

function snapshot(directory) {
  if (!fs.existsSync(directory)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(directory, { recursive: true })
      .filter((file) => fs.statSync(path.join(directory, file)).isFile())
      .map((file) => [
        file,
        fs.readFileSync(path.join(directory, file)).toString('base64'),
      ]),
  );
}

test('concurrent processes isolate tasks, archives and plants without touching normal data', async () => {
  const normalData = path.resolve(__dirname, '../data');
  const before = snapshot(normalData);
  const program = `
    const fs = require('node:fs');
    const path = require('node:path');
    const store = require('./src/server/storage/json-store');
    (async () => {
      const value = process.env.FIXTURE;
      await store.writeTasks([{ id: value }]);
      await store.writeArchivedTasks([{ id: value + '-archive' }]);
      fs.writeFileSync(path.join(store.DATA_DIR, 'plants.json'), JSON.stringify([{ id: value }]));
      const plants = require('./src/server/services/plant-service').readPlants();
      console.log(JSON.stringify([store.readTasks(), store.readArchivedTasks(), plants]));
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const results = await Promise.all(
    ['one', 'two'].map(async (value) => {
      const { stdout } = await run(process.execPath, ['-e', program], {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          DATA_DIR: path.join(process.env.DATA_DIR, value),
          FIXTURE: value,
        },
      });
      return JSON.parse(stdout);
    }),
  );
  expect(results).toEqual([
    [[{ id: 'one' }], [{ id: 'one-archive' }], [{ id: 'one' }]],
    [[{ id: 'two' }], [{ id: 'two-archive' }], [{ id: 'two' }]],
  ]);
  expect(snapshot(normalData)).toEqual(before);
});
