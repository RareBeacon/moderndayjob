import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { supabaseAdmin } from '@/lib/supabase';
import { SITE_URL } from '@/lib/site';
import { websiteJsonLd, organizationJsonLd, faqJsonLd, jsonLdTag } from '@/lib/seo';
import { PLANS, PLAN_ORDER } from '@/lib/billing/pricing';
import { formatNaira } from '@/lib/billing/currency';
import styles from './home.module.css';
import { Icon } from '@/components/home/Icons';
import SiteHeader, { BrandWordmark } from '@/components/home/SiteHeader';
import Walkthrough from '@/components/home/Walkthrough';

export const revalidate = 300;

export const metadata: Metadata = {
  // Root page titles do not get the layout template suffix, so the brand is included here once.
  title: 'Jobiest - Big ambitions. Meet your agent.',
  description: 'Jobiest is the AI career agent that finds matching roles, prepares truthful applications, and moves forward on your terms. You approve every send.',
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

const faqs = [
  { q: 'Will the agent apply without my permission?', a: 'You review and approve each application. The agent prepares the work; you decide when it is ready to send.' },
  { q: 'Will it make up experience for my CV?', a: 'Documents use the information you verify. Missing details are flagged so you can add context without inventing credentials or achievements.' },
  { q: 'Do I need to connect my email inbox?', a: 'No inbox connection is needed to discover opportunities, prepare application documents, or track your progress.' },
  { q: 'What can I do on the free plan?', a: 'Explore job matching, use the tracker, and access career tools with a daily allowance. You also get three AI generations in total to try the writer. No payment card is required.' },
];

const workflowSteps = [
  { n: '01', title: 'Start with your story.', body: 'Add your CV, experience, and preferences. Show your agent where you have been and where you want to go.' },
  { n: '02', title: 'Find the fit. See the why.', body: 'Explore relevant roles with clear reasons for each match, including the details worth checking.' },
  { n: '03', title: 'Apply with your say-so.', body: 'Review tailored documents, check the facts, and approve the applications you want to send.' },
];

const tools = [
  { href: '/free-cover-letter-writer', icon: 'spark' as const, name: 'Cover Letter Writer', body: 'Connect your experience to the opportunity.' },
  { href: '/free-job-description-analyzer', icon: 'search' as const, name: 'Job Description Analyzer', body: 'Get to the heart of what the role needs.' },
  { href: '/free-skills-matcher', icon: 'layers' as const, name: 'Skills Matcher', body: 'See where you fit and where to grow.' },
  { href: '/free-interview-question-generator', icon: 'message' as const, name: 'Interview Question Generator', body: 'Walk into the conversation prepared.' },
  { href: '/free-salary-insights', icon: 'chart' as const, name: 'Salary Insights', body: 'Explore pay disclosed in job listings.' },
];

/** Design copy per plan, checked against PLANS (single source of truth for numbers). */
const PLAN_COPY: Record<string, { description: string; includes: string; features: string[] }> = {
  FREE: {
    description: 'Get your search in shape.',
    includes: 'A place to begin',
    features: ['3 AI generations to try', '10 tool uses per day', 'CV scanner and job matching', 'Application tracker'],
  },
  BASIC: {
    description: 'Build a steady rhythm.',
    includes: 'Everything in Free, plus',
    features: ['3 AI generations per day', '50 tool uses per day', '2 agent trial runs in total', 'You approve every send'],
  },
  PREMIUM: {
    description: 'Give your agent room to work.',
    includes: 'Everything in Basic, plus',
    features: ['10 AI generations per day', '10 agent applications per day', 'Unlimited career-tool uses', 'You approve every send'],
  },
  MAX: {
    description: 'More capacity for more ambition.',
    includes: 'Everything in Premium, plus',
    features: ['20 AI generations per day', '20 agent applications per day', 'Unlimited career-tool uses', 'For high-volume workflows'],
  },
};

const planCards = PLAN_ORDER.map((code) => {
  const plan = PLANS[code];
  const copy = PLAN_COPY[code];
  return {
    code,
    name: plan.name,
    description: copy.description,
    price: formatNaira(plan.monthlyNgn),
    period: plan.monthlyNgn === 0 ? '/ forever' : '/ month',
    includes: copy.includes,
    features: copy.features,
    cta: plan.cta,
    featured: Boolean(plan.featured),
  };
});

export default async function HomePage() {
  const market = await getLiveMarket();

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(websiteJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(organizationJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(faqJsonLd(faqs))} />
      <a href="#main" className={styles['skip-link']}>Skip to content</a>
      <SiteHeader />
      <main id="main">
        {/* ===================== Hero ===================== */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles['hero-topline']}>
              <span className={styles.eyebrow}><Icon name="spark" /> YOUR AI CAREER AGENT</span>
              <a href="#how-it-works" className={styles['quiet-link']}>A better way to make your next move <Icon name="arrow" small /></a>
            </div>
            <div className={styles['hero-intro']}>
              <h1>Big ambitions.<br />Meet your <span className={styles['headline-highlight']}>agent.</span></h1>
              <div className={styles['hero-copy']}>
                <p>Your next role is out there. Jobiest helps you find it, prepare a stronger application, and move forward on your terms.</p>
                <div className={styles['hero-actions']}>
                  <Link className={`${styles.button} ${styles['button-navy']}`} href="/signup">
                    Start my next chapter <span className={styles['button-arrow']}><Icon name="arrow" /></span>
                  </Link>
                  <a className={styles['demo-link']} href="#agent-preview"><Icon name="play" />Take a quick look</a>
                </div>
                <p className={styles['hero-note']}><Icon name="check" />Free to start. No card needed.</p>
              </div>
            </div>

            {/* ===================== Interactive walkthrough ===================== */}
            <div className={styles['demo-stage']} id="agent-preview" tabIndex={-1} aria-label="Interactive Jobiest agent walkthrough">
              <div className={styles['stage-caption']}>
                <span>LESS TAB-HOPPING. MORE FORWARD MOTION.</span>
                <span className={styles['sample-label']}>Interactive example · sample roles &amp; profile</span>
              </div>
              <Walkthrough />
              <div className={styles['demo-bottom']}>
                <span><Icon name="shield" />Prepared by your agent. Approved by you.</span>
                <a className={styles['reset-demo']} href="#agent-preview"><Icon name="arrow" small />Restart walkthrough</a>
              </div>
            </div>

            {/* ===================== Job sources ===================== */}
            <div className={styles['source-strip']}>
              <p>Good opportunities start<br />with direct hiring sources.</p>
              <div className={styles['source-names']} aria-label="Job listing sources">
                <span className={styles['greenhouse-wordmark']}>greenhouse<span>✳</span></span>
                <span className={styles['ashby-wordmark']}>ashby</span>
                <span className={styles['lever-wordmark']}>lever</span>
              </div>
              <span className={styles['source-note']}>
                {market.total > 0 ? `${market.total.toLocaleString()} roles indexed from direct sources.` : 'Job sources, in one place.'}
              </span>
            </div>
          </div>
        </section>

        {/* ===================== How it works ===================== */}
        <section className={`${styles.section} ${styles['workflow-section']}`} id="how-it-works">
          <div className={`${styles.container} ${styles['workflow-grid']}`}>
            <div className={styles['workflow-visual']}>
              <Image
                src="/career-moment.webp"
                width={1122}
                height={1402}
                loading="lazy"
                alt="A professional taking a thoughtful moment beside her laptop in a sunlit workspace."
              />
              <div className={styles['photo-caption']}>
                <span className={styles['photo-icon']}><Icon name="briefcase" /></span>
                <p>Your next move<br /><strong>should feel like you.</strong></p>
              </div>
            </div>
            <div className={styles['workflow-copy']}>
              <p className={styles['section-kicker']}>A BETTER WAY FORWARD</p>
              <h2>Go from searching<br />to moving forward.</h2>
              <p className={styles['section-intro']}>A little structure makes room for what matters. Here is where your agent comes in.</p>
              <div className={styles['workflow-steps']}>
                {workflowSteps.map((step) => (
                  <article key={step.n}>
                    <span className={styles['step-number']}>{step.n}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </article>
                ))}
              </div>
              <a className={styles['text-link']} href="#agent-preview">Try the walkthrough <Icon name="arrow" /></a>
            </div>
          </div>
        </section>

        {/* ===================== Free tools ===================== */}
        <section className={`${styles.section} ${styles['tools-section']}`} id="tools">
          <div className={styles.container}>
            <div className={styles['section-top']}>
              <div>
                <p className={styles['section-kicker']}>YOUR NEXT STEP CAN BE A SMALL ONE</p>
                <h2>A toolkit for<br />getting somewhere.</h2>
              </div>
              <p className={styles['section-intro']}>Fix your CV. Prepare for an interview.<br />Start with what you need today.</p>
            </div>
            <div className={styles['tools-grid']}>
              <Link className={styles['featured-tool']} href="/free-ats-resume-scanner">
                <span className={styles['featured-tool-label']}>START WITH YOUR CV</span>
                <span className={styles['featured-tool-icon']}><Icon name="file" /></span>
                <h3>Make your first<br />impression count.</h3>
                <p>Use the ATS Resume Scanner to check readability and alignment with a job.</p>
                <div className={styles['scanner-preview']}>
                  <span className={styles['scanner-title']}><Icon name="file" /> What you can check</span>
                  <span>Readable sections <Icon name="search" /></span>
                  <span>Relevant keywords <Icon name="search" /></span>
                  <span>Machine-friendly formatting <Icon name="search" /></span>
                </div>
                <span className={styles['featured-tool-action']}>Scan my CV <Icon name="arrow" /></span>
              </Link>
              {tools.map((tool) => (
                <Link className={styles['tool-card']} href={tool.href} key={tool.href}>
                  <span className={styles['tool-icon']}><Icon name={tool.icon} /></span>
                  <Icon name="arrow-up" className={styles['tool-arrow']} />
                  <h3>{tool.name}</h3>
                  <p>{tool.body}</p>
                </Link>
              ))}
              <Link className={`${styles['tool-card']} ${styles['all-tools-card']}`} href="/tools">
                <span className={styles['all-tools-number']}>10</span>
                <h3>Small tools.<br />A stronger search.</h3>
                <span className={styles['text-link']}>Explore all free tools <Icon name="arrow" /></span>
              </Link>
            </div>
          </div>
        </section>

        {/* ===================== Pricing ===================== */}
        <section className={`${styles.section} ${styles['pricing-section']}`} id="pricing">
          <div className={styles.container}>
            <div className={styles['center-heading']}>
              <p className={styles['section-kicker']}>A LITTLE SUPPORT. ROOM TO GROW.</p>
              <h2>Start free. Build your momentum.</h2>
              <p>Start free. Choose more capacity when you need it.</p>
              <span className={styles['pricing-note']}>Monthly pricing in Nigerian Naira (₦)</span>
            </div>
            <div className={styles['pricing-grid']}>
              {planCards.map((plan) => (
                <article
                  className={`${styles['price-card']} ${plan.featured ? styles['featured-plan'] : ''}`}
                  key={plan.code}
                >
                  {plan.featured ? (
                    <div className={styles['popular-label']}><Icon name="spark" />MOST POPULAR</div>
                  ) : null}
                  <h3>{plan.name}</h3>
                  <p className={styles['plan-description']}>{plan.description}</p>
                  <div className={styles.price}>{plan.price}<span>{plan.period}</span></div>
                  <Link
                    className={[
                      styles.button,
                      plan.featured ? styles['button-yellow'] : styles['button-outline'],
                    ].join(' ')}
                    href="/signup"
                  >
                    {plan.cta} <Icon name="arrow" />
                  </Link>
                  <p className={styles['plan-includes']}>{plan.includes}</p>
                  <ul>
                    {plan.features.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </article>
              ))}
            </div>
            <p className={styles['pricing-footer']}>
              AI generations cover resumes, cover letters, and application answers.{' '}
              <Link href="/pricing">View full plan details <Icon name="arrow-up" small /></Link>
            </p>
          </div>
        </section>

        {/* ===================== FAQ ===================== */}
        <section className={`${styles.section} ${styles['faq-section']}`} id="questions">
          <div className={`${styles.container} ${styles['faq-grid']}`}>
            <div className={styles['faq-heading']}>
              <p className={styles['section-kicker']}>GOOD QUESTIONS. CLEAR ANSWERS.</p>
              <h2>Make your next move<br />with confidence.</h2>
              <p>Have something else in mind?</p>
              <Link className={styles['text-link']} href="/help">Visit the help centre <Icon name="arrow" /></Link>
            </div>
            <div className={styles['faq-list']}>
              {faqs.map((item, index) => (
                <details key={item.q} open={index === 0}>
                  <summary>{item.q}<Icon name="plus" /></summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== Closing ===================== */}
        <section className={styles['closing-section']}>
          <div className={styles.container}>
            <div className={styles['closing-card']}>
              <div>
                <span className={styles['closing-kicker']}><Icon name="spark" />THE NEXT CHAPTER IS YOURS</span>
                <h2>Your next move<br />looks good on you.</h2>
                <p>Let us find the opportunity that fits your story.</p>
              </div>
              <div className={styles['closing-action']}>
                <Link className={`${styles.button} ${styles['button-yellow']}`} href="/signup">
                  Start my next chapter <Icon name="arrow" />
                </Link>
                <span>Start free. Keep the final say.</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ===================== Footer ===================== */}
      <footer className={styles['site-footer']}>
        <div className={styles.container}>
          <div className={styles['footer-top']}>
            <div className={styles['footer-brand']}>
              <BrandWordmark />
              <p>Move forward.<br />On your own terms.</p>
            </div>
            <div className={styles['footer-column']}>
              <h3>Product</h3>
              <a href="#how-it-works">How it works</a>
              <a href="#tools">Free tools</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div className={styles['footer-column']}>
              <h3>Get to know us</h3>
              <Link href="/about">About Jobiest</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/help">Help centre</Link>
            </div>
            <div className={styles['footer-column']}>
              <h3>Your account</h3>
              <Link href="/signup">Get started</Link>
              <Link href="/login">Sign in</Link>
              <Link href="/refund">Refund policy</Link>
            </div>
          </div>
          <div className={styles['footer-bottom']}>
            <span>© {new Date().getFullYear()} Jobiest. Built in Lagos, for your next move.</span>
            <div>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
