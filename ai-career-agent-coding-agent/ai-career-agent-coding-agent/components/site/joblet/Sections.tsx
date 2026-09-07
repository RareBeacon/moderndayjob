import Link from 'next/link';
import { FAQ } from '@/components/site/FAQ';
import { IconArrowRight, IconBolt, IconShield, IconDocument, IconCheck } from './Icons';

const TOOLS = [
  { title: 'ATS Resume Scanner', body: 'See exactly how your CV reads to applicant tracking systems.', href: '/free-ats-resume-scanner' },
  { title: 'Cover Letter Writer', body: 'Draft a tailored letter from your verified facts.', href: '/free-cover-letter-writer' },
  { title: 'Job Description Analyzer', body: 'Break any listing into skills, gaps, and keywords.', href: '/free-job-description-analyzer' },
  { title: 'Skills Matcher', body: 'See which of your skills a job actually rewards.', href: '/free-skills-matcher' },
  { title: 'Interview Question Generator', body: 'Practice role-specific questions with model answers.', href: '/free-interview-question-generator' },
  { title: 'Career Path Explorer', body: 'Map realistic next steps from your real profile.', href: '/free-career-path-explorer' },
  { title: 'Salary Insights', body: 'Only the pay that real listings state, never estimates.', href: '/free-salary-insights' },
  { title: 'Resume Summary Generator', body: 'A sharp two-line intro, grounded in your work.', href: '/free-resume-summary-generator' },
  { title: 'Follow-up Email Writer', body: 'A polite, timely nudge to a recruiter.', href: '/free-follow-up-email-writer' },
  { title: 'LinkedIn Headline Builder', body: 'A headline that earns the right clicks.', href: '/free-linkedin-headline-builder' },
];

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--jl-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5 L10 17 L19 7" />
    </svg>
  );
}

export function JobletTools() {
  return (
    <section className="jl-sec" id="tools">
      <div className="jl-shell">
        <div className="jl-sec-head center">
          <span className="jl-kicker">Career resources</span>
          <h2>Free tools. No paywall to start.</h2>
          <p>Ten focused tools to move your search forward — each one truthful, each one free to start.</p>
        </div>
        <div className="jl-tools-grid">
          {TOOLS.map((t) => (
            <Link className="jl-tool" href={t.href} key={t.title}>
              <span className="jl-tool-tag">Live</span>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
              <span className="jl-tool-go">Open tool <IconArrowRight size={14} /></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function JobletHow() {
  return (
    <section className="jl-sec tint" id="how">
      <div className="jl-shell">
        <div className="jl-sec-head center">
          <span className="jl-kicker">How it works</span>
          <h2>Three steps to momentum.</h2>
        </div>
        <div className="jl-how">
          <div className="jl-how-step">
            <span className="jl-n">1</span>
            <h3>Build your profile</h3>
            <p>A guided flow captures your experience, skills, and the roles you want. Any profession.</p>
          </div>
          <div className="jl-how-step">
            <span className="jl-n">2</span>
            <h3>Let the agent work</h3>
            <p>It discovers jobs, scores fit, and prepares truthful, tailored applications for you.</p>
          </div>
          <div className="jl-how-step">
            <span className="jl-n">3</span>
            <h3>Approve &amp; track</h3>
            <p>Review each application, approve in a click, and watch every status update in one place.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function JobletPricing() {
  return (
    <section className="jl-sec" id="pricing">
      <div className="jl-shell">
        <div className="jl-sec-head center">
          <span className="jl-kicker">Pricing</span>
          <h2>Start free. Upgrade when you’re ready to automate.</h2>
          <p>Prices in Naira. Cancel anytime.</p>
        </div>
        <div className="jl-plans">
          <div className="jl-plan">
            <h3>Free</h3>
            <div className="jl-price">₦0<small> /month</small></div>
            <ul>
              <li><Tick />2 AI career credits / day</li>
              <li><Tick />CV builder &amp; ATS tools</li>
              <li><Tick />Job analysis &amp; matching</li>
              <li><Tick />Application tracking</li>
            </ul>
            <Link className="jl-btn-outline jl-plan-cta" href="/signup" style={{ textAlign: 'center' }}>Start free</Link>
          </div>
          <div className="jl-plan featured">
            <h3>Basic</h3>
            <div className="jl-price">₦5,000<small> /month</small></div>
            <ul>
              <li><Tick />Everything in Free</li>
              <li><Tick />Application automation</li>
              <li><Tick />10 applications / day</li>
              <li><Tick />Approval-mode workflow</li>
            </ul>
            <Link className="jl-btn-solid jl-plan-cta" href="/signup" style={{ textAlign: 'center' }}>Choose Basic</Link>
          </div>
          <div className="jl-plan">
            <h3>Premium</h3>
            <div className="jl-price">₦10,000<small> /month</small></div>
            <ul>
              <li><Tick />Everything in Basic</li>
              <li><Tick />20 applications / day</li>
              <li><Tick />Advanced intelligence</li>
              <li><Tick />Priority processing</li>
            </ul>
            <Link className="jl-btn-outline jl-plan-cta" href="/signup" style={{ textAlign: 'center' }}>Choose Premium</Link>
          </div>
        </div>
        <p className="jl-trial-note"><b>7-day automation trial</b> on every new account — try Basic features free, no card required.</p>
      </div>
    </section>
  );
}

const ABOUT = [
  { icon: IconDocument, title: 'Only your verified facts', body: 'Nothing is invented. Generators draw solely from the profile you build.' },
  { icon: IconCheck, title: 'You approve everything', body: 'Approval mode is the default. No application sends without your say-so.' },
  { icon: IconShield, title: 'Immutable receipts', body: 'Every generation and submission is a permanent, traceable record.' },
  { icon: IconBolt, title: 'No inbox access', body: 'You bring an application email. We never read your mailbox or Gmail.' },
];

export function JobletAbout() {
  return (
    <section className="jl-sec tint" id="about">
      <div className="jl-shell">
        <div className="jl-sec-head center">
          <span className="jl-kicker">Built on trust</span>
          <h2>Honest by design. Private by default.</h2>
          <p>Real people. Real journeys. Four commitments built into how Jobiest works.</p>
        </div>
        <div className="jl-about-grid">
          {ABOUT.map((a) => (
            <div className="jl-about" key={a.title}>
              <span className="jl-about-ico"><a.icon size={20} /></span>
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function JobletFaq() {
  return (
    <section className="jl-sec" id="faq">
      <div className="jl-shell jl-faq-wrap">
        <div className="jl-sec-head center">
          <span className="jl-kicker">FAQ</span>
          <h2>Questions, answered.</h2>
        </div>
        <FAQ />
      </div>
    </section>
  );
}

