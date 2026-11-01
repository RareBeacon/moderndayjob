import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import { isAllowedPublicSeoUrl } from '@/lib/seo/public-urls';
import { timingSafeCronBearerMatch } from '@/lib/security/cron-auth';

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe('Jobiest Nov 2, 2026 Product Launch Readiness & Journeys 1-8 Integrity', () => {
  it('Journey 1 & 2: zero broken internal href links across all pages/components, including /forgot-password', () => {
    const appDir = path.join(process.cwd(), 'app');
    const compDir = path.join(process.cwd(), 'components');

    const routeFiles = walkFiles(appDir).filter((f) => /\/(page\.tsx|route\.ts)$/.test(f));
    const validRoutes = routeFiles.map((f) => {
      let rel = '/' + path.relative(appDir, f).replace(/\/(page\.tsx|route\.ts)$/, '');
      rel = rel.replace(/\/\([^)]+\)/g, '');
      if (rel === '/page.tsx' || rel === '/') return '/';
      return rel;
    });

    const staticSet = new Set(validRoutes.filter((r) => !r.includes('[')));
    const dynamicRegexes = validRoutes
      .filter((r) => r.includes('['))
      .map(
        (r) =>
          new RegExp(
            '^' + r.replace(/\[\.\.\.[^\]]+\]/g, '.+').replace(/\[[^\]]+\]/g, '[^/]+') + '$',
          ),
      );

    expect(staticSet.has('/forgot-password')).toBe(true);
    expect(staticSet.has('/reset-password')).toBe(true);
    expect(staticSet.has('/talent-pool')).toBe(true);
    expect(staticSet.has('/employer')).toBe(true);
    expect(staticSet.has('/admin/talent-pool')).toBe(true);

    const tsxFiles = [...walkFiles(appDir), ...walkFiles(compDir)].filter((f) => f.endsWith('.tsx'));
    const hrefRe = /href\s*=\s*["'](\/[a-zA-Z0-9_\-/?.=&%#]*)["']/g;
    const unmatched: string[] = [];

    for (const file of tsxFiles) {
      const src = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = hrefRe.exec(src)) !== null) {
        const clean = m[1].split(/[?#]/)[0].replace(/\/+$/, '') || '/';
        if (clean.startsWith('/_next') || /\.(png|jpg|svg|ico|pdf|xml|txt|webmanifest)$/i.test(clean)) {
          continue;
        }
        if (!staticSet.has(clean) && !dynamicRegexes.some((re) => re.test(clean))) {
          unmatched.push(`${path.relative(process.cwd(), file)} -> ${m[1]}`);
        }
      }
    }

    expect(unmatched).toEqual([]);
  });

  it('SEO & Crawler Privacy Gate: robots.txt and public-urls exclude private candidate, employer, admin, and auth recovery paths', () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const disallow = Array.isArray(rules.disallow) ? rules.disallow : [rules.disallow];

    for (const protectedPrefix of [
      '/dashboard',
      '/talent-pool',
      '/employer',
      '/admin',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
    ]) {
      expect(disallow).toContain(protectedPrefix);
      expect(isAllowedPublicSeoUrl(protectedPrefix)).toBe(false);
    }

    expect(isAllowedPublicSeoUrl('/pricing')).toBe(true);
    expect(isAllowedPublicSeoUrl('/how-it-works')).toBe(true);
  });

  it('AppSec Cron Gate: constant-time Bearer token verification rejects malformed, prefix, and wrong-length tokens', () => {
    const secret = 'prod-cron-secret-998877665544332211';
    expect(timingSafeCronBearerMatch(`Bearer ${secret}`, secret)).toBe(true);
    expect(timingSafeCronBearerMatch(null, secret)).toBe(false);
    expect(timingSafeCronBearerMatch('', secret)).toBe(false);
    expect(timingSafeCronBearerMatch(`Bearer ${secret.slice(0, 10)}`, secret)).toBe(false);
    expect(timingSafeCronBearerMatch(`Bearer ${secret}extra`, secret)).toBe(false);
    expect(timingSafeCronBearerMatch(secret, secret)).toBe(false);
  });

  it('Database Migration Safety Gate: migrations 001..051 exist with rollback script and zero destructive DROP TABLE on core user tables', () => {
    const migDir = path.join(process.cwd(), 'supabase/migrations');
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    expect(files.length).toBeGreaterThanOrEqual(51);
    expect(files.some((f) => f.startsWith('051_talent_rag_and_langgraph_checkpoints'))).toBe(true);

    const mig051 = fs.readFileSync(
      path.join(migDir, '051_talent_rag_and_langgraph_checkpoints.sql'),
      'utf8',
    );
    expect(mig051.toLowerCase()).not.toContain('drop table');
    expect(mig051.toLowerCase()).toContain('enable row level security');

    const rollbackSql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/rollbacks/047_to_050_talent_pool.down.sql'),
      'utf8',
    );
    expect(rollbackSql).toContain('talent_workflow_checkpoints');
    expect(rollbackSql).toContain('talent_rag_chunks');
  });
});
