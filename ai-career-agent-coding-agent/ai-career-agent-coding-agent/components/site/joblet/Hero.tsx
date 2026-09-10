import Link from 'next/link';
import {
  IconBolt,
  IconShield,
  IconUsers,
  IconBriefcase,
  IconChart,
} from './Icons';

const FLOATS = [
  { icon: IconBriefcase, title: 'Remote Jobs', sub: 'Work from anywhere' },
  { icon: IconChart, title: 'Career Growth', sub: 'Build your future' },
  { icon: IconUsers, title: 'Top Employers', sub: 'Leading companies' },
];

/** Hand-drawn yellow underline beneath "career agent". */
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
          <span className="jl-eyebrow" data-animate>
            <span className="jl-dot" aria-hidden="true" />
            Your AI career agent
          </span>

          <h1 className="jl-headline" data-animate data-animate-delay="70">
            Your AI
            <br />
            <span className="jl-hl-yellow">
              career agent
              <HandUnderline />
            </span>
          </h1>

          <p className="jl-sub" data-animate data-animate-delay="140">
            Find the right jobs. Build stronger applications. Apply with confidence.
            Jobiest finds opportunities that fit your profile, prepares tailored
            applications from your verified experience, and lets you approve
            everything before it goes out.
          </p>

          {/* Primary journey: one clear action, one secondary */}
          <div className="jl-hero-cta" data-animate data-animate-delay="210">
            <Link className="jl-btn-solid jl-hero-primary" href="/signup">Start your job search</Link>
            <Link className="jl-btn-outline jl-hero-secondary" href="/jobs">Explore jobs</Link>
          </div>

          <div className="jl-trust" data-animate data-animate-delay="280">
            <span className="jl-trust-item"><IconBolt size={17} /> Verified job listings</span>
            <span className="jl-trust-item"><IconShield size={17} /> Safe &amp; secure platform</span>
            <span className="jl-trust-item"><IconUsers size={17} /> You stay in control</span>
          </div>

          {liveTotal > 0 && (
            <p className="jl-live-note" data-animate data-animate-delay="340">
              {liveTotal.toLocaleString()} live listings right now
              {liveSources.length > 0 ? ` from ${liveSources.join(', ')}` : ''}.
            </p>
          )}
        </div>

        {/* Right visual */}
        <div className="jl-visual" data-animate data-animate-delay="160">
          <span className="jl-circle" data-parallax="0.07" aria-hidden="true" />
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
