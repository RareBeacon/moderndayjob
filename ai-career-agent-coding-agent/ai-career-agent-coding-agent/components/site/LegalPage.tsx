import type { ReactNode } from 'react';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { getUser } from '@/lib/auth';
import styles from '@/app/marketing.module.css';

/** Shared shell for legal pages (Terms, Privacy, Refund) and Contact. Uses the
 *  redesigned marketing shell (header + footer) and renders prose in a readable column. */
export async function LegalPage({ title, updated, kicker = 'Legal', children }: { title: string; updated?: string; kicker?: string; children: ReactNode }) {
  const user = await getUser();
  return (
    <MarketingShell authenticated={!!user}>
      <main className={styles.page} id="main">
        <section className={styles.section}>
          <div className={`${styles.container} jl-legal`} style={{ maxWidth: 820 }}>
            <p className={styles.eyebrow}>{kicker}</p>
            <h1>{title}</h1>
            {updated && <p className="jl-legal-updated">Last updated: {updated}</p>}
            {children}
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
