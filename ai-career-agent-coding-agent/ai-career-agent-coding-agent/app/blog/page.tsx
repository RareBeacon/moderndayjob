import Link from 'next/link';
import type { Metadata } from 'next';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { BLOG_POSTS } from '@/lib/seo/blog';
import { SITE_URL } from '@/lib/site';
import { breadcrumbJsonLd, jsonLdTag } from '@/lib/seo';
import { supabaseAdmin } from '@/lib/supabase';
import styles from '../marketing.module.css';

export const metadata: Metadata = {
  title: 'Job Search Blog',
  description: 'Practical Jobiest guides on job search strategy, ATS-friendly CVs, application automation and getting more interview callbacks.',
  alternates: { canonical: `${SITE_URL}/blog` },
};

export const revalidate = 300;

async function dbPosts() {
  try {
    const { data, error } = await supabaseAdmin
      .from('seo_articles')
      .select('slug,title,target_keyword,secondary_keywords,meta_description,search_intent')
      .eq('status', 'PUBLISHED')
      .order('published_at', { ascending: false })
      .limit(80);
    if (error || !data) return [];
    const seeded = new Set(BLOG_POSTS.map((p) => p.slug));
    return data.filter((p) => !seeded.has(String(p.slug))).map((p) => ({
      slug: String(p.slug),
      title: String(p.title),
      category: String(p.search_intent ?? 'SEO guide'),
      readingTime: '5 min',
      description: String(p.meta_description ?? ''),
      primaryKeyword: String(p.target_keyword ?? ''),
      secondaryKeywords: (p.secondary_keywords ?? []) as string[],
    }));
  } catch {
    return [];
  }
}

export default async function BlogIndexPage() {
  const posts = [...BLOG_POSTS, ...(await dbPosts())];
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Jobiest Blog',
    itemListElement: posts.map((post, index) => ({ '@type': 'ListItem', position: index + 1, url: `${SITE_URL}/blog/${post.slug}`, name: post.title })),
  };
  return (
    <MarketingShell activePath="/blog">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }]))} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(itemListJsonLd)} />
      <main className={styles.page} id="main">
        <header className={styles.pageHero} data-animate>
          <div className={styles.container}>
            <p className={styles.eyebrow}>Jobiest Blog</p>
            <h1>Job search strategy for people who are tired of guessing.</h1>
            <p className={styles.pageLead}>
              Practical guides on ATS scans, tailored CVs, application volume, automation, and the process behind getting more interviews.
            </p>
          </div>
        </header>
        <section className={`${styles.section} ${styles.sectionSoft}`} data-animate>
          <div className={`${styles.container} ${styles.postGrid}`}>
            {posts.map((post) => (
              <article className={styles.postCard} key={post.slug}>
                <div className={styles.postMeta}>
                  <span>{post.category}</span>
                  <span>{post.readingTime}</span>
                </div>
                <h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2>
                <p>{post.description}</p>
                <div className={styles.postTags}>
                  {post.primaryKeyword && <span>{post.primaryKeyword}</span>}
                  {post.secondaryKeywords.slice(0, 2).map((k) => <span key={k}>{k}</span>)}
                </div>
                <Link className={styles.postRead} href={`/blog/${post.slug}`}>Read article</Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
