import {
  IconBolt,
  IconShield,
  IconUsers,
  IconBriefcase,
  IconChart,
  IconArrowRight,
} from './Icons';
import { JobletSearch } from './JobletSearch';

const FLOATS = [
  { icon: IconBriefcase, title: 'Remote Jobs', sub: 'Work from anywhere' },
  { icon: IconChart, title: 'Career Growth', sub: 'Build your future' },
  { icon: IconUsers, title: 'Top Employers', sub: 'Leading companies' },
];

/** Hand-drawn yellow underline beneath "Your Future". */
function HandUnderline() {
  return (
    <svg viewBox="0 0 220 22" fill="none" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M4 15 C 40 6, 80 16, 110 12 S 180 6, 216 10"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Small yellow hand-drawn strokes near the hero person. */
function Scribbles() {
  return (
    <svg viewBox="0 0 60 40" fill="none" aria-hidden="true">
      <path d="M3 12 C 16 4, 30 18, 40 8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M8 24 C 20 18, 30 30, 44 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M4 33 C 14 28, 22 36, 34 30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function JobletHero({ liveTotal, liveSources }: { liveTotal: number; liveSources: string[] }) {
  return (
      <div className="jl-shell jl-hero-grid">
        {/* Left content */}
        <div>
          <span className="jl-eyebrow">
            <span className="jl-dot" aria-hidden="true" />
            Your next opportunity is here
          </span>

          <h1 className="jl-headline">
            Find a Job That
            <br />
            Fits{' '}
            <span className="jl-hl-yellow">
              Your Future
              <HandUnderline />
            </span>
          </h1>

          <p className="jl-sub">
            Jobiest connects talented people with great companies. Search, apply,
            and take the next step in your career — faster and easier.
          </p>

          {/* Search — connects to the real job browser at /jobs */}
          <JobletSearch />

          <div className="jl-trust">
            <span className="jl-trust-item"><IconBolt size={17} /> Verified job listings</span>
            <span className="jl-trust-item"><IconShield size={17} /> Safe &amp; secure platform</span>
            <span className="jl-trust-item"><IconUsers size={17} /> You stay in control</span>
          </div>

          {liveTotal > 0 && (
            <p className="jl-live-note">
              {liveTotal.toLocaleString()} live listings right now
              {liveSources.length > 0 ? ` from ${liveSources.join(', ')}` : ''}.
            </p>
          )}
        </div>

        {/* Right visual */}
        <div className="jl-visual">
          <span className="jl-circle" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="jl-person"
            src="/images/hero-person.jpg"
            alt="A smiling professional reviewing roles on her laptop"
            width={1408}
            height={768}
            fetchPriority="high"
          />
          <span className="jl-scribbles" aria-hidden="true"><Scribbles /></span>

          <div className="jl-float" aria-label="Highlights">
            {FLOATS.map((f) => (
              <div className="jl-float-card" key={f.title}>
                <span className="jl-float-ico"><f.icon size={20} /></span>
                <span>
                  <b>{f.title}</b>
                  <span>{f.sub}</span>
                </span>
                <span className="jl-float-arrow"><IconArrowRight /></span>
              </div>
            ))}
          </div>

          <span className="jl-dream" aria-hidden="true">
            Dream
            <br />
            Apply
            <br />
            Grow
            <svg viewBox="0 0 120 12" fill="none" preserveAspectRatio="none">
              <path d="M3 8 C 30 3, 70 10, 117 5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </span>
        </div>
      </div>
  );
}
