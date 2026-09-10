import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { supabaseAdmin } from '@/lib/supabase';
import { generateSeoArticleFromKeyword } from '@/lib/seo/content-agent';
import { ensureSeoProject, recordDiscoveryWorkflow, recordSeoAudit } from '@/lib/seo/service';

const body = z.object({
  keyword: z.string().trim().min(3).max(120),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

export async function POST(req: Request) {
  try {
    const admin = await requireAdminUser();
    const project = await ensureSeoProject();
    const input = body.parse(await req.json());
    const article = generateSeoArticleFromKeyword(input.keyword);
    const { data, error } = await supabaseAdmin
      .from('seo_articles')
      .upsert({
        project_id: project.id,
        title: article.title,
        slug: article.slug,
        url: article.url,
        target_keyword: article.targetKeyword,
        secondary_keywords: article.secondaryKeywords,
        semantic_keywords: article.semanticKeywords,
        search_intent: article.searchIntent,
        meta_title: article.metaTitle,
        meta_description: article.metaDescription,
        canonical_url: article.canonicalUrl,
        featured_image_alt: article.featuredImageAlt,
        status: input.status,
        content_markdown: article.contentMarkdown,
        quality_report: article.qualityReport,
        indexing_status: input.status === 'PUBLISHED' ? 'DISCOVERABLE_VIA_SITEMAP' : 'DRAFT_NOT_INDEXABLE',
        published_at: input.status === 'PUBLISHED' ? new Date().toISOString() : null,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'project_id,slug' })
      .select('id, url, status')
      .single();
    if (error) throw new Error(error.message);
    await recordSeoAudit({ projectId: project.id, actorUserId: admin.id, action: 'SEO_ARTICLE_GENERATED', targetType: 'article', targetUrl: article.url, metadata: { keyword: input.keyword, status: input.status, metrics: 'No search-volume/difficulty/CPC fabricated.' } });
    if (input.status === 'PUBLISHED') await recordDiscoveryWorkflow(project, article.url, 'Article', admin.id);
    return Response.json({ ok: true, article: data });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'INVALID_BODY', issues: error.issues }, { status: 400 });
    return adminErrorResponse(error);
  }
}
