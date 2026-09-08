import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end browser tests (section 6 / 56 of the brief).
 *
 * These are NOT run as part of the default `npm test`; they need a running
 * server and a Playwright browser download, both of which may be unavailable
 * in a restricted environment. See tests/e2e/README.md.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
