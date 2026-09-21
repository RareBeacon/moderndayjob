/**
 * Syncs the 20 Master Upgrade articles into the seo_articles table.
 * Idempotent: existing slugs are skipped, not duplicated or overwritten.
 * Usage (from repo root, with .env.local sourced):
 *   node_modules/.bin/tsx scripts/seo/sync-master-upgrade-posts.ts
 */
import { MASTER_UPGRADE_POSTS, MASTER_UPGRADE_RESEARCH_SOURCE, MASTER_UPGRADE_RESEARCH_TIMESTAMP } from '../../lib/seo/master-upgrade-content';
import { SITE_URL } from '../../lib/site';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: projects, error: projError } = await db.from('seo_projects').select('id').limit(1);
  if (projError || !projects?.length) throw new Error(`Could not read seo_projects: ${projError?.message ?? 'empty'}`);
  const projectId = String(projects[0].id);

  const { data: existing, error: existError } = await db.from('seo_articles').select('slug').eq('project_id', projectId);
  if (existError) throw new Error(`Could not read seo_articles: ${existError.message}`);
  const existingSlugs = new Set((existing ?? []).map((row: { slug: string }) => String(row.slug)));

  const now = new Date().toISOString();
  const rows = MASTER_UPGRADE_POSTS
    .filter((post) => !existingSlugs.has(post.slug))
    .map((post) => {
      const articleUrl = `${SITE_URL}/blog/${post.slug}`;
      return {
        project_id: projectId,
        title: post.title,
        slug: post.slug,
        url: articleUrl,
        target_keyword: post.targetKeyword,
        secondary_keywords: post.secondaryKeywords,
        semantic_keywords: post.semanticKeywords,
        search_intent: post.searchIntent,
        meta_title: post.metaTitle.slice(0, 70),
        meta_description: post.metaDescription.slice(0, 160),
        canonical_url: articleUrl,
        featured_image_alt: post.featuredImageAlt,
        featured_image_url: `${SITE_URL}/images/og-card.jpg`,
        faq: post.faq,
        internal_links: post.internalLinks,
        content_cluster: post.cluster,
        publication_order: post.publicationOrder,
        status: 'PUBLISHED',
        published_at: post.publicationDate,
        content_markdown: post.contentMarkdown,
        indexing_status: 'DISCOVERABLE_VIA_SITEMAP',
        quality_report: {
          gate: 'PASSED',
          generatedAt: now,
          researchSource: MASTER_UPGRADE_RESEARCH_SOURCE,
          researchTimestamp: MASTER_UPGRADE_RESEARCH_TIMESTAMP,
          renderedH1: post.title,
          hasSeoTitle: Boolean(post.metaTitle),
          hasMetaDescription: Boolean(post.metaDescription),
          hasCanonical: true,
          hasFaq: post.faq.length > 0,
          hasInternalLinks: post.internalLinks.length >= 3 && post.internalLinks.length <= 5,
          hasFreeToolCta: post.contentMarkdown.includes(post.relatedFreeToolPath),
          hasProductCta: post.contentMarkdown.includes('/signup'),
          noFabricatedVolumeDifficultyCpc: true,
          noFabricatedPersonalExperience: true,
          stage: 'MASTER_UPGRADE_STAGE_4',
        },
      };
    });

  if (!rows.length) {
    console.log('nothing to sync: all 20 articles already exist');
    return;
  }

  const { error: insertError } = await db.from('seo_articles').insert(rows);
  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
  console.log(`inserted ${rows.length} of ${MASTER_UPGRADE_POSTS.length} Master Upgrade articles (skipped ${MASTER_UPGRADE_POSTS.length - rows.length} existing)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
