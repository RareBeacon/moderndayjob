import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { CV_EXAMPLE_ROLES, getCvExampleRole } from '@/lib/seo/cv-examples';
import { SITE_URL } from '@/lib/site';

export const revalidate = 86400;

export async function generateStaticParams() {
  return CV_EXAMPLE_ROLES.map((role) => ({ role: role.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }): Promise<Metadata> {
  const { role: slug } = await params;
  const role = getCvExampleRole(slug);
  if (!role) return { title: 'CV example not found | Jobiest', robots: { index: false, follow: true } };
  return {
    title: role.seoTitle,
    description: role.metaDescription,
    alternates: { canonical: `${SITE_URL}/cv-examples/${role.slug}` },
    openGraph: { images: [`${SITE_URL}/api/og?title=${encodeURIComponent(role.title)}&eyebrow=ROLE%20CV%20PLAYBOOK`] },
  };
}

export default async function CvExampleDetailPage({ params }: { params: Promise<{ role: string }> }) {
  const { role: slug } = await params;
  const role = getCvExampleRole(slug);
  if (!role) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: role.title,
    description: role.metaDescription,
    mainEntityOfPage: `${SITE_URL}/cv-examples/${role.slug}`,
    author: { '@type': 'Organization', name: 'Jobiest' },
    publisher: { '@type': 'Organization', name: 'Jobiest', url: SITE_URL },
  };
  return (
    <MarketingShell>
      <main className="mk-shell" style={{ maxWidth: 900, paddingTop: 48, paddingBottom: 72 }}>
        <nav aria-label="Breadcrumb"><Link href="/">Home</Link> / <Link href="/cv-examples">CV Examples</Link> / <span>{role.shortRole}</span></nav>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
        <p className="mk-kicker">Role-specific CV playbook</p>
        <h1>{role.title}</h1>
        <p>{role.intro}</p>
        <p><strong>Important:</strong> These examples are teaching patterns, not a real candidate's employment history. Replace brackets with accurate details. Never add a credential, tool, result, or metric you cannot verify.</p>
        <section>
          <h2>Role keywords to check against the actual vacancy</h2>
          <ul>{role.keywords.map((keyword) => <li key={keyword}>{keyword}</li>)}</ul>
          <p>These are prompts for comparison, not a list to paste blindly. Only include a skill when your experience supports it.</p>
        </section>
        <section>
          <h2>Professional summary structure</h2>
          <blockquote>{role.summaryExample}</blockquote>
          <p>Fill each bracket with your real background. Remove any phrase that does not describe you.</p>
        </section>
        <section>
          <h2>Weak vs stronger experience bullets</h2>
          {role.bulletExamples.map((example, index) => (
            <article key={index} style={{ borderTop: '1px solid #d8deea', padding: '16px 0' }}>
              <p><strong>Too vague:</strong> {example.weak}</p>
              <p><strong>More specific:</strong> {example.stronger}</p>
              <p><strong>Use responsibly:</strong> {example.note}</p>
            </article>
          ))}
        </section>
        <section>
          <h2>Checklist for this role</h2>
          <ul>{role.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
        </section>
        <section>
          <h2>Next steps</h2>
          <p><Link href={role.toolHref}>Use the related free career tool</Link></p>
          <p><Link href={`/jobs/role/${role.relatedJobRole}`}>Browse related verified jobs</Link></p>
          <p><Link href={`/templates/${role.templateId}`}>Compare a related A4 template</Link></p>
          <p><Link href="/free-ats-resume-scanner">Run the free ATS scanner</Link></p>
          <p><Link href="/signup">Build and tailor your CV in Jobiest</Link></p>
        </section>
        <nav aria-label="More role examples" style={{ marginTop: 24 }}>
          <h2>More CV examples</h2>
          <ul>{CV_EXAMPLE_ROLES.filter((other) => other.slug !== role.slug).slice(0, 6).map((other) => (
            <li key={other.slug}><Link href={`/cv-examples/${other.slug}`}>{other.title}</Link></li>
          ))}</ul>
        </nav>
      </main>
    </MarketingShell>
  );
}
