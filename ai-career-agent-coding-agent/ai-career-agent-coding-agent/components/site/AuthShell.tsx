import Link from 'next/link';
import { Logo } from './Logo';
import type { ReactNode } from 'react';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" aria-label="Jobiest home" style={{ textDecoration: 'none' }}>
          <Logo className="logo center" />
        </Link>
        <h1>{title}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
        {children}
      </div>
    </main>
  );
}
