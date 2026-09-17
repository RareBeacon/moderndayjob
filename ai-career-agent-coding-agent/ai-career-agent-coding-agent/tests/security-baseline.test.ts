/**
 * Security-baseline regression guards (Master Implementation Package:
 * Book III B-003, B-004(lint part), B-005, B-024; Book IV checks D1, D2, D6).
 *
 * These tests enforce the security baseline at the SOURCE level so drift fails
 * CI even before a database exists to audit:
 *   1. Migration guard (Book IV D1/D2/D6):
 *      - every table created in supabase/migrations must have RLS enabled
 *      - no permissive USING (true) / WITH CHECK (true) policies
 *      - every SECURITY DEFINER function must pin its search_path
 *   2. Endpoint guard (B-024): every API route must either carry a server
 *      auth marker (requireUser / admin gate / webhook secret / cron secret)
 *      or be on the explicit, reviewed PUBLIC_ROUTES allowlist.
 *   3. Header guard (B-005/F-002/F-003/F-008): next.config.mjs must keep the
 *      security header set, CSP without unsafe-eval, and no-store on auth and
 *      authenticated surfaces.
 *   4. Bundle scan (B-003): after `next build`, no secret material may appear
 *      in .next/static. The publishable Supabase anon key is the one allowed
 *      JWT (it is public by design; RLS is the row gate).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';
const API_DIR = 'app/api';

function readMigrations(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf-8') }));
}

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

describe('migration guard (Book IV D1/D2/D6 at source level)', () => {
  const migrations = readMigrations();
  const allSql = migrations.map((m) => m.sql).join('\n');

  it('has migrations to audit', () => {
    expect(migrations.length).toBeGreaterThan(10);
  });

  it('D1: every created table has RLS enabled somewhere in the migration set', () => {
    const created = new Set<string>();
    for (const { sql } of migrations) {
      for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/gi)) {
        created.add(m[1]);
      }
    }
    expect(created.size).toBeGreaterThanOrEqual(30);
    const missing: string[] = [];
    for (const table of created) {
      const re = new RegExp(
        `alter table (?:if exists )?(?:public\\.)?${table}\\s+enable row level security`,
        'i',
      );
      if (!re.test(allSql)) missing.push(table);
    }
    expect(missing, `tables created without RLS: ${missing.join(', ')}`).toEqual([]);
  });

  it('D2: no permissive allow-all policies in migrations', () => {
    const hits: string[] = [];
    for (const { file, sql } of migrations) {
      if (/using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i.test(sql)) hits.push(file);
    }
    expect(hits, `permissive USING(true)/WITH CHECK(true) policies in: ${hits.join(', ')}`).toEqual([]);
  });

  it('D6: every SECURITY DEFINER function pins its search_path (last definition wins)', () => {
    // Migrations are an ordered history: a function may be defined several
    // times. What matters for the live schema is the LAST definition of each
    // function name across the chain.
    const lastDef = new Map<string, { file: string; pinned: boolean }>();
    const files = migrations; // already sorted by name = application order
    for (const { file, sql } of files) {
      const re =
        /create (?:or replace )?function public\.([a-z_]+)\s*\([^)]*\)([^$]*?)as \$\$/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql))) {
        const name = m[1];
        const tail = m[2]; // everything between ")" and "as $$"
        const isSecurityDefiner = /security definer/i.test(tail);
        const pinned = /set search_path/i.test(tail);
        if (!isSecurityDefiner) {
          lastDef.delete(name); // replaced by a non-definer version: nothing to pin
          continue;
        }
        lastDef.set(name, { file, pinned });
      }
    }
    expect(lastDef.size).toBeGreaterThanOrEqual(6); // the known definer set
    const offenders = [...lastDef.entries()]
      .filter(([, v]) => !v.pinned)
      .map(([name, v]) => `${name} (${v.file})`);
    expect(offenders, `SECURITY DEFINER without pinned search_path: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('endpoint guard (B-024: deny-by-default route registry)', () => {
  /** Intentionally public routes. Every other route needs a server auth marker. */
  const PUBLIC_ROUTES = new Set([
    '/api/health', // status only, no data
    '/api/jobs', // public job search, rate-limited
    '/api/auth/signup', // rate-limited account creation
    '/api/auth/signout', // clears cookies; nothing to protect
    '/api/auth/confirm', // legacy-account repair, gated by prior password proof
    '/api/auth/forgot-password', // rate-limited
    '/api/auth/reset-password', // token-gated, rate-limited
    '/api/client-error', // anonymous-safe: rate-limited, bounded, writes to audit_logs only
    // Native-client bootstrap for the Android app: returns only the values that
    // are already public (NEXT_PUBLIC_SUPABASE_URL / ANON KEY, canonical app
    // URL, support address). No user data, no server secret — see
    // tests/mobile-config-route.test.ts, which asserts that.
    '/api/mobile/config',
  ]);

  const AUTH_MARKERS = [
    'requireUser',
    'requireAdminUser',
    'admin_users',
    'getUser',
    'CRON_SECRET',
    'verif-hash',
    'FLW_SECRET',
    'TALLY_WEBHOOK_SECRET',
  ];

  it('every API route has server-side auth or is on the reviewed public allowlist', () => {
    const files = listFiles(API_DIR).filter((f) => f.endsWith('route.ts'));
    expect(files.length).toBeGreaterThan(50);
    const unprotected: string[] = [];
    for (const file of files) {
      const route = file.replace(/^app/, '').replace(/\/route\.ts$/, '');
      if (PUBLIC_ROUTES.has(route)) continue;
      const src = readFileSync(file, 'utf-8');
      if (!AUTH_MARKERS.some((marker) => src.includes(marker))) unprotected.push(route);
    }
    expect(unprotected, `routes without a server auth marker: ${unprotected.join(', ')}`).toEqual([]);
  });

  it('high-value routes keep server-side rate limiting', () => {
    const mustRateLimit = [
      'app/api/free-tools/generate/route.ts',
      'app/api/auth/signup/route.ts',
      'app/api/jobs/route.ts',
      'app/api/documents/generate/route.ts',
      'app/api/resume-studio/generate/route.ts',
      'app/api/ai/resume/route.ts',
    ];
    const missing = mustRateLimit.filter(
      (f) => !readFileSync(f, 'utf-8').includes('enforceRateLimit'),
    );
    expect(missing, `rate limiting missing in: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('header guard (B-005/F-002/F-003/F-008)', () => {
  const config = readFileSync('next.config.mjs', 'utf-8');

  it('keeps the baseline security header set', () => {
    for (const header of [
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
      'Cross-Origin-Opener-Policy',
      'Cross-Origin-Resource-Policy',
      'X-DNS-Prefetch-Control',
    ]) {
      expect(config, `missing header: ${header}`).toContain(header);
    }
  });

  it('CSP contains no unsafe-eval and pins object-src', () => {
    const cspLine = config.split('\n').find((l) => l.includes('script-src'));
    expect(cspLine).toBeTruthy();
    expect(cspLine!).not.toContain('unsafe-eval');
    expect(config).toContain("object-src 'none'");
  });

  it('auth and authenticated surfaces are served no-store', () => {
    for (const path of [
      "'/login'",
      "'/signup'",
      "'/reset-password'",
      "'/dashboard/:path*'",
      "'/billing/:path*'",
      "'/documents/:path*'",
      "'/applications/:path*'",
    ]) {
      expect(config, `no-store missing for ${path}`).toContain(path);
    }
    expect(config).toContain('no-store');
  });
});

describe('bundle secret scan (B-003) — runs when .next/static exists (post-build)', () => {
  const STATIC_DIR = '.next/static';

  it.skipIf(!existsSync(STATIC_DIR))('client bundles contain no secret material', () => {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const forbidden: RegExp[] = [
      /sk_live/,
      /sk_test/,
      /sk-ant/,
      /sk-proj/,
      /service_role/i,
      /SUPABASE_SERVICE/,
      /-----BEGIN/,
      /postgres:\/\//,
    ];
    const files = listFiles(STATIC_DIR).filter((f) => /\.(js|mjs|css|map|txt|html)$/.test(f));
    expect(files.length).toBeGreaterThan(10);
    const findings: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      for (const re of forbidden) {
        if (re.test(src)) findings.push(`${file}: ${re}`);
      }
      // JWTs are allowed ONLY if they are the publishable anon key.
      for (const m of src.matchAll(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9[A-Za-z0-9._-]*/g)) {
        if (!anonKey || m[0] !== anonKey) findings.push(`${file}: unexpected JWT`);
      }
    }
    expect(findings, `secrets found in bundle: ${findings.slice(0, 10).join(', ')}`).toEqual([]);
  });
});
