import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AI usage ledger (Phase 2, B-061): hashIp is deterministic and keyed;
 * trackGeneration records ok/error without ever failing the request.
 */

const m = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: () => ({ insert: m.insert }) },
}));

import { hashIp, recordGenerationUsage, trackGeneration } from '@/lib/ai/usage';

beforeEach(() => {
  vi.clearAllMocks();
  m.insert.mockResolvedValue({ error: null });
  process.env.LOG_HASH_KEY = 'test-log-key';
});

describe('hashIp', () => {
  it('is deterministic and keyed', () => {
    const a = hashIp('1.2.3.4');
    expect(a).toBe(hashIp('1.2.3.4'));
    expect(a).not.toBe(hashIp('1.2.3.5'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('returns null for missing/unknown IPs', () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp('unknown')).toBeNull();
  });
});

describe('recordGenerationUsage', () => {
  it('writes the ledger row shape and never throws on insert failure', async () => {
    m.insert.mockRejectedValueOnce(new Error('db down'));
    await expect(
      recordGenerationUsage({ userId: 'u1', feature: 'ai.resume', provider: 'deterministic', latencyMs: 12, status: 'ok' }),
    ).resolves.toBeUndefined();

    m.insert.mockResolvedValue({ error: null });
    await recordGenerationUsage({
      userId: null, ipHash: 'abc', feature: 'free-tools.cover-letter-generator', provider: 'template',
      latencyMs: 340, status: 'error', errorCode: 'BOOM', promptVersion: 'v1', contentHashValue: 'deadbeef',
    });
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: null, ip_hash: 'abc', feature: 'free-tools.cover-letter-generator', provider: 'template',
        status: 'error', error_code: 'BOOM', prompt_version: 'v1', content_hash: 'deadbeef',
      }),
    );
  });
  it('bounds feature and provider lengths', async () => {
    await recordGenerationUsage({ feature: 'x'.repeat(200), provider: 'y'.repeat(200), latencyMs: 1, status: 'ok' });
    const row = m.insert.mock.calls[0][0];
    expect(row.feature.length).toBeLessThanOrEqual(80);
    expect(row.provider.length).toBeLessThanOrEqual(80);
  });
});

describe('trackGeneration', () => {
  it('records ok with the winning provider and returns the result', async () => {
    const result = await trackGeneration({ userId: 'u1', feature: 'ai.match' }, async () => ({ data: 1, provider: 'primary' }));
    expect(result).toEqual({ data: 1, provider: 'primary' });
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ feature: 'ai.match', provider: 'primary', status: 'ok' }));
  });

  it('records the error and rethrows', async () => {
    const err = Object.assign(new Error('AI_ALL_PROVIDERS_FAILED: x'), { code: 'AI_ALL_PROVIDERS_FAILED' });
    await expect(
      trackGeneration({ userId: 'u1', feature: 'ai.match' }, async () => { throw err; }),
    ).rejects.toThrow('AI_ALL_PROVIDERS_FAILED');
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('survives a ledger insert failure', async () => {
    m.insert.mockRejectedValue(new Error('db down'));
    await expect(
      trackGeneration({ userId: 'u1', feature: 'ai.match' }, async () => ({ provider: 'p' })),
    ).resolves.toEqual({ provider: 'p' });
  });
});
