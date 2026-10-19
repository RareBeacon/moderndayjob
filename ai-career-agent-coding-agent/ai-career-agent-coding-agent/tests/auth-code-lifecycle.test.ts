import { beforeEach, describe, expect, it, vi } from 'vitest';

/** In-memory PostgREST double for the code lifecycle. No live keys or inbox. */
const { from, sendSignupVerificationEmail, sendEmailVerificationCode } = vi.hoisted(() => ({
  from: vi.fn(),
  sendSignupVerificationEmail: vi.fn(),
  sendEmailVerificationCode: vi.fn(),
}));
vi.mock('@/lib/env', () => ({ env: { ENCRYPTION_MASTER_KEY: 'test-only-not-a-real-secret' } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from } }));
vi.mock('@/lib/email/resend', () => ({ sendSignupVerificationEmail, sendEmailVerificationCode }));

import { confirmEmailVerificationCode, issueEmailVerificationCode } from '@/lib/auth-oauth';

type Row = {
  id: string;
  user_id: string;
  code_hash: string;
  created_at: string;
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
};
const rows: Row[] = [];
let profileVerifiedAt: string | null = null;
let failInsert = false;

type Value = string | number | null;
function queryFor(table: string) {
  let filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let patch: Record<string, unknown> | null = null;
  let newest = false;
  const source = () => table === 'email_verification_codes'
    ? rows as unknown as Array<Record<string, unknown>>
    : [{ user_id: 'u1', email_verified_at: profileVerifiedAt }] as Array<Record<string, unknown>>;
  const matching = () => {
    const hits = source().filter((row) => filters.every((check) => check(row)));
    return newest ? hits.reverse() : hits;
  };
  const applyUpdate = () => {
    const target = matching()[0];
    if (!target || !patch) return { data: null, error: null };
    Object.assign(target, patch);
    if (table === 'profiles' && typeof patch.email_verified_at === 'string') {
      profileVerifiedAt = patch.email_verified_at;
    }
    return { data: { ...target }, error: null };
  };
  const q = {
    select: (_fields: string) => q,
    eq: (field: string, value: Value) => {
      filters.push((row) => row[field] === value);
      return q;
    },
    is: (field: string, value: null) => {
      filters.push((row) => row[field] === value);
      return q;
    },
    gt: (field: string, value: string) => {
      filters.push((row) => String(row[field]) > value);
      return q;
    },
    order: (_field: string, opts: { ascending: boolean }) => {
      newest = !opts.ascending;
      return q;
    },
    limit: (_count: number) => q,
    maybeSingle: async () => patch ? applyUpdate() : { data: matching()[0] ?? null, error: null },
    then: (resolve: (result: ReturnType<typeof applyUpdate>) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(applyUpdate()).then(resolve, reject),
  };
  return {
    select: (_fields: string) => q,
    update: (newValues: Record<string, unknown>) => {
      patch = newValues;
      return q;
    },
    insert: async (values: Pick<Row, 'user_id' | 'code_hash' | 'expires_at'>) => {
      if (failInsert) return { error: { code: 'TEST_FAILURE' } };
      rows.push({ ...values, id: `row-${rows.length + 1}`, created_at: new Date().toISOString(), attempts: 0, consumed_at: null });
      return { error: null };
    },
  };
}

const user = { id: 'u1', email: 'ada@example.com', fullName: 'Ada Example' };

beforeEach(() => {
  rows.length = 0;
  profileVerifiedAt = null;
  failInsert = false;
  from.mockReset().mockImplementation(queryFor);
  sendSignupVerificationEmail.mockReset().mockResolvedValue({ ok: true, id: 'accepted-by-provider' });
  sendEmailVerificationCode.mockReset().mockResolvedValue({ ok: true, id: 'accepted-by-provider' });
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://jobiest.com');
});

function lastCode() {
  return sendSignupVerificationEmail.mock.lastCall?.[1] as string;
}

describe('verification code lifecycle', () => {
  it('stores a hash and sends only to the account email with a matching one-click link', async () => {
    expect(await issueEmailVerificationCode(user, { kind: 'signup' })).toEqual({ sent: true, cooldown: false });
    const code = lastCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(rows[0].code_hash).not.toBe(code);
    expect(sendSignupVerificationEmail).toHaveBeenCalledWith(
      'ada@example.com', code,
      `https://jobiest.com/verify-email?email=ada%40example.com&code=${code}`,
      'Ada Example',
    );
    expect(sendEmailVerificationCode).not.toHaveBeenCalled();
    expect(new Date(rows[0].expires_at).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
  });

  it('cannot reuse a consumed code even with two simultaneous confirmations', async () => {
    await issueEmailVerificationCode(user, { kind: 'signup' });
    const code = lastCode();
    const outcomes = await Promise.all([
      confirmEmailVerificationCode({ id: 'u1' }, code),
      confirmEmailVerificationCode({ id: 'u1' }, code),
    ]);
    expect(outcomes).toContain('VERIFIED');
    expect(outcomes.filter((outcome) => outcome === 'VERIFIED')).toHaveLength(1);
    expect(rows[0].consumed_at).toBeTruthy();
    expect(profileVerifiedAt).toBeTruthy();
    expect(await confirmEmailVerificationCode({ id: 'u1' }, code)).toBe('NOT_FOUND');
  });

  it('rejects an expired code without marking the profile', async () => {
    await issueEmailVerificationCode(user, { kind: 'signup' });
    const code = lastCode();
    rows[0].expires_at = new Date(Date.now() - 100).toISOString();
    expect(await confirmEmailVerificationCode({ id: 'u1' }, code)).toBe('EXPIRED');
    expect(profileVerifiedAt).toBeNull();
  });

  it('bounds wrong guesses and never accepts a correct code after eight misses', async () => {
    await issueEmailVerificationCode(user, { kind: 'signup' });
    const badCode = lastCode() === '000000' ? '999999' : '000000';
    for (let i = 0; i < 8; i++) {
      expect(await confirmEmailVerificationCode({ id: 'u1' }, badCode)).toBe('INVALID');
    }
    expect(rows[0].attempts).toBe(8);
    expect(await confirmEmailVerificationCode({ id: 'u1' }, lastCode())).toBe('TOO_MANY_ATTEMPTS');
    expect(profileVerifiedAt).toBeNull();
  });

  it('honours resend cooldown, but consumes a rejected send so it can be retried', async () => {
    await issueEmailVerificationCode(user, { kind: 'signup' });
    expect(await issueEmailVerificationCode(user, { kind: 'signup' })).toEqual({ sent: false, cooldown: true });
    expect(sendSignupVerificationEmail).toHaveBeenCalledTimes(1);

    // Simulate waiting past the cooldown before the second provider request.
    rows[0].created_at = new Date(Date.now() - 61_000).toISOString();
    sendSignupVerificationEmail.mockResolvedValueOnce({ ok: false, error: 'REJECTED' });
    expect(await issueEmailVerificationCode(user, { kind: 'signup' })).toEqual({ sent: false, cooldown: false, error: 'REJECTED' });
    expect(rows[1].consumed_at).toBeTruthy();
    expect(await issueEmailVerificationCode(user, { kind: 'signup' })).toEqual({ sent: true, cooldown: false });
  });

  it('never marks a password profile until the route confirms auth.users', async () => {
    await issueEmailVerificationCode(user, { kind: 'signup' });
    expect(await confirmEmailVerificationCode({ id: 'u1' }, lastCode(), { markProfileVerified: false })).toBe('VERIFIED');
    expect(profileVerifiedAt).toBeNull();
  });

  it('does not send a code if its database insert fails', async () => {
    failInsert = true;
    expect(await issueEmailVerificationCode(user, { kind: 'signup' })).toEqual({ sent: false, cooldown: false, error: 'CODE_STORE_FAILED' });
    expect(sendSignupVerificationEmail).not.toHaveBeenCalled();
  });
});
