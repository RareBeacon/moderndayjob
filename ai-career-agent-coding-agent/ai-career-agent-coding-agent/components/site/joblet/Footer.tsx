/** Navy site footer for the redesigned homepage. */
export function JobletFooter() {
  return (
    <footer className="jl-footer">
      <div className="jl-shell">
        <div className="jl-footer-top">
          <div className="jl-footer-brand">
            <a className="jl-brand" href="/">
              <span className="jl-brand-mark">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 16 L9 9 L13 13 L20 5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="20" cy="5" r="2.3" fill="currentColor" />
                </svg>
              </span>
              Jobiest
            </a>
            <p>The AI career agent that finds roles, prepares truthful applications, and keeps you in control.</p>
          </div>

          <div className="jl-footer-cols">
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="/#how">How it works</a></li>
                <li><a href="/#tools">Free tools</a></li>
                <li><a href="/#pricing">Pricing</a></li>
                <li><a href="/jobs">Browse jobs</a></li>
              </ul>
            </div>
            <div>
              <h4>Account</h4>
              <ul>
                <li><a href="/signup">Start free</a></li>
                <li><a href="/login">Sign in</a></li>
                <li><a href="/#faq">Help</a></li>
                <li><a href="/#about">About</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="jl-footer-bottom">
          <span>© {new Date().getFullYear()} Jobiest. All rights reserved.</span>
          <span>Built in Lagos.</span>
        </div>
      </div>
    </footer>
  );
}
