import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { MIN_HUB_JOBS_FOR_INDEX, PUBLIC_JOB_ROLE_HUBS, jobMatchesRoleHub, listActivePublicJobs } from '@/lib/seo/public-jobs';
import { SITE_URL } from '@/lib/site';

export const revalidate = 900;

async function getData(slug: string) {
  const hub = PUBLIC_JOB_ROLE_HUBS.find((item) => item.slug === slug);
  if (!hub) return { hub: null, jobs: [] };
  const jobs = (await listActivePublicJobs(500)).filter((job) => jobMatchesRoleHub(job, hub));
  return { hub, jobs };
}

export async function generateStaticParams() {
  return PUBLIC_JOB_ROLE_HUBS.map((hub) => ({ slug: hub.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { hub, jobs } = await getData(slug);
  if (!hub) return { title: 'Job category unavailable | Jobiest', robots: { index: false, follow: true } };
  const indexable = jobs.length >= MIN_HUB_JOBS_FOR_INDEX;
  return {
    title: hub.seoTitle,
    description: hub.metaDescription,
    alternates: { canonical: `${SITE_URL}/jobs/role/${hub.slug}` },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function JobRoleHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { hub, jobs } = await getData(slug);
  if (!hub) return <MarketingShell><main className="mk-shell"><h1>Job category not found</h1><Link href="/jobs">Browse all jobs</Link></main></MarketingShell>;
  const indexable = jobs.length >= MIN_HUB_JOBS_FOR_INDEX;
  return (
    <MarketingShell>
      <main className="mk-shell" style={{ maxWidth: 1000, paddingTop: 48, paddingBottom: 72 }}>
        <nav aria-label="Breadcrumb"><Link href="/">Home</Link> / <Link href="/jobs">Verified jobs</Link> / <span>{hub.shortLabel}</span></nav>
        <p className="mk-kicker">Verified role category</p>
        <h1>{hub.title}</h1>
        <p>{hub.intro}</p>
        {!indexable && <p role="status">This category currently has fewer than {MIN_HUB_JOBS_FOR_INDEX} matching active verified listings. We keep it out of search results until there is enough inventory.</p>}
        {jobs.length ? <ul>{jobs.map((job) => <li key={job.id} style={{ padding: '16px 0', borderTop: '1px solid #d8deea' }}><h2><Link href={`/jobs/${job.slug}`}>{job.title}</Link></h2><p>{job.companyName}{job.locationRaw ? ` · ${job.locationRaw}` : ''}</p><p>{job.descriptionClean.slice(0, 240)}</p></li>)}</ul> : <p>No matching active verified openings at this time.</p>}
        <p>Use only the requirements that match your own experience. <Link href={`/cv-examples/${hub.relatedCvRoleSlug}`}>Review a related CV example</Link> or <Link href="/free-ats-resume-scanner">scan your CV</Link>.</p>
        <p>Browse: {PUBLIC_JOB_ROLE_HUBS.filter((other) => other.slug !== hub.slug).slice(0, 6).map((other) => <span key={other.slug}><Link href={`/jobs/role/${other.slug}`}>{other.shortLabel}</Link> · </span>)}</p>
      </main>
    </MarketingShell>
  );
}
