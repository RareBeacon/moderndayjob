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

export const revalidate = 300;

export const metadata: Metadata = {
  // Root page titles do not get the layout template suffix, so the brand is included here once.
  title: 'Jobiest - Apply for Jobs While You Sleep',
  description: 'Jobiest is the career agent that finds roles that fit you, tailors truthful CVs and cover letters, and applies on your terms while you sleep. Start free, no card needed.',
  alternates: { canonical: SITE_URL },
};

const faqs = [
  { q: 'Can it really apply while I sleep?', a: 'Yes. Your agent works through the night on paid plans: it matches new roles to your profile, tailors your documents, and submits applications on supported boards following the rules you set. If you prefer, you can require your approval on every send instead. Everything lands in your tracker for the morning report.' },
  { q: 'Will it make up experience for my CV?', a: 'Never. Documents are built only from the facts you verify. Missing details are flagged so you can add context without inventing credentials or achievements.' },
  { q: 'Do I need to connect my email inbox?', a: 'No inbox connection is needed to prepare applications, use the career tools, or track your progress.' },
  { q: 'What can I do on the free plan?', a: 'Use all 10 career tools with a daily allowance, start applications with your agent, and track them in one place. You also get three AI generations in total to try the writer. No payment card is required.' },
];

const overnightSteps = [
  { time: '9:42 PM', title: 'You set the rules once', body: 'Target roles, salary, location, seniority. Say how hands-on you want to be, then close the laptop.' },
  { time: '11:15 PM', title: 'The agent goes hunting', body: 'New openings are matched against your profile and scored for fit, with honest gap flags, not hype.' },
  { time: '2:30 AM', title: 'Documents get tailored', body: 'Your CV and cover letter are reshaped for each role using your verified facts. Nothing is invented.' },
  { time: '5:50 AM', title: 'Applications go out', body: 'On supported boards, applications are submitted following your rules. What needs a human eye waits for you.' },
  { time: '7:30 AM', title: 'You wake up to a report', body: 'What was applied, what is ready for review, what to chase next. All in one tracker.' },
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

const uniques = [
  { icon: 'moon' as const, title: 'Autopilot, not another job board', body: 'Job boards make you scroll. Jobiest brings the roles to you and does the applying, following the rules you set, while you get on with life.' },
  { icon: 'shield' as const, title: 'Truthful applications only', body: 'Every CV and cover letter is built from facts you verified. Gaps get flagged, never filled with fiction. That is what survives interviews.' },
  { icon: 'briefcase' as const, title: 'You stay in control', body: 'Choose full autopilot or approve every send yourself. Either way, one tracker shows every application, every status, every morning.' },
  { icon: 'layers' as const, title: 'The whole toolkit, one place', body: '70 resume templates, 10 free career tools, application tracking and an agent that ties it all together. Free to start.' },
];

/** Design copy per plan, checked against PLANS (single source of truth for numbers). */
const PLAN_COPY: Record<string, { description: string; includes: string; features: string[] }> = {
  FREE: {
    description: 'Get your search moving.',
    includes: 'A place to begin',
    features: ['3 AI generations to try', '10 tool uses per day', 'CV scanner and application tracking', 'Agent prepares what you approve'],
  },
  BASIC: {
    description: 'Let the agent start working nights.',
    includes: 'Everything in Free, plus',
    features: ['3 AI generations per day', '50 tool uses per day', '2 agent trial runs in total', 'You approve every send'],
  },
  PREMIUM: {
    description: 'Full overnight autopilot.',
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
  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(websiteJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(organizationJsonLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(faqJsonLd(faqs))} />
      <a href="#main" className={styles['skip-link']}>Skip to content</a>
      <SiteHeader />
      <main id="main">

        {/* ===================== Headline + sub headline ===================== */}
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles['hero-topline']}>
              <span className={styles.eyebrow}><Icon name="moon" /> THE AGENT THAT WORKS OVERNIGHT</span>
              <a href="#case-study" className={styles['quiet-link']}>See an overnight run <Icon name="arrow" small /></a>
            </div>
            <div className={styles['hero-intro']}>
              <h1>Apply for jobs<br />while you <span className={styles['headline-highlight']}>sleep.</span></h1>
              <div className={styles['hero-copy']}>
                <p>Jobiest finds roles that fit you, tailors your CV and cover letter, and submits applications on your terms. You wake up to progress, not another day of scrolling.</p>
                <div className={styles['hero-actions']}>
                  <Link className={`${styles.button} ${styles['button-navy']}`} href="/signup">
                    Start free tonight <span className={styles['button-arrow']}><Icon name="arrow" /></span>
                  </Link>
                  <a className={styles['demo-link']} href="#case-study"><Icon name="play" />See how it works</a>
                </div>
                <p className={styles['hero-note']}><Icon name="check" />Free to start. No card needed.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== Hook ===================== */}
        <section className={styles['hook-band']} aria-label="Why Jobiest exists">
          <div className={styles.container}>
            <div className={styles['hook-card']}>
              <div>
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
                <span><Icon name="check" /> Wake up to applications sent</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== Use case study ===================== */}
        <section className={`${styles.section} ${styles['case-section']}`} id="case-study">
          <div className={styles.container}>
            <div className={styles['section-top']}>
              <div>
                <p className={styles['section-kicker']}>AN OVERNIGHT RUN</p>
                <h2>You went to bed.<br />Your agent went to work.</h2>
              </div>
              <p className={styles['section-intro']}>This is what one night with Jobiest looks like<br />from your side of the pillow.</p>
            </div>

            <div className={styles['case-grid']}>
              <figure className={styles['case-photo']}>
                <Image
                  src="/images/overnight-run.jpg"
                  alt="Illustration of a person sleeping while a laptop submits job applications overnight"
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

            {/* The "video": a live, looping night-shift report */}
            <div className={styles['night-report']} role="img" aria-label="Animated demo of the overnight report: three applications submitted while you slept">
              <div className={styles['night-report-head']}>
                <span className={styles['night-live']}><i aria-hidden="true" />Morning report</span>
                <span className={styles['night-date']}>While you slept</span>
              </div>
              <ul>
                <li><span className={styles['night-check']}><Icon name="check" small /></span><strong>Senior Product Manager, Fintech</strong><em>Applied, 02:14 AM</em></li>
                <li><span className={styles['night-check']}><Icon name="check" small /></span><strong>Growth Marketing Lead</strong><em>Applied, 03:47 AM</em></li>
                <li><span className={styles['night-check']}><Icon name="check" small /></span><strong>Product Owner, Logistics</strong><em>Applied, 05:22 AM</em></li>
                <li className={styles['night-review']}><span className={styles['night-check']}><Icon name="file" small /></span><strong>Head of Product, Health</strong><em>Ready for your review</em></li>
              </ul>
              <p className={styles['night-note']}>Demo animation. Your real report shows your roles, your statuses, your rules.</p>
            </div>
          </div>
        </section>

        {/* ===================== Pricing ===================== */}
        <section className={`${styles.section} ${styles['pricing-section']}`} id="pricing">
          <div className={styles.container}>
            <div className={styles['center-heading']}>
              <p className={styles['section-kicker']}>START FREE. LET THE AGENT EARN IT.</p>
              <h2>Sleep on it.<br />Literally.</h2>
              <p className={styles['section-intro']}>Start free and see the work. Upgrade when the nights start paying for themselves.</p>
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
            <p className={styles['pricing-footer']}>
              Prices in Naira. Cancel anytime. <Link href="/pricing">View full plan details <Icon name="arrow-up" small /></Link>
            </p>
          </div>
        </section>

        {/* ===================== Free tools ===================== */}
        <section className={`${styles.section} ${styles['tools-section']}`} id="tools">
          <div className={styles.container}>
            <div className={styles['section-top']}>
              <div>
                <p className={styles['section-kicker']}>FREE FOREVER TOOLS</p>
                <h2>Sharpen everything<br />around the search.</h2>
              </div>
              <p className={styles['section-intro']}>The five people reach for most, free to use today.<br />No account needed to start.</p>
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

        {/* ===================== What makes Jobiest unique ===================== */}
        <section className={`${styles.section} ${styles['unique-section']}`} id="why-jobiest">
          <div className={styles.container}>
            <div className={styles['center-heading']}>
              <p className={styles['section-kicker']}>WHAT MAKES JOBIEST DIFFERENT</p>
              <h2>Built to hand you<br />your evenings back.</h2>
            </div>
            <div className={styles['unique-grid']}>
              {uniques.map((item) => (
                <article key={item.title} className={styles['unique-card']}>
                  <span className={styles['unique-icon']}><Icon name={item.icon} /></span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== Socials ===================== */}
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

        {/* ===================== FAQ ===================== */}
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

        {/* ===================== Closing CTA ===================== */}
        <section className={styles['closing-section']}>
          <div className={styles.container}>
            <div className={styles['closing-card']}>
              <div>
                <span className={styles['closing-kicker']}><Icon name="moon" />TONIGHT COULD BE NIGHT ONE</span>
                <h2>Go to bed.<br />Wake up closer to hired.</h2>
                <p>Set your rules once. Your agent handles the rest.</p>
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
              <a href="#case-study">How it works</a>
              <a href="#tools">Free tools</a>
              <a href="#pricing">Pricing</a>
              <a href="#why-jobiest">Why Jobiest</a>
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
