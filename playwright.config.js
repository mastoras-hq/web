const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'node scripts/serve.mjs',
    port: 4173,
    reuseExistingServer: true,
  },
});
