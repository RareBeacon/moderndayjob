import { defineConfig, devices } from '@playwright/test';

/**
 * Production smoke suite (npm run e2e). Runs the tests in tests/e2e against
 * the LIVE site (E2E_BASE_URL, default https://jobiest.com); no local server
 * is started. Honest scope: these prove the deploy is alive, the critical
 * public surfaces render, and the paid gates stay shut. Deep product flows
 * remain unit-covered. Chromium-only projects (desktop + a phone viewport)
 * so CI downloads exactly one browser.
 *
 * Authenticated tests need the live-check account:
 *   E2E_EMAIL=... E2E_PASSWORD=...
 * They only use endpoints that are idempotent or test-account-scoped.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://jobiest.com',
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
