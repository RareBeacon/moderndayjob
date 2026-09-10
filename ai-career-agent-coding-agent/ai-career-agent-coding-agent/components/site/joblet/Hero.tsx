import Link from 'next/link';
import { IconBolt, IconShield, IconUsers } from './Icons';

/** Hand-drawn yellow underline beneath the core value proposition. */
function HandUnderline() {
  return (
    <svg viewBox="0 0 260 22" fill="none" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M4 15 C 44 6, 90 16, 130 12 S 210 6, 256 10"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function JobletHero({ liveTotal, liveSources }: { liveTotal: number; liveSources: string[] }) {
  const liveCopy = liveTotal > 0
    ? `${liveTotal.toLocaleString()} live listings right now${liveSources.length > 0 ? ` from ${liveSources.join(', ')}` : ''}`
    : 'Verified sources only';

  return (
    <div className="jl-shell jl-hero-grid pastor-hero-grid">
      <div>
        <span className="jl-eyebrow" data-animate>
          <span className="jl-dot" aria-hidden="true" />
          Approval mode: nothing sends without you
        </span>

        <h1 className="jl-headline pastor-headline" data-animate data-animate-delay="70">
          Your job search is costing you
          <br />
          <span className="jl-hl-yellow">
            more than you think.
            <HandUnderline />
          </span>
        </h1>

        <p className="jl-sub" data-animate data-animate-delay="140">
          Every hour you spend rewriting CVs, tailoring cover letters, and scrolling through irrelevant listings is an hour you are not being interviewed. Jobiest ends that. Our agent finds real roles, writes truthful applications, and prepares them for your approval while you focus on getting hired.
        </p>

        <div className="jl-hero-cta" data-animate data-animate-delay="210">
          <Link className="jl-btn-solid jl-hero-primary" href="/signup">Get Started Free - No Card Required</Link>
          <Link className="jl-btn-outline jl-hero-secondary" href="/how-it-works">See how it works</Link>
        </div>

        <div className="jl-trust" data-animate data-animate-delay="280">
          <span className="jl-trust-item"><IconBolt size={17} /> {liveCopy}</span>
          <span className="jl-trust-item"><IconShield size={17} /> Verified sources only</span>
          <span className="jl-trust-item"><IconUsers size={17} /> You approve every application</span>
        </div>
      </div>

      <div className="pastor-hero-panel" data-animate data-animate-delay="160">
        <div className="pastor-panel-card primary">
          <span>Before Jobiest</span>
          <strong>Manual search, manual drafts, silent applications.</strong>
          <p>Hours disappear into tabs, rewrites, and listings that were never a strong fit.</p>
        </div>
        <div className="pastor-panel-card">
          <span>After Jobiest</span>
          <strong>An agent surfaces matches and prepares truthful applications.</strong>
          <p>You review the best opportunities, approve what fits, and track every step in one dashboard.</p>
        </div>
        <div className="pastor-proof">
          <b>{liveCopy}</b>
          <small>Greenhouse, Ashby, Lever and other verified ATS sources.</small>
        </div>
      </div>
    </div>
  );
}
