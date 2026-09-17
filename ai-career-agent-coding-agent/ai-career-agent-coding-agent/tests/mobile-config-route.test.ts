import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/mobile/config/route';

/**
 * GET /api/mobile/config is the native Android client's bootstrap endpoint.
 * It must expose ONLY the public client configuration (the same NEXT_PUBLIC_*
 * values the website ships to browsers) and never a server secret.
 */
describe('GET /api/mobile/config', () => {
  it('returns the public client configuration', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.apiBaseUrl).toBe('string');
    expect(String(body.apiBaseUrl)).toMatch(/^https?:\/\//);
    expect(typeof body.supabaseUrl).toBe('string');
    expect(typeof body.supabaseAnonKey).toBe('string');
    expect(body.supportEmail).toBe('support@jobiest.com');
    expect(body.minSupportedVersionCode).toBe(1);
  });

  it('never leaks a server-side secret', async () => {
    const response = await GET();
    const text = await response.text();
    for (const forbidden of [
      'SUPABASE_SERVICE_ROLE_KEY',
      'service_role',
      'FLW_SECRET',
      'RESEND_API_KEY',
      'ENCRYPTION_MASTER_KEY',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
