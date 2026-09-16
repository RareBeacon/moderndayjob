import type { Metadata } from 'next';
import { SupportForm } from '@/components/support/SupportForm';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';

/**
 * Central support destination: pick a category, describe the issue, and the
 * message goes to the Jobiest support inbox (reply-to preserved). Public:
 * works logged-out too, because login trouble is a support category.
 */
export const metadata: Metadata = {
  title: 'Contact Support - Jobiest',
  description: 'How can we help? Account and login, jobs, CV and resume, applications, AI agent, payments and subscriptions.',
};

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

export default function SupportPage() {
  return (
    <>
      <JobletNavbar />
      <main className="jl-page">
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px 72px' }}>
          <p className="jl-eyebrow">SUPPORT</p>
          <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 38px)', letterSpacing: '-0.03em', margin: '8px 0 10px' }}>
            How can we help?
          </h1>
          <p className="muted" style={{ fontSize: 16.5, maxWidth: '52ch' }}>
            Pick what your message is about, tell us what happened, and a real person replies to your email. You can
            also write to <a href="mailto:support@jobiest.com">support@jobiest.com</a> directly.
          </p>
          <SupportForm categories={CATEGORIES} />
        </div>
      </main>
      <JobletFooter />
    </>
  );
}
