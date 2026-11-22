// Shared Chromium smoke harness: real Express app, disposable storage, loopback port.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER_DIR = path.join(__dirname, '../../src/server') + path.sep;

function dropServerModules() {
  // DATA_DIR/LOG_DIR are resolved at import time, so every start needs fresh modules.
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(SERVER_DIR)) delete require.cache[key];
  }
}

async function startApp(prefix = 'gardenplanner-smoke-', { apiKey } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = path.join(root, 'data');
  process.env.LOG_DIR = path.join(root, 'logs');
  process.env.LOG_LEVEL = 'silent';
  if (apiKey) process.env.API_KEY = apiKey;
  else delete process.env.API_KEY;
  dropServerModules();
  const { app } = require('../../src/server/app');
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  return {
    baseURL: `http://127.0.0.1:${server.address().port}`,
    async stop() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      dropServerModules();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

module.exports = { startApp };
