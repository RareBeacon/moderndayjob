import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Entitlement + usage-meter hardening (Phase 9). The browser is never trusted
 * for plan/role/quota state: assertEntitlement and createUsageMeter are the
 * server-side gate, backed by atomic DB functions. Quota races are resolved
 * by the FOR UPDATE RPCs (consume_ai_credit); these tests pin the app-side
 * contract: correct RPC args, quota exhaustion surfaced as AIGatewayError,
 * refunds best-effort.
 */

const mocks = vi.hoisted(() => {
  const select = vi.fn();
  const eq = vi.fn();
  const single = vi.fn();
  const update = vi.fn();
  const rpc = vi.fn();
  const query = { select, eq, single, update };
  select.mockReturnValue(query);
  eq.mockReturnValue(query);
  update.mockReturnValue(query);
  return { query, select, eq, single, update, rpc };
});

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: () => mocks.query, rpc: mocks.rpc },
}));

import { assertEntitlement } from '@packages/security/entitlements';
import { createUsageMeter } from '@/lib/ai/server';
import { AIGatewayError } from '@packages/ai/gateway';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue(mocks.query);
  mocks.eq.mockReturnValue(mocks.query);
  mocks.update.mockReturnValue(mocks.query);
});

describe('assertEntitlement (server-side plan/role gate)', () => {
  it('returns the entitlement for an ACTIVE account', async () => {
    mocks.single.mockResolvedValue({ data: { account_status: 'ACTIVE', plan: 'PREMIUM', automation_enabled: true }, error: null });
    const e = await assertEntitlement('u1', 'automation');
    expect(e.plan).toBe('PREMIUM');
  });

  it('blocks suspended/terminated accounts before any feature check', async () => {
    mocks.single.mockResolvedValue({ data: { account_status: 'SUSPENDED', automation_enabled: true }, error: null });
    await expect(assertEntitlement('u1', 'ai')).rejects.toThrow('ACCOUNT_BLOCKED');
  });

  it('requires automation_enabled for the automation feature', async () => {
    mocks.single.mockResolvedValue({ data: { account_status: 'ACTIVE', automation_enabled: false }, error: null });
    await expect(assertEntitlement('u1', 'automation')).rejects.toThrow('AUTOMATION_NOT_ENTITLED');
  });

  it('does not gate non-automation features on automation_enabled', async () => {
    mocks.single.mockResolvedValue({ data: { account_status: 'ACTIVE', automation_enabled: false }, error: null });
    await expect(assertEntitlement('u1', 'ai')).resolves.toMatchObject({ account_status: 'ACTIVE' });
  });
});

describe('createUsageMeter (daily AI credit quota)', () => {
  it('reserve() consumes a credit through the atomic RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await createUsageMeter('u1').reserve();
    expect(mocks.rpc).toHaveBeenCalledWith('consume_ai_credit', { p_user_id: 'u1' });
  });

  it('reserve() surfaces quota exhaustion as AIGatewayError', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'AI_QUOTA_EXHAUSTED' } });
    const p = createUsageMeter('u1').reserve();
    await expect(p).rejects.toBeInstanceOf(AIGatewayError);
    await expect(p).rejects.toMatchObject({ code: 'AI_QUOTA_EXHAUSTED' });
  });

  it('reserve() rethrows unexpected DB errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'SOME_DB_ERROR' } });
    await expect(createUsageMeter('u1').reserve()).rejects.toMatchObject({ message: 'SOME_DB_ERROR' });
  });

  it('refund() decrements the counter best-effort', async () => {
    mocks.single.mockResolvedValue({ data: { ai_used: 3 }, error: null });
    await expect(createUsageMeter('u1').refund()).resolves.toBeUndefined();
    expect(mocks.update).toHaveBeenCalledWith({ ai_used: 2 });
  });

  it('refund() never throws, even when the DB is down', async () => {
    mocks.single.mockRejectedValue(new Error('db down'));
    await expect(createUsageMeter('u1').refund()).resolves.toBeUndefined();
  });
});
