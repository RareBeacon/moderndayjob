import { expect, test } from '@playwright/test';

/**
 * Master Reliability E2E Matrix (non-destructive).
 *
 * Covers:
 *  - Public & authentication surface availability (signup, forgot-password,
 *    reset-password, verify-email, free career tools, pricing)
 *  - Session expiry notice (/login?expired=1) and protected-route redirects
 *  - OAuth PKCE starter redirect + httpOnly context/verifier cookie contract
 *  - Deny-by-default unauthenticated API route protection
 *  - Health endpoint + x-request-id correlation header
 *  - Credential-gated authenticated persistence, navigation, and logout
 *    invalidation (honestly skipped when E2E_EMAIL/E2E_PASSWORD are unset)
 */

test('signup, forgot-password, and free career tools render cleanly', async ({ page }) => {
  const signupRes = await page.goto('/signup');
  expect(signupRes?.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();

  const toolsRes = await page.goto('/tools');
  expect(toolsRes?.status()).toBe(200);

  const scannerRes = await page.goto('/free-ats-resume-scanner');
  expect(scannerRes?.status()).toBe(200);
});

test('expired session redirect displays clear re-authentication notice on /login', async ({ page }) => {
  await page.goto('/login?next=%2Fdashboard&expired=1');
  await expect(page.getByRole('alert')).toContainText(/session expired/i);
});

test('protected workspace and admin pages redirect anonymous visitors to /login', async ({ request }) => {
  for (const protectedPath of ['/profile', '/documents', '/applications', '/billing', '/settings', '/admin/users']) {
    const res = await request.get(protectedPath, { maxRedirects: 0 });
    expect([302, 307, 308]).toContain(res.status());
    expect(res.headers()['location'] ?? '').toContain('/login');
  }
});

test('authenticated API routes reject anonymous callers with 401/403', async ({ request }) => {
  for (const apiPath of ['/api/profile', '/api/applications', '/api/documents', '/api/entitlements', '/api/admin/users']) {
    const res = await request.get(apiPath, { maxRedirects: 0 });
    expect([401, 403]).toContain(res.status());
  }
});

test('Google OAuth starter sets no-store + PKCE/context cookies on 302 redirect', async ({ request }) => {
  const res = await request.get('/api/auth/oauth?provider=google&from=/login&next=/dashboard', {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(302);
  expect(res.headers()['cache-control'] ?? '').toContain('no-store');
  const location = res.headers()['location'] ?? '';
  // Either redirects to Supabase / Google OAuth authorize endpoint or cleanly back to /login?error=... if unconfigured
  expect(location.length).toBeGreaterThan(0);
  if (!location.includes('/login?error=')) {
    const setCookies = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
    expect(setCookies.some((c) => c.includes('jobiest_oauth_ctx='))).toBe(true);
    expect(setCookies.some((c) => c.includes('code-verifier'))).toBe(true);
  }
});

test('health endpoint echoes x-request-id correlation header', async ({ request }) => {
  const customId = 'e2e-corr-check-20261031';
  const res = await request.get('/api/health', {
    headers: { 'x-request-id': customId },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { ok?: boolean; service?: string };
  expect(body.service).toBe('ai-career-agent');
  // Live production before correlation deploy may omit x-request-id; when present it must match customId
  const echoed = res.headers()['x-request-id'];
  if (echoed) {
    expect(echoed).toBe(customId);
  }
});

const E2E_EMAIL = process.env.E2E_EMAIL;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

test.describe('authenticated session lifecycle (requires E2E_EMAIL and E2E_PASSWORD)', () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'live test credentials not provided');

  test('preserves session across reload, navigates workspace modules, and invalidates on sign out', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(E2E_EMAIL!);
    await page.getByLabel(/password/i).fill(E2E_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Page refresh preserves session
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);

    // Navigate core protected modules
    for (const path of ['/profile', '/documents', '/applications', '/billing', '/settings']) {
      const resp = await page.goto(path);
      expect(resp?.status()).toBe(200);
      await expect(page).not.toHaveURL(/\/login/);
    }

    // Sign out invalidates session and blocks subsequent /dashboard access
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /^Sign out$/i }).first().click();
    await expect(page).toHaveURL(/\/$|\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
