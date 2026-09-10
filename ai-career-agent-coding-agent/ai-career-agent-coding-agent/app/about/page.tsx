import Link from 'next/link';
import type { Metadata } from 'next';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'About Jobiest',
  description: 'Jobiest was built in Lagos by Phos Lab to help real candidates put their real best forward faster, more consistently, and with full approval control.',
  alternates: { canonical: `${SITE_URL}/about` },
};

const COMMITMENTS = [
  'We will never fabricate a credential on your behalf.',
  'We will never send an application without your approval.',
  'We will never read your inbox.',
  'We will always show you exactly what was sent and when.',
];

export default function AboutPage() {
  return (
    <div className="jl-page">
      <JobletNavbar />
      <main id="main">
        <section className="jl-sec blog-hero">
          <div className="jl-shell">
            <span className="jl-kicker">About Jobiest</span>
            <h1>We built the tool we wished existed.</h1>
            <p>Built in Lagos by Phos Lab for talented people who need a better job-search process, not more empty motivation.</p>
          </div>
        </section>
        <section className="jl-sec tint">
          <div className="jl-shell pastor-copy wide">
            <span className="blog-step">Problem</span>
            <h2>Talented people were being drained by administration.</h2>
            <p>We watched engineers, analysts, marketers, and recent graduates with real ability spend months in job searches that slowly drained them. Not because they lacked skill. Because the process was inefficient. Every application was a manual act. The feedback loop between effort and outcome was so delayed it felt like shouting into a room with no walls.</p>

            <span className="blog-step">Amplify</span>
            <h2>The silence starts to feel personal.</h2>
            <p>The worst part was not only the time cost. It was what the process did to people's confidence. A month in, two months in, the silence from employers starts to feel like a verdict. Talented people begin to question whether they are talented at all.</p>

            <span className="blog-step">Story</span>
            <h2>The job search should spend more energy on preparation than administration.</h2>
            <p>Jobiest was built in Lagos by Phos Lab with a simple belief: a great candidate should be spending time getting interview-ready, not rewriting the same CV for the fifteenth time.</p>
            <p>We are builders. We do not believe in inventing credentials or gaming the system. We believe in helping real people put their real best forward, faster, more consistently, and with more confidence than any manual process allows.</p>

            <span className="blog-step">Transformation</span>
            <h2>More applications, better applications, less exhaustion.</h2>
            <p>The candidates who use Jobiest do not just apply to more roles. They apply better. A tailored CV and a thoughtful cover letter, built quickly from verified facts, is more useful than a generic application that took two hours to write.</p>

            <div className="pastor-list-card about-commitments">
              <h2>Our commitments</h2>
              <ul>{COMMITMENTS.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </div>
        </section>
        <section className="jl-sec">
          <div className="jl-shell pastor-response">
            <span className="jl-kicker">Start today</span>
            <h2>If this sounds like the tool you want running your search, start free.</h2>
            <Link className="jl-btn-solid" href="/signup">Join Jobiest</Link>
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
