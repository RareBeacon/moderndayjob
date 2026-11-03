import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { buildJobPostingJsonLd, getPublicJobBySlug, listActivePublicJobs, type PublicSeoJob } from '@/lib/seo/public-jobs';
import { SITE_URL } from '@/lib/site';

export const revalidate = 900;

export async function generateStaticParams() {
  const jobs = await listActivePublicJobs(300);
  return jobs.map((job) => ({ slug: job.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const job = await getPublicJobBySlug(slug);
  if (!job) return { title: 'Job listing unavailable | Jobiest', robots: { index: false, follow: true } };
  const isActive = job.lifecycleStatus === 'ACTIVE' && (!job.validThrough || new Date(job.validThrough).getTime() > Date.now());
  return {
    title: `${job.title} at ${job.companyName} | Jobiest Jobs`,
    description: `${job.title} at ${job.companyName}${job.locationRaw ? `, ${job.locationRaw}` : ''}. View the source listing and check role eligibility before applying.`,
    alternates: { canonical: `${SITE_URL}/jobs/${job.slug}` },
    robots: isActive ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { images: [`${SITE_URL}/api/og?title=${encodeURIComponent(`${job.title} at ${job.companyName}`)}&eyebrow=VERIFIED%20JOB`] },
  };
}

function JobPostingSchema({ job }: { job: PublicSeoJob }) {
  const schema = buildJobPostingJsonLd(job);
  if (!schema) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />;
}

export default async function PublicJobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getPublicJobBySlug(slug);
  if (!job) notFound();
  const related = (await listActivePublicJobs(200)).filter((item) => item.id !== job.id).slice(0, 5);
  const isActive = job.lifecycleStatus === 'ACTIVE' && (!job.validThrough || new Date(job.validThrough).getTime() > Date.now());
  return (
    <MarketingShell>
      <main className="mk-shell" style={{ maxWidth: 900, paddingTop: 48, paddingBottom: 72 }}>
        <JobPostingSchema job={job} />
        <nav aria-label="Breadcrumb"><Link href="/">Home</Link> / <Link href="/jobs">Verified jobs</Link> / <span>{job.title}</span></nav>
        {!isActive && <aside role="status" style={{ background: '#fff7ed', padding: 16, borderRadius: 8 }}><strong>This listing may no longer be accepting applications.</strong><p>Confirm availability on the employer source page before sharing information or applying.</p></aside>}
        <p className="mk-kicker">{job.verificationStatus === 'VERIFIED_HIGH_TRUST' ? 'Verified employer source' : 'Verified listing source'}</p>
        <h1>{job.title}</h1>
        <p><strong>{job.companyName}</strong>{job.locationRaw ? ` · ${job.locationRaw}` : ''}{job.workplaceType !== 'UNKNOWN' ? ` · ${job.workplaceType.toLowerCase()}` : ''}</p>
        <p>{job.department ? `${job.department} · ` : ''}{job.employmentType ?? 'Employment type not specified'}{job.seniorityLevel ? ` · ${job.seniorityLevel}` : ''}</p>
        {job.remoteRegionRestriction && <p><strong>Remote eligibility:</strong> {job.remoteRegionRestriction}</p>}
        {isActive && <p><a className="btn primary" href={job.applyUrl} target="_blank" rel="noopener noreferrer">Continue to employer application</a></p>}
        <p>Jobiest shows the source and verified listing information. The employer controls eligibility and application decisions. Review the original listing and share personal information only on the employer’s official application page.</p>
        {job.salaryMin != null || job.salaryMax != null ? <p><strong>Published compensation:</strong> {[job.salaryCurrency, job.salaryMin != null ? job.salaryMin.toLocaleString() : null, job.salaryMax != null ? `to ${job.salaryMax.toLocaleString()}` : null, job.salaryPeriod?.toLowerCase()].filter(Boolean).join(' ')}</p> : null}
        {job.skillsRequired.length > 0 && <section><h2>Requirements listed</h2><ul>{job.skillsRequired.map((skill) => <li key={skill}>{skill}</li>)}</ul></section>}
        {job.skillsPreferred.length > 0 && <section><h2>Preferred experience listed</h2><ul>{job.skillsPreferred.map((skill) => <li key={skill}>{skill}</li>)}</ul></section>}
        <section><h2>Role description</h2><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{job.descriptionClean}</div></section>
        {job.publishedAt && <p>Source posting date: {new Date(job.publishedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}</p>}
        <section><h2>Prepare your application</h2><p><Link href="/free-ats-resume-scanner">Scan your CV</Link> · <Link href="/free-skills-matcher">Compare your skills</Link> · <Link href="/free-interview-question-generator">Prepare for an interview</Link></p></section>
        {related.length > 0 && <section><h2>More verified openings</h2><ul>{related.map((item) => <li key={item.id}><Link href={`/jobs/${item.slug}`}>{item.title} at {item.companyName}</Link></li>)}</ul></section>}
      </main>
    </MarketingShell>
  );
}
