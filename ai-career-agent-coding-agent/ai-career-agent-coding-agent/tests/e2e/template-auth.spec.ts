import { expect, test } from '@playwright/test';

/** Public, non-mutating browser checks. Auth responses are deliberately mocked:
 * these prove client routing and CSP hydration, not provider/inbox delivery. */
test('the 70 catalog designs show real miniature CVs and open a full document', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await page.goto('/templates');
  expect(response?.status()).toBe(200);
  const miniatures = page.locator('[data-preview-size="mini"] article[data-template-id][data-demo="true"]');
  await expect(miniatures).toHaveCount(70);
  expect(await miniatures.first().locator('section[data-section]').count()).toBeGreaterThan(4);
  await page.getByRole('button', { name: /^Preview .+ full size$/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-preview-size="full"] article[data-template-id]')).toBeVisible();
  expect(await dialog.locator('section[data-section]').count()).toBeGreaterThan(4);
  await dialog.getByRole('button', { name: 'Close template preview' }).click();
  await expect(dialog).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('signup failed delivery can resend; a manual code submits only on click', async ({ page }) => {
  await page.route('**/api/auth/signup', async (route) => {
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true, mustVerify: true, verificationEmailAccepted: false }) });
  });
  let sendAccepted = false;
  const confirmed: string[] = [];
  await page.route('**/api/auth/verify', async (route) => {
    const body = route.request().postDataJSON() as { action: string; code?: string };
    if (body.action === 'send') {
      await route.fulfill({ status: sendAccepted ? 200 : 503, contentType: 'application/json', body: JSON.stringify(sendAccepted
        ? { ok: true, message: 'A code was accepted for delivery. Check your inbox.' }
        : { ok: false, message: 'We could not send a code right now. Please try again shortly.' }) });
      return;
    }
    confirmed.push(body.code ?? '');
    const valid = body.code === '123456';
    await route.fulfill({ status: valid ? 200 : 400, contentType: 'application/json', body: JSON.stringify(valid ? { ok: true } : { ok: false, message: 'That code did not work.' }) });
  });

  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Ada Example');
  await page.getByLabel('Email', { exact: true }).fill('ada@example.com');
  await page.getByPlaceholder('801 234 5678').fill('8012345678');
  await page.locator('input[autocomplete="new-password"]').fill('longenough1!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/verify-email\?email=ada%40example.com&delivery=failed/);
  await expect(page.locator('.auth-error')).toContainText('could not send the code yet');
  await page.getByRole('button', { name: 'Send a new code', exact: true }).click();
  await expect(page.locator('.auth-error')).toContainText('could not send a code right now');
  sendAccepted = true;
  await page.getByRole('button', { name: 'Send a new code', exact: true }).click();
  await expect(page.locator('.auth-success')).toContainText('accepted for delivery');
  await page.locator('input[autocomplete="one-time-code"]').fill('000000');
  expect(confirmed).toEqual([]);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.locator('.auth-error')).toContainText('did not work');
  expect(confirmed).toEqual(['000000']);
  await page.locator('input[autocomplete="one-time-code"]').fill('123456');
  expect(confirmed).toEqual(['000000']);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page).toHaveURL(/\/login\?email=ada%40example.com&verified=1/);
  expect(confirmed).toEqual(['000000', '123456']);
});

test('a code from an emailed link auto-submits exactly once', async ({ page }) => {
  const confirmed: string[] = [];
  await page.route('**/api/auth/verify', async (route) => {
    const body = route.request().postDataJSON() as { action: string; code?: string };
    if (body.action === 'confirm') confirmed.push(body.code ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.goto('/verify-email?email=ada%40example.com&code=123456');
  await expect(page).toHaveURL(/\/login\?email=ada%40example.com&verified=1/);
  expect(confirmed).toEqual(['123456']);
});
