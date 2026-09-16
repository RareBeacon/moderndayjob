import { describe, expect, it } from 'vitest';

/**
 * Digest AI-usage section (Phase 2, B-061): pure summarization + rendering,
 * and the §10.4 anomaly flags driven from injected usage rows.
 */
import { renderDigestHtml, renderDigestText, runSecurityDigest, summarizeUsage, type DigestEvent, type DigestUsageRow } from '@/lib/security/digest';

const rows: DigestUsageRow[] = [
  { feature: 'free-tools.cover-letter-generator', status: 'ok', user_id: null },
  { feature: 'free-tools.cover-letter-generator', status: 'ok', user_id: null },
  { feature: 'ai.resume', status: 'ok', user_id: 'u1' },
  { feature: 'ai.match', status: 'error', user_id: 'u1' },
  { feature: 'ai.match', status: 'blocked', user_id: 'u2' },
];

describe('summarizeUsage', () => {
  it('counts runs, errors, blocks, anonymous and top features', () => {
    const u = summarizeUsage(rows);
    expect(u.runs).toBe(5);
    expect(u.errors).toBe(1);
    expect(u.blocked).toBe(1);
    expect(u.anonymous).toBe(2);
    expect(u.topFeatures[0]).toEqual({ feature: 'free-tools.cover-letter-generator', count: 2 });
    expect(u.topFeatures).toHaveLength(3);
  });
});

describe('renderDigest (usage section)', () => {
  const base = {
    windowStart: '2026-09-15T00:00:00Z',
    windowEnd: '2026-09-16T00:00:00Z',
    total: 0,
    truncated: false,
    byAction: {},
    signups: 0,
    passwordResets: 0,
    suspicious: [],
    adminActions: [],
    flags: [],
  };
  const data = { ...base, usage: summarizeUsage(rows) };

  it('renders the usage line in HTML and text', () => {
    expect(renderDigestHtml(data)).toContain('AI usage');
    expect(renderDigestHtml(data)).toContain('5 run(s)');
    expect(renderDigestText(data)).toContain('AI usage: 5 run(s), 1 error(s), 1 quota-block(s), 2 anonymous.');
  });

  it('omits the section when usage is missing (ledger query failed)', () => {
    expect(renderDigestHtml(base)).not.toContain('AI usage');
  });
});

describe('runSecurityDigest usage flags', () => {
  const events: DigestEvent[] = [];

  function manyRows(n: number, errors: number, anonymous: number): DigestUsageRow[] {
    return Array.from({ length: n }, (_, i) => ({
      feature: 'f',
      status: i < errors ? 'error' : 'ok',
      user_id: i < anonymous ? null : 'u',
    }));
  }

  it('flags a high AI error rate', async () => {
    const report = await runSecurityDigest({
      to: 'admin@jobiest.com',
      queryEvents: async () => events,
      queryUsage: async () => manyRows(50, 10, 0),
      send: async () => ({ ok: true }),
    });
    expect(report.flags ?? []).toEqual([expect.stringContaining('AI error rate 20%')]);
  });

  it('flags high anonymous volume', async () => {
    const report = await runSecurityDigest({
      to: 'admin@jobiest.com',
      queryEvents: async () => events,
      queryUsage: async () => manyRows(900, 1, 850),
      send: async () => ({ ok: true }),
    });
    expect(report.flags ?? []).toEqual([expect.stringContaining('Anonymous generation volume high: 850')]);
  });

  it('degrades silently when the usage query fails', async () => {
    const report = await runSecurityDigest({
      to: 'admin@jobiest.com',
      queryEvents: async () => events,
      queryUsage: async () => { throw new Error('db down'); },
      send: async (_to, subject) => {
        expect(subject).not.toContain('AI error rate');
        return { ok: true };
      },
    });
    expect(report.ok).toBe(true);
    expect(report.flags ?? []).toEqual([]);
  });
});
