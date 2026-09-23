import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { sanitizePortfolioData, type PortfolioData } from '@/lib/portfolios';

export const dynamic = 'force-dynamic';

/**
 * Public portfolio page (Milestone 6, owner decision D5: hosted at
 * /portfolio/<slug> first). Service-role read (RLS has no policies; this
 * page is the only public reader) with three hard rules:
 *  - PRIVATE portfolios 404 for everyone but show nothing.
 *  - A previous_slug (rename) 301-redirects permanently to the new slug.
 *  - All content is structured data sanitized at storage time and rendered
 *    through React text nodes (auto-escaped); nothing is ever injected as
 *    HTML. UNLISTED pages are reachable by link but carry noindex metadata
 *    and stay out of the sitemap; PUBLIC pages are indexed.
 */

type Row = {
  id: string;
  slug: string;
  previous_slug: string | null;
  title: string;
  template_id: string;
  data: unknown;
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
  updated_at: string;
};

async function loadPortfolio(slug: string): Promise<Row | null> {
  const { data } = await supabaseAdmin
    .from('portfolios')
    .select('id, slug, previous_slug, title, template_id, data, visibility, updated_at')
    .eq('slug', slug)
    .maybeSingle();
  if (data) return data as Row;
  // Rename redirect: an old slug resolves to its current record.
  const { data: byPrevious } = await supabaseAdmin
    .from('portfolios')
    .select('id, slug, previous_slug, title, template_id, data, visibility, updated_at')
    .eq('previous_slug', slug)
    .maybeSingle();
  return (byPrevious as Row | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const row = await loadPortfolio(slug);
  if (!row || row.visibility === 'PRIVATE') return { title: 'Portfolio not found' };
  if (row.slug !== slug) return { title: row.title };
  const data = sanitizePortfolioData(row.data);
  const description = data.headline || data.about || `${row.title}, a portfolio hosted on Jobiest.`;
  return {
    title: row.title,
    description: description.slice(0, 300),
    robots: row.visibility === 'UNLISTED' ? { index: false, follow: false } : undefined,
  };
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ fontSize: 20, letterSpacing: 0.4, borderBottom: '1px solid var(--color-border, #ddd)', paddingBottom: 6 }}>{heading}</h2>
      {children}
    </section>
  );
}

export default async function PublicPortfolioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await loadPortfolio(slug);
  if (!row || row.visibility === 'PRIVATE') notFound();
  // Permanent redirect for renamed portfolios.
  if (row.slug !== slug) permanentRedirect(`/portfolio/${row.slug}`);

  const data: PortfolioData = sanitizePortfolioData(row.data);
  const accent = row.template_id === 'bold' ? '#7c2d12' : row.template_id === 'sidebar' ? '#0f766e' : '#111827';
  const isSidebar = row.template_id === 'sidebar';

  const rail = (
    <aside style={{ minWidth: 220, color: 'var(--ink-2, #555)' }}>
      {data.links.email && <p style={{ margin: '4px 0' }}>{data.links.email}</p>}
      {data.links.website && (
        <p style={{ margin: '4px 0' }}>
          <a href={data.links.website} rel="noopener noreferrer nofollow">{data.links.website.replace(/^https?:\/\//, '')}</a>
        </p>
      )}
      {data.links.linkedin && (
        <p style={{ margin: '4px 0' }}>
          <a href={data.links.linkedin} rel="noopener noreferrer nofollow">LinkedIn</a>
        </p>
      )}
      {data.links.github && (
        <p style={{ margin: '4px 0' }}>
          <a href={data.links.github} rel="noopener noreferrer nofollow">GitHub</a>
        </p>
      )}
      {data.skills.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 15 }}>Skills</h2>
          <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
            {data.skills.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '48px 20px', fontFamily: 'var(--font-sans, system-ui)', color: '#111' }}>
      <header style={{ borderLeft: isSidebar ? undefined : `4px solid ${accent}`, paddingLeft: isSidebar ? 0 : 16 }}>
        <h1 style={{ fontSize: row.template_id === 'bold' ? 44 : 34, margin: 0, color: accent }}>{row.title}</h1>
        {data.headline && <p style={{ fontSize: 18, margin: '8px 0 0', color: 'var(--ink-2, #555)' }}>{data.headline}</p>}
      </header>

      <div style={{ display: isSidebar ? 'flex' : 'block', gap: 40, marginTop: 12 }}>
        {isSidebar && rail}
        <div style={{ flex: 1 }}>
          {data.about && <p style={{ fontSize: 17, lineHeight: 1.7 }}>{data.about}</p>}

          {data.experience.length > 0 && (
            <Section heading="Experience">
              {data.experience.map((e) => (
                <article key={`${e.company}-${e.role}`} style={{ marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 2px', fontSize: 17 }}>{e.role} · {e.company}</h3>
                  {e.period && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2, #777)' }}>{e.period}</p>}
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                    {e.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </Section>
          )}

          {data.projects.length > 0 && (
            <Section heading="Projects">
              {data.projects.map((p) => (
                <article key={p.name} style={{ marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 2px', fontSize: 17 }}>{p.name}</h3>
                  {p.description && <p style={{ margin: '4px 0', lineHeight: 1.6 }}>{p.description}</p>}
                  {p.technologies.length > 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2, #777)' }}>{p.technologies.join(', ')}</p>
                  )}
                  {p.url && (
                    <p style={{ margin: '4px 0 0' }}>
                      <a href={p.url} rel="noopener noreferrer nofollow">{p.url.replace(/^https?:\/\//, '')}</a>
                    </p>
                  )}
                </article>
              ))}
            </Section>
          )}

          {data.education.length > 0 && (
            <Section heading="Education">
              <ul style={{ paddingLeft: 18, lineHeight: 1.9 }}>
                {data.education.map((e) => (
                  <li key={e.institution}>
                    {e.qualification}, {e.institution} {e.period && `(${e.period})`}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!isSidebar && data.skills.length > 0 && (
            <Section heading="Skills">
              <p>{data.skills.join(', ')}</p>
            </Section>
          )}
        </div>
      </div>

      <footer style={{ marginTop: 48, paddingTop: 16, borderTop: '1px solid var(--color-border, #eee)', fontSize: 13, color: 'var(--ink-2, #888)' }}>
        <span>Hosted on </span>
        <Link href="/">Jobiest</Link>
      </footer>
    </main>
  );
}
