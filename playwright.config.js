// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 } } }],
  webServer: {
    command: 'node tests/serve.js',
    port: 4173,
    reuseExistingServer: true,
  },
});
