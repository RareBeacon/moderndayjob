import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const hoisted = vi.hoisted(() => {
  const requireUser = vi.fn();
  const auditInsert = vi.fn();
  const adminUsersMaybeSingle = vi.fn();
  const profileMaybeSingle = vi.fn();
  const deleteUser = vi.fn();
  const listUsers = vi.fn();
  const signOut = vi.fn();
  const genericUpdate = vi.fn();
  const genericInsert = vi.fn();
  return {
    requireUser,
    auditInsert,
    adminUsersMaybeSingle,
    profileMaybeSingle,
    deleteUser,
    listUsers,
    signOut,
    genericUpdate,
    genericInsert,
  };
});

vi.mock('@/lib/auth', () => ({
  requireUser: hoisted.requireUser,
  getUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true })),
  requestIp: () => '127.0.0.1',
  hashContext: (v: string) => `hash:${v}`,
}));

vi.mock('@/lib/supabase', () => {
  const makeChain = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      },
      in: () => chain,
      order: () => chain,
      limit: async () => {
        if (table === 'audit_logs') {
          return {
            data: [
              {
                action: 'PROFILE_NOTE',
                resource: 'profiles',
                outcome: 'allow',
                created_at: '2026-11-01T00:00:00Z',
                meta: { detail: 'contact jane.doe@example.com for verification' },
              },
            ],
            error: null,
          };
        }
        if (table === 'security_events') {
          return {
            data: [
              {
                event_type: 'LOGIN_ALERT',
                severity: 'LOW',
                created_at: '2026-11-01T00:00:00Z',
                metadata: { actor_email: 'jane.doe@example.com' },
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      },
      maybeSingle: async () => {
        if (table === 'admin_users') {
          return hoisted.adminUsersMaybeSingle(filters.user_id);
        }
        if (table === 'profiles') {
          return hoisted.profileMaybeSingle(filters.user_id);
        }
        return { data: null, error: null };
      },
      insert: (row: unknown) => {
        if (table === 'audit_logs') return hoisted.auditInsert(row);
        return hoisted.genericInsert(table, row);
      },
      update: (patch: unknown) => {
        hoisted.genericUpdate(table, patch);
        return chain;
      },
    };
    if (table === 'admin_users') {
      // Used by `/api/admin/purge` collectTargets(): `.from('admin_users').select('user_id')`
      const selectFn = () => {
        const sub = {
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return { maybeSingle: () => hoisted.adminUsersMaybeSingle(filters.user_id) };
          },
          then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve({ data: [{ user_id: ADMIN_A }, { user_id: ADMIN_B }], error: null }).then(onFulfilled),
        };
        return sub;
      };
      chain.select = selectFn;
    }
    return chain;
  };

  return {
    supabaseAdmin: {
      from: (table: string) => makeChain(table),
      auth: {
        admin: {
          deleteUser: hoisted.deleteUser,
          listUsers: hoisted.listUsers,
          signOut: hoisted.signOut,
        },
      },
    },
  };
});

import { adminErrorResponse } from '@/lib/admin';
import { requireAuditEvent, sanitizeMeta } from '@/lib/audit';
import { issueRevealToken } from '@/lib/security/reveal';
import {
  isSafeHttpUrl,
  maskEmailAddress,
  maskEmailsInStructure,
  safeExternalHref,
} from '@/lib/security/safe-url';
import { decryptSecret, encryptSecret } from '@packages/security/crypto';
import { profileSchema } from '@/lib/schemas/profile';
import {
  employerRegistrationSchema,
  talentIntakeUpdateSchema,
} from '@/lib/talent-pool/schemas';
import { POST as adminCredPost } from '@/app/api/admin/credentials/route';
import { POST as adminPurgePost } from '@/app/api/admin/purge/route';
import { POST as terminatePost } from '@/app/api/admin/users/terminate/route';
import { POST as suspendPost } from '@/app/api/admin/users/suspend/route';
import { POST as signoutPost } from '@/app/api/admin/users/signout/route';
import { GET as userDetailGet } from '@/app/api/admin/users/[id]/route';

const ADMIN_A = '44444444-4444-4444-8444-444444444444';
const ADMIN_B = '55555555-5555-4555-8555-555555555555';
const USER_1 = '11111111-1111-4111-8111-111111111111';

function listAdminPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listAdminPages(full, out);
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.requireUser.mockResolvedValue({ id: ADMIN_A, email: 'owner@jobiest.com' });
  hoisted.adminUsersMaybeSingle.mockImplementation(async (uid: unknown) => ({
    data: uid === ADMIN_A || uid === ADMIN_B ? { user_id: uid } : null,
    error: null,
  }));
  hoisted.profileMaybeSingle.mockResolvedValue({
    data: {
      user_id: USER_1,
      email: 'jane.doe@example.com',
      full_name: 'Jane Doe',
      account_status: 'ACTIVE',
      created_at: '2026-10-15T10:00:00Z',
    },
    error: null,
  });
  hoisted.auditInsert.mockResolvedValue({ error: null });
  hoisted.genericInsert.mockResolvedValue({ error: null });
  hoisted.signOut.mockResolvedValue({ error: null });
  hoisted.deleteUser.mockResolvedValue({ error: null });
  hoisted.listUsers.mockResolvedValue({
    data: { users: [{ id: ADMIN_A }, { id: USER_1 }] },
    error: null,
  });
});

describe('Cybersecurity Audit: XSS & Dangerous URL Scheme Prevention', () => {
  it('blocks javascript:, data:, vbscript:, and file: URLs in employer registration & candidate schemas', () => {
    for (const malicious of [
      'javascript:alert(document.cookie)',
      'JAVASCRIPT:fetch("https://evil.test")',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(isSafeHttpUrl(malicious)).toBe(false);
      expect(safeExternalHref(malicious)).toBeNull();

      const emp = employerRegistrationSchema.safeParse({
        company_name: 'Acme Tech',
        website_url: malicious,
        company_description: 'Enterprise cloud security engineering company.',
        industry: 'Software',
        company_location: 'Lagos',
        country: 'Nigeria',
        business_email: 'talent@acmetech.com',
        authorized_representative_name: 'Ada Lovelace',
        authorized_representative_role: 'VP Talent',
      });
      expect(emp.success).toBe(false);

      const prof = profileSchema.safeParse({
        full_name: 'Jane Doe',
        target_roles: ['Backend Engineer'],
        links: { portfolio: malicious },
      });
      expect(prof.success).toBe(false);
    }

    expect(safeExternalHref('https://jobiest.com/talent')).toBe('https://jobiest.com/talent');
    const intake = talentIntakeUpdateSchema.safeParse({
      full_name: 'Jane Doe',
      headline: 'Senior Backend Engineer',
      location: 'Lagos',
      country: 'Nigeria',
      career_category: 'Software Engineering',
      seniority_level: 'SENIOR',
      target_roles: ['Backend Engineer'],
      years_of_experience: 6,
      skills: ['TypeScript', 'PostgreSQL'],
      technical_competencies: ['Distributed Systems'],
      portfolio_url: 'javascript:alert(1)',
      employment_types: ['Full-time'],
      remote_types: ['REMOTE'],
      availability: 'IMMEDIATE',
      work_authorization: 'Authorized in Nigeria',
    });
    expect(intake.success).toBe(false);
  });
});

describe('Cybersecurity Audit: Admin Credential Vault SSRF & AES-256-GCM Integrity', () => {
  it('blocks cloud metadata, loopback, RFC1918 private IPs, and cleartext HTTP in POST /api/admin/credentials', async () => {
    for (const unsafeUrl of [
      'http://169.254.169.254/latest/meta-data/',
      'https://127.0.0.1:8443/v1',
      'https://10.0.0.12/v1',
      'http://openrouter.ai/api/v1',
    ]) {
      const res = await adminCredPost(
        new Request('http://localhost/api/admin/credentials', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId: USER_1,
            provider: 'openrouter',
            apiKey: 'sk-openrouter-1234567890abcdef',
            model: 'openai/gpt-4o-mini',
            baseUrl: unsafeUrl,
          }),
        }),
      );
      expect(res.status, `expected SSRF block for ${unsafeUrl}`).toBe(422);
      expect((await res.json()).error).toBe('BASE_URL_BLOCKED');
    }
  });

  it('validates AES-256-GCM ciphertext structure and authentication tag before releasing plaintext', () => {
    const ct = encryptSecret('super-secret-provider-key');
    expect(ct).not.toContain('super-secret-provider-key');
    expect(decryptSecret(ct)).toBe('super-secret-provider-key');

    expect(() => decryptSecret('malformed')).toThrow('INVALID_CIPHERTEXT');
    expect(() => decryptSecret('a.b.c')).toThrow('INVALID_CIPHERTEXT');

    // Flip one byte in the GCM authentication tag: must throw and never return plaintext.
    const [iv, tag, data] = ct.split('.');
    const tagBuf = Buffer.from(tag, 'base64');
    tagBuf[0] ^= 0xff;
    expect(() => decryptSecret(`${iv}.${tagBuf.toString('base64')}.${data}`)).toThrow();
  });
});

describe('Cybersecurity Audit: Fail-Closed Audit Trail & Deep Secret Redaction', () => {
  it('fails closed when PostgREST returns { error } on audit_logs insert', async () => {
    hoisted.auditInsert.mockResolvedValueOnce({ error: { message: 'disk full' } });
    await expect(
      requireAuditEvent({
        action: 'ADMIN_USER_PII_READ',
        resource: 'user',
        resourceId: USER_1,
        userId: ADMIN_A,
        outcome: 'allow',
      }),
    ).rejects.toThrow('disk full');
  });

  it('recursively redacts secret keys and Bearer/sk- tokens inside nested metadata objects and arrays', () => {
    const sanitized = sanitizeMeta({
      headers: {
        Authorization: 'Bearer secret-jwt-value',
        custom: 'Authorization: Bearer nested-token-value',
      },
      credentials: {
        apiKey: 'plain-secret',
        ciphertext: 'iv.tag.data',
      },
      events: ['used sk-abcdef1234567890abcdef12 in call'],
    });

    const headers = sanitized.headers as Record<string, string>;
    const creds = sanitized.credentials as Record<string, string>;
    const events = sanitized.events as string[];

    expect(headers.Authorization).toBe('<redacted>');
    expect(headers.custom).toBe('Authorization=<redacted>');
    expect(creds.apiKey).toBe('<redacted>');
    expect(creds.ciphertext).toBe('<redacted>');
    expect(events[0]).not.toContain('sk-abcdef1234567890abcdef12');
    expect(events[0]).toContain('<redacted>');
  });
});

describe('Admin Panel Security: Peer-Admin Protection, Production Purge Lock & Error Hygiene', () => {
  it('prevents an admin from terminating, suspending, or signing out a peer admin account', async () => {
    for (const handler of [terminatePost, suspendPost, signoutPost]) {
      const res = await handler(
        new Request('http://localhost/api/admin/users/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId: ADMIN_B }),
        }),
      );
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('CANNOT_MODIFY_ADMIN_ACCOUNT');
    }
    expect(hoisted.signOut).not.toHaveBeenCalled();
  });

  it('blocks POST /api/admin/purge in production by default and requires valid reauth + fail-closed audit when enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.ALLOW_DESTRUCTIVE_ADMIN_PURGE;

    const prodBlocked = await adminPurgePost(
      new Request('http://localhost/api/admin/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirm: 'PURGE_NON_ADMIN_USERS',
          revealToken: issueRevealToken(ADMIN_A).token,
        }),
      }),
    );
    expect(prodBlocked.status).toBe(403);
    expect((await prodBlocked.json()).error).toBe('PURGE_DISABLED_IN_PRODUCTION');
    expect(hoisted.deleteUser).not.toHaveBeenCalled();

    // Even when explicitly enabled, a token minted for another admin is rejected.
    vi.stubEnv('ALLOW_DESTRUCTIVE_ADMIN_PURGE', 'true');
    const wrongAdminToken = await adminPurgePost(
      new Request('http://localhost/api/admin/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirm: 'PURGE_NON_ADMIN_USERS',
          revealToken: issueRevealToken(ADMIN_B).token,
        }),
      }),
    );
    expect(wrongAdminToken.status).toBe(403);
    expect((await wrongAdminToken.json()).error).toBe('REAUTH_REQUIRED');
    expect(hoisted.deleteUser).not.toHaveBeenCalled();

    // If audit_logs fails, zero users are deleted (fail-closed).
    hoisted.auditInsert.mockResolvedValueOnce({ error: { message: 'audit offline' } });
    const auditFailed = await adminPurgePost(
      new Request('http://localhost/api/admin/purge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirm: 'PURGE_NON_ADMIN_USERS',
          revealToken: issueRevealToken(ADMIN_A).token,
        }),
      }),
    );
    expect(auditFailed.status).toBe(500);
    expect(hoisted.deleteUser).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('never leaks raw SQL/driver errors from adminErrorResponse on 500s and maps MFA/session/account codes accurately', async () => {
    const mfaRes = adminErrorResponse(new Error('MFA_REQUIRED'));
    expect(mfaRes.status).toBe(401);

    const suspendedRes = adminErrorResponse(new Error('ACCOUNT_SUSPENDED'));
    expect(suspendedRes.status).toBe(403);

    const dbCrashRes = adminErrorResponse(
      new Error('duplicate key value violates unique constraint "users_pkey" on pg_catalog'),
    );
    expect(dbCrashRes.status).toBe(500);
    const body = await dbCrashRes.json();
    expect(body).toEqual({ error: 'INTERNAL_SERVER_ERROR' });
  });
});

describe('User Data Protection: B-063 PII Masking, Reveal Gate & Admin SSR Gating', () => {
  it('validates UUIDs, withholds raw email + masks audit metadata without reveal token, and fails closed if audit write errors', async () => {
    const badId = await userDetailGet(new Request('http://localhost/api/admin/users/not-a-uuid'), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    expect(badId.status).toBe(400);

    // Without x-admin-reveal-token: email is null AND incidental emails in audit/security logs are masked.
    const unrevealed = await userDetailGet(new Request(`http://localhost/api/admin/users/${USER_1}`), {
      params: Promise.resolve({ id: USER_1 }),
    });
    expect(unrevealed.status).toBe(200);
    const unrevealedJson = await unrevealed.json();
    expect(unrevealedJson.user.email).toBeNull();
    expect(unrevealedJson.user.email_domain).toBe('example.com');
    expect(JSON.stringify(unrevealedJson.recentAudit)).not.toContain('jane.doe@example.com');
    expect(JSON.stringify(unrevealedJson.recentAudit)).toContain('j***@example.com');
    expect(JSON.stringify(unrevealedJson.recentSecurity)).not.toContain('jane.doe@example.com');

    // With valid reveal token + failed audit write: fails closed with 503 and NEVER discloses email.
    hoisted.auditInsert.mockResolvedValueOnce({ error: { message: 'audit table locked' } });
    const auditDown = await userDetailGet(
      new Request(`http://localhost/api/admin/users/${USER_1}`, {
        headers: { 'x-admin-reveal-token': issueRevealToken(ADMIN_A).token },
      }),
      { params: Promise.resolve({ id: USER_1 }) },
    );
    expect(auditDown.status).toBe(503);
    expect(await auditDown.json()).toEqual({ error: 'AUDIT_UNAVAILABLE' });

    // With valid reveal token + healthy audit write: discloses email and writes ADMIN_USER_PII_READ.
    const revealed = await userDetailGet(
      new Request(`http://localhost/api/admin/users/${USER_1}`, {
        headers: { 'x-admin-reveal-token': issueRevealToken(ADMIN_A).token },
      }),
      { params: Promise.resolve({ id: USER_1 }) },
    );
    expect(revealed.status).toBe(200);
    expect((await revealed.json()).user.email).toBe('jane.doe@example.com');
    expect(hoisted.auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_USER_PII_READ', resource_id: USER_1, outcome: 'allow' }),
    );
  });

  it('masks email addresses deterministically and verifies every Admin SSR page is server-gated + migration 052 locks ai_credentials', () => {
    expect(maskEmailAddress('candidate@jobiest.com')).toBe('c***@jobiest.com');
    expect(maskEmailsInStructure({ note: 'Reach alice@company.io today' })).toEqual({
      note: 'Reach a***@company.io today',
    });

    const adminPages = listAdminPages('app/admin');
    expect(adminPages.length).toBeGreaterThanOrEqual(11);
    for (const pagePath of adminPages) {
      const src = readFileSync(pagePath, 'utf-8');
      expect(src, `${pagePath} missing requireUserOrRedirect`).toContain('requireUserOrRedirect');
      expect(src, `${pagePath} missing admin_users check`).toContain('admin_users');
    }

    const mig052 = readFileSync(
      'supabase/migrations/052_cybersecurity_admin_and_userdata_hardening.sql',
      'utf-8',
    );
    expect(mig052).toContain('drop policy if exists ai_credentials_self on public.ai_credentials');
    expect(mig052).toContain('employer_organizations_website_url_http_chk');
  });
});
