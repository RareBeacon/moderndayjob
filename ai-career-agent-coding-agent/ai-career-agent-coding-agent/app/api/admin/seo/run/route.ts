import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import {
  ensureSeoProject,
  importSearchConsoleMetrics,
  inspectAndRecordUrl,
  recordDiscoveryWorkflow,
  runInitialSeoFoundation,
  seedKeywordRoadmap,
  submitConfiguredSitemap,
  syncPastorArticles,
  verifySitemapAndRobots,
} from '@/lib/seo/service';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('INITIAL_AUDIT') }),
  z.object({ action: z.literal('SYNC_PASTOR_ARTICLES') }),
  z.object({ action: z.literal('SEED_KEYWORDS') }),
  z.object({ action: z.literal('VERIFY_SITEMAP') }),
  z.object({ action: z.literal('SUBMIT_SITEMAP') }),
  z.object({ action: z.literal('IMPORT_METRICS'), days: z.number().int().min(3).max(90).optional() }),
  z.object({ action: z.literal('INSPECT_URL'), url: z.string().url() }),
  z.object({ action: z.literal('RECORD_DISCOVERY'), url: z.string().url(), contentType: z.string().min(3).max(60).optional() }),
]);

export async function POST(req: Request) {
  try {
    const admin = await requireAdminUser();
    const project = await ensureSeoProject();
    const parsed = body.parse(await req.json());
    let result: unknown;
    switch (parsed.action) {
      case 'INITIAL_AUDIT':
        result = await runInitialSeoFoundation(project, admin.id);
        break;
      case 'SYNC_PASTOR_ARTICLES':
        result = { synced: await syncPastorArticles(project.id, admin.id) };
        break;
      case 'SEED_KEYWORDS':
        result = { seeded: await seedKeywordRoadmap(project.id, admin.id) };
        break;
      case 'VERIFY_SITEMAP':
        result = await verifySitemapAndRobots(project, admin.id);
        break;
      case 'SUBMIT_SITEMAP':
        result = await submitConfiguredSitemap(project, admin.id);
        break;
      case 'IMPORT_METRICS':
        result = { imported: await importSearchConsoleMetrics(project, admin.id, parsed.days ?? 28) };
        break;
      case 'INSPECT_URL':
        result = await inspectAndRecordUrl(project, parsed.url, admin.id);
        break;
      case 'RECORD_DISCOVERY':
        result = await recordDiscoveryWorkflow(project, parsed.url, parsed.contentType ?? 'Article', admin.id);
        break;
    }
    return Response.json({ ok: true, result });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'INVALID_BODY', issues: error.issues }, { status: 400 });
    return adminErrorResponse(error);
  }
}
