import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { BLOG_POSTS } from '@/lib/seo/blog';
import { MASTER_UPGRADE_POSTS } from '@/lib/seo/master-upgrade-content';
import { STRATEGIC_SEO_POSTS } from '@/lib/seo/strategic-content';
import { getTopicCluster, TOPIC_CLUSTERS, matchPostToCluster } from '@/lib/seo/topic-clusters';
import { SITE_URL } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase';

export const revalidate = 3600;

async function postsFor(slug: string) {
  const cluster = getTopicCluster(slug);
  if (!cluster) return { cluster: null, posts: [] as Array<{ slug: string; title: string; description: string }> };
  const staticPosts = [...BLOG_POSTS, ...STRATEGIC_SEO_POSTS, ...MASTER_UPGRADE_POSTS]
    .filter((post) => matchPostToCluster({ slug: post.slug, title: post.title, keyword: 'targetKeyword' in post ? post.targetKeyword : post.primaryKeyword, cluster: 'cluster' in post ? post.cluster : null }).slug === slug)
    .map((post) => ({ slug: post.slug, title: post.title, description: 'metaDescription' in post ? post.metaDescription : post.description }));
  try {
    const { data } = await supabaseAdmin.from('seo_articles').select('slug,title,meta_description,target_keyword,content_cluster').eq('status', 'PUBLISHED').limit(500);
    const dbPosts = (data ?? []).filter((post) => matchPostToCluster({ slug: String(post.slug), title: String(post.title), keyword: String(post.target_keyword ?? ''), cluster: String(post.content_cluster ?? '') }).slug === slug)
      .map((post) => ({ slug: String(post.slug), title: String(post.title), description: String(post.meta_description ?? '') }));
    const unique = new Map([...staticPosts, ...dbPosts].map((post) => [post.slug, post]));
    return { cluster, posts: [...unique.values()] };
  } catch {
    return { cluster, posts: staticPosts };
  }
}

export async function generateStaticParams() { return TOPIC_CLUSTERS.map((cluster) => ({ cluster: cluster.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ cluster: string }> }): Promise<Metadata> {
  const { cluster: slug } = await params;
  const { cluster } = await postsFor(slug);
  if (!cluster) return { title: 'Topic unavailable | Jobiest', robots: { index: false, follow: true } };
  return { title: cluster.seoTitle, description: cluster.metaDescription, alternates: { canonical: `${SITE_URL}/blog/topic/${slug}` } };
}

export default async function BlogTopicPage({ params }: { params: Promise<{ cluster: string }> }) {
  const { cluster: slug } = await params;
  const { cluster, posts } = await postsFor(slug);
  if (!cluster) return <MarketingShell><main className="mk-shell"><h1>Topic not found</h1><Link href="/blog">Browse all guides</Link></main></MarketingShell>;
  const structuredData = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: cluster.title, description: cluster.metaDescription, url: `${SITE_URL}/blog/topic/${slug}`, mainEntity: { '@type': 'ItemList', itemListElement: posts.map((post, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/blog/${post.slug}`, name: post.title })) } };
  return (
    <MarketingShell activePath="/blog">
      <main className="mk-shell" style={{ maxWidth: 1050, paddingTop: 48, paddingBottom: 72 }}>
        <nav aria-label="Breadcrumb"><Link href="/">Home</Link> / <Link href="/blog">Blog</Link> / <span>{cluster.shortLabel}</span></nav>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
        <p className="mk-kicker">Jobiest guide collection</p><h1>{cluster.title}</h1><p>{cluster.lead}</p>
        <p><Link className="btn primary" href={cluster.featuredToolHref}>{cluster.featuredToolLabel}</Link> · <Link href={`/cv-examples/${cluster.featuredCvExampleSlug}`}>Read a related CV example</Link></p>
        {posts.length ? <ul>{posts.map((post) => <li key={post.slug} style={{ padding: '18px 0', borderTop: '1px solid #d8deea' }}><h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2><p>{post.description}</p></li>)}</ul> : <p>Guides for this collection are being prepared. Explore <Link href="/blog">all Jobiest guides</Link> or try a <Link href={cluster.featuredToolHref}>free career tool</Link>.</p>}
        <h2>More Jobiest guide collections</h2><ul>{TOPIC_CLUSTERS.filter((other) => other.slug !== slug).map((other) => <li key={other.slug}><Link href={`/blog/topic/${other.slug}`}>{other.title}</Link></li>)}</ul>
      </main>
    </MarketingShell>
  );
}
