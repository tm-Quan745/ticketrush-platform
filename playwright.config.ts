import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 90000,
  expect: { timeout: 15000 }, globalSetup: './tests/e2e/setup.ts',
  globalTeardown: './tests/e2e/teardown.ts',
  use: { baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3100', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
});
