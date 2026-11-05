import Link from 'next/link';
import { Logo } from './Logo';
import type { ReactNode } from 'react';

export function AuthShell({
  title,
  subtitle,
  children,
  variant = 'centered',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  variant?: 'centered' | 'signup';
}) {
  const isSignup = variant === 'signup';
  return (
    <main className={`auth-page${isSignup ? ' auth-page-signup' : ' auth-page-login'}`}>
      {isSignup && (
        <aside className="auth-promo" aria-label="Jobiest account benefits">
          <Link href="/" aria-label="Jobiest home" className="auth-promo-brand">
            <Logo variant="dark" className="auth-promo-logo" size={24} />
          </Link>
          <div className="auth-promo-copy">
            <h2>
              Make your<br />
              <span>next application</span><br />
              count.
            </h2>
            <p>Create your profile once. Prepare role-specific applications from your real experience.</p>
            <ul className="auth-promo-checklist">
              <li>
                <span className="auth-check-icon" aria-hidden="true">✓</span>
                <span>3 free tailored documents included</span>
              </li>
              <li>
                <span className="auth-check-icon" aria-hidden="true">✓</span>
                <span>Every draft stays editable</span>
              </li>
              <li>
                <span className="auth-check-icon" aria-hidden="true">✓</span>
                <span>Nothing is sent without your approval</span>
              </li>
            </ul>
          </div>
          <div className="auth-promo-orbit" aria-hidden="true">
            <div className="auth-promo-orbit-inner" />
          </div>
        </aside>
      )}
      <div className="auth-main">
        <div className={`auth-card${isSignup ? ' auth-card-signup' : ''}`}>
          {!isSignup && (
            <Link href="/" aria-label="Jobiest home" className="auth-brand">
              <Logo className="auth-logo" size={22} />
            </Link>
          )}
          <h1>{title}</h1>
          {subtitle ? <p className="sub">{subtitle}</p> : null}
          {children}
        </div>
      </div>
    </main>
  );
}
