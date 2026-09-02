import Link from 'next/link';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { FAQ } from '@/components/site/FAQ';
import { Reveal } from '@/components/site/Reveal';
import { ScrollStory } from '@/components/site/ScrollStory';
import { DemoReel } from '@/components/site/DemoReel';
import type { MarketData } from '@/components/site/CityStage';
import { supabaseAdmin } from '@/lib/supabase';

/* Homepage data is ISR: rebuilt on deploy, then refreshed at most every 5
   minutes, so the market city shows recent counts without hammering the
   database on every visit. */
export const revalidate = 300;

/** Live market shape for the 3D city. Honest on failure: empty means the
 *  scene renders unlabeled rather than inventing numbers. */
async function getLiveMarket(): Promise<MarketData> {
  try {
    const { data, error } = await supabaseAdmin.from('jobs').select('source, company');
    if (error || !data) return { total: 0, sources: [], companies: [], checkedAt: null };
    const bySource = new Map<string, number>();
    const byCompany = new Map<string, number>();
    for (const row of data as { source: string; company: string | null }[]) {
      bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1);
      const co = (row.company ?? '').trim();
      if (co) byCompany.set(co, (byCompany.get(co) ?? 0) + 1);
    }
    const sources = [...bySource.entries()].map(([name, count]) => ({ name: name.charAt(0) + name.slice(1).toLowerCase(), count })).sort((a, b) => b.count - a.count);
    const companies = [...byCompany.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 7);
    return { total: data.length, sources, companies, checkedAt: new Date().toISOString() };
  } catch {
    return { total: 0, sources: [], companies: [], checkedAt: null };
  }
}

/* small inline check glyph for the security rail (meaningful, not decorative sparkle) */
function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5 L10 17 L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Logo() {
  return (
    <span className="mk-logo">
      <span className="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 16 L9 9 L13 13 L20 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20" cy="5" r="2.1" fill="currentColor" />
        </svg>
      </span>
      Jobiest
    </span>
  );
}

const agentStages = [
  { n: '01', label: 'Discovering', state: 'done' },
  { n: '02', label: 'Analyzing', state: 'done' },
  { n: '03', label: 'Tailoring', state: 'done' },
  { n: '04', label: 'Answering', state: 'done' },
  { n: '05', label: 'Filling', state: 'live' },
  { n: '06', label: 'Verifying', state: 'todo' },
  { n: '07', label: 'Submitting', state: 'todo' },
  { n: '08', label: 'Completed', state: 'todo' },
];

const pipeStages = [
  { cnt: '18', nm: 'Saved', p: '100%' },
  { cnt: '12', nm: 'Applied', p: '67%' },
  { cnt: '4', nm: 'Interview', p: '22%' },
  { cnt: '1', nm: 'Offer', p: '6%' },
];

const tools = [
  { tag: 'Live', title: 'ATS Resume Scanner', body: 'See exactly how your CV reads to applicant tracking systems.', href: '/free-ats-resume-scanner' },
  { tag: 'Live', title: 'Cover Letter Writer', body: 'Draft a tailored letter from your verified facts.', href: '/free-cover-letter-writer' },
  { tag: 'Live', title: 'Job Description Analyzer', body: 'Break any listing into skills, gaps, and keywords.', href: '/free-job-description-analyzer' },
  { tag: 'Live', title: 'Skills Matcher', body: 'See which of your skills a job actually rewards.', href: '/free-skills-matcher' },
  { tag: 'Live', title: 'Interview Question Generator', body: 'Practice role-specific questions with model answers.', href: '/free-interview-question-generator' },
  { tag: 'Live', title: 'Career Path Explorer', body: 'Map realistic next steps from your real profile.', href: '/free-career-path-explorer' },
  { tag: 'Live', title: 'Salary Insights', body: 'Only the pay that real listings state, never estimates.', href: '/free-salary-insights' },
  { tag: 'Live', title: 'Resume Summary Generator', body: 'A sharp two-line intro, grounded in your work.', href: '/free-resume-summary-generator' },
  { tag: 'Live', title: 'Follow-up Email Writer', body: 'A polite, timely nudge to a recruiter.', href: '/free-follow-up-email-writer' },
  { tag: 'Live', title: 'LinkedIn Headline Builder', body: 'A headline that earns the right clicks.', href: '/free-linkedin-headline-builder' },
];

export default async function HomePage() {
  const market = await getLiveMarket();
  return (
    <>
      {/* 1 · Header */}
      <header className="mk-header">
        <div className="mk-shell bar">
          <Link href="/"><Logo /></Link>
          <nav className="mk-nav" aria-label="Primary">
            <span className="links">
              <Link href="/#how">How it works</Link>
              <Link href="/#tools">Free tools</Link>
              <Link href="/#pricing">Pricing</Link>
              <Link href="/#faq">FAQ</Link>
            </span>
            <span className="cta">
              <Link className="mk-btn-ghost" href="/login">Sign in</Link>
              <Link className="mk-btn-accent" href="/signup">Start free</Link>
            </span>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* 2 · Hero, asymmetric: outcome copy + living agent workspace */}
        <section className="mk-hero">
          <div className="mk-shell grid">
            <div>
              <span className="mk-eyebrow"><span className="pulse" /> Your AI career agent is working</span>
              <h1>
                Your next role, <em>found and applied</em>, while you do something else.
              </h1>
              <p className="lead">
                Jobiest discovers jobs that genuinely fit, scores them against your real profile,
                tailors a truthful CV and cover letter, and prepares every application for your approval.
                You stay in control. The busywork disappears.
              </p>
              <div className="actions">
                <Link className="mk-btn-accent" href="/signup">Build My Free CV</Link>
                <Link className="mk-btn-ghost" href="/#how">See How It Works</Link>
              </div>
              <div className="trust">
                <span><b>Free forever</b> · 2 AI credits/day</span>
                <span><b>Truthful</b> · only your verified facts</span>
                <span><b>You approve</b> every application</span>
              </div>
            </div>

            <div className="mk-floats">
              <div className="mk-panel">
                <div className="mk-panel-head">
                  <span className="dot" />
                  <strong>Career agent · live</strong>
                  <span className="pill">Approval mode</span>
                </div>
                <div className="mk-rail">
                  <span className="fill" aria-hidden="true" />
                  <div className="mk-step done"><span className="node">✓</span><span className="label">Job found</span><span className="meta">Senior Designer · Remote</span></div>
                  <div className="mk-step done"><span className="node">✓</span><span className="label">Matched · 92%</span><span className="meta">7 of 8 skills</span></div>
                  <div className="mk-step done"><span className="node">✓</span><span className="label">CV tailored</span><span className="meta">ATS-ready</span></div>
                  <div className="mk-step active"><span className="node">•</span><span className="label">Application ready</span><span className="meta">Awaiting you</span></div>
                  <div className="mk-step todo"><span className="node" /><span className="label">Submitted</span><span className="meta">-</span></div>
                </div>
                <div className="mk-panel-foot">
                  <div className="mk-stat"><b>12</b><span>new matches today</span></div>
                  <div className="mk-stat"><b>4</b><span>applications prepared</span></div>
                  <div className="mk-stat"><b>92%</b><span>avg. fit score</span></div>
                </div>
              </div>
              <span className="chip mint f1">✓ Facts verified</span>
              <span className="chip cobalt f2">+ Cover letter drafted</span>
            </div>
          </div>
        </section>

        {/* 2.5 · The cinematic market story: scroll = camera */}
        <ScrollStory market={market} />

        {/* 3 · Career identity, asymmetric copy + profile-strength card */}
        <section className="mk-section">
          <div className="mk-shell mk-identity">
            <div className="copy">
              <span className="mk-kicker">Your career identity</span>
              <h2>Build your profile once. We do the rest.</h2>
              <p>
                Tell us your experience, skills, and goals in a guided flow, for any profession, not just
                engineering. Your profile becomes the single source of truth that powers every CV, match, and
                application. No exaggeration. No fabrication. Just your real story, applied precisely.
              </p>
              <ul className="points">
                <li><span className="ic">1</span><span><b>Profession-agnostic</b><br /><span>Engineers, designers, marketers, accountants, founders, all welcome.</span></span></li>
                <li><span className="ic">2</span><span><b>Verified facts only</b><br /><span>We never invent employers, metrics, or credentials you don’t have.</span></span></li>
                <li><span className="ic">3</span><span><b>Reused everywhere</b><br /><span>One profile fuels matching, CVs, cover letters, and answers.</span></span></li>
              </ul>
            </div>
            <div className="mk-pcard">
              <div className="row">
                <span className="mk-avatar">AL</span>
                <div>
                  <h3>Ada Lovelace</h3>
                  <p className="sub">Senior Product Designer · Lagos</p>
                </div>
              </div>
              <div className="mk-meter" style={{ '--w': '88%' } as CSSProperties}>
                <div className="top"><span>Profile strength</span><span>88%</span></div>
                <div className="bar"><i /></div>
              </div>
              <div className="mk-tags">
                <span>Figma</span><span>Design systems</span><span>User research</span><span>Prototyping</span><span>Strategy</span>
              </div>
            </div>
          </div>
        </section>

        {/* 4 · Resume studio, split: document mock + copy */}
        <section className="mk-section" style={{ background: 'var(--background-secondary)' }}>
          <div className="mk-shell mk-studio">
            <div className="mk-doc" aria-hidden="true">
              <span className="score-tag">92 ATS</span>
              <div className="dline h" />
              <div className="dline w90" />
              <div className="dline w70" />
              <div className="dline w40" />
              <div style={{ height: 14 }} />
              <div className="dline w70" />
              <div className="dline w90" />
              <div className="dline w40" />
              <div style={{ height: 12 }} />
              <div className="ats"><i className="on" /><i className="on" /><i className="on" /><i className="on" /><i /></div>
            </div>
            <div className="copy">
              <span className="mk-kicker">Resume studio</span>
              <h2>A document studio, not a text box.</h2>
              <p>
                Paste a job description and watch your CV reshape to it: keywords aligned, achievements
                repositioned, an ATS score applied. Every edit is grounded in your real profile and kept as an
                immutable version, so you can always prove what you sent.
              </p>
              <ul className="points" style={{ marginTop: 22 }}>
                <li><span className="ic">✓</span><span><b>Truthful by design</b><br /><span>A built-in checker rejects any claim your profile can’t support.</span></span></li>
                <li><span className="ic">✓</span><span><b>Versioned & traceable</b><br /><span>Every generation is an immutable, hashable record.</span></span></li>
              </ul>
              <div style={{ marginTop: 26 }}><Link className="mk-btn-primary" href="/signup">Try the resume studio</Link></div>
            </div>
          </div>
        </section>

        {/* 5 · Job matching, split: copy + match card with ring + "why" */}
        <section className="mk-section">
          <div className="mk-shell mk-match-wrap">
            <div>
              <span className="mk-kicker">Why this job?</span>
              <h2 style={{ fontSize: 'var(--fs-h2)', letterSpacing: '-0.03em', fontWeight: 800, color: 'var(--brand-ink)', margin: '14px 0 0' }}>
                Matching that actually explains itself.
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.65, marginTop: 16 }}>
                No black-box scores. For every job you see a clear fit percentage and the exact reasons,
                strengths, gaps, and the skills that matter. Jobs you’ve already applied to are automatically
                excluded, so you never waste a step.
              </p>
            </div>
            <div className="mk-match">
              <div className="top">
                <span className="mk-ring" style={{ '--p': '92%' } as CSSProperties}><span className="inner">92</span></span>
                <div>
                  <span className="mk-co">N</span>
                </div>
                <div>
                  <h3>Senior Product Designer</h3>
                  <p className="loc">Northwind · Remote · $90-120k</p>
                  <p className="why">“You’re a strong match because…”</p>
                </div>
              </div>
              <div className="mk-reasons">
                <div className="r"><span className="ok">✓</span> Design systems <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>8 yrs</span></div>
                <div className="r"><span className="ok">✓</span> User research & prototyping</div>
                <div className="r"><span className="ok">✓</span> 7 of 8 listed skills</div>
                <div className="r"><span className="gap">~</span> Slight gap: B2B SaaS at scale</div>
              </div>
            </div>
          </div>
        </section>

        {/* 6 · ATS intelligence, editorial: JD paste → structured ruled grid */}
        <section className="mk-section" style={{ background: 'var(--background-secondary)' }}>
          <div className="mk-shell mk-ats">
            <div className="mk-jd" aria-hidden="true">
              <div className="jd-head"><span className="dl" /> Pasted job description</div>
              <div className="dl-line w85"><span className="kw" style={{ width: '22%' }} /></div>
              <div className="dl-line w60"><span className="kw" style={{ width: '30%' }} /></div>
              <div className="dl-line w85" />
              <div className="dl-line w45"><span className="kw" style={{ width: '55%' }} /></div>
              <div className="dl-line w60" />
              <div className="dl-line w85"><span className="kw" style={{ width: '18%' }} /></div>
              <div className="dl-line w45" />
            </div>
            <div>
              <span className="mk-kicker">ATS intelligence</span>
              <h2 style={{ fontSize: 'var(--fs-h2)', letterSpacing: '-0.03em', fontWeight: 800, color: 'var(--brand-ink)', margin: '14px 0 0' }}>
                Every listing, broken into a plan.
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.6, margin: '16px 0 24px', maxWidth: '52ch' }}>
                Paste a job description and get a structured breakdown, required skills you have, the ones
                you’re missing, the keywords that matter, and where you’re strong. A ruled grid you can scan
                in seconds.
              </p>
              <div className="mk-ats-break" role="group" aria-label="Example analysis (illustrative)">
                <div className="mk-ats-row"><span className="k">Required skills</span><span className="v"><span className="chip ok">✓ React</span><span className="chip ok">✓ TypeScript</span><span className="chip ok">✓ GraphQL</span><span className="chip no">× Rust</span></span></div>
                <div className="mk-ats-row"><span className="k">Keywords</span><span className="v"><span className="chip ok">✓ Senior</span><span className="chip ok">✓ Remote</span><span className="chip ok">✓ Startup</span></span></div>
                <div className="mk-ats-row"><span className="k">Gaps</span><span className="v"><span className="chip no">× Rust experience</span><span className="chip no">× Fintech domain</span></span></div>
                <div className="mk-ats-row"><span className="k">Strengths</span><span className="v"><span className="chip ok">✓ 8+ yrs frontend</span><span className="chip ok">✓ Design systems</span></span></div>
              </div>
            </div>
          </div>
        </section>

        {/* 7 · Automation, sophisticated staged agent rail (not identical cards) */}
        <section className="mk-section">
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">Application automation</span>
              <h2>Meet your AI career employee.</h2>
              <p>From discovery to submission, the agent moves your applications through every stage, and pauses for your approval before anything sends.</p>
            </div>
            <div className="mk-agent-rail" style={{ '--rail': '56%' } as CSSProperties}>
              {agentStages.map((s) => (
                <div className={`ar ${s.state}`} key={s.n}>
                  <span className="nd">{s.state === 'done' ? '✓' : s.state === 'live' ? '●' : s.n}</span>
                  <span className="lbl">{s.label}</span>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, marginTop: 28 }}>
              <b style={{ color: 'var(--brand-strong)' }}>Approval mode is the default.</b> The agent prepares; you review and release. Nothing is ever sent without you.
            </p>
          </div>
        </section>

        {/* 8 · Application activity, pipeline snapshot + response sparkline */}
        <section className="mk-section" style={{ background: 'var(--background-secondary)' }}>
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">Full tracking</span>
              <h2>Every application, in one calm pipeline.</h2>
              <p>See where each application stands, your live response rate, and what to follow up on, never a scattered spreadsheet again.</p>
            </div>
            <div className="mk-activity" style={{ marginTop: 40 }}>
              <div className="mk-pipe-grid">
                {pipeStages.map((s) => (
                  <div className="mk-pipe-stage" key={s.nm}>
                    <div className="cnt">{s.cnt}</div>
                    <div className="nm">{s.nm}</div>
                    <div className="px"><i style={{ width: s.p }} /></div>
                  </div>
                ))}
              </div>
              <div className="mk-spark-card">
                <div className="head">
                  <div>
                    <div className="big">28%</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Response rate</div>
                  </div>
                  <div className="delta">↑ 6 pts / mo</div>
                </div>
                <svg viewBox="0 0 200 60" preserveAspectRatio="none" role="img" aria-label="Response rate trend over 30 days, illustrative">
                  <defs>
                    <linearGradient id="mkspark" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#0ba5a0" />
                      <stop offset="1" stopColor="#0ba5a0" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline points="0,50 28,46 52,48 78,38 104,40 128,30 158,22 200,12 200,60 0,60" fill="url(#mkspark)" />
                  <polyline points="0,50 28,46 52,48 78,38 104,40 128,30 158,22 200,12" fill="none" stroke="#0ba5a0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="cap">30-day trend · illustrative preview of your future dashboard</div>
              </div>
            </div>
          </div>
        </section>

        {/* 8.5 · Case study: one honest morning */}
        <section className="mk-section case" id="case" style={{ background: 'var(--background-secondary)' }}>
          <div className="mk-shell mk-case">
            <Reveal className="mk-case-media">
              <Image
                src="/images/case-study.jpg"
                alt="A young Lagos professional reviewing her calm Jobiest dashboard in warm morning light"
                width={1200}
                height={800}
                sizes="(max-width: 900px) 100vw, 46vw"
                style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-lg)' }}
              />
              <span className="mk-case-tag">Case study</span>
            </Reveal>
            <Reveal delay={120} className="mk-case-copy">
              <span className="mk-kicker">Case study</span>
              <h2>One Tuesday morning with Jobiest.</h2>
              <p className="mk-case-note">
                A walkthrough of the real system with an example profile. Everything the system does
                below is live behavior; only the person is illustrative.
              </p>
              <ol className="mk-case-steps">
                <li><b>06:30</b><span>The daily pipeline runs: six boards read over their public APIs, 180 listings normalized, hashed and deduplicated. The job pool is warm before Lagos wakes.</span></li>
                <li><b>07:12</b><span>Amaka, an operations lead, opens her digest. Roles are ranked by real skill overlap with her verified profile. No gamified scores, no streaks to feed.</span></li>
                <li><b>07:40</b><span>She checks Salary Insights for “operations”: only listings that explicitly state pay appear, next to the honest denominator of how many were scanned.</span></li>
                <li><b>08:05</b><span>She tailors a CV for an Ops Lead role. The generator cites only her profile facts; the truthfulness guard rejects anything it cannot trace back.</span></li>
                <li><b>09:14</b><span>The application is prepared and parked. Status: waiting for approval. It will sit there until she says yes, because that is the product’s whole point.</span></li>
              </ol>
              <p className="mk-case-quote">“The system’s honesty is the feature.”</p>
            </Reveal>
          </div>
        </section>

        {/* 9 · Free tools, asymmetric bento */}
        <section className="mk-section" id="tools">
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">Free career tools</span>
              <h2>Real tools. No paywall to start.</h2>
              <p>Ten focused tools to move your search forward. Free to use, your account unlocks each one.</p>
            </div>
            <div className="mk-bento">
              {tools.map((t, i) => (
                <Link className={`mk-tool${i === 0 || i === 4 ? ' wide' : ''}`} href={t.href} key={t.title}>
                  <span className="tag">{t.tag}</span>
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                  <span className="arrow">Open tool →</span>
                </Link>
              ))}
            </div>
            <p className="mk-bento-note">All ten tools are <b style={{ color: 'var(--brand-strong)' }}>live</b>, every one truthful, every one free to start.</p>
          </div>
        </section>

        {/* 10 · How it works, three airy numbered steps */}
        <section className="mk-section" id="how" style={{ background: 'var(--background-secondary)' }}>
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">How it works</span>
              <h2>Three steps to momentum.</h2>
            </div>
            <div className="mk-how">
              <div className="step"><div className="n">1</div><h3>Build your profile</h3><p>A guided flow captures your experience, skills, and the roles you want. Any profession.</p></div>
              <div className="step"><div className="n">2</div><h3>Let the agent work</h3><p>It discovers jobs, scores fit, and prepares truthful, tailored applications for you.</p></div>
              <div className="step"><div className="n">3</div><h3>Approve & track</h3><p>Review each application, approve in a click, and watch every status update in one place.</p></div>
            </div>
          </div>
        </section>

        {/* 10.5 · The flow, animated (the homepage video) */}
        <section className="mk-section" id="demo">
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">The whole flow</span>
              <h2>Watch it work, end to end.</h2>
              <p>Five steps, one loop. This is the actual product flow, animated.</p>
            </div>
            <Reveal className="demo-wrap"><DemoReel /></Reveal>
          </div>
        </section>

        {/* Editorial plate: the magazine image band */}
        <figure className="plate">
          <Image
            src="/images/editorial-career.jpg"
            alt="Editorial illustration: paper-cut city towers rising from an open notebook, a paper plane ascending between them"
            fill
            sizes="100vw"
          />
          <figcaption>
            <span className="mk-kicker">Our whole philosophy, one image</span>
            <p>The market is real. Your story is real. We just introduce them.</p>
          </figcaption>
        </figure>

        {/* 11 · Security & privacy, trust rail (reinforces differentiators + D-001) */}
        <section className="mk-section">
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">Built on trust</span>
              <h2>Honest by design. Private by default.</h2>
              <p>We earn your trust with limits, not promises. Four commitments built into how Jobiest works.</p>
            </div>
            <div className="mk-trust-rail" style={{ marginTop: 40 }}>
              <div className="mk-trust"><span className="ic"><Check /></span><h3>Only your verified facts</h3><p>Nothing is invented. Generators draw solely from the profile you build.</p></div>
              <div className="mk-trust"><span className="ic"><Check /></span><h3>You approve everything</h3><p>Approval mode is the default. No application sends without your say-so.</p></div>
              <div className="mk-trust"><span className="ic"><Check /></span><h3>Immutable receipts</h3><p>Every generation and submission is a permanent, traceable record.</p></div>
              <div className="mk-trust"><span className="ic"><Check /></span><h3>No inbox access</h3><p>You bring an application email. We never read your mailbox or Gmail.</p></div>
            </div>
          </div>
        </section>

        {/* 12 · Pricing, Free / Basic (featured) / Premium (coral) */}
        <section className="mk-section" id="pricing" style={{ background: 'var(--background-secondary)' }}>
          <div className="mk-shell">
            <div className="mk-sec-head center">
              <span className="mk-kicker">Pricing</span>
              <h2>Start free. Upgrade when you’re ready to automate.</h2>
              <p>Prices in Naira. Cancel anytime.</p>
            </div>
            <div className="mk-price-grid">
              <div className="mk-plan">
                <h3>Free</h3>
                <div className="price">₦0<small> /month</small></div>
                <ul>
                  <li>2 AI career credits / day</li>
                  <li>CV builder & ATS tools</li>
                  <li>Job analysis & matching</li>
                  <li>Application tracking</li>
                </ul>
                <Link className="mk-btn-ghost" href="/signup" style={{ textAlign: 'center' }}>Start free</Link>
              </div>
              <div className="mk-plan featured">
                <h3>Basic</h3>
                <div className="price">₦5,000<small> /month</small></div>
                <ul>
                  <li>Everything in Free</li>
                  <li>Application automation</li>
                  <li>10 applications / day</li>
                  <li>Approval-mode workflow</li>
                </ul>
                <Link className="mk-btn-accent" href="/signup" style={{ textAlign: 'center' }}>Choose Basic</Link>
              </div>
              <div className="mk-plan premium">
                <h3>Premium</h3>
                <div className="price">₦10,000<small> /month</small></div>
                <ul>
                  <li>Everything in Basic</li>
                  <li>20 applications / day</li>
                  <li>Advanced intelligence</li>
                  <li>Priority processing</li>
                </ul>
                <Link className="mk-btn-primary" href="/signup" style={{ textAlign: 'center' }}>Choose Premium</Link>
              </div>
            </div>
            <p className="mk-trial"><b>7-day automation trial</b> on every new account, try Basic features free, no card required.</p>
          </div>
        </section>

        {/* 13 · FAQ */}
        <section className="mk-section tight" id="faq">
          <div className="mk-shell" style={{ maxWidth: 820 }}>
            <div className="mk-sec-head center">
              <span className="mk-kicker">FAQ</span>
              <h2>Questions, answered.</h2>
            </div>
            <div style={{ marginTop: 36 }}><FAQ /></div>
          </div>
        </section>

        {/* 14 · Final CTA */}
        <section className="mk-section tight">
          <div className="mk-shell">
            <div className="mk-cta">
              <h2>Your career agent is ready when you are.</h2>
              <p>Build your free CV in minutes. No card, no commitment, just momentum.</p>
              <div className="actions" style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap' }}>
                <Link className="mk-btn-accent" href="/signup">Build My Free CV</Link>
                <Link className="mk-btn-ghost" href="/login">I already have an account</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 15 · Footer */}
      <footer className="mk-footer">
        <div className="mk-shell">
          <div className="top">
            <div>
              <Logo />
              <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 12, maxWidth: 320 }}>
                The AI career agent that finds roles, prepares truthful applications, and keeps you in control.
              </p>
            </div>
            <div className="cols">
              <div>
                <h4>Product</h4>
                <ul>
                  <li><Link href="/#how">How it works</Link></li>
                  <li><Link href="/#tools">Free tools</Link></li>
                  <li><Link href="/#pricing">Pricing</Link></li>
                  <li><Link href="/signup">Sign up</Link></li>
                </ul>
              </div>
              <div>
                <h4>Account</h4>
                <ul>
                  <li><Link href="/login">Sign in</Link></li>
                  <li><Link href="/signup">Start free</Link></li>
                  <li><Link href="/#faq">Help</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="bottom">
            <span>© {new Date().getFullYear()} Jobiest. All rights reserved.</span>
            <span>Built in Lagos.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
