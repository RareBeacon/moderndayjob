import { defineConfig } from '@playwright/test';

/**
 * Production smoke suite (Phase 10). Runs against the LIVE site by default:
 *
 *   E2E_BASE_URL=https://jobiest.com npx playwright test -c playwright.e2e.config.ts
 *
 * Authenticated tests need the live-check account:
 *   E2E_EMAIL=... E2E_PASSWORD=...
 * They only use endpoints that are idempotent or test-account-scoped.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 1,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://jobiest.com',
    trace: 'off',
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
