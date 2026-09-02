import Link from 'next/link';
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
        <Link href="/" className="logo center" aria-label="Jobiest home">
          <span className="dot" aria-hidden="true">M</span>
          Jobiest
        </Link>
        <h1>{title}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
        {children}
      </div>
    </main>
  );
}
