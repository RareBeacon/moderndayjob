import Link from 'next/link';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container row">
        <div className="footer-brand">
          <Link href="/" className="logo" aria-label="ModernJob home">
            <span className="dot" aria-hidden="true">M</span>
            ModernJob
          </Link>
          <p className="muted" style={{ marginTop: 12, maxWidth: '36ch', fontSize: 14 }}>
            Your AI career agent. Find roles, prepare truthful applications, and track every application in one place.
          </p>
          <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>© {year} ModernJob. All rights reserved.</p>
        </div>
        <div className="cols">
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link href="/#features">Features</Link></li>
              <li><Link href="/#how">How it works</Link></li>
              <li><Link href="/#pricing">Pricing</Link></li>
              <li><Link href="/signup">Get started</Link></li>
            </ul>
          </div>
          <div>
            <h4>Account</h4>
            <ul>
              <li><Link href="/login">Sign in</Link></li>
              <li><Link href="/signup">Create account</Link></li>
              <li><Link href="/billing">Plans</Link></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><Link href="/">Privacy</Link></li>
              <li><Link href="/">Terms</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
