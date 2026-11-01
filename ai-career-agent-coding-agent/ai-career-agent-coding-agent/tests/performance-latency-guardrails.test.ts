import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('Performance & UI latency guardrails', () => {
  it('skips cross-region Supabase auth calls on public pages when no auth cookie exists', () => {
    const auth = read('lib/auth.ts');
    expect(auth).toContain('export async function getOptionalUser()');
    expect(auth).toContain("c.name.startsWith('sb-')");

    for (const pagePath of [
      'app/templates/page.tsx',
      'app/pricing/page.tsx',
      'app/about/page.tsx',
      'app/how-it-works/page.tsx',
      'app/tools/page.tsx',
    ]) {
      const src = read(pagePath);
      expect(src, `${pagePath} should use getOptionalUser`).toContain('getOptionalUser');
      expect(src).not.toContain("export const dynamic = 'force-dynamic'");
    }

    const home = read('app/page.tsx');
    expect(home).not.toContain('await getUser()');
  });

  it('eliminates 30-card forced layout reflows and caches normalized sample preview data', () => {
    const bespoke = read('components/resume/BespokeResumeDocument.tsx');
    expect(bespoke).toContain('getSampleNormalizedDoc()');
    expect(bespoke).toContain('export const BespokeResumeDocument = memo(');
    expect(bespoke).toContain("size === 'full' && sheetRef.current");

    const preview = read('components/resume/ResumeDocumentPreview.tsx');
    expect(preview).toContain('export const ResumeDocumentPreview = memo(');

    const gallery = read('components/resume/TemplateGallery.tsx');
    expect(gallery).toContain('const GalleryCard = memo(');

    const generate = read('app/generate/page.tsx');
    expect(generate).toContain('useDeferredValue(draft)');
    expect(generate).toContain('const TemplateCard = memo(');
  });

  it('parallelizes auth/session waterfalls and avoids blocking DB session touch writes', () => {
    const middleware = read('middleware.ts');
    expect(middleware).toContain('const [sessionOutcome, gatesOutcome, aalOutcome] = await Promise.all(');
    expect(middleware).toContain('void touchAppSession(appSessionRow as any)');

    const auth = read('lib/auth.ts');
    expect(auth).toContain('const [appCheck, profileStatus] = await Promise.all([');
    expect(auth).toContain('void touchAppSession(v.row)');
  });

  it('omits multi-MB document content from default generated-documents list and caches rate limiters', () => {
    const genRoute = read('app/api/documents/generated/route.ts');
    expect(genRoute).toContain("searchParams.get('includeContent') === '1'");
    expect(genRoute).toContain("'id,kind,title,version,is_active,created_at,application_id,source_facts'");

    const rateLimit = read('lib/rate-limit.ts');
    expect(rateLimit).toContain('const limiterCache = new Map<string, Ratelimit>()');
    expect(rateLimit).toContain('analytics: false');
  });
});
