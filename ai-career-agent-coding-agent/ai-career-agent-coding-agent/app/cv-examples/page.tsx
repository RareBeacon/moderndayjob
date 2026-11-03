import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { CV_EXAMPLE_ROLES } from '@/lib/seo/cv-examples';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'CV Examples by Role | Jobiest',
  description: 'Practical CV examples for technology, analytics, design, finance, operations, and early-career roles. Every sample uses placeholders, not fabricated candidate achievements.',
  alternates: { canonical: `${SITE_URL}/cv-examples` },
};

export default function CvExamplesIndexPage() {
  return (
    <MarketingShell>
      <main className="mk-shell" style={{ maxWidth: 1080, paddingTop: 48, paddingBottom: 72 }}>
        <p className="mk-kicker">Career examples</p>
        <h1>CV examples built around real role requirements</h1>
        <p>Each guide shows a role-specific structure and example bullet rewrites. Replace every bracketed placeholder with your own facts; no sample claims to represent a real person's career history.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginTop: 28 }}>
          {CV_EXAMPLE_ROLES.map((role) => (
            <article key={role.slug} style={{ border: '1px solid #d8deea', borderRadius: 12, padding: 18 }}>
              <h2><Link href={`/cv-examples/${role.slug}`}>{role.title}</Link></h2>
              <p>{role.metaDescription}</p>
              <Link href={`/cv-examples/${role.slug}`}>Read this CV example</Link>
            </article>
          ))}
        </div>
      </main>
    </MarketingShell>
  );
}
