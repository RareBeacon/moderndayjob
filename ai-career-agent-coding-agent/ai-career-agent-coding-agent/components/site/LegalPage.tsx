import type { ReactNode } from 'react';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';

/** Shared shell for legal pages (Terms, Privacy, Refund). Keeps the public
 *  navbar + footer and renders prose in a readable column. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="jl-page">
      <JobletNavbar />
      <main id="main">
        <section className="jl-sec">
          <div className="jl-shell jl-legal">
            <span className="jl-kicker">Legal</span>
            <h1>{title}</h1>
            <p className="jl-legal-updated">Last updated: {updated}</p>
            {children}
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
