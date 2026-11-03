import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FreeToolExperience } from '@/components/freetools/FreeToolExperience';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { getOptionalUser } from '@/lib/auth';
import { CV_EXAMPLE_ROLES, getCvExampleRole } from '@/lib/seo/cv-examples';
import { SITE_URL } from '@/lib/site';

export const revalidate = 86400;

const TOOL_ROUTES = {
  'ats-resume-scanner': { id: 'ats-resume-scanner', name: 'ATS Resume Scanner', benefit: 'Check whether the headings, dates, contact details, and real skills on your resume are easy to parse. It does not predict hiring outcomes.' },
  'interview-questions': { id: 'interview-question-generator', name: 'Interview Question Generator', benefit: 'Use the actual job description to create grounded practice questions. The tool does not claim to know the employer’s exact interview questions.' },
  'salary-insights': { id: 'salary-insights', name: 'Salary Insights', benefit: 'Compare pay explicitly stated in job listings you provide. Jobiest does not invent or estimate a market salary from missing information.' },
} as const;

type ToolSlug = keyof typeof TOOL_ROUTES;
function toolFor(slug: string) { return Object.hasOwn(TOOL_ROUTES, slug) ? TOOL_ROUTES[slug as ToolSlug] : null; }

export async function generateStaticParams() {
  return Object.keys(TOOL_ROUTES).flatMap((tool) => CV_EXAMPLE_ROLES.map((role) => ({ tool, role: role.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string; role: string }> }): Promise<Metadata> {
  const { tool: toolSlug, role: roleSlug } = await params;
  const tool = toolFor(toolSlug);
  const role = getCvExampleRole(roleSlug);
  if (!tool || !role) return { title: 'Free career tool unavailable | Jobiest', robots: { index: false, follow: true } };
  const title = `${tool.name} for ${role.shortRole} | Free Jobiest Tool`;
  return {
    title,
    description: `${tool.benefit} Role context: ${role.shortRole}. Free to use on Jobiest.`,
    alternates: { canonical: `${SITE_URL}/tools/${toolSlug}/${roleSlug}` },
    openGraph: { images: [`${SITE_URL}/api/og?title=${encodeURIComponent(title)}&eyebrow=FREE%20CAREER%20TOOL`] },
  };
}

export default async function RoleToolPage({ params }: { params: Promise<{ tool: string; role: string }> }) {
  const { tool: toolSlug, role: roleSlug } = await params;
  const tool = toolFor(toolSlug);
  const role = getCvExampleRole(roleSlug);
  if (!tool || !role) notFound();
  const user = await getOptionalUser();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${SITE_URL}/tools/${toolSlug}/${roleSlug}#application`,
    name: `${tool.name} for ${role.shortRole}`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    provider: { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'Jobiest' },
    url: `${SITE_URL}/tools/${toolSlug}/${roleSlug}`,
    description: `${tool.benefit} This role-specific entry is prefilled for ${role.shortRole}.`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'NGN' },
  };
  return (
    <MarketingShell>
      <main className="mk-shell" style={{ maxWidth: 1000, paddingTop: 40, paddingBottom: 72 }}>
        <nav aria-label="Breadcrumb"><Link href="/">Home</Link> / <Link href="/tools">Free tools</Link> / <span>{role.shortRole}</span></nav>
        <p className="mk-kicker">Free {tool.name}</p>
        <h1>{tool.name} for {role.shortRole}</h1>
        <p>{tool.benefit}</p>
        <p>This page starts with the role selected. Add the real job description and your own experience where requested. Suggestions are prompts, not claims about your skills.</p>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
        <section style={{ margin: '24px 0' }}>
          <h2>Role context to consider</h2>
          <p>{role.intro}</p>
          <ul>{role.keywords.slice(0, 5).map((keyword) => <li key={keyword}>{keyword}</li>)}</ul>
          <p>Use a keyword only when you can support it with real work, study, or a project.</p>
        </section>
        <section aria-label={`${tool.name} interactive tool`}>
          <FreeToolExperience
            toolId={tool.id}
            signedIn={Boolean(user)}
            initialAnswers={{ targetRole: role.shortRole }}
            sessionScope={`${toolSlug}-${role.slug}`}
          />
        </section>
        <section style={{ marginTop: 32 }}>
          <h2>Related Jobiest resources</h2>
          <p><Link href={`/cv-examples/${role.slug}`}>Read the {role.shortRole} CV example</Link> · <Link href={`/jobs/role/${role.relatedJobRole}`}>Browse related verified roles</Link> · <Link href={`/templates/${role.templateId}`}>See a related A4 template</Link></p>
          <p><Link href="/tools">Browse all 10 free tools</Link> · <Link href="/blog">Read Jobiest career guides</Link></p>
        </section>
      </main>
    </MarketingShell>
  );
}
