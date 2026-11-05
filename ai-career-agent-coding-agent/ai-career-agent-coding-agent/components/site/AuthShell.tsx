import React, { type ReactNode } from 'react';
import Link from 'next/link';
import { Logo } from './Logo';

export function AuthShell({
  title,
  subtitle,
  children,
  variant = 'split',
  promoHeadline,
  promoSubtitle,
  promoPoints,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  variant?: 'centered' | 'signup' | 'login' | 'split';
  promoHeadline?: ReactNode;
  promoSubtitle?: string;
  promoPoints?: string[];
}) {
  const isCentered = variant === 'centered';
  const isSplit = !isCentered;

  const defaultPoints = [
    '3 free tailored documents included',
    'Every draft stays editable',
    'Nothing is sent without your approval',
  ];

  return (
    <main className={`auth-page${isSplit ? ` auth-page-split auth-page-${variant}` : ' auth-page-centered'}`}>
      {isSplit && (
        <aside className="auth-promo" aria-label="Jobiest account benefits">
          <Link href="/" aria-label="Jobiest home" className="auth-promo-brand">
            <Logo variant="dark" className="auth-promo-logo" size={24} />
          </Link>
          <div className="auth-promo-copy">
            <h2>
              {promoHeadline ?? (
                <>
                  Make your<br />
                  <span>next application</span><br />
                  count.
                </>
              )}
            </h2>
            <p>
              {promoSubtitle ??
                'Create your profile once. Prepare role-specific applications from your real experience.'}
            </p>
            <ul className="auth-promo-checklist">
              {(promoPoints ?? defaultPoints).map((point, i) => (
                <li key={i}>
                  <span className="auth-check-icon" aria-hidden="true">✓</span>
                  <span className="auth-check-text">{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="auth-promo-orbit" aria-hidden="true">
            <div className="auth-promo-orbit-inner" />
          </div>
        </aside>
      )}
      <div className="auth-main">
        <div className={`auth-card${isSplit ? ` auth-card-split auth-card-${variant}` : ''}`}>
          {isCentered && (
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
