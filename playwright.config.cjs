const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/smoke',
  workers: 1,
  retries: 0,
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  reporter: 'list',
});
