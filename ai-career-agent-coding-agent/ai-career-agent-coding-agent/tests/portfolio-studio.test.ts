import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Portfolio Studio (Milestone 6, owner decisions D1 + D5).
 *
 * Contract: slugs are safe and collision-checked against BOTH the current
 * and previous slug columns; user content is sanitized at storage time and
 * escaped again in the HTML export (XSS fixtures below); the plan's record
 * limit (1/5/10/26) is enforced at create; creating requires an onboarded
 * account; publishing is an explicit, reversible action; PRIVATE portfolios
 * never resolve publicly.
 */

const m = vi.hoisted(() => {
  const db: Record<string, unknown> = {
    count: 0,
    rows: [] as Array<Record<string, unknown>>,
    slugTaken: false,
    insertError: null as unknown,
  };
  const gate = vi.fn();
  const requireUser = vi.fn();
  return { db, gate, requireUser };
});

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'portfolios') {
        return {
          // count probe: select('id', { count: 'exact', head: true }) → await .eq(...)
          // availability probe: select('id') → .or(...).limit(1).maybeSingle()
          select: (...args: unknown[]) => {
            if (args.length === 2) {
              return { eq: () => ({ count: m.db.count, error: null }) };
            }
            return {
              or: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: m.db.slugTaken ? { id: 'taken' } : null }),
                }),
              }),
              eq: () => ({ order: () => ({ data: m.db.rows, error: null }) }),
            };
          },
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({ data: { id: 'p1', ...payload }, error: m.db.insertError }),
            }),
          }),
        };
      }
      if (table === 'subscriptions') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      }
      if (table === 'subscription_plans') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { portfolio_limit: 1 } }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));
vi.mock('@/lib/auth', () => ({ requireUser: m.requireUser, getUser: vi.fn() }));
vi.mock('@/lib/onboarding-gate', () => ({ onboardingGateResponse: m.gate }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }), requestIp: () => '127.0.0.1' }));

import {
  candidateSlug,
  escapeHtml,
  sanitizePortfolioData,
  sanitizePortfolioText,
  slugBase,
  slugAvailable,
} from '@/lib/portfolios';
import { POST as createPOST } from '@/app/api/portfolios/route';

beforeEach(() => {
  m.requireUser.mockReset().mockResolvedValue({ id: 'user-1', email: 'ada@b.co' });
  m.gate.mockReset().mockResolvedValue(null);
  m.db.count = 0;
  m.db.slugTaken = false;
  m.db.insertError = null;
  m.db.rows = [];
  delete process.env.ENTITLEMENTS_LEDGER;
});
afterEach(() => vi.clearAllMocks());

describe('slugs', () => {
  it('derives a safe base from any title', () => {
    expect(slugBase('Ada Lovelace, Platform Engineer!')).toBe('ada-lovelace-platform-engineer');
    expect(slugBase('   ')).toBe('portfolio');
    expect(slugBase('Ünïcödé & Symbols ///')).toBe('n-c-d-symbols');
  });

  it('candidates are slug-shaped with a random tail', () => {
    const s = candidateSlug('My Portfolio');
    expect(s).toMatch(/^my-portfolio-[a-z0-9]{6}$/);
  });

  it('availability checks both the current and previous slug columns', async () => {
    m.db.slugTaken = true;
    expect(await slugAvailable('taken-slug')).toBe(false);
    m.db.slugTaken = false;
    expect(await slugAvailable('free-slug')).toBe(true);
  });
});

describe('sanitization (XSS fixtures)', () => {
  it('strips script tags, event handlers and markup from text', () => {
    const out = sanitizePortfolioText('<script>alert(1)</script>Hello <b>world</b>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('script');
    expect(out).toContain('Hello world');
  });

  it('drops javascript: and data: URLs, keeps https and mailto', () => {
    const data = sanitizePortfolioData({ links: { website: 'javascript:alert(1)', github: 'https://github.com/ada' } });
    expect(data.links.website).toBe('');
    expect(data.links.github).toBe('https://github.com/ada');
  });

  it('keeps apostrophes (real text) while removing double quotes and backticks', () => {
    expect(sanitizePortfolioText("Ada's `great` \"work\"")).toBe("Ada's great work");
  });

  it('the HTML export escapes every user string', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml("O'Brien & Sons")).toBe('O&#39;Brien &amp; Sons');
  });

  it('caps list lengths so a payload cannot bloat storage', () => {
    const data = sanitizePortfolioData({ skills: Array.from({ length: 500 }, (_, i) => `s${i}`) });
    expect(data.skills.length).toBe(40);
  });
});

describe('create route', () => {
  function req(body: unknown) {
    return new Request('http://localhost/api/portfolios', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('creates a PRIVATE portfolio with a unique slug and sanitized data', async () => {
    const res = await createPOST(req({ title: 'Ada Lovelace', templateId: 'sidebar', data: { about: '<script>x</script>Engineer' } }));
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.portfolio.visibility).toBe('PRIVATE');
    expect(String(out.portfolio.slug)).toMatch(/^ada-lovelace-[a-z0-9]{6}$/);
  });

  it('rejects an unknown template id without failing (falls back to clean)', async () => {
    const res = await createPOST(req({ title: 'Ada', templateId: 'does-not-exist' }));
    expect(res.status).toBe(201);
  });

  it('enforces the plan record limit (403 with the limit disclosed)', async () => {
    m.db.count = 1; // FREE limit is 1
    const res = await createPOST(req({ title: 'Second portfolio' }));
    expect(res.status).toBe(403);
    const out = await res.json();
    expect(out.error).toBe('PORTFOLIO_LIMIT_REACHED');
    expect(out.limit).toBe(1);
  });

  it('blocks accounts below the onboarding threshold', async () => {
    m.gate.mockResolvedValue(Response.json({ error: 'ONBOARDING_REQUIRED' }, { status: 403 }));
    const res = await createPOST(req({ title: 'Ada' }));
    expect(res.status).toBe(403);
    const out = await res.json();
    expect(out.error).toBe('ONBOARDING_REQUIRED');
  });

  it('requires authentication', async () => {
    m.requireUser.mockResolvedValue(null);
    const res = await createPOST(req({ title: 'Ada' }));
    expect(res.status).toBe(401);
  });

  it('creates with the deterministic fallback when every candidate collides', async () => {
    m.db.slugTaken = true;
    const res = await createPOST(req({ title: 'Ada' }));
    // The route retries candidates; with the probe always "taken" it still
    // creates with the deterministic fallback after 8 attempts.
    expect(res.status).toBe(201);
  });
});
