import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { getOptionalUser } from '@/lib/auth';
import { SITE_URL } from '@/lib/site';
import { RESUME_TEMPLATES, templateColumns, type ResumeTemplate } from '@/lib/resume-studio/templates';

export const revalidate = 86400;

function getTemplate(slug: string): ResumeTemplate | undefined {
  return RESUME_TEMPLATES.find((template) => template.id === slug);
}

export async function generateStaticParams() {
  return RESUME_TEMPLATES.map((template) => ({ slug: template.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const template = getTemplate(slug);
  if (!template) return { title: 'Template not found | Jobiest', robots: { index: false, follow: true } };
  return {
    title: `${template.name} Resume & CV Template | Jobiest`,
    description: `${template.description} View honest ATS parsing notes, best-fit roles, and build a PDF or DOCX with this ISO A4 template.`,
    alternates: { canonical: `${SITE_URL}/templates/${template.id}` },
    openGraph: { images: [`${SITE_URL}/api/og?title=${encodeURIComponent(`${template.name} Resume & CV Template`)}&eyebrow=30%20ISO%20A4%20TEMPLATES`] },
  };
}

export default async function TemplateDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const template = getTemplate(slug);
  if (!template) notFound();
  const user = await getOptionalUser();
  const columns = templateColumns(template);
  const atsLabel = template.atsCompatibility === 'verified'
    ? 'ATS compatibility: verified for a single-column layout'
    : 'ATS compatibility: partial; this layout may need review in some applicant systems';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: template.name,
    description: template.description,
    url: `${SITE_URL}/templates/${template.id}`,
    creator: { '@type': 'Organization', name: 'Jobiest', url: SITE_URL },
    genre: 'ISO A4 resume and CV template',
    keywords: template.bestFor.join(', '),
  };
  return (
    <MarketingShell authenticated={Boolean(user)}>
      <main className="mk-shell" style={{ maxWidth: 980, paddingTop: 48, paddingBottom: 72 }}>
        <nav aria-label="Breadcrumb"><Link href="/">Home</Link> / <Link href="/templates">Templates</Link> / <span>{template.name}</span></nav>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
        <p className="mk-kicker">{template.category} · ISO A4 · {columns} column{columns === 1 ? '' : 's'}</p>
        <h1>{template.name} Resume &amp; CV Template</h1>
        <p>{template.description}</p>
        <div style={{ border: '1px solid #d8deea', borderRadius: 12, padding: 20, margin: '24px 0', background: '#f8fafc' }}>
          <h2>Template details</h2>
          <p><strong>Recommended for:</strong> {template.bestFor.join(', ')}</p>
          <p><strong>ATS note:</strong> {template.atsNotes ?? atsLabel}</p>
          <p><strong>Page size:</strong> ISO A4, PDF and DOCX export supported in Resume Studio.</p>
          <p>ATS results depend on each employer's software and settings. Jobiest does not guarantee a screening outcome.</p>
        </div>
        <h2>Who this design can suit</h2>
        <p>{template.intendedUse ?? `This ${template.category} layout can be adapted for ${template.bestFor.join(', ')}. Match the sections and examples to your verified experience, and keep the document easy to scan.`}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '24px 0' }}>
          <Link className="btn primary" href={`/generate?template=${encodeURIComponent(template.id)}`}>Build with this template</Link>
          <Link className="btn secondary" href="/free-ats-resume-scanner">Check ATS parsing</Link>
          <Link className="btn secondary" href="/templates">Browse all 30 templates</Link>
        </div>
        <h2>Related career example</h2>
        <p><Link href="/cv-examples/software-engineer">Explore a role-specific CV example</Link> and use only details you can support.</p>
      </main>
    </MarketingShell>
  );
}
