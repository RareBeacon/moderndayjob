import type { Metadata } from 'next';
import Link from 'next/link';
import { applyAdapters } from '@/lib/apply/registry';

export const metadata: Metadata = {
  title: 'Supported application systems',
  description:
    'Exactly which employer application systems Jobiest can fill and submit for you today, what it refuses to do, and why. No inflating, no fine print.',
};

/**
 * Honest supported-systems page (Milestone 4). This closes the
 * overclaim risk from the investor circulation: the list below is generated
 * from the adapter registry the engine actually loads, so it can never
 * claim a board the code does not support. The boundaries section is the
 * product's real policy, stated in plain language.
 */
export default function SupportedSystemsPage() {
  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '48px 20px' }}>
      <p className="eyebrow">HONEST SCOPE</p>
      <h1 style={{ fontSize: 34, margin: '0 0 8px' }}>What we support today</h1>
      <p style={{ fontSize: 17, color: 'var(--ink-2)' }}>
        This list is generated from the code that runs the agent. If a system is not on it, the agent will not pretend to
        apply for you there. It will still prepare your full package with a direct link, so you can submit yourself in a
        couple of clicks.
      </p>

      <section style={{ margin: '28px 0' }}>
        <h2 style={{ fontSize: 22 }}>Automatic form filling and submission</h2>
        <ul style={{ lineHeight: 1.9, fontSize: 16 }}>
          {applyAdapters.map((a) => (
            <li key={a.id}>
              <strong>{a.label}</strong> job boards (for example{' '}
              {a.domains
                .filter((d) => !d.startsWith('*.'))
                .slice(0, 2)
                .map((d) => d.replace(/^www\./, ''))
                .join(', ')}
              )
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>
          On these systems the agent fills the employer form with your prepared CV, cover letter and answers and submits
          it: after your approval by default, or automatically if you switch to the Auto send policy.
        </p>
      </section>

      <section style={{ margin: '28px 0' }}>
        <h2 style={{ fontSize: 22 }}>What we do not do</h2>
        <ul style={{ lineHeight: 1.9, fontSize: 16 }}>
          <li>No LinkedIn Easy Apply and no Indeed Apply. Their terms forbid automation, so we do not touch them.</li>
          <li>No mass submitting. Every application is prepared for a specific matching role, and you choose whether
            each send needs your approval.</li>
          <li>No board logins and no stored board passwords. We fill public employer forms only.</li>
          <li>No CAPTCHA solving, no anti-bot bypassing. When a form raises one, the application comes back to you with
            everything ready.</li>
          <li>No scraping behind logins and no invented answers. If a question is missing from your profile, the agent
            asks you instead of guessing.</li>
        </ul>
      </section>

      <section style={{ margin: '28px 0' }}>
        <h2 style={{ fontSize: 22 }}>Everything else: prepared, not submitted</h2>
        <p style={{ fontSize: 16 }}>
          For any job link you paste, on any site, the agent analyzes the role, tailors your CV, writes the cover letter
          and drafts the answers, and gives you a direct link to the form. One review, a couple of clicks, done.
        </p>
      </section>

      <p style={{ fontSize: 15 }}>
        <Link href="/pricing" className="text-button">
          See plans and monthly allowances
        </Link>
      </p>
    </main>
  );
}
