import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'session.browser.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:3195' },
  webServer: {
    command: 'npm run start', url: 'http://127.0.0.1:3195',
    env: { PORT: '3195', HOST: '127.0.0.1', NODE_ENV: 'production' }, reuseExistingServer: false,
  },
});
