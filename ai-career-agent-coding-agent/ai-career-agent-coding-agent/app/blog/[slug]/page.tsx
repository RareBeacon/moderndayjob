import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';
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
}

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

async function getDbArticle(slug: string): Promise<DbArticle | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('seo_articles')
      .select('slug,title,url,target_keyword,secondary_keywords,meta_description,meta_title,canonical_url,content_markdown,published_at,last_updated,search_intent')
      .eq('slug', slug)
      .eq('status', 'PUBLISHED')
      .maybeSingle();
    if (error || !data) return null;
    return data as DbArticle;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
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
  const db = await getDbArticle(slug);
  if (!db) return {};
  return {
    title: db.meta_title || db.title,
    description: db.meta_description || undefined,
    keywords: [db.target_keyword ?? '', ...(db.secondary_keywords ?? [])].filter(Boolean),
    alternates: { canonical: db.canonical_url || db.url },
    openGraph: {
      title: db.title,
      description: db.meta_description || undefined,
      type: 'article',
      url: db.url,
      publishedTime: db.published_at ?? undefined,
      modifiedTime: db.last_updated ?? undefined,
      authors: ['Jobiest'],
    },
  };
}

function articleJsonLd(input: { title: string; description?: string | null; publishedAt?: string | null; updatedAt?: string | null; url: string; keywords: string[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description ?? undefined,
    datePublished: input.publishedAt ?? undefined,
    dateModified: input.updatedAt ?? input.publishedAt ?? undefined,
    author: { '@type': 'Organization', name: 'Jobiest' },
    publisher: { '@type': 'Organization', name: 'Jobiest' },
    mainEntityOfPage: input.url,
    keywords: input.keywords.join(', '),
  };
}

function MarkdownArticle({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="blog-article-body">
      {blocks.map((block) => {
        if (block.startsWith('# ')) return <h2 key={block}>{block.replace(/^#\s+/, '')}</h2>;
        if (block.startsWith('## ')) return <section key={block}><h2>{block.replace(/^##\s+/, '')}</h2></section>;
        if (block.startsWith('- ')) {
          const items = block.split('\n').map((x) => x.replace(/^[-*]\s+/, '').trim()).filter(Boolean);
          return <ul key={block}>{items.map((i) => <li key={i}>{i}</li>)}</ul>;
        }
        return <p key={block}>{block}</p>;
      })}
      <section className="blog-cta-box">
        <h2>Ready to change how your search works?</h2>
        <p>Create a free Jobiest profile and start improving your next application with verified facts.</p>
        <Link className="jl-btn-solid" href="/signup">Get Started Free</Link>
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
      <section className="blog-cta-box">
        <h2>Ready to change how your search works?</h2>
        <p>{post.cta}</p>
        <Link className="jl-btn-solid" href="/signup">Get Started Free</Link>
      </section>
    </div>
  );
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  const db = post ? null : await getDbArticle(slug);
  if (!post && !db) notFound();

  const title = post?.title ?? db!.title;
  const description = post?.description ?? db!.meta_description;
  const category = post?.category ?? db!.search_intent ?? 'SEO guide';
  const readingTime = post?.readingTime ?? '5 min';
  const url = post ? `${SITE_URL}/blog/${post.slug}` : db!.url;
  const keywords = post ? [post.primaryKeyword, ...post.secondaryKeywords] : [db!.target_keyword ?? '', ...(db!.secondary_keywords ?? [])].filter(Boolean);
  const jsonLd = articleJsonLd({ title, description, publishedAt: post?.publishedAt ?? db!.published_at, updatedAt: post?.publishedAt ?? db!.last_updated, url, keywords });

  return (
    <div className="jl-page">
      <JobletNavbar />
      <main id="main">
        <article className="jl-sec blog-article">
          <div className="jl-shell blog-article-shell">
            <Link className="blog-back" href="/blog">Back to blog</Link>
            <header className="blog-article-head">
              <div className="blog-card-meta"><span>{category}</span><span>{readingTime}</span></div>
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </header>
            {post ? <StaticArticle post={post} /> : <MarkdownArticle markdown={db!.content_markdown} />}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        </article>
      </main>
      <JobletFooter />
    </div>
  );
}
