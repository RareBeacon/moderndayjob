/** Navy closing banner with a curved top edge, faithful to the reference. */
export function JobletBanner() {
  return (
    <section className="jl-banner" aria-label="Jobiest tagline">
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
      </div>
    </section>
  );
}
