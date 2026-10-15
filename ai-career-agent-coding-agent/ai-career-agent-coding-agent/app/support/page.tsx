import type { Metadata } from 'next';
import { getUser } from '@/lib/auth';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { SupportForm } from '@/components/support/SupportForm';
import { marketingMetadata } from '@/components/marketing/metadata';
import styles from '../marketing.module.css';

export const metadata: Metadata = marketingMetadata({
  title: 'Contact Support',
  description: 'How can we help? Account and login, jobs, CV and resume, applications, AI agent, payments and subscriptions.',
  path: '/support',
});

const CATEGORIES = [
  'Account & Login',
  'Jobs',
  'CV & Resume',
  'Applications',
  'AI Agent',
  'Payments & Subscription',
  'Technical Issue',
  'Other',
];

/**
 * Central support destination: pick a category, describe the issue, and the
 * message goes to the Jobiest support inbox (reply-to preserved). Public:
 * works logged-out too, because login trouble is a support category.
 */
export default async function SupportPage() {
  const user = await getUser();
  return (
    <MarketingShell activePath="/support" authenticated={!!user}>
      <main className={styles.page} id="main">
        <header className={styles.pageHero} data-animate>
          <div className={styles.container}>
            <p className={styles.eyebrow}>Support</p>
            <h1>How can we help?</h1>
            <p className={styles.pageLead}>
              Pick what your message is about, tell us what happened, and a real person replies to your email. You can
              also write to support@jobiest.com directly.
            </p>
          </div>
        </header>
        <section className={styles.section} data-animate>
          <div className={styles.container} style={{ maxWidth: 720 }}>
            <SupportForm categories={CATEGORIES} />
            <p className={styles.helperNote} style={{ marginTop: 16, fontSize: 14, color: 'var(--color-muted, #5D6B85)' }}>
              Prefer email? Write to <a href="mailto:support@jobiest.com">support@jobiest.com</a> and the same person will answer.
            </p>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
