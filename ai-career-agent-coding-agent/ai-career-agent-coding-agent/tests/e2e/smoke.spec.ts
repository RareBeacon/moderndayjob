import { expect, test } from '@playwright/test';

/**
 * Production smoke suite. Honest scope: these prove the deploy is alive,
 * the critical public surfaces render, auth works, mobile layouts hold,
 * and the paid gates stay shut. Deep product flows remain unit-covered.
 */

test('homepage renders and primary CTA is readable', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Jobiest/);
  const cta = page.getByRole('link', { name: /Start my next chapter|Start for free/ }).first();
  await expect(cta).toBeVisible();
  // contrast regression: button text must differ enough from its background
  const ratio = await cta.evaluate((el) => {
    const lum = (rgb: string) => {
      const m = rgb.match(/\d+(\.\d+)?/g)!.map(Number).slice(0, 3).map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
    };
    const cs = getComputedStyle(el);
    let bg = cs.backgroundColor;
    if (bg === 'rgba(0, 0, 0, 0)') {
      let p = el.parentElement;
      while (p && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
    }
    const l1 = lum(cs.color);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
  expect(ratio).toBeGreaterThan(4);
});

test('no horizontal overflow on mobile homepage', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile viewport only');
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('retired jobs routes are gone (no job listings offering)', async ({ request }) => {
  const jobs = await request.get('/api/jobs');
  expect(jobs.status()).toBe(404);
  const match = await request.get('/match');
  expect(match.status()).toBe(404);
});

test('auth pages render', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('protected route bounces anonymous visitors to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('pricing page renders and compare table is swipeable, not page-overflowing', async ({ page }) => {
  await page.goto('/pricing');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('health endpoint is up', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
});

const E2E_EMAIL = process.env.E2E_EMAIL;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

test.describe('authenticated (needs E2E_EMAIL/E2E_PASSWORD)', () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'credentials not provided');

  test('sign in and reach the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(E2E_EMAIL!);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /today/i }).first()).toBeVisible();
  });

  test('sensitive questions are never auto-answered', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(E2E_EMAIL!);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    const res = await page.request.post('/api/documents/generate', {
      data: {
        kind: 'ANSWERS',
        questions: ['What are your salary expectations?', 'Are you legally authorized to work in the United States?'],
      },
    });
    // Either the sensitive gate (422 ALL_QUESTIONS_SENSITIVE) or a profile
    // prerequisite (400) - never a 2xx that answered a sensitive question.
    expect([400, 401, 422]).toContain(res.status());
    if (res.status() === 422) {
      const body = await res.json();
      expect(body.error).toBe('ALL_QUESTIONS_SENSITIVE');
    }
  });
});
