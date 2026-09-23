import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Credit ledger client + meter integration (Milestone 2).
 *
 * Owner decisions under test:
 *  - D3: reserve at start, consume on confirmed completion, release on
 *    failure. The meter maps ledger exhaustion to the same
 *    AI_QUOTA_EXHAUSTED error the routes already handle, and refunds the
 *    legacy counter when the ledger says no.
 *  - Parallel-run: with ENTITLEMENTS_LEDGER unset (default) the ledger is
 *    inert; only legacy counters move.
 */

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  dailyData: { ai_used: 2 } as { ai_used?: number } | null,
  lifetimeData: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: m.rpc,
    from: (table: string) => {
      const data = table === 'usage_daily' ? m.dailyData : m.lifetimeData;
      const done = Promise.resolve({ error: null });
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        single: () => Promise.resolve({ data }),
        update: () => chain,
        then: (resolve: unknown, reject: unknown) => done.then(resolve as never, reject as never),
      };
      return chain;
    },
  },
}));

import {
  consumeCredit,
  CreditExhaustedError,
  creditAvailable,
  ensurePeriodGrants,
  ledgerEnabled,
  releaseCredit,
  reserveCredit,
} from '@/lib/credits';
import { createUsageMeter } from '@/lib/ai/server';
import { AIGatewayError } from '@packages/ai/gateway';

function rpcOk() {
  m.rpc.mockResolvedValue({ error: null, data: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ENTITLEMENTS_LEDGER;
  rpcOk();
  m.dailyData = { ai_used: 2 };
  m.lifetimeData = null;
});

afterEach(() => {
  delete process.env.ENTITLEMENTS_LEDGER;
});

describe('ledger flag', () => {
  it('is armed by default since the 2026-09-23 go-live; false disarms', () => {
    expect(ledgerEnabled()).toBe(true);
    process.env.ENTITLEMENTS_LEDGER = 'true';
    expect(ledgerEnabled()).toBe(true);
    process.env.ENTITLEMENTS_LEDGER = 'false';
    expect(ledgerEnabled()).toBe(false);
  });
});

describe('ledger client', () => {
  it('reserves with the documented rpc shape', async () => {
    await reserveCredit('u1', 'DOCUMENT', 'doc:abc');
    expect(m.rpc).toHaveBeenCalledWith('credit_reserve', { p_user: 'u1', p_resource: 'DOCUMENT', p_reference: 'doc:abc' });
  });

  it('consumes with a stable idempotency key derived from the reference', async () => {
    await consumeCredit('u1', 'AUTO_APPLY', 'app:42');
    expect(m.rpc).toHaveBeenCalledWith('credit_consume', {
      p_user: 'u1',
      p_resource: 'AUTO_APPLY',
      p_reference: 'app:42',
      p_key: 'consume:AUTO_APPLY:app:42',
    });
  });

  it('releases with a stable idempotency key', async () => {
    await releaseCredit('u1', 'DOCUMENT', 'doc:abc');
    expect(m.rpc).toHaveBeenCalledWith('credit_release', {
      p_user: 'u1',
      p_resource: 'DOCUMENT',
      p_reference: 'doc:abc',
      p_key: 'release:DOCUMENT:doc:abc',
    });
  });

  it('maps CREDIT_EXHAUSTED to CreditExhaustedError', async () => {
    m.rpc.mockResolvedValue({ error: { message: 'CREDIT_EXHAUSTED' } });
    await expect(reserveCredit('u1', 'DOCUMENT', 'doc:abc')).rejects.toBeInstanceOf(CreditExhaustedError);
  });

  it('surfaces availability and grant counts', async () => {
    m.rpc.mockResolvedValue({ error: null, data: 7 });
    expect(await creditAvailable('u1', 'DOCUMENT')).toBe(7);
    expect(await ensurePeriodGrants()).toBe(7);
  });
});

describe('createUsageMeter · disarmed (flag off)', () => {
  beforeEach(() => {
    process.env.ENTITLEMENTS_LEDGER = 'false';
  });

  it('reserve touches only the legacy counter', async () => {
    const meter = createUsageMeter('u1');
    await meter.reserve();
    expect(m.rpc).toHaveBeenCalledWith('consume_ai_credit', { p_user_id: 'u1' });
    expect(m.rpc).not.toHaveBeenCalledWith('credit_reserve', expect.anything());
  });

  it('commit is a no-op', async () => {
    const meter = createUsageMeter('u1');
    await meter.commit();
    expect(m.rpc).not.toHaveBeenCalledWith('credit_consume', expect.anything());
  });

  it('refund releases nothing on the ledger', async () => {
    const meter = createUsageMeter('u1');
    await meter.refund();
    expect(m.rpc).not.toHaveBeenCalledWith('credit_release', expect.anything());
  });
});

describe('createUsageMeter · ledger armed', () => {
  beforeEach(() => {
    process.env.ENTITLEMENTS_LEDGER = 'true';
  });

  it('reserve holds a DOCUMENT credit after the legacy counter', async () => {
    const meter = createUsageMeter('u1');
    await meter.reserve();
    expect(m.rpc).toHaveBeenCalledWith('consume_ai_credit', { p_user_id: 'u1' });
    const call = m.rpc.mock.calls.find(([fn]) => fn === 'credit_reserve');
    expect(call).toBeTruthy();
    expect(call![1].p_user).toBe('u1');
    expect(call![1].p_resource).toBe('DOCUMENT');
    expect(String(call![1].p_reference)).toMatch(/^doc:/);
  });

  it('commit consumes the held credit', async () => {
    const meter = createUsageMeter('u1');
    await meter.reserve();
    await meter.commit();
    const call = m.rpc.mock.calls.find(([fn]) => fn === 'credit_consume');
    expect(call).toBeTruthy();
    expect(String(call![1].p_reference)).toMatch(/^doc:/);
  });

  it('refund releases the held credit', async () => {
    const meter = createUsageMeter('u1');
    await meter.reserve();
    await meter.refund();
    expect(m.rpc.mock.calls.find(([fn]) => fn === 'credit_release')).toBeTruthy();
  });

  it('ledger exhaustion refunds the legacy counter and raises the mapped error', async () => {
    m.rpc.mockImplementation((fn: string) =>
      fn === 'credit_reserve'
        ? Promise.resolve({ error: { message: 'CREDIT_EXHAUSTED' } })
        : Promise.resolve({ error: null, data: null }),
    );
    const meter = createUsageMeter('u1');
    await expect(meter.reserve()).rejects.toMatchObject({ code: 'AI_QUOTA_EXHAUSTED' });
    // Legacy refund ran (usage_daily read attempted).
    expect(m.dailyData).toEqual({ ai_used: 2 });
  });

  it('ledger exhaustion error is an AIGatewayError the routes already map', async () => {
    m.rpc.mockImplementation((fn: string) =>
      fn === 'credit_reserve'
        ? Promise.resolve({ error: { message: 'CREDIT_EXHAUSTED' } })
        : Promise.resolve({ error: null, data: null }),
    );
    const meter = createUsageMeter('u1');
    const err = await meter.reserve().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AIGatewayError);
  });
});
