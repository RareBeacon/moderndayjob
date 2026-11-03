import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { listActivePublicJobs, PUBLIC_JOB_LOCATION_HUBS, PUBLIC_JOB_ROLE_HUBS } from '@/lib/seo/public-jobs';
import { SITE_URL } from '@/lib/site';

export const revalidate = 900;
export const metadata: Metadata = {
  title: 'Verified Jobs in Nigeria, Africa & Remote | Jobiest',
  description: 'Browse verified openings from public employer career systems. Check each role’s location and eligibility, then apply directly with your own approval.',
  alternates: { canonical: `${SITE_URL}/jobs` },
};

export default async function PublicJobsPage() {
  const jobs = await listActivePublicJobs(200);
  return (
    <MarketingShell>
      <main className="mk-shell" style={{ maxWidth: 1100, paddingTop: 48, paddingBottom: 72 }}>
        <p className="mk-kicker">Jobiest Verified Opportunities</p>
        <h1>Verified jobs from direct employer career sources</h1>
        <p>Listings are sourced from employer career systems, checked against Jobiest verification rules, and shown with the source application link. Eligibility varies by role. Review the employer’s listing before applying.</p>
        <p>{jobs.length ? `${jobs.length} current verified listings shown` : 'No current listings meet the public listing checks. Please check again soon.'}</p>
        <section aria-label="Browse job categories">
          <h2>Browse roles</h2>
          <ul>{PUBLIC_JOB_ROLE_HUBS.map((hub) => <li key={hub.slug}><Link href={`/jobs/role/${hub.slug}`}>{hub.title}</Link></li>)}</ul>
          <h2>Browse by location or work style</h2>
          <ul>{PUBLIC_JOB_LOCATION_HUBS.map((hub) => <li key={hub.slug}><Link href={`/jobs/location/${hub.slug}`}>{hub.title}</Link></li>)}</ul>
        </section>
        <section aria-label="Current verified job listings">
          <h2>Recent openings</h2>
          {jobs.length ? <ul>{jobs.map((job) => (
            <li key={job.id} style={{ borderTop: '1px solid #d8deea', padding: '18px 0' }}>
              <h3><Link href={`/jobs/${job.slug}`}>{job.title}</Link></h3>
              <p>{job.companyName}{job.locationRaw ? ` · ${job.locationRaw}` : ''}{job.workplaceType !== 'UNKNOWN' ? ` · ${job.workplaceType.toLowerCase()}` : ''}</p>
              <p>{job.descriptionClean.slice(0, 260)}{job.descriptionClean.length > 260 ? '…' : ''}</p>
              <Link href={`/jobs/${job.slug}`}>View role and source</Link>
            </li>
          ))}</ul> : <p>We only list roles that pass the verification and content checks.</p>}
        </section>
        <p>Want to prepare before applying? <Link href="/free-ats-resume-scanner">Scan your CV free</Link> or <Link href="/cv-examples">browse role-specific CV examples</Link>.</p>
      </main>
    </MarketingShell>
  );
}
