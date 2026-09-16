import { describe, expect, it } from 'vitest';
import { auditEvent, redactSecrets, requireAuditEvent, sanitizeMeta } from '@/lib/audit';

describe('redactSecrets', () => {
  it('redacts secret-shaped key=value pairs', () => {
    expect(redactSecrets('password=hunter2 token=abc.def.ghi')).toBe(
      'password=<redacted> token=<redacted>',
    );
  });

  it('redacts bearer-style tokens', () => {
    expect(redactSecrets('Authorization: Bearer xyz')).toBe('Authorization=<redacted>');
  });

  it('leaves ordinary text untouched', () => {
    const text = 'Generated a resume for the senior engineer role.';
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('sanitizeMeta', () => {
  it('redacts secrets inside string values and caps length', () => {
    const out = sanitizeMeta({ note: `token=secretvalue ${'x'.repeat(600)}` });
    const note = out.note as string;
    expect(note).toContain('token=<redacted>');
    expect(note.length).toBeLessThanOrEqual(500);
  });

  it('drops undefined and null fields', () => {
    const out = sanitizeMeta({ a: undefined, b: null, c: 'keep' });
    expect(out).toEqual({ c: 'keep' });
  });

  it('deep-copies structured values', () => {
    const out = sanitizeMeta({ list: [1, 2, 3], nested: { ok: true } });
    expect(out).toEqual({ list: [1, 2, 3], nested: { ok: true } });
  });

  it('caps keys to 64 chars', () => {
    const longKey = 'k'.repeat(100);
    const out = sanitizeMeta({ [longKey]: 'v' });
    expect(Object.keys(out)[0].length).toBe(64);
  });
});

// --- Phase 2 (B-060/B-063): outcome columns + the fail-closed variant ---

import { beforeEach, vi } from 'vitest';

const m = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: () => ({ insert: m.insert }) } }));

beforeEach(() => {
  vi.clearAllMocks();
  m.insert.mockResolvedValue({ error: null });
});

describe('auditEvent vs requireAuditEvent', () => {
  it('best-effort variant swallows insert failures', async () => {
    m.insert.mockRejectedValue(new Error('db down'));
    await expect(
      auditEvent({ action: 'USER_SIGNUP', resource: 'auth', outcome: 'allow', ipHash: 'h' }),
    ).resolves.toBeUndefined();
  });

  it('fail-closed variant throws on insert failure (the read must not proceed)', async () => {
    m.insert.mockRejectedValue(new Error('db down'));
    await expect(
      requireAuditEvent({ action: 'ADMIN_USER_PII_READ', resource: 'user', resourceId: 'u1', outcome: 'allow' }),
    ).rejects.toThrow('db down');
  });

  it('writes the Phase 2 columns when provided', async () => {
    await requireAuditEvent({
      action: 'ADMIN_USER_PII_READ', resource: 'user', resourceId: 'u1',
      userId: 'admin-1', outcome: 'allow', requestId: 'r-1', ipHash: 'ip-h', uaHash: 'ua-h',
    });
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'allow', request_id: 'r-1', ip_hash: 'ip-h', ua_hash: 'ua-h' }),
    );
  });
});
