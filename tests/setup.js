const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Jest runs this in each suite before application imports. Never use real data.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gardenplanner-jest-'));
process.env.DATA_DIR = path.join(root, 'data');
process.env.LOG_DIR = path.join(root, 'logs');
process.env.LOG_LEVEL = 'silent';
delete process.env.API_KEY;
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
