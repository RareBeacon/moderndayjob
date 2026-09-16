import type { Metadata } from 'next';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { SITE_URL } from '@/lib/site';
import { JobletFooter } from '@/components/site/joblet/Footer';
import { websiteJsonLd, organizationJsonLd, faqJsonLd, jsonLdTag } from '@/lib/seo';
import { PLANS, PLAN_ORDER } from '@/lib/billing/pricing';
import { formatNaira } from '@/lib/billing/currency';

export const revalidate = 300;

export const metadata: Metadata = {
  // Root page titles do not get the layout template suffix, so the brand is included here once.
  title: 'Jobiest - Get more interviews. Not more tabs.',
  description: 'Jobiest is the AI job search agent that finds matching roles, prepares truthful applications, and waits for your approval.',
  alternates: { canonical: SITE_URL },
};

async function getLiveMarket(): Promise<{ total: number; sources: string[] }> {
  try {
    const { data, error } = await supabaseAdmin.from('jobs').select('source');
    if (error || !data) return { total: 0, sources: [] };
    const bySource = new Map<string, number>();
    for (const row of data as { source?: string | null }[]) {
      const source = String(row.source || '').trim().toUpperCase();
      if (!source) continue;
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }
    const sources = [...bySource.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([source]) => source.charAt(0) + source.slice(1).toLowerCase())
      .slice(0, 3);
    return { total: data.length, sources };
  } catch {
    return { total: 0, sources: [] };
  }
}

const steps = [
  { n: '01', title: 'Upload once.', body: 'Give Jobiest the real version of your experience, goals, and preferences.' },
  { n: '02', title: 'Review the signal.', body: 'See the roles worth your attention, ranked by fit and grounded in your verified profile.' },
  { n: '03', title: 'Approve what fits.', body: 'Make the call on each application. Your agent never gets ahead of you.' },
];

const workflow = [
  {
    label: 'Find roles',
    index: '01',
    title: 'The right roles, before the window closes.',
    body: 'Jobiest reads verified job sources and ranks opportunities against your experience, preferences, and next move.',
  },
  {
    label: 'Tailor docs',
    index: '02',
    title: 'Truthful documents, prepared from your facts.',
    body: 'The agent prepares resumes, cover letters, and answers using only what you verified. Missing facts are flagged instead of invented.',
  },
  {
    label: 'Approve',
    index: '03',
    title: 'Nothing leaves without your decision.',
    body: 'You review the opportunity, the fit explanation, and the application before anything is sent or tracked.',
  },
];

const before = [
  'Hours disappear into tabs and rewrites.',
  'Generic CVs make good work look average.',
  'Silence after you submit, with no system.',
  'More effort starts to feel like the only plan.',
];

const after = [
  'Your agent works while you focus.',
  'Every document is tailored and truthful.',
  'Every application has a clear next step.',
  'You approve the opportunities worth your time.',
];

const proofCards = [
  { initials: 'CV', role: 'Resume clarity', quote: 'Turn verified profile facts into sharper resumes without inventing roles, numbers, tools, or impact.' },
  { initials: 'JD', role: 'Job fit signal', quote: 'See why a role fits before spending your best energy on a long application flow.' },
  { initials: 'OK', role: 'Approval control', quote: 'Keep the final decision with you. The agent prepares the work, but you choose what moves forward.' },
];

const plans = PLAN_ORDER.map((code) => {
  const plan = PLANS[code];
  return {
    name: plan.name,
    price: plan.monthlyNgn === 0 ? formatNaira(0) : `${formatNaira(plan.monthlyNgn)} / month`,
    note: plan.tagline,
    features: plan.features.slice(0, 4),
    cta: plan.cta,
    featured: Boolean(plan.featured),
  };
});

const featuredTools = [
  { name: 'ATS Resume Scanner', href: '/free-ats-resume-scanner', tag: 'Deterministic', body: 'Check whether your CV is machine-readable and aligned with a target job.' },
  { name: 'Cover Letter Writer', href: '/free-cover-letter-writer', tag: 'AI, grounded', body: 'A concise cover letter matched to a real role and your supplied background.' },
  { name: 'Job Description Analyzer', href: '/free-job-description-analyzer', tag: 'AI, grounded', body: 'Break a listing into requirements, responsibilities, keywords and gaps.' },
  { name: 'Skills Matcher', href: '/free-skills-matcher', tag: 'AI, grounded', body: 'Compare your real skills to a job description with clear strengths and gaps.' },
  { name: 'Interview Question Generator', href: '/free-interview-question-generator', tag: 'AI, grounded', body: 'Practice questions and focus notes generated from the actual listing.' },
  { name: 'Salary Insights', href: '/free-salary-insights', tag: 'Stated pay only', body: 'Only the pay that matching listings explicitly state. Never invented averages.' },
];

const faqs = [
  { q: 'Will Jobiest lie on my CV or applications?', a: 'Never. Every CV, cover letter, and answer is generated only from facts you verify. If something is missing or uncertain, Jobiest flags it instead of inventing it.' },
  { q: 'Does it apply to jobs without asking me?', a: 'No. Approval mode keeps you in control. Your agent can prepare the work, but you decide what goes out.' },
  { q: 'Does Jobiest read my inbox?', a: 'No. Jobiest does not need inbox access to help you discover roles, prepare documents, and track applications.' },
  { q: 'Is it really free to start?', a: 'Yes. The free plan is permanent and needs no card: 3 AI generations in total to try the AI writer, 10 career-tool uses a day, job matching, and your dashboard. Paid plans add daily volume and agent mode.' },
];

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 16 L9 9 L13 13 L20 5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="5" r="2.3" fill="currentColor" />
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.5 10.4 8.3 14 15.8 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LandingNav() {
  return (
    <header className="ja-nav">
      <div className="ja-container ja-nav-inner">
        <Link className="ja-brand" href="/" aria-label="Jobiest home">
          <span><BrandMark /></span>
          Jobiest
        </Link>
        <nav className="ja-nav-links" aria-label="Primary navigation">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/tools">Free tools</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/blog">Blog</Link>
        </nav>
        <div className="ja-nav-actions">
          <Link className="ja-login" href="/login">Sign in</Link>
          <Link className="ja-btn ja-btn-light" href="/signup">Get started</Link>
        </div>
      </div>
    </header>
  );
}

function AgentPreview({ liveTotal, liveSources }: { liveTotal: number; liveSources: string[] }) {
  const liveCopy = liveTotal > 0 ? `${liveTotal.toLocaleString()} roles scanned` : 'Source scan active';
  return (
    <div className="ja-agent-card animate-gentle-float" data-animate data-animate-delay="120">
      <div className="ja-agent-top">
        <div>
          <span>Jobiest agent</span>
          <strong>Approval mode</strong>
        </div>
        <em>Live queue</em>
      </div>
      <div className="ja-agent-panel glass-panel">
        <p>Your next best moves</p>
        <div className="ja-scan-row"><span>Scanning verified sources</span><b>{liveCopy}</b></div>
        <div className="ja-progress"><i /></div>
        <div className="ja-scan-row"><span>Shortlisted for your profile</span><b>Strong matches</b></div>
      </div>
      <div className="ja-match-card">
        <div>
          <span>Application ready for review</span>
          <strong>Role matched to your profile</strong>
        </div>
        <b>Strong</b>
      </div>
      <div className="ja-mini-grid">
        <div><span>Applications reviewed</span><strong>Approval first</strong></div>
        <div><span>Match quality</span><strong>Clear signal</strong></div>
      </div>
      <div className="ja-score-ring" aria-label="Strong fit signal">
        <span>Fit</span>
        <small>Strong signal</small>
      </div>
      <p className="ja-agent-note">Based on your skills, goals, and preferences. Nothing sends without you.</p>
      {liveSources.length ? <small className="ja-live-source">Sources include {liveSources.join(', ')}</small> : null}
    </div>
  );
}

export default async function HomePage() {
  const market = await getLiveMarket();
  const liveTotal = market.total;
  const roleStat = liveTotal > 0 ? liveTotal.toLocaleString() : 'Live';

  return (
    <div className="ja-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(websiteJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(organizationJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(faqJsonLd(faqs))} />
      <LandingNav />
      <main id="main">
        <section className="ja-hero grain">
          <div className="ja-orb ja-orb-one" data-parallax="0.04" />
          <div className="ja-orb ja-orb-two" data-parallax="-0.03" />
          <div className="ja-container ja-hero-grid">
            <div className="ja-hero-copy">
              <div className="ja-pill" data-animate><span /> Approval mode. Nothing sends without you</div>
              <h1 data-animate data-animate-delay="60">Get more <span>interviews.</span> Not more tabs.</h1>
              <p data-animate data-animate-delay="120">Jobiest finds the roles that fit, prepares truthful applications, and waits for your approval before anything goes out.</p>
              <div className="ja-hero-actions" data-animate data-animate-delay="180">
                <Link className="ja-btn ja-btn-accent" href="/signup">Get started free <Arrow /></Link>
                <Link className="ja-btn ja-btn-ghost" href="/tools">Try a free tool</Link>
              </div>
              <div className="ja-trust-row" data-animate data-animate-delay="240">
                <span>No credit card</span>
                <span>Verified job sources</span>
                <span>You stay in control</span>
              </div>
            </div>
            <AgentPreview liveTotal={liveTotal} liveSources={market.sources} />
          </div>
          <div className="ja-container ja-hero-bottom" data-animate data-animate-delay="260">
            <div><strong>{roleStat}</strong><span>roles reviewed from verified sources</span></div>
            <div><strong>100%</strong><span>human approval before applications move</span></div>
            <div><strong>0</strong><span>fabricated CV claims by design</span></div>
            {market.sources.length ? (
              <div><strong>{market.sources.length}</strong><span>verified job sources behind every match</span></div>
            ) : (
              <div><strong>10</strong><span>free career tools, no card needed</span></div>
            )}
          </div>
        </section>

        <section className="ja-section" id="tools">
          <div className="ja-container">
            <div className="ja-section-head" data-animate>
              <span>Free career tools</span>
              <h2>Start with a tool. Stay for the agent.</h2>
              <p>Ten focused tools for the parts of the search that eat your week. Every result is grounded in the job text you provide or your verified profile facts.</p>
            </div>
            <div className="ja-tool-grid">
              {featuredTools.map((tool, index) => (
                <Link className="ja-tool-card" href={tool.href} key={tool.href} data-animate data-animate-delay={index * 60}>
                  <span>{tool.tag}</span>
                  <h3>{tool.name}</h3>
                  <p>{tool.body}</p>
                  <em>Open tool <Arrow /></em>
                </Link>
              ))}
            </div>
            <div style={{ marginTop: 26 }} data-animate>
              <Link className="ja-inline" href="/tools">See all 10 free tools <Arrow /></Link>
            </div>
          </div>
        </section>

        <section className="ja-section" id="how">
          <div className="ja-container">
            <div className="ja-section-head" data-animate>
              <span>From overwhelmed to in motion</span>
              <h2>A little less searching. A lot more moving.</h2>
              <p>Your job search deserves a system that respects your time, your story, and your say.</p>
            </div>
            <div className="ja-step-grid">
              {steps.map((step, index) => (
                <article className="ja-step" data-animate data-animate-delay={index * 70} key={step.title}>
                  <span>{step.n}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ja-section ja-agent-section" id="agent">
          <div className="ja-container ja-agent-grid">
            <div className="ja-agent-copy" data-animate>
              <span>The agent, up close</span>
              <h2>The busywork stops here.</h2>
              <p>One trusted profile powers every match, every tailored document, and every application you choose to send.</p>
              <div className="ja-tabs" aria-label="Agent workflow tabs">
                {workflow.map((item) => <span key={item.label}>{item.label}</span>)}
              </div>
              {workflow.map((item, index) => (
                <div className="ja-workflow-item" key={item.title} data-animate data-animate-delay={index * 80}>
                  <small>{item.index} / {item.label}</small>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
              <Link className="ja-inline" href="/how-it-works">Explore the workflow <Arrow /></Link>
            </div>
            <div className="ja-recommendation" data-animate data-animate-delay="120">
              <div className="ja-rec-head"><span>Your match queue, in preview</span><em>example</em></div>
              {[
                ['Matched role from verified source', 'Strong profile fit', 'ready to review'],
                ['Role with useful overlap', 'Relevant skill signal', 'needs your decision'],
                ['Stretch role to inspect', 'Some gaps flagged', 'prep suggested'],
              ].map((job, index) => (
                <div className="ja-rec-row" key={job[0]}>
                  <div><strong>{job[0]}</strong><span>{job[1]} · {job[2]}</span></div>
                  <b>{index === 0 ? 'High' : index === 1 ? 'Good' : 'Review'}</b>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ja-section ja-before-after">
          <div className="ja-container">
            <div className="ja-section-head" data-animate>
              <span>Before and after</span>
              <h2>Your energy belongs in the interview.</h2>
              <p>Stop spending your best thinking on forms that never get read. Let Jobiest carry the repetitive load without taking the decision away from you.</p>
            </div>
            <div className="ja-compare-grid">
              <article className="ja-compare" data-animate>
                <span>Before Jobiest</span>
                <ul>{before.map((item) => <li key={item}><Tick />{item}</li>)}</ul>
              </article>
              <article className="ja-compare ja-compare-good" data-animate data-animate-delay="100">
                <span>With Jobiest</span>
                <ul>{after.map((item) => <li key={item}><Tick />{item}</li>)}</ul>
              </article>
            </div>
          </div>
        </section>

        <section className="ja-section ja-motion">
          <div className="ja-container">
            <div className="ja-section-head" data-animate>
              <span>People in motion</span>
              <h2>Less busywork. More doors open.</h2>
              <Link className="ja-inline" href="#pricing">Start your own momentum <Arrow /></Link>
            </div>
            <div className="ja-proof-grid">
              {proofCards.map((card, index) => (
                <article className="ja-proof" data-animate data-animate-delay={index * 80} key={card.role}>
                  <div className="ja-avatar">{card.initials}</div>
                  <h3>{card.role}</h3>
                  <p>{card.quote}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ja-section ja-pricing" id="pricing">
          <div className="ja-container">
            <div className="ja-section-head" data-animate>
              <span>Simple to start</span>
              <h2>Pay when the agent proves it.</h2>
              <p>Start free. Keep your profile, matching, and career tools. Upgrade only when you want more volume.</p>
              <small>All prices in Naira (₦) a month. No card to start.</small>
            </div>
            <div className="ja-plan-grid ja-plan-grid-4">
              {plans.map((plan, index) => (
                <article className={plan.featured ? 'ja-plan ja-plan-featured' : 'ja-plan'} data-animate data-animate-delay={index * 80} key={plan.name}>
                  {plan.featured ? <em>Most popular</em> : null}
                  <h3>{plan.name}</h3>
                  <strong>{plan.price}</strong>
                  <p>{plan.note}</p>
                  <ul>{plan.features.map((item) => <li key={item}><Tick />{item}</li>)}</ul>
                  <Link className={plan.featured ? 'ja-btn ja-btn-accent' : 'ja-btn ja-btn-dark'} href="/signup">{plan.cta}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ja-section ja-faq" id="faq">
          <div className="ja-container ja-faq-grid">
            <div className="ja-section-head" data-animate>
              <span>Good questions</span>
              <h2>Clarity is part of the product.</h2>
              <p>Straight answers about control, truth, and what happens next.</p>
            </div>
            <div className="ja-faq-list" data-animate data-animate-delay="100">
              {faqs.map((item, index) => (
                <details key={item.q} open={index === 0}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="ja-final grain">
          <div className="ja-container" data-animate>
            <span>The next move is yours</span>
            <h2>Your next opportunity is already out there.</h2>
            <p>Let Jobiest find it, prepare it, and leave the final call to you.</p>
            <Link className="ja-btn ja-btn-accent" href="/signup">Start free today <Arrow /></Link>
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
