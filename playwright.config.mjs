import { defineConfig, devices } from '@playwright/test';

// The e2e server gets its own port (npm start uses 4173) and mounts the build under the same
// /lu4-polearm-guide/ prefix GitHub Pages uses, so the tests prove the site works there.
export const PORT = 4174;
export const BASE_PATH = '/lu4-polearm-guide/';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && node scripts/serve.mjs --port ${PORT} --base ${BASE_PATH}`,
    url: `http://127.0.0.1:${PORT}${BASE_PATH}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
