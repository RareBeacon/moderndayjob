import Link from 'next/link';
import { FAQ } from '@/components/site/FAQ';
import { IconArrowRight, IconBolt, IconShield, IconDocument, IconCheck } from './Icons';

const TOOLS = [
  { title: 'ATS Resume Scanner', body: 'See how your CV reads to applicant tracking systems.', href: '/free-ats-resume-scanner' },
  { title: 'Cover Letter Writer', body: 'Draft a tailored letter from your verified facts.', href: '/free-cover-letter-writer' },
  { title: 'Job Description Analyzer', body: 'Break any listing into skills, gaps, and keywords.', href: '/free-job-description-analyzer' },
  { title: 'Skills Matcher', body: 'See which of your skills a job actually rewards.', href: '/free-skills-matcher' },
  { title: 'Interview Question Generator', body: 'Practice role-specific questions with practical focus notes.', href: '/free-interview-question-generator' },
  { title: 'Career Path Explorer', body: 'Map realistic next steps from your real profile.', href: '/free-career-path-explorer' },
  { title: 'Salary Insights', body: 'Only the pay real listings state, never invented estimates.', href: '/free-salary-insights' },
  { title: 'Resume Summary Generator', body: 'Generate conservative summary options from verified profile facts.', href: '/free-resume-summary-generator' },
  { title: 'Follow-up Email Writer', body: 'A polite, timely nudge to a recruiter.', href: '/free-follow-up-email-writer' },
  { title: 'LinkedIn Headline Builder', body: 'Headline options grounded in your saved profile.', href: '/free-linkedin-headline-builder' },
];

function Tick() {
  return (
    <span className="jl-tick" aria-hidden="true">
      <IconCheck size={13} />
    </span>
  );
}

export function JobletTools() {
  return (
    <section className="jl-sec" id="tools">
      <div className="jl-shell">
        <div className="jl-sec-head center" data-animate>
          <span className="jl-kicker">Free career tools</span>
          <h2>Try the workflow before you pay.</h2>
          <p>Ten focused tools to move your search forward. Every generated result is grounded in your profile or in the job text you provide.</p>
        </div>
        <div className="jl-tools-grid">
          {TOOLS.map((t, i) => (
            <Link className="jl-tool" href={t.href} key={t.title} data-animate data-animate-delay={i * 50}>
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
    <section className="jl-sec tint" id="problem">
      <div className="jl-shell pastor-split">
        <div className="jl-sec-head" data-animate>
          <span className="jl-kicker">Problem</span>
          <h2>You are working harder than any job search should require.</h2>
        </div>
        <div className="pastor-copy" data-animate data-animate-delay="90">
          <p>The average job seeker spends hours every week copying the same work history into different formats, reading job descriptions that turn out to be irrelevant, and writing cover letters when their energy is already gone.</p>
          <p>For all that effort, most applications disappear into the void. No reply. No feedback. Just silence.</p>
          <p>This is not a personal failure. The system is broken. Job boards are crowded with outdated listings, filled roles, and noisy opportunities. ATS systems can reject qualified candidates before a human ever reads their name.</p>
          <p>You are not losing because you are not good enough. You are losing because the process itself is designed to wear you down.</p>
        </div>
      </div>
    </section>
  );
}

export function JobletPricing() {
  return (
    <section className="jl-sec" id="amplify">
      <div className="jl-shell pastor-split reverse">
        <div className="jl-sec-head" data-animate>
          <span className="jl-kicker">Amplify</span>
          <h2>Every week you wait is another week of missed opportunity.</h2>
        </div>
        <div className="pastor-copy" data-animate data-animate-delay="90">
          <p>The role you were perfect for may close before you reach it. Not because you were not qualified. Because you ran out of time and energy before you could prepare the application properly.</p>
          <p>Meanwhile, the candidates who build momentum are not always more talented. They often just have a better process.</p>
          <p>The longer a search drags on, the harder it becomes. Confidence erodes. Your energy drops. The gap between effort and feedback starts to feel personal.</p>
          <p>There is a compounding cost to a slow job search, and most people do not see it until months have passed.</p>
        </div>
      </div>
    </section>
  );
}

const BEFORE = [
  'Hours each week on manual searching',
  'Generic CVs that do not speak to the role',
  'Cover letters written when you are already tired',
  'A few roles per week at maximum effort',
  'Silence after submission, with no tracking',
];
const AFTER = [
  'Your agent works in the background',
  'Every CV is tailored using only your real experience',
  'Cover letters that match the role and stay truthful',
  'More quality applications reviewed by you',
  'One dashboard for every application and status',
];

const RESUME_HEADLINES = [
  {
    title: 'AI Experience Builder',
    body: 'Tell Jobiest what you actually did in plain English. The assistant asks useful follow-up questions and turns your real work into stronger resume bullets.',
  },
  {
    title: '50-template library',
    body: 'Choose from Minimal, Modern, Professional, Creative and Executive resume systems. Switching templates changes the presentation without losing your content.',
  },
  {
    title: 'Live preview',
    body: 'Watch your resume update as you build it. The desktop studio shows preview side by side, while mobile keeps preview one tap away.',
  },
];

export function JobletAbout() {
  return (
    <section className="jl-sec tint" id="solution">
      <div className="jl-shell">
        <div className="jl-sec-head center" data-animate>
          <span className="jl-kicker">Story and solution</span>
          <h2>We built Jobiest because we lived this problem.</h2>
          <p>Jobiest was built in Lagos by a team that watched talented people spend months stuck in a job search that was eating their time and confidence.</p>
        </div>
        <div className="pastor-copy wide" data-animate data-animate-delay="80">
          <p>The solution was not another job board. It was an agent.</p>
          <p>Jobiest connects to verified ATS sources, scores listings against your actual profile, writes personalized CVs and cover letters from your verified history, and prepares applications for your approval.</p>
          <p>No invention. No embellishment. No application leaves without your explicit say-so.</p>
          <p>The job search does not have to cost you this much. It has to be done smarter.</p>
        </div>
        <div className="resume-headlines-grid">
          {RESUME_HEADLINES.map((item, i) => (
            <div className="resume-headline-card" key={item.title} data-animate data-animate-delay={110 + i * 70}>
              <span>Resume Studio</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function JobletMission() {
  return (
    <section className="jl-sec" id="transformation">
      <div className="jl-shell">
        <div className="jl-sec-head center" data-animate>
          <span className="jl-kicker">Transformation</span>
          <h2>What your search looks like with Jobiest.</h2>
        </div>
        <div className="pastor-before-after">
          <div className="pastor-list-card" data-animate>
            <h3>Before Jobiest</h3>
            <ul>{BEFORE.map((item) => <li key={item}><Tick />{item}</li>)}</ul>
          </div>
          <div className="pastor-list-card featured" data-animate data-animate-delay="90">
            <h3>After Jobiest</h3>
            <ul>{AFTER.map((item) => <li key={item}><Tick />{item}</li>)}</ul>
          </div>
        </div>
        <p className="pastor-shift" data-animate data-animate-delay="160">
          You stop being a job seeker who manually produces applications. You become a professional who reviews and approves the best opportunities your agent surfaces.
        </p>
      </div>
    </section>
  );
}

export function JobletFaq() {
  return (
    <>
      <section className="jl-sec tint" id="offer">
        <div className="jl-shell">
          <div className="jl-sec-head center" data-animate>
            <span className="jl-kicker">Offer</span>
            <h2>Start free. Upgrade when the agent proves its value.</h2>
            <p>The free tier is permanent. Paid plans add more document volume, approved automation, priority processing, and support.</p>
          </div>
          <div className="jl-plans four">
            <div className="jl-plan" data-animate>
              <h3>Free</h3>
              <div className="jl-price">₦0<small> /month</small></div>
              <ul>
                <li><Tick />3 AI documents total</li>
                <li><Tick />10 career tool uses per day</li>
                <li><Tick />CV builder and ATS scanner</li>
                <li><Tick />Job matching and dashboard</li>
              </ul>
              <Link className="jl-btn-outline jl-plan-cta" href="/signup" style={{ textAlign: 'center' }}>Get Started Free</Link>
            </div>
            <div className="jl-plan" data-animate data-animate-delay="70">
              <h3>Basic</h3>
              <div className="jl-price">₦5,000<small> /month</small></div>
              <ul>
                <li><Tick />Everything in Free</li>
                <li><Tick />3 AI documents per day</li>
                <li><Tick />2 agent-mode trial applications</li>
                <li><Tick />50 tool uses per day</li>
              </ul>
              <Link className="jl-btn-outline jl-plan-cta" href="/signup" style={{ textAlign: 'center' }}>Choose Basic</Link>
            </div>
            <div className="jl-plan featured" data-animate data-animate-delay="140">
              <h3>Premium</h3>
              <div className="jl-price">₦10,000<small> /month</small></div>
              <ul>
                <li><Tick />Everything in Basic</li>
                <li><Tick />10 AI documents per day</li>
                <li><Tick />10 auto-apply slots per day</li>
                <li><Tick />Unlimited career tools</li>
              </ul>
              <Link className="jl-btn-solid jl-plan-cta" href="/signup" style={{ textAlign: 'center' }}>Choose Premium</Link>
            </div>
            <div className="jl-plan" data-animate data-animate-delay="210">
              <h3>Max</h3>
              <div className="jl-price">₦20,000<small> /month</small></div>
              <ul>
                <li><Tick />Everything in Premium</li>
                <li><Tick />20 AI documents per day</li>
                <li><Tick />20 auto-apply slots per day</li>
                <li><Tick />Human-reviewed applications</li>
              </ul>
              <Link className="jl-btn-outline jl-plan-cta" href="/signup" style={{ textAlign: 'center' }}>Choose Max</Link>
            </div>
          </div>
          <p className="jl-trial-note" data-animate data-animate-delay="240">Start free with no card. Upgrade only when the workflow is worth it.</p>
        </div>
      </section>

      <section className="jl-sec" id="response">
        <div className="jl-shell pastor-response" data-animate>
          <span className="jl-kicker">Response</span>
          <h2>One step. That is all it takes to change how your search works.</h2>
          <p>Fill in your name, email, and password. No credit card. No lengthy questionnaire before you see what the platform can do. Your agent starts becoming useful as soon as your profile is complete.</p>
          <div className="jl-hero-cta">
            <Link className="jl-btn-solid" href="/signup">Get Started Free</Link>
            <Link className="jl-btn-outline" href="/blog">Read the blog</Link>
          </div>
          <p className="jl-live-note">Takes about 90 seconds to start. No card required. Cancel anytime.</p>
        </div>
      </section>

      <section className="jl-sec tint" id="trust">
        <div className="jl-shell">
          <div className="jl-sec-head center" data-animate>
            <span className="jl-kicker">Trust</span>
            <h2>Honest by design. Yours by default.</h2>
          </div>
          <div className="jl-about-grid">
            {[
              { icon: IconDocument, title: 'Only your verified facts', body: 'Nothing is invented. Every CV, cover letter, and answer draws from information you provide and confirm.' },
              { icon: IconCheck, title: 'You approve everything', body: 'Approval mode is on by default. No application leaves without your explicit say-so.' },
              { icon: IconShield, title: 'No inbox access', body: 'We never read your email. You bring an application address; we never touch your mailbox.' },
              { icon: IconBolt, title: 'Permanent records', body: 'Every application is logged with a timestamp. You always know what was sent, when, and where.' },
            ].map((a, i) => (
              <div className="jl-about" key={a.title} data-animate data-animate-delay={i * 70}>
                <span className="jl-about-ico"><a.icon size={20} /></span>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="jl-sec" id="faq">
        <div className="jl-shell jl-faq-wrap">
          <div className="jl-sec-head center" data-animate>
            <span className="jl-kicker">FAQ</span>
            <h2>Questions, answered.</h2>
            <p>Straight answers about how Jobiest works, what it costs, and how your data is protected.</p>
          </div>
          <FAQ />
        </div>
      </section>
    </>
  );
}
