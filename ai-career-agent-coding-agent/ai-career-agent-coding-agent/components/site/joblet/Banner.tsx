import Link from 'next/link';

/** Navy closing banner: tagline plus the one clear action. */
export function JobletBanner() {
  return (
    <section className="jl-banner" aria-label="Get started with Jobiest">
      <svg className="jl-banner-wave" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0,40 C 240,80 480,0 720,20 C 960,40 1200,10 1440,34 L1440,0 L0,0 Z"
          fill="currentColor"
        />
      </svg>
      <div className="jl-shell jl-banner-inner">
        <span className="jl-banner-line" aria-hidden="true" />
        <span className="jl-banner-text">
          Jobiest <b>—</b> More than just jobs.
        </span>
        <span className="jl-banner-line" aria-hidden="true" />
        <Link className="jl-btn-solid" href="/signup">Start your job search</Link>
      </div>
    </section>
  );
}
