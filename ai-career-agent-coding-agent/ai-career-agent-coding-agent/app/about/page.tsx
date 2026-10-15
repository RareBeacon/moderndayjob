import Link from 'next/link';
import type { Metadata } from 'next';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { getUser } from '@/lib/auth';
import { SITE_URL } from '@/lib/site';
import { breadcrumbJsonLd, jsonLdTag } from '@/lib/seo';
import styles from '../marketing.module.css';

export const metadata: Metadata = {
  title: 'About',
  description: 'Jobiest was built in Lagos by Phos Lab to help real candidates put their real best forward faster, more consistently, and with full approval control.',
  alternates: { canonical: `${SITE_URL}/about` },
};

const COMMITMENTS = [
  'We will never fabricate a credential on your behalf.',
  'We will never send an application without your approval.',
  'We will never read your inbox.',
  'We will always show you exactly what was sent and when.',
];

export default async function AboutPage() {
  const user = await getUser();
  return (
    <MarketingShell activePath="/about" authenticated={!!user}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }]))} />
      <main className={styles.page} id="main">
        <header className={styles.pageHero} data-animate>
          <div className={styles.container}>
            <p className={styles.eyebrow}>About Jobiest</p>
            <h1>We built the tool we wished existed.</h1>
            <p className={styles.pageLead}>
              Built in Lagos by Phos Lab for talented people who need a better job-search process, not more empty motivation.
            </p>
          </div>
        </header>
        <section className={`${styles.section} ${styles.sectionSoft}`} data-animate>
          <div className={`${styles.container} pastor-copy wide`} style={{ maxWidth: 780 }}>
            <p className={styles.eyebrow}>Problem</p>
            <h2>Talented people were being drained by administration.</h2>
            <p>We watched engineers, analysts, marketers, and recent graduates with real ability spend months in job searches that slowly drained them. Not because they lacked skill. Because the process was inefficient. Every application was a manual act. The feedback loop between effort and outcome was so delayed it felt like shouting into a room with no walls.</p>

            <p className={styles.eyebrow}>Amplify</p>
            <h2>The silence starts to feel personal.</h2>
            <p>The worst part was not only the time cost. It was what the process did to people's confidence. A month in, two months in, the silence from employers starts to feel like a verdict. Talented people begin to question whether they are talented at all.</p>

            <p className={styles.eyebrow}>Story</p>
            <h2>The job search should spend more energy on preparation than administration.</h2>
            <p>Jobiest was built in Lagos by Phos Lab with a simple belief: a great candidate should be spending time getting interview-ready, not rewriting the same CV for the fifteenth time.</p>
            <p>We are builders. We do not believe in inventing credentials or gaming the system. We believe in helping real people put their real best forward, faster, more consistently, and with more confidence than any manual process allows.</p>

            <p className={styles.eyebrow}>Transformation</p>
            <h2>More applications, better applications, less exhaustion.</h2>
            <p>The candidates who use Jobiest do not just apply to more roles. They apply better. A tailored CV and a thoughtful cover letter, built quickly from verified facts, is more useful than a generic application that took two hours to write.</p>

            <div className="pastor-list-card about-commitments">
              <h2>Our commitments</h2>
              <ul>{COMMITMENTS.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </div>
        </section>
        <section className={styles.section} data-animate>
          <div className={styles.container}>
            <div className={styles.ctaBand}>
              <div>
                <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--text-13)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgb(255 255 255 / 75%)' }}>Start today</p>
                <h2>If this sounds like the tool you want running your search, start free.</h2>
              </div>
              <Link className={styles.primaryAction} href="/signup">Join Jobiest</Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
