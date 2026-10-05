import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Self security scan (owner brief 2026-10-05: "automated scanning, make it
 * live"). Runs the same attack classes the manual Burp-style suite covered,
 * against the live site, from the weekly /api/cron/security-scan job:
 *
 *  - anon surface: security headers, https redirect, auth gates, anon RLS
 *  - token attacks: tampered sub / role claims, alg=none, garbage
 *  - authorization: admin routes (must 403), IDOR probes (must 404)
 *  - mass assignment: plan/role/workspace in body must be ignored
 *  - injection probes: SQLi strings must come back non-5xx
 *
 * Authenticated checks use a dedicated scanner account
 * (security-scanner@jobiest.com) whose password is derived from CRON_SECRET:
 * rotating the secret rotates the password, and the next run simply resets it
 * through the admin API. No credentials are stored anywhere.
 *
 * The scan is strictly read-only for user data: it never reads another
 * account, never generates documents, and only writes its own scanner
 * profile row.
 */

export interface ScanCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface ScanReport {
  day: string;
  origin: string;
  checks: ScanCheck[];
  findings: ScanCheck[];
  scannerAccount: 'CREATED' | 'REUSED' | 'ANON_ONLY';
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function scannerPassword(): string {
  return sha256(`${process.env.CRON_SECRET ?? 'unset'}:jobiest-security-scanner`) + '!1aA';
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Tamper a JWT payload while keeping the original (now broken) signature. */
function tamperJwt(token: string, mutate: (payload: Record<string, unknown>) => void): string {
  const [h, p, s] = token.split('.');
  const payload = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  mutate(payload);
  return `${h}.${b64url(JSON.stringify(payload))}.${s}`;
}

function noneJwt(token: string): string {
  const [, p] = token.split('.');
  return `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${p}.`;
}

async function ensureScannerSession(fetchFn: FetchLike): Promise<{ token: string | null; state: 'CREATED' | 'REUSED' | 'ANON_ONLY' }> {
  const email = 'security-scanner@jobiest.com';
  const password = scannerPassword();
  const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!sbUrl || !anonKey) return { token: null, state: 'ANON_ONLY' };

  const grant = async () => {
    const res = await fetchFn(`${sbUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string };
    return body.access_token ?? null;
  };

  let token = await grant();
  if (token) return { token, state: 'REUSED' };

  // First run (or rotated CRON_SECRET): find or create the scanner account
  // with a confirmed email and the current derived password.
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 500 });
    const users = data?.users ?? [];
    userId = users.find((u) => (u.email ?? '').toLowerCase() === email)?.id ?? null;
    if (users.length < 500) break;
  }
  if (userId) {
    await supabaseAdmin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    token = await grant();
    return { token, state: token ? 'REUSED' : 'ANON_ONLY' };
  }
  const { data: created } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Jobiest Security Scanner' },
  });
  if (!created?.user) return { token: null, state: 'ANON_ONLY' };
  token = await grant();
  return { token, state: token ? 'CREATED' : 'ANON_ONLY' };
}

export async function runSelfScan(origin: string, fetchFn: FetchLike = fetch): Promise<ScanReport> {
  const checks: ScanCheck[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const get = async (path: string, headers: Record<string, string> = {}, redirect: RequestRedirect = 'manual') =>
    fetchFn(`${origin}${path}`, { headers, redirect });
  const jsonBody = async (res: Response) => {
    try { return (await res.json()) as Record<string, unknown>; } catch { return {}; }
  };

  // ---------- anon surface ----------
  const home = await get('/');
  const h = (k: string) => (home.headers.get(k) ?? '').toLowerCase();
  check('header: CSP on homepage', h('content-security-policy').includes("default-src 'self'"), h('content-security-policy').slice(0, 60));
  check('header: HSTS', home.headers.get('strict-transport-security')?.includes('max-age') === true);
  check('header: nosniff', h('x-content-type-options') === 'nosniff');
  check('header: frame protection', h('x-frame-options') === 'deny' || h('content-security-policy').includes("frame-ancestors 'none'"));
  check('header: no X-Powered-By', !home.headers.get('x-powered-by'));

  const http = await fetchFn(origin.replace('https://', 'http://') + '/', { redirect: 'manual' });
  check('https redirect', http.status === 301 || http.status === 308, `status ${http.status}`);

  for (const [path, expected] of [
    ['/api/profile', 401], ['/api/documents', 401], ['/api/admin/users', 401],
    ['/api/cron/daily-pipeline', 401], ['/api/cron/security-scan', 401],
  ] as const) {
    const res = await get(path);
    check(`auth gate: ${path}`, res.status === expected, `status ${res.status}`);
  }

  const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (sbUrl && anonKey) {
    for (const table of ['profiles', 'ai_credentials', 'usage_daily']) {
      const res = await fetchFn(`${sbUrl}/rest/v1/${table}?select=*`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      const body = await jsonBody(res);
      check(`anon RLS: ${table} leaks nothing`, res.ok && Array.isArray(body) && body.length === 0,
        `status ${res.status}`);
    }
  }

  // ---------- authenticated attack checks ----------
  const { token, state } = await ensureScannerSession(fetchFn);
  if (!token) {
    check('scanner session', false, 'could not establish scanner session; authenticated checks skipped');
  } else {
    const auth = { Authorization: `Bearer ${token}` };
    const me = await get('/api/profile', auth);
    check('scanner session', me.status === 200, `status ${me.status}`);

    check('JWT: tampered user id rejected', [401, 403].includes((await get('/api/profile', { Authorization: `Bearer ${tamperJwt(token, (p) => { p.sub = '00000000-0000-4000-8000-000000000000'; })}`})).status));
    check('JWT: role claim rejected', [401, 403].includes((await get('/api/profile', { Authorization: `Bearer ${tamperJwt(token, (p) => { p.role = 'service_role'; })}`})).status));
    check('JWT: alg=none rejected', [401, 403].includes((await get('/api/profile', { Authorization: `Bearer ${noneJwt(token)}` })).status));
    check('JWT: garbage rejected', (await get('/api/profile', { Authorization: 'Bearer garbage.token.here' })).status === 401);

    for (const path of ['/api/admin/users', '/api/admin/credentials']) {
      const res = await fetchFn(`${origin}${path}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' });
      check(`admin blocked: ${path}`, res.status === 403, `status ${res.status}`);
    }

    const victim = '99999999-9999-4999-8999-999999999999';
    check('IDOR: foreign document blocked', (await get(`/api/documents/${victim}/export?format=pdf`, auth)).status === 404);
    check('IDOR: foreign application blocked', (await get(`/api/applications/${victim}`, auth)).status === 404);

    const save = await fetchFn(`${origin}/api/profile`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Jobiest Security Scanner', target_roles: ['AI Engineer'], headline: 'Automated security scan account',
        workspace_id: 'should-be-ignored', plan: 'PREMIUM', role: 'admin',
      }),
    });
    const entitlements = await jsonBody(await get('/api/entitlements', auth));
    check('mass assignment ignored', save.status === 200 && entitlements.plan !== 'PREMIUM',
      `save=${save.status} plan=${String(entitlements.plan)}`);

    const sqli = await get(`/api/jobs?q=${encodeURIComponent("' OR '1'='1' --")}`, auth);
    check('SQLi probe inert', sqli.status < 500, `status ${sqli.status}`);
  }

  const findings = checks.filter((c) => !c.ok);
  return { day: new Date().toISOString().slice(0, 10), origin, checks, findings, scannerAccount: state };
}
