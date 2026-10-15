import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import styles from '../../marketing.module.css';
import { BLOG_POSTS, getBlogPost, type BlogPost } from '@/lib/seo/blog';
import { SITE_URL } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamicParams = true;
export const revalidate = 300;

interface DbArticle {
  slug: string;
  title: string;
  url: string;
  target_keyword: string | null;
  secondary_keywords: string[] | null;
  meta_description: string | null;
  meta_title: string | null;
  canonical_url: string | null;
  content_markdown: string;
  published_at: string | null;
  last_updated: string | null;
  search_intent: string | null;
  featured_image_url?: string | null;
  featured_image_alt?: string | null;
  faq?: { question: string; answer: string }[] | null;
  internal_links?: string[] | null;
  content_cluster?: string | null;
}

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

async function getDbArticle(slug: string): Promise<DbArticle | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('seo_articles')
      .select('slug,title,url,target_keyword,secondary_keywords,meta_description,meta_title,canonical_url,content_markdown,published_at,last_updated,search_intent,featured_image_alt')
      .eq('slug', slug)
      .eq('status', 'PUBLISHED')
      .maybeSingle();
    if (error || !data) return null;

    const { data: rich } = await supabaseAdmin
      .from('seo_articles')
      .select('featured_image_url,faq,internal_links,content_cluster')
      .eq('slug', slug)
      .eq('status', 'PUBLISHED')
      .maybeSingle()
      .then((result) => result, () => ({ data: null }));

    return { ...(data as DbArticle), ...((rich ?? {}) as Partial<DbArticle>) };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  // DB is the source of truth for published articles; the static list is a
  // fallback so legacy posts keep rendering if a row is ever missing.
  const db = await getDbArticle(slug);
  if (db) {
    return {
      title: /jobiest/i.test(db.meta_title || db.title) ? { absolute: db.meta_title || db.title } : db.meta_title || db.title,
      description: db.meta_description || undefined,
      keywords: [db.target_keyword ?? '', ...(db.secondary_keywords ?? [])].filter(Boolean),
      alternates: { canonical: db.canonical_url || db.url },
      openGraph: {
        title: db.title,
        description: db.meta_description || undefined,
        type: 'article',
        url: db.url,
        images: [db.featured_image_url || `${SITE_URL}/images/og-card.jpg`],
        publishedTime: db.published_at ?? undefined,
        modifiedTime: db.last_updated ?? undefined,
        authors: ['Jobiest'],
      },
    };
  }
  const post = getBlogPost(slug);
  if (post) {
    return {
      title: post.title,
      description: post.description,
      keywords: [post.primaryKeyword, ...post.secondaryKeywords],
      alternates: { canonical: `${SITE_URL}/blog/${post.slug}` },
      openGraph: {
        title: post.title,
        description: post.description,
        type: 'article',
        url: `${SITE_URL}/blog/${post.slug}`,
        publishedTime: post.publishedAt,
        authors: ['Jobiest'],
      },
    };
  }
  return {};
}

function articleJsonLd(input: { title: string; description?: string | null; publishedAt?: string | null; updatedAt?: string | null; url: string; keywords: string[]; image?: string | null }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description ?? undefined,
    image: input.image ?? `${SITE_URL}/images/og-card.jpg`,
    datePublished: input.publishedAt ?? undefined,
    dateModified: input.updatedAt ?? input.publishedAt ?? undefined,
    author: { '@type': 'Organization', name: 'Jobiest' },
    publisher: { '@type': 'Organization', name: 'Jobiest' },
    mainEntityOfPage: input.url,
    keywords: input.keywords.join(', '),
  };
}

function faqJsonLd(faq?: { question: string; answer: string }[] | null) {
  if (!faq?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (!match) return <span key={`${part}-${index}`}>{part}</span>;
        const href = match[2].startsWith('/') ? match[2] : '#';
        return <Link className="inline-link" href={href} key={`${part}-${index}`}>{match[1]}</Link>;
      })}
    </>
  );
}

function MarkdownArticle({ markdown, faq, internalLinks }: { markdown: string; faq?: { question: string; answer: string }[] | null; internalLinks?: string[] | null }) {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const markdownAlreadyHasFaq = /##\s+Frequently asked questions/i.test(markdown);
  return (
    <div className="blog-article-body">
      {blocks.map((block) => {
        if (block.startsWith('# ')) return <h2 key={block}>{block.replace(/^#\s+/, '')}</h2>;
        if (block.startsWith('## ')) return <section key={block}><h2>{block.replace(/^##\s+/, '')}</h2></section>;
        if (block.startsWith('### ')) return <h3 key={block}>{block.replace(/^###\s+/, '')}</h3>;
        if (block.startsWith('- ')) {
          const items = block.split('\n').map((x) => x.replace(/^[-*]\s+/, '').trim()).filter(Boolean);
          return <ul key={block}>{items.map((i) => <li key={i}><InlineMarkdown text={i} /></li>)}</ul>;
        }
        return <p key={block}><InlineMarkdown text={block} /></p>;
      })}
      {faq?.length && !markdownAlreadyHasFaq ? (
        <section className="blog-faq-box">
          <h2>Frequently asked questions</h2>
          {faq.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>
      ) : null}
      {internalLinks?.length ? (
        <section className="blog-related-box">
          <h2>Related Jobiest resources</h2>
          <ul>{internalLinks.slice(0, 6).map((href) => <li key={href}><Link className="inline-link" href={href}>{href.replace(/^\//, '').replace(/-/g, ' ')}</Link></li>)}</ul>
        </section>
      ) : null}
      <section className="blog-cta-box">
        <h2>Ready to change how your search works?</h2>
        <p>Create a free Jobiest profile and start improving your next application with verified facts.</p>
        <Link className={styles.primaryAction} href="/signup">Get Started Free</Link>
      </section>
    </div>
  );
}

function StaticArticle({ post }: { post: BlogPost }) {
  return (
    <div className="blog-article-body">
      {post.sections.map((section) => (
        <section key={`${section.eyebrow}-${section.heading}`}>
          {section.eyebrow && <span className="blog-step">{section.eyebrow}</span>}
          {section.heading && <h2>{section.heading}</h2>}
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
      {post.relatedTools?.length ? (
        <section className="blog-internal-links">
          <h2>Free tools that help with this</h2>
          <ul>
            {post.relatedTools.map((tool) => (
              <li key={tool.href}><Link className="inline-link" href={tool.href}>{tool.label}</Link></li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="blog-cta-box">
        <h2>Ready to change how your search works?</h2>
        <p>{post.cta}</p>
        <Link className={styles.primaryAction} href="/signup">Get Started Free</Link>
      </section>
    </div>
  );
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  // DB is the source of truth; the static list is a fallback for missing rows.
  const db = await getDbArticle(slug);
  if (!post && !db) notFound();

  const title = db?.title ?? post!.title;
  const description = db?.meta_description ?? post!.description;
  const category = post?.category ?? db!.search_intent ?? 'SEO guide';
  const readingTime = db
    ? `${Math.max(1, Math.round(db.content_markdown.split(/\s+/).length / 220))} min`
    : post!.readingTime;
  const url = db?.url ?? `${SITE_URL}/blog/${post!.slug}`;
  const keywords = db
    ? [db.target_keyword ?? '', ...(db.secondary_keywords ?? [])].filter(Boolean)
    : [post!.primaryKeyword, ...post!.secondaryKeywords];
  const image = db?.featured_image_url || `${SITE_URL}/images/og-card.jpg`;
  const jsonLd = articleJsonLd({ title, description, publishedAt: db?.published_at ?? post?.publishedAt, updatedAt: db?.last_updated ?? post?.publishedAt, url, keywords, image });
  const faqLd = faqJsonLd(db?.faq);

  return (
    <MarketingShell activePath="/blog">
      <main className={styles.page} id="main">
        <article className={styles.section}>
          <div className={`${styles.container} blog-article-shell`} style={{ maxWidth: 860 }}>
            <Link className="blog-back" href="/blog">Back to blog</Link>
            <header className="blog-article-head">
              <div className="blog-card-meta"><span>{category}</span><span>{readingTime}</span></div>
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </header>
            {db && (
              <figure className="blog-featured-image" aria-label={db!.featured_image_alt ?? `${title} featured image`}>
                <span>{db!.content_cluster ?? 'Jobiest guide'}</span>
                <strong>{db!.target_keyword ?? title}</strong>
              </figure>
            )}
            {db ? <MarkdownArticle markdown={db.content_markdown} faq={db.faq} internalLinks={db.internal_links} /> : post ? <StaticArticle post={post} /> : null}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
          {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}
        </article>
      </main>
    </MarketingShell>
  );
}
