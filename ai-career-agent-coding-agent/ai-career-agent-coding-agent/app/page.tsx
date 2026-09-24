import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { SITE_URL } from '@/lib/site';
import { websiteJsonLd, organizationJsonLd, faqJsonLd, jsonLdTag } from '@/lib/seo';
import { PLANS, PLAN_ORDER } from '@/lib/billing/pricing';
import styles from './home.module.css';
import { Icon } from '@/components/home/Icons';
import SiteHeader, { BrandWordmark } from '@/components/home/SiteHeader';
import { ProductTour } from '@/components/home/ProductTour';
import { GeoPrice } from '@/components/home/GeoPrice';

export const revalidate = 300;

export const metadata: Metadata = {
  // Root page titles do not get the layout template suffix, so the brand is included here once.
  title: 'Jobiest - Your AI Agent for the Job Search',
  description: 'Jobiest is the AI agent for your job search: tell it your criteria once, drop in the jobs you want, and it tailors your CV and cover letter, fills supported forms, and submits after your approval. Start free.',
  alternates: { canonical: SITE_URL },
};

const faqs = [
  { q: 'How much work is this, really?', a: 'Set your criteria once. On paid plans your agent then searches employer boards for matching roles and prepares the applications; you can also paste any job link yourself. You review each package and approve; on Greenhouse and Lever the submission itself is done for you, or fully automatic if you switch to the Auto send policy. Most evenings take minutes, not hours.' },
  { q: 'Which job boards does it support?', a: 'The agent fills and submits employer forms on Greenhouse, Lever, Ashby and Workable, after your approval or on the Auto policy. Jobs it finds itself come from Greenhouse and Lever boards today; any job you paste on a supported board is filled and submitted too. Everything else comes back as the complete package, CV, cover letter and answers, with a direct link so you can submit in a couple of clicks. Forms that need a CAPTCHA, a login, or an assessment are handed back to you with everything ready to go.' },
  { q: 'Will it make up experience for my CV?', a: 'Never. Documents are built only from the facts you verify. Missing details are flagged so you can add context without inventing credentials or achievements, and a truthfulness check runs before any submission: if honest content cannot be verified, the application stops and comes back to you.' },
  { q: 'What can I do on the free plan?', a: 'Use all 10 career tools (full results preview, no account needed), build your profile and criteria, and track applications in one place. You also get three AI generations in total to try the writer. Agent runs start on paid plans. No payment card is required.' },
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

const howSteps = [
  { n: '01', title: 'Give Jobiest your criteria', body: 'Target roles, locations, remote preference, salary floor, daily target. You set the rules once; the agent works inside them.' },
  { n: '02', title: 'Your agent finds the jobs', body: 'On paid plans, your agent searches employer boards for roles that match your criteria and adds them to your pipeline, ready to apply. You can also paste any link yourself, from anywhere. No scrolling job boards inside Jobiest.' },
  { n: '03', title: 'Your agent does the work', body: 'It reads each job description, tailors your CV and cover letter from your verified experience, answers application questions, and completes supported forms.' },
  { n: '04', title: 'Applications get submitted', body: 'By default you review each package and approve with one tap, and your agent submits on Greenhouse, Lever, Ashby and Workable. Prefer full delegation? On paid plans, switch to the Auto send policy and your agent submits within your rules, then emails you each application it sent on your behalf.' },
  { n: '05', title: 'Track everything', body: 'Applied, waiting, interview, rejected, follow-up. One tracker shows every application and its status, every morning.' },
];

const trustItems = [
  {
    icon: 'shield' as const,
    title: 'Truthful by design, checked at send time',
    body: 'Documents are built only from facts you verified, and gaps get flagged, never filled with fiction. A truthfulness check runs server-side before any submission: if honest content cannot be verified, the application stops and comes back to you.',
  },
  {
    icon: 'check' as const,
    title: 'Every send follows your policy',
    body: 'The default is simple: nothing is sent until you approve it. Approvals expire after 24 hours and restart if your documents change, so nothing goes out on stale information. On paid plans you can switch to the Auto send policy and your agent submits within your rules; it still stops on CAPTCHAs, unsupported sites, and anything it cannot verify as truthful.',
  },
  {
    icon: 'briefcase' as const,
    title: 'Supported boards, stated plainly',
    body: 'On Greenhouse, Lever, Ashby and Workable, the agent fills and submits the employer form after you approve. Jobs your agent finds come from Greenhouse and Lever boards today; every other job comes back as a complete, ready-to-send package with a direct link.',
  },
  {
    icon: 'user' as const,
    title: 'Your data stays yours',
    body: 'Your CV and profile are stored securely, never sold, and no inbox connection is needed. Export your documents as PDF or Word anytime.',
  },
];

/** Design copy per plan, checked against PLANS (single source of truth for numbers). */
const PLAN_COPY: Record<string, { description: string; includes: string; features: string[] }> = {
  FREE: {
    description: 'Get your search moving.',
    includes: 'Free forever, no card',
    features: ['5 AI generations a month', '10 career-tool uses a day', 'Paste any job link for agent analysis', 'Application tracker', 'Optional: verify a card (costs nothing) to unlock 5 auto-applies a month'],
  },
  BASIC: {
    description: 'A first taste of the agent.',
    includes: 'Everything in Free, plus',
    features: ['10 AI generations a month', '50 career-tool uses a day', '20 auto-applies a month', 'Your agent finds matching jobs', 'You choose: approve every send, or Auto'],
  },
  PREMIUM: {
    description: 'The full agent workflow.',
    includes: 'Everything in Basic, plus',
    features: ['15 AI generations a month', 'Your agent finds matching jobs daily', '30 auto-applies a month', 'Unlimited career-tool uses', 'You choose: approve every send, or Auto'],
  },
  MAX: {
    description: 'For high-volume searches.',
    includes: 'Everything in Premium, plus',
    features: ['100 AI generations a month (fair-use cap)', 'Your agent finds matching jobs daily', '50 auto-applies a month', 'Unlimited career-tool uses', 'You choose: approve every send, or Auto'],
  },
};

const planCards = PLAN_ORDER.map((code) => {
  const plan = PLANS[code];
  const copy = PLAN_COPY[code];
  return {
    code,
    name: plan.name,
    description: copy.description,
    ngn: plan.monthlyNgn,
    usd: plan.monthlyUsd,
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

        {/* ===================== 1. Hero: the agent promise ===================== */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles['hero-topline']}>
              <span className={styles.eyebrow}><Icon name="spark" /> YOUR AI JOB-SEARCH AGENT</span>
              <a href="#case-study" className={styles['quiet-link']}>Watch it work <Icon name="play" small /></a>
            </div>
            <div className={styles['hero-intro']}>
              <h1>Your AI agent<br />for the <span className={styles['headline-highlight']}>job search.</span></h1>
              <div className={styles['hero-copy']}>
                <p>
                  Tell Jobiest what you want once. It finds matching roles on paid plans, or takes any job link you paste. Every application comes back tailored: CV, cover letter, answers, form filled. One tap approves it, and on Greenhouse, Lever, Ashby and Workable the agent submits for you. You review the results. It does the work.
                </p>
                <div className={styles['hero-actions']}>
                  <Link className={`${styles.button} ${styles['button-navy']}`} href="/signup">
                    Delegate my job search <span className={styles['button-arrow']}><Icon name="arrow" /></span>
                  </Link>
                  <a className={styles['demo-link']} href="#case-study"><Icon name="play" />See it work</a>
                </div>
                <p className={styles['hero-note']}><Icon name="check" />Free to start. No card needed. Your first tailored application in minutes.</p>
              </div>
            </div>

            <div className={styles['loop-strip']}>
              <strong>You set the rules. Jobiest does the work.</strong>
              <div className={styles['loop-chips']} aria-label="The Jobiest loop">
                <span>Target</span><i aria-hidden="true">→</i>
                <span>Tailor</span><i aria-hidden="true">→</i>
                <span>Apply</span><i aria-hidden="true">→</i>
                <span>Track</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 2. Case study: the campaign hook ===================== */}
        <section className={`${styles.section} ${styles['case-video-section']}`} id="case-study">
          <div className={styles.container}>
            <div className={styles['section-top']}>
              <div>
                <p className={styles['section-kicker']}>THE DELEGATION STORY</p>
                <h2>You sleep.<br />Your agent works.</h2>
              </div>
              <p className={styles['section-intro']}>One evening, start to finish:<br />the whole Jobiest loop in twenty seconds.</p>
            </div>

            <div className={styles['case-video-grid']}>
              <div className={styles['case-video-wrap']}>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  className={styles['case-video']}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster="/images/case-5-morning.jpg"
                >
                  <source src="/videos/jobiest-case-study.mp4" type="video/mp4" />
                </video>
                <p className={styles['case-video-note']}>Illustrative demo of the Jobiest workflow.</p>
              </div>
              <div className={styles['case-video-side']}>
                <ul>
                  <li><Icon name="check" small /> Set your criteria once: roles, locations, salary floor.</li>
                  <li><Icon name="check" small /> Your agent finds matching roles on paid plans; paste any link too.</li>
                  <li><Icon name="check" small /> Your agent tailors every document and fills supported forms.</li>
                  <li><Icon name="check" small /> Approve before bed, or switch to Auto: the morning run submits and emails you each one.</li>
                  <li><Icon name="check" small /> Anything that needs a human, CAPTCHA or assessment, comes back ready.</li>
                </ul>
                <figure className={styles['case-photo-small']}>
                  <Image src="/images/life-sofa.jpg" alt="A person relaxing with a book in the evening while the agent works" width={640} height={360} />
                  <figcaption>While you get on with your life.</figcaption>
                </figure>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== 3. How it works: the delegation loop ===================== */}
        <section className={`${styles.section} ${styles['how-section']}`} id="how-it-works">
          <div className={styles.container}>
            <div className={styles['section-top']}>
              <div>
                <p className={styles['section-kicker']}>HOW IT WORKS</p>
                <h2>From your criteria<br />to your morning review.</h2>
              </div>
              <p className={styles['section-intro']}>Five steps. You do two of them,<br />and one of those is approving.</p>
            </div>
            <div className={styles['how-grid']}>
              <div className={styles['how-steps']}>
                {howSteps.map((step) => (
                  <article key={step.n} className={styles['how-step']}>
                    <span className={styles['how-number']}>{step.n}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </article>
                ))}
              </div>
              <figure className={styles['how-photo']}>
                <Image src="/images/life-cafe.jpg" alt="Friends laughing at an outdoor cafe in the evening" width={880} height={660} />
                <figcaption>The part that matters: everything else you could be doing.</figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* ===================== 4. Product tour: show it working ===================== */}
        <section className={`${styles.section} ${styles['tour-section']}`} id="product">
          <div className={styles.container}>
            <div className={styles['section-top']}>
              <div>
                <p className={styles['section-kicker']}>SHOW, NOT TELL</p>
                <h2>See exactly what<br />the agent does.</h2>
              </div>
              <p className={styles['section-intro']}>Click through a real agent run:<br />criteria, jobs, documents, approval, tracker.</p>
            </div>
            <ProductTour />
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
                  <li><Icon name="check" small /> <strong>Jobs you paste:</strong> on Greenhouse, Lever, Ashby and Workable the agent fills and submits the form after you approve; anything else comes back as a ready-to-send package with a direct link.</li>
                  <li><Icon name="check" small /> <strong>Jobs your agent finds:</strong> Greenhouse and Lever boards today, submitted the same way after your approval.</li>
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
              <p className={styles['section-intro']}>Every plan keeps you as the approver. The difference is how much<br />the agent can do for you each day.</p>
            </div>
            <div className={styles['pricing-grid']}>
              {planCards.map((card) => (
                <div key={card.code} className={`${styles['price-card']} ${card.featured ? styles['featured-plan'] : ''}`}>
                  {card.featured && <span className={styles['popular-label']}><Icon name="spark" small />MOST POPULAR</span>}
                  <p className={styles['plan-description']}>{card.description}</p>
                  <h3>{card.name}</h3>
                  <p className={styles.price}><GeoPrice ngn={card.ngn} usd={card.usd} /><span>{card.period}</span></p>
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
              <ul>
                <li><strong>AI generations:</strong> resumes, cover letters and application answers written by the AI writer. 5 a month on Free, 10 to 100 a month on paid plans. Unused generations never expire; each month's allowance adds to what you already have.</li>
                <li><strong>Career-tool uses:</strong> the 10 free tools: the ATS scanner is rule-based, the other nine are AI-powered, and every tool shows a full preview without an account (copying and saving needs a free account). Tool use never touches your AI-generation allowance.</li>
                <li><strong>Agent runs:</strong> one complete application, found or pasted, analyzed, documents tailored, form filled, sent after your approval or on the Auto policy. Basic includes 20 a month, Premium 30, Max 50. Free can unlock 5 a month with a one-time card verification that costs nothing. Credits only count confirmed sends; stopped or unconfirmed ones go back.</li>
              </ul>
            </div>
            <p className={styles['pricing-footer']}>
              Nigeria pays in Naira, everywhere else in US dollars. Cancel anytime. <Link href="/pricing">View full plan details <Icon name="arrow-up" small /></Link>
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
              <p className={styles['section-intro']}>The five most-used tools, free to preview today.<br />No account needed to start.</p>
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
                <h2>Before you<br />delegate anything.</h2>
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
                <span className={styles['closing-kicker']}><Icon name="spark" />DELEGATE THE BUSYWORK</span>
                <h2>Your next application<br />starts here.</h2>
                <p>Set your criteria. Drop in a job. Approve the result.</p>
              </div>
              <div className={styles['closing-action']}>
                <Link className={`${styles.button} ${styles['button-yellow']}`} href="/signup">
                  Delegate my job search <Icon name="arrow" />
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
