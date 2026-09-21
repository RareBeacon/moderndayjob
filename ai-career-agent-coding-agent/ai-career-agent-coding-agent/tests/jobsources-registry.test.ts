import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Job source registry (B-140/B-147): adapters load from job_sources honoring
 * enabled + cooldown; the circuit breaker opens after 3 consecutive failures
 * for 1 hour and closes on the first success.
 */

const m = vi.hoisted(() => {
  const state: { rows: unknown[] | Error } = { rows: [] };
  const updates: Array<{ values: Record<string, unknown>; eqs: Record<string, unknown> }> = [];
  const chain = () => {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { (q as { eqs?: Record<string, unknown> }).eqs = { ...(q as { eqs?: Record<string, unknown> }).eqs, [c]: v }; return q; },
      maybeSingle: async () => ({
        data: Array.isArray(state.rows) ? (state.rows[0] as Record<string, unknown> | undefined) ?? null : null,
        error: null,
      }),
      update: (values: Record<string, unknown>) => {
        const rec = { values, eqs: {} as Record<string, unknown> };
        updates.push(rec);
        (q as { __rec?: unknown }).__rec = rec;
        return q;
      },
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) => {
        if (state.rows instanceof Error) rej(state.rows);
        else res({ data: state.rows, error: null });
      },
    };
    return q;
  };
  const from = vi.fn(() => chain());
  return { state, updates, from };
});

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: m.from } }));

import {
  loadRegistryAdapters,
  recordSourceOutcome,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS,
} from '@/lib/jobsources/registry';
import { defaultAdapters } from '@/lib/jobsources/boards';

const fetchImpl = (async () => new Response('{}')) as unknown as typeof fetch;
const row = (over: Record<string, unknown> = {}) => ({
  id: 'greenhouse:gitlab',
  adapter: 'greenhouse',
  board: 'gitlab',
  enabled: true,
  compliance: {},
  consecutive_failures: 0,
  last_ok_at: null,
  cooldown_until: null,
  ...over,
});

beforeEach(() => {
  m.state.rows = [];
  m.updates.length = 0;
});

describe('loadRegistryAdapters (B-140)', () => {
  it('builds adapters from registry rows', async () => {
    m.state.rows = [row()];
    const adapters = await loadRegistryAdapters(fetchImpl, () => defaultAdapters());
    expect(adapters.map((a) => a.id)).toEqual(['greenhouse:gitlab']);
  });

  it('skips disabled sources (per-source kill switch, B-224)', async () => {
    m.state.rows = [row(), row({ id: 'lever:spotify', adapter: 'lever', board: 'spotify', enabled: false })];
    const adapters = await loadRegistryAdapters(fetchImpl, () => defaultAdapters());
    expect(adapters.map((a) => a.id)).toEqual(['greenhouse:gitlab']);
  });

  it('skips sources in cooldown (open circuit, B-147)', async () => {
    m.state.rows = [row({ cooldown_until: new Date(Date.now() + 60_000).toISOString() })];
    const adapters = await loadRegistryAdapters(fetchImpl, () => defaultAdapters());
    expect(adapters).toHaveLength(0);
  });

  it('re-includes sources whose cooldown has lapsed', async () => {
    m.state.rows = [row({ cooldown_until: new Date(Date.now() - 60_000).toISOString() })];
    const adapters = await loadRegistryAdapters(fetchImpl, () => defaultAdapters());
    expect(adapters).toHaveLength(1);
  });

  it('falls back to env defaults when the registry is empty', async () => {
    m.state.rows = [];
    const adapters = await loadRegistryAdapters(fetchImpl, () => defaultAdapters({ ...process.env, JOB_SOURCE_GREENHOUSE_BOARDS: 'stripe' } as NodeJS.ProcessEnv));
    expect(adapters.map((a) => a.id)).toEqual(['greenhouse:stripe', 'lever:spotify', 'ashby:openai', 'ashby:linear']);
  });

  it('falls back when the registry query itself fails', async () => {
    m.state.rows = new Error('relation "job_sources" does not exist');
    const adapters = await loadRegistryAdapters(fetchImpl, () => defaultAdapters({ ...process.env, JOB_SOURCE_LEVER_BOARDS: 'netflix' } as NodeJS.ProcessEnv));
    expect(adapters.map((a) => a.id)).toEqual(['greenhouse:gitlab', 'greenhouse:anthropic', 'greenhouse:coinbase', 'lever:netflix', 'ashby:openai', 'ashby:linear']);
  });

  it('ignores unknown adapter kinds', async () => {
    m.state.rows = [row(), row({ id: 'weird:x', adapter: 'linkedin', board: 'x' })];
    const adapters = await loadRegistryAdapters(fetchImpl, () => []);
    expect(adapters.map((a) => a.id)).toEqual(['greenhouse:gitlab']);
  });
});

describe('recordSourceOutcome circuit breaker (B-147)', () => {
  it('success resets failures, stamps last_ok_at and clears cooldown', async () => {
    await recordSourceOutcome('greenhouse:gitlab', true);
    const u = m.updates[0];
    expect(u.values.consecutive_failures).toBe(0);
    expect(u.values.last_ok_at).toBeTruthy();
    expect(u.values.cooldown_until).toBeNull();
  });

  it('failure increments the counter without opening below the threshold', async () => {
    m.state.rows = [row({ consecutive_failures: CIRCUIT_FAILURE_THRESHOLD - 2 })];
    await recordSourceOutcome('greenhouse:gitlab', false);
    const u = m.updates[0];
    expect(u.values.consecutive_failures).toBe(CIRCUIT_FAILURE_THRESHOLD - 1);
    expect(u.values.cooldown_until).toBeUndefined();
  });

  it('opens the circuit (1h cooldown) at the threshold', async () => {
    m.state.rows = [row({ consecutive_failures: CIRCUIT_FAILURE_THRESHOLD - 1 })];
    await recordSourceOutcome('greenhouse:gitlab', false);
    const u = m.updates[0];
    expect(u.values.consecutive_failures).toBe(CIRCUIT_FAILURE_THRESHOLD);
    const until = u.values.cooldown_until as string;
    const delta = new Date(until).getTime() - Date.now();
    expect(delta).toBeGreaterThan(CIRCUIT_COOLDOWN_MS - 60_000);
    expect(delta).toBeLessThan(CIRCUIT_COOLDOWN_MS + 60_000);
  });

  it('never throws, even when the registry write fails', async () => {
    m.state.rows = new Error('boom');
    await expect(recordSourceOutcome('greenhouse:gitlab', false)).resolves.toBeUndefined();
  });
});
