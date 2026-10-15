/** Navy site footer for the redesigned homepage. */
export function JobletFooter() {
  return (
    <footer className="jl-footer">
      <div className="jl-shell">
        <div className="jl-footer-top">
          <div className="jl-footer-brand">
            <a className="jl-brand" href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo-wordmark-dark.png" alt="Jobiest" width={124} height={34} style={{ display: 'block' }} />
            </a>
            <p>The AI career agent that finds roles, prepares truthful applications, and keeps you in control.</p>
          </div>

          <div className="jl-footer-cols">
            <div>
              <h2>Product</h2>
              <ul>
                <li><a href="/how-it-works">How it works</a></li>
                <li><a href="/tools">Free tools</a></li>
                <li><a href="/pricing">Pricing</a></li>
                <li><a href="/blog">Blog</a></li>
              </ul>
            </div>
            <div>
              <h2>Account</h2>
              <ul>
                <li><a href="/signup">Start free</a></li>
                <li><a href="/login">Sign in</a></li>
                <li><a href="/about">About</a></li>
                <li><a href="/contact">Contact</a></li>
                <li><a href="/help">Help</a></li>
              </ul>
            </div>
            <div>
              <h2>Legal</h2>
              <ul>
                <li><a href="/terms">Terms of service</a></li>
                <li><a href="/privacy">Privacy policy</a></li>
                <li><a href="/refund">Refund policy</a></li>
                <li><a href="/dpa">Data processing</a></li>
                <li><a href="/msa">Service agreement</a></li>
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
