import Link from 'next/link';
import type { Metadata } from 'next';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';
import { BLOG_POSTS } from '@/lib/seo/blog';
import { SITE_URL } from '@/lib/site';
import { supabaseAdmin } from '@/lib/supabase';

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
      .limit(20);
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
  return (
    <div className="jl-page">
      <JobletNavbar />
      <main id="main">
        <section className="jl-sec blog-hero">
          <div className="jl-shell">
            <span className="jl-kicker">Jobiest Blog</span>
            <h1>Job search strategy for people who are tired of guessing.</h1>
            <p>
              Practical guides on ATS scans, tailored CVs, application volume, automation, and the process behind getting more interviews.
            </p>
          </div>
        </section>
        <section className="jl-sec tint">
          <div className="jl-shell blog-grid">
            {posts.map((post) => (
              <article className="blog-card" key={post.slug}>
                <div className="blog-card-meta">
                  <span>{post.category}</span>
                  <span>{post.readingTime}</span>
                </div>
                <h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2>
                <p>{post.description}</p>
                <div className="blog-keywords">
                  {post.primaryKeyword && <span>{post.primaryKeyword}</span>}
                  {post.secondaryKeywords.slice(0, 2).map((k) => <span key={k}>{k}</span>)}
                </div>
                <Link className="blog-read" href={`/blog/${post.slug}`}>Read article</Link>
              </article>
            ))}
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
