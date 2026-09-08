import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Admin security controls (Phase 9 / QA hardening). Every admin action must
 * be gated on the admin_users table, write an audited admin_actions row, and
 * never leak secrets: credential ciphertext must differ from the plaintext
 * key, and rotation must revoke-then-issue with an incremented key_version.
 */

const mocks = vi.hoisted(() => {
  const select = vi.fn();
  const update = vi.fn();
  const insert = vi.fn();
  const eq = vi.fn();
  const inFilter = vi.fn();
  const maybeSingle = vi.fn();
  const signOut = vi.fn();
  const rpc = vi.fn();
  const query: Record<string, unknown> = { select, update, insert, eq, in: inFilter, maybeSingle };
  select.mockReturnValue(query);
  update.mockReturnValue(query);
  insert.mockReturnValue(query);
  eq.mockReturnValue(query);
  inFilter.mockReturnValue(query);
  return { query, select, update, insert, eq, inFilter, maybeSingle, signOut, rpc };
});

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => mocks.query,
    rpc: mocks.rpc,
    auth: { admin: { signOut: mocks.signOut } },
  },
}));

const requireUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ requireUser, getUser: vi.fn() }));

import { POST as terminatePost } from '@/app/api/admin/users/terminate/route';
import { POST as suspendPost } from '@/app/api/admin/users/suspend/route';
import { POST as signoutPost } from '@/app/api/admin/users/signout/route';
import { POST as credPost, PATCH as credPatch } from '@/app/api/admin/credentials/route';

const TARGET = '11111111-1111-4111-8111-111111111111';
const RELATED = '22222222-2222-4222-8222-222222222222';
const CRED_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';

function jsonReq(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function patchReq(url: string, body: unknown) {
  return new Request(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: ADMIN_ID });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.select.mockReturnValue(mocks.query);
  mocks.update.mockReturnValue(mocks.query);
  mocks.insert.mockReturnValue(mocks.query);
  mocks.eq.mockReturnValue(mocks.query);
  mocks.inFilter.mockReturnValue(mocks.query);
  // default: caller is an admin
  mocks.maybeSingle.mockResolvedValue({ data: { user_id: ADMIN_ID }, error: null });
});

describe('admin authorization', () => {
  it('terminate is 403 for a non-admin', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await terminatePost(jsonReq('http://x/api/admin/users/terminate', { userId: TARGET }));
    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('credential PATCH is 403 for a non-admin', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await credPatch(patchReq('http://x/api/admin/credentials', { id: CRED_ID, action: 'REVOKE' }));
    expect(res.status).toBe(403);
  });
});

describe('terminate', () => {
  it('terminates target + related accounts, cancels work, revokes sessions, audits', async () => {
    const res = await terminatePost(jsonReq('http://x/api/admin/users/terminate', { userId: TARGET, relatedUserIds: [RELATED] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, terminated: [TARGET, RELATED] });
    expect(mocks.update).toHaveBeenCalledWith({ account_status: 'TERMINATED' });
    expect(mocks.update).toHaveBeenCalledWith({ status: 'CANCELLED' });
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.signOut).toHaveBeenCalledWith(TARGET, 'global');
    expect(mocks.signOut).toHaveBeenCalledWith(RELATED, 'global');
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(mocks.insert.mock.calls.every((args) => (args[0] as { action: string }).action === 'TERMINATE_ACCOUNT')).toBe(true);
  });
});

describe('suspend', () => {
  it('suspends the account, revokes sessions and audits', async () => {
    const res = await suspendPost(jsonReq('http://x/api/admin/users/suspend', { userId: TARGET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, suspended: TARGET });
    expect(mocks.update).toHaveBeenCalledWith({ account_status: 'SUSPENDED' });
    expect(mocks.signOut).toHaveBeenCalledWith(TARGET, 'global');
    expect(mocks.insert).toHaveBeenCalledWith(
      { admin_user_id: ADMIN_ID, target_user_id: TARGET, action: 'SUSPEND_ACCOUNT' },
    );
  });
});

describe('sign out everywhere', () => {
  it('revokes every live session and audits', async () => {
    const res = await signoutPost(jsonReq('http://x/api/admin/users/signout', { userId: TARGET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, signedOut: TARGET });
    expect(mocks.signOut).toHaveBeenCalledWith(TARGET, 'global');
    expect(mocks.insert).toHaveBeenCalledWith(
      { admin_user_id: ADMIN_ID, target_user_id: TARGET, action: 'REVOKE_SESSIONS' },
    );
  });
});

const KEY = 'sk-openrouter-abcdef123456789';

describe('admin AI-credential management (encrypted at rest)', () => {
  it('POST stores only ciphertext — the plaintext key never reaches the DB', async () => {
    const res = await credPost(jsonReq('http://x/api/admin/credentials', {
      userId: TARGET, provider: 'openrouter', apiKey: KEY, model: 'openai/gpt-4o', baseUrl: 'https://openrouter.ai/api/v1',
    }));
    expect(res.status).toBe(200);
    const credentialInsert = mocks.insert.mock.calls.find((args) => (args[0] as { ciphertext?: string }).ciphertext);
    expect(credentialInsert).toBeTruthy();
    const row = credentialInsert![0] as { ciphertext: string; status: string; key_version: number; user_id: string };
    expect(row.ciphertext).not.toBe(KEY);
    expect(row.ciphertext.length).toBeGreaterThan(0);
    expect(row.status).toBe('ACTIVE');
    expect(row.key_version).toBe(1);
    expect(row.user_id).toBe(TARGET);
    expect(mocks.insert).toHaveBeenCalledWith(
      { admin_user_id: ADMIN_ID, target_user_id: TARGET, action: 'ADD_AI_CREDENTIAL', metadata: { provider: 'openrouter', model: 'openai/gpt-4o' } },
    );
  });

  it('PATCH REVOKE marks the key REVOKED and audits', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { user_id: ADMIN_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: CRED_ID, user_id: TARGET, provider: 'openrouter', model: 'm', base_url: 'https://x', key_version: 2 }, error: null });
    const res = await credPatch(patchReq('http://x/api/admin/credentials', { id: CRED_ID, action: 'REVOKE' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, revoked: CRED_ID });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'REVOKED' }));
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REVOKE_AI_CREDENTIAL' }),
    );
  });

  it('PATCH ROTATE requires a new key', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { user_id: ADMIN_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: CRED_ID, user_id: TARGET, provider: 'openrouter', model: 'm', base_url: 'https://x', key_version: 1 }, error: null });
    const res = await credPatch(patchReq('http://x/api/admin/credentials', { id: CRED_ID, action: 'ROTATE' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/apiKey/i);
  });

  it('PATCH ROTATE revokes the old key and issues key_version+1 with fresh ciphertext', async () => {
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: { user_id: ADMIN_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: CRED_ID, user_id: TARGET, provider: 'openrouter', model: 'm', base_url: 'https://x', key_version: 2 }, error: null });
    const res = await credPatch(patchReq('http://x/api/admin/credentials', { id: CRED_ID, action: 'ROTATE', apiKey: KEY }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rotated: CRED_ID, key_version: 3 });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'REVOKED' }));
    const newCred = mocks.insert.mock.calls.find((args) => (args[0] as { ciphertext?: string }).ciphertext);
    const row = newCred![0] as { key_version: number; status: string; ciphertext: string };
    expect(row.key_version).toBe(3);
    expect(row.status).toBe('ACTIVE');
    expect(row.ciphertext).not.toBe(KEY);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ROTATE_AI_CREDENTIAL', metadata: { provider: 'openrouter', from: 2, to: 3 } }),
    );
  });
});
