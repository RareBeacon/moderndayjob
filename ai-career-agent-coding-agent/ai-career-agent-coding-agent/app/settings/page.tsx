import Link from 'next/link';
import { AppShell } from '@/components/site/AppShell';
import { SignOutCard } from '@/components/settings/SignOutCard';
import { MfaManager } from '@/components/settings/MfaManager';

/**
 * Settings (Profile -> Settings): account actions, security, support.
 * Server component shell; the interactive cards are client islands.
 */
export const metadata = { title: 'Settings - Jobiest' };

export default function SettingsPage() {
  return (
    <AppShell active="settings" title="Settings">
      <section className="workspace-hero">
        <p className="eyebrow">SETTINGS</p>
        <h1>Settings</h1>
        <p>Account, security and support for your Jobiest account.</p>
      </section>

      <h2 className="settings-section">Security</h2>
      <MfaManager />
      <div className="settings-card">
        <div className="settings-card-head">
          <div>
            <strong>Password</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
              Forgot your password or want a new one? We email a reset link.
            </p>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Link className="btn-ghost" href="/login?reset=1" style={{ textDecoration: 'none' }}>
            Reset my password
          </Link>
        </div>
      </div>

      <h2 className="settings-section">Support</h2>
      <div className="settings-card">
        <div className="settings-card-head">
          <div>
            <strong>Contact Support</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
              Account, jobs, CV, applications, AI agent or payments: a real person replies.
            </p>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="btn" href="/support" style={{ textDecoration: 'none' }}>
            Contact Support
          </Link>
          <a className="btn-ghost" href="mailto:support@jobiest.com" style={{ textDecoration: 'none' }}>
            support@jobiest.com
          </a>
        </div>
      </div>

      <h2 className="settings-section">Account</h2>
      <SignOutCard />
    </AppShell>
  );
}
