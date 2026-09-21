import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { SITE_URL } from '@/lib/site';
import { websiteJsonLd, organizationJsonLd, faqJsonLd, jsonLdTag } from '@/lib/seo';
import { PLANS, PLAN_ORDER } from '@/lib/billing/pricing';
import { formatNaira } from '@/lib/billing/currency';
import styles from './home.module.css';
import { Icon } from '@/components/home/Icons';
import SiteHeader, { BrandWordmark } from '@/components/home/SiteHeader';
import { ProductTour } from '@/components/home/ProductTour';

export const revalidate = 300;

export const metadata: Metadata = {
  // Root page titles do not get the layout template suffix, so the brand is included here once.
  title: 'Jobiest - Job Applications, Ready When You Wake Up',
  description: 'Jobiest is the career agent that finds matching roles overnight and prepares tailored, truthful applications for your approval. Greenhouse and Lever forms filled on send. Start free.',
  alternates: { canonical: SITE_URL },
};

const faqs = [
  { q: 'Can it really work while I sleep?', a: 'Yes, the work happens overnight: the agent searches within your preferences, scores each role for fit, and tailors your CV and cover letter. On Greenhouse and Lever roles it also pre-fills the employer form. But nothing is submitted until you approve it, so most mornings look like: coffee, review, approve, done.' },
  { q: 'Which job boards does it support?', a: 'The agent fills and submits employer forms on Greenhouse and Lever. For any other job, it prepares the complete package, CV, cover letter and answers, with a direct link so you can submit in a couple of clicks. Forms that need a CAPTCHA, a login, or an assessment are handed back to you with everything ready to go.' },
  { q: 'Will it make up experience for my CV?', a: 'Never. Documents are built only from the facts you verify. Missing details are flagged so you can add context without inventing credentials or achievements, and a built-in truthfulness check stops the agent rather than letting it guess.' },
  { q: 'What can I do on the free plan?', a: 'Use all 10 career tools with a daily allowance, get match scoring, and track applications in one place. You also get three AI generations in total to try the writer. Agent runs start on paid plans. No payment card is required.' },
];

const overnightSteps = [
  { time: '9:42 PM', title: 'You set the rules once', body: 'Target roles, salary, location, seniority. You approve every send. Then close the laptop.' },
  { time: '11:15 PM', title: 'The agent goes hunting', body: 'New openings are matched against your profile and scored for fit, with honest gap flags, not hype.' },
  { time: '2:30 AM', title: 'Documents get tailored', body: 'Your CV and cover letter are reshaped for each role using your verified facts. Nothing is invented.' },
  { time: '5:50 AM', title: 'Forms get pre-filled', body: 'On Greenhouse and Lever roles, the employer form is filled and waiting. Anything else is packaged with a direct link.' },
  { time: '7:30 AM', title: 'You approve, it sends', body: 'Review the morning line-up, approve what you like, edit or skip the rest. Every status lands in your tracker.' },
];

const socials = [
  { name: 'Instagram', handle: '@jobiest_ai', href: 'https://www.instagram.com/jobiest_ai', icon: 'instagram' as const },
  { name: 'TikTok', handle: '@jobiest', href: 'https://www.tiktok.com/@jobiest', icon: 'tiktok' as const },
  { name: 'WhatsApp', handle: 'Jobiest channel', href: 'https://whatsapp.com/channel/0029VbE1oVxHVvTk2cnfdj2r', icon: 'whatsapp' as const },
  { name: 'X', handle: '@Jobiest_ai', href: 'https://x.com/Jobiest_ai', icon: 'x' as const },
];

const tools = [
  { href: '/free-ats-resume-scanner', icon: 'search' as const, name: 'ATS Resume Scanner', body: 'See how your CV reads to a machine.' },
  { href: '/free-job-description-analyzer', icon: 'file' as const, name: 'Job Description Analyzer', body: 'Get to the heart of what the role needs.' },
  { href: '/free-cover-letter-writer', icon: 'spark' as const, name: 'Cover Letter Writer', body: 'Connect your experience to the opportunity.' },
  { href: '/free-resume-summary-generator', icon: 'message' as const, name: 'Resume Summary Generator', body: 'A sharp summary in your voice.' },
  { href: '/free-linkedin-headline-builder', icon: 'user' as const, name: 'LinkedIn Headline Builder', body: 'Stand out where recruiters look first.' },
];

const trustItems = [
  {
    icon: 'shield' as const,
    title: 'Truthful by design, enforced in code',
    body: 'Documents are built only from facts you verified. Gaps get flagged, never filled with fiction, and a built-in truthfulness check stops the agent any time it cannot guarantee honest content.',
  },
  {
    icon: 'check' as const,
    title: 'You approve every send',
    body: 'No plan, at any price, sends without your approval. Approvals expire after 24 hours and restart if your documents change, so nothing goes out on stale information.',
  },
  {
    icon: 'briefcase' as const,
    title: 'Supported boards, stated plainly',
    body: 'Greenhouse and Lever today: the agent fills and submits the employer form after you approve. Every other job comes back as a complete, ready-to-send package with a direct link.',
  },
  {
    icon: 'user' as const,
    title: 'Your data stays yours',
    body: 'Your CV and profile live in encrypted storage, are never sold, and no inbox connection is needed. You can export or delete everything at any time.',
  },
];

/** Design copy per plan, checked against PLANS (single source of truth for numbers). */
const PLAN_COPY: Record<string, { description: string; includes: string; features: string[] }> = {
  FREE: {
    description: 'Get your search moving.',
    includes: 'Free forever, no card',
    features: ['3 AI generations in total (lifetime)', '10 career-tool uses a day', 'Match scoring and application tracker', 'Agent runs start on paid plans'],
  },
  BASIC: {
    description: 'A first taste of the night shift.',
    includes: 'Everything in Free, plus',
    features: ['3 AI generations a day', '50 career-tool uses a day', '2 agent trial runs in total', 'Every send approved by you'],
  },
  PREMIUM: {
    description: 'The full overnight workflow.',
    includes: 'Everything in Basic, plus',
    features: ['10 AI generations a day', '10 agent applications a day', 'Unlimited career-tool uses', 'Every send approved by you'],
  },
  MAX: {
    description: 'For high-volume searches.',
    includes: 'Everything in Premium, plus',
    features: ['20 AI generations a day', '20 agent applications a day', 'Unlimited career-tool uses', 'Every send approved by you'],
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
  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(websiteJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(organizationJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(faqJsonLd(faqs))} />
      <a href="#main" className={styles['skip-link']}>Skip to content</a>
      <SiteHeader />
      <main id="main">

        {/* ===================== 1. Hero: the promise, clarified ===================== */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles['hero-topline']}>
              <span className={styles.eyebrow}><Icon name="moon" /> THE AGENT THAT WORKS OVERNIGHT</span>
              <a href="#product-tour" className={styles['quiet-link']}>See the product, end to end <Icon name="arrow" small /></a>
            </div>
            <div className={styles['hero-intro']}>
              <h1>Wake up to applications,<br /><span className={styles['headline-highlight']}>ready to send.</span></h1>
              <div className={styles['hero-copy']}>
                <p>
                  Jobiest works the night shift: it finds roles that fit your preferences, tailors your CV and cover letter to each one, and pre-fills Greenhouse and Lever forms. Nothing is submitted until you approve it.
                </p>
                <div className={styles['hero-actions']}>
                  <Link className={`${styles.button} ${styles['button-navy']}`} href="/signup">
                    Start free tonight <span className={styles['button-arrow']}><Icon name="arrow" /></span>
                  </Link>
                  <a className={styles['demo-link']} href="#product-tour"><Icon name="play" />See how it works</a>
                </div>
                <p className={styles['hero-note']}><Icon name="check" />Free to start. No card needed.</p>
              </div>
            </div>

            <div className={styles['hero-promise']}>
              <span><Icon name="moon" small /><strong>Overnight:</strong> the agent prepares everything</span>
              <span><Icon name="check" small /><strong>Morning:</strong> you approve, it submits on supported boards</span>
              <span><Icon name="shield" small /><strong>Always:</strong> truthful documents, no exceptions</span>
            </div>
          </div>
        </section>

        {/* ===================== 2. Product demo: show it working ===================== */}
        <section className={`${styles.section} ${styles['tour-section']}`} id="product">
          <div className={styles.container}>
            <div className={styles['section-top']}>
              <div>
                <p className={styles['section-kicker']}>SHOW, NOT TELL</p>
                <h2>See exactly what<br />the agent does.</h2>
              </div>
              <p className={styles['section-intro']}>Click through a real overnight run:<br />preferences, matches, documents, approval, tracker.</p>
            </div>
            <ProductTour />
          </div>
        </section>

        {/* ===================== 3. The problem: why Jobiest exists ===================== */}
        <section className={styles['hook-band']} aria-label="Why Jobiest exists">
          <div className={styles.container}>
            <div className={styles['hook-card']}>
              <div>
                <p className={styles['section-kicker']}>WHY JOBIEST EXISTS</p>
                <h2>Job hunting shouldn&rsquo;t be a second job.</h2>
                <p>
                  Hours lost scrolling job boards. The same cover letter rewritten for the tenth time.
                  Forms that eat your evening. Meanwhile the roles that fit you quietly close.
                  Jobiest takes the night shift so your evenings, and your energy, stay yours.
                </p>
              </div>
              <div className={styles['hook-stats']}>
                <span><Icon name="close" /> No more endless scrolling</span>
                <span><Icon name="close" /> No more form fatigue</span>
                <span><Icon name="check" /> Mornings of ready applications</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 4. How it works: one night, start to finish ===================== */}
        <section className={`${styles.section} ${styles['case-section']}`} id="how-it-works">
          <div className={styles.container}>
            <div className={styles['section-top']}>
              <div>
                <p className={styles['section-kicker']}>HOW IT WORKS</p>
                <h2>One night,<br />start to finish.</h2>
              </div>
              <p className={styles['section-intro']}>From your rules to your morning report,<br />this is the whole workflow.</p>
            </div>

            <div className={styles['case-grid']}>
              <figure className={styles['case-photo']}>
                <Image
                  src="/images/overnight-run.jpg"
                  alt="Illustration of a person sleeping while a laptop prepares job applications overnight"
                  width={880}
                  height={880}
                  priority
                />
                <figcaption><Icon name="moon" /> Illustrative walkthrough of an overnight run.</figcaption>
              </figure>

              <div className={styles['case-timeline']}>
                {overnightSteps.map((step) => (
                  <article key={step.time} className={styles['case-step']}>
                    <span className={styles['case-time']}><Icon name="clock" small />{step.time}</span>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 5. Trust and control ===================== */}
        <section className={`${styles.section} ${styles['unique-section']}`} id="trust">
          <div className={styles.container}>
            <div className={styles['center-heading']}>
              <p className={styles['section-kicker']}>TRUST AND CONTROL</p>
              <h2>What the agent will and<br />will not do.</h2>
              <p className={styles['section-intro']}>Clear boundaries, stated up front, so nothing surprises you after you pay.</p>
            </div>
            <div className={styles['unique-grid']}>
              {trustItems.map((item) => (
                <article key={item.title} className={styles['unique-card']}>
                  <span className={styles['unique-icon']}><Icon name={item.icon} /></span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>

            <div className={styles['platforms-panel']}>
              <div>
                <h3>Where the agent can apply</h3>
                <ul>
                  <li><Icon name="check" small /> <strong>Greenhouse and Lever:</strong> after your approval, the agent fills and submits the employer form.</li>
                  <li><Icon name="check" small /> <strong>Every other job:</strong> you get the complete package, tailored CV, cover letter and answers, with a direct link to submit in a couple of clicks.</li>
                  <li><Icon name="check" small /> <strong>CAPTCHA, login or assessment required:</strong> the agent stops and hands it back to you with everything prepared.</li>
                  <li><Icon name="check" small /> <strong>Unclear submissions:</strong> if a submit result cannot be confirmed, it is never auto-retried; you get a manual check instead.</li>
                </ul>
              </div>
              <p>Support for more boards is added over time. The list here changes when the product changes, not before.</p>
            </div>
          </div>
        </section>

        {/* ===================== 6. Pricing: simple plans, clear limits ===================== */}
        <section className={`${styles.section} ${styles['pricing-section']}`} id="pricing">
          <div className={styles.container}>
            <div className={styles['center-heading']}>
              <p className={styles['section-kicker']}>START FREE. UPGRADE WHEN IT EARNS IT.</p>
              <h2>Simple plans.<br />Clear limits.</h2>
              <p className={styles['section-intro']}>Every plan keeps you as the approver. The difference is how much<br />the agent can prepare for you each day.</p>
            </div>
            <div className={styles['pricing-grid']}>
              {planCards.map((card) => (
                <div key={card.code} className={`${styles['price-card']} ${card.featured ? styles['featured-plan'] : ''}`}>
                  {card.featured && <span className={styles['popular-label']}><Icon name="spark" small />MOST POPULAR</span>}
                  <p className={styles['plan-description']}>{card.description}</p>
                  <h3>{card.name}</h3>
                  <p className={styles.price}>{card.price}<span>{card.period}</span></p>
                  <Link className={`${styles.button} ${card.featured ? styles['button-yellow'] : styles['button-outline']}`} href="/signup">
                    {card.cta} <Icon name="arrow" small />
                  </Link>
                  <p className={styles['plan-includes']}>{card.includes}:</p>
                  <ul>
                    {card.features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div className={styles['limits-explainer']}>
              <strong>What the limits mean</strong>
              <p>
                <strong>AI generations</strong> are resumes, cover letters and application answers written by the AI writer: 3 in total on Free (lifetime), refreshed daily on paid plans.
                <strong> Career-tool uses</strong> are the 10 free tools, which are rule-based: 10 a day on Free, 50 on Basic, unlimited on Premium and Max. Unlimited tools never means unlimited AI generations.
                <strong> Agent applications</strong> are complete applications the agent prepares for you overnight: 2 trial runs in total on Basic, 10 a day on Premium and 20 a day on Max, and every one waits for your approval before anything is sent.
              </p>
            </div>
            <p className={styles['pricing-footer']}>
              Prices in Naira. Cancel anytime. <Link href="/pricing">View full plan details <Icon name="arrow-up" small /></Link>
            </p>
          </div>
        </section>

        {/* ===================== 7. Free career tools ===================== */}
        <section className={`${styles.section} ${styles['tools-section']}`} id="tools">
          <div className={styles.container}>
            <div className={styles['section-top']}>
              <div>
                <p className={styles['section-kicker']}>FREE FOREVER TOOLS</p>
                <h2>Sharpen everything<br />around the search.</h2>
              </div>
              <p className={styles['section-intro']}>The five most-used tools, free today.<br />No account needed to start.</p>
            </div>
            <div className={styles['tools-grid']}>
              {tools.map((tool) => (
                <Link key={tool.href} href={tool.href} className={styles['tool-card']}>
                  <span className={styles['tool-icon']}><Icon name={tool.icon} /></span>
                  <h3>{tool.name}</h3>
                  <p>{tool.body}</p>
                  <span className={styles['tool-arrow']}><Icon name="arrow" small /></span>
                </Link>
              ))}
              <Link href="/tools" className={styles['all-tools-card']}>
                <span className={styles['all-tools-number']}>10</span>
                <h3>free career tools<br />in total</h3>
                <span className={styles['text-link']}>See all free tools <Icon name="arrow" small /></span>
              </Link>
            </div>
          </div>
        </section>

        {/* ===================== 8. Socials ===================== */}
        <section className={styles['socials-section']} aria-label="Jobiest on social media">
          <div className={styles.container}>
            <div className={styles['socials-card']}>
              <div>
                <p className={styles['section-kicker']}>COME SAY HELLO</p>
                <h2>The journey is better<br />with company.</h2>
                <p className={styles['socials-note']}>Career tips, product updates, and the occasional laugh. Follow along where you already hang out.</p>
              </div>
              <div className={styles['socials-grid']}>
                {socials.map((social) => (
                  <a key={social.name} href={social.href} target="_blank" rel="noreferrer" className={styles['social-link']}>
                    <span className={styles['social-icon']}><Icon name={social.icon} /></span>
                    <span className={styles['social-name']}>{social.name}</span>
                    <span className={styles['social-handle']}>{social.handle}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 9. FAQ ===================== */}
        <section className={`${styles.section} ${styles['faq-section']}`} id="questions">
          <div className={styles.container}>
            <div className={styles['faq-grid']}>
              <div className={styles['faq-heading']}>
                <p className={styles['section-kicker']}>GOOD QUESTIONS. CLEAR ANSWERS.</p>
                <h2>Before you<br />set your alarm.</h2>
                <p>Anything else, the chat bubble in the corner is right there. Real answers, fast.</p>
              </div>
              <div className={styles['faq-list']}>
                {faqs.map((faq) => (
                  <details key={faq.q}>
                    <summary>{faq.q} <Icon name="plus" /></summary>
                    <p>{faq.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 10. Final CTA ===================== */}
        <section className={styles['closing-section']}>
          <div className={styles.container}>
            <div className={styles['closing-card']}>
              <div>
                <span className={styles['closing-kicker']}><Icon name="moon" />THE NIGHT SHIFT STARTS TONIGHT</span>
                <h2>Go to bed.<br />Wake up to progress.</h2>
                <p>Set your rules once. Review, approve, repeat.</p>
              </div>
              <div className={styles['closing-action']}>
                <Link className={`${styles.button} ${styles['button-yellow']}`} href="/signup">
                  Start free tonight <Icon name="arrow" />
                </Link>
                <span>Free to start. No card needed.</span>
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
              <a href="#product">See the product</a>
              <a href="#how-it-works">How it works</a>
              <a href="#pricing">Pricing</a>
              <a href="#trust">Trust and control</a>
            </div>
            <div className={styles['footer-column']}>
              <h3>Get to know us</h3>
              <Link href="/about">About Jobiest</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/help">Help centre</Link>
              <a href="#tools">Free tools</a>
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
              {socials.map((social) => (
                <a key={social.name} href={social.href} target="_blank" rel="noreferrer" aria-label={`Jobiest on ${social.name}`}>
                  <Icon name={social.icon} small />
                </a>
              ))}
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
