import type { ReactNode } from 'react';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';

/** Shared shell for legal pages (Terms, Privacy, Refund) and Contact. Keeps
 *  the public navbar + footer and renders prose in a readable column. */
export function LegalPage({ title, updated, kicker = 'Legal', children }: { title: string; updated?: string; kicker?: string; children: ReactNode }) {
  return (
    <div className="jl-page">
      <JobletNavbar />
      <main id="main">
        <section className="jl-sec">
          <div className="jl-shell jl-legal">
            <span className="jl-kicker">{kicker}</span>
            <h1>{title}</h1>
            {updated && <p className="jl-legal-updated">Last updated: {updated}</p>}
            {children}
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
