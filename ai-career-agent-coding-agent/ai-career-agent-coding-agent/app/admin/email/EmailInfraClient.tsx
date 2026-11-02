'use client';

import { useState } from 'react';
import type { DomainDnsCheckItem, EmailProviderId, EmailProviderStatus } from '@/lib/email/transport';

interface MailboxInfo {
  address: string;
  purpose: string;
  aliases: readonly string[] | string[];
  quotaGb: number;
}

interface Props {
  isOwner: boolean;
  ownerEmail: string;
  stalwartApiConnected: boolean;
  initialInfrastructure: {
    strategy: string;
    fallbackEnabled: boolean;
    activeChain: EmailProviderId[];
    estimatedFreeMonthlyCapacity: number;
    totalFailovers: number;
    providers: EmailProviderStatus[];
  };
  initialDnsChecks: DomainDnsCheckItem[];
  mailboxes: readonly MailboxInfo[] | MailboxInfo[];
  webmailUrl: string;
  mailAdminUrl: string;
}

export function EmailInfraClient({
  isOwner,
  ownerEmail,
  stalwartApiConnected,
  initialInfrastructure,
  initialDnsChecks,
  mailboxes,
  webmailUrl,
  mailAdminUrl,
}: Props) {
  const [infra, setInfra] = useState(initialInfrastructure);
  const [dnsChecks, setDnsChecks] = useState(initialDnsChecks);
  const [refreshing, setRefreshing] = useState(false);

  const [smtpCheck, setSmtpCheck] = useState<{
    loading: boolean;
    result: null | { ok: boolean; detail: string; latencyMs: number; host: string | null; port: number | null };
  }>({ loading: false, result: null });

  const [recipient, setRecipient] = useState(ownerEmail || 'philip@jobiest.com');
  const [preferredProvider, setPreferredProvider] = useState<'auto' | EmailProviderId>('auto');
  const [testState, setTestState] = useState<{
    loading: boolean;
    message: string | null;
    tone: 'ok' | 'err' | null;
  }>({ loading: false, message: null, tone: null });

  const [staffLocalPart, setStaffLocalPart] = useState('');
  const [staffDisplayName, setStaffDisplayName] = useState('');
  const [staffQuotaGb, setStaffQuotaGb] = useState(2);
  const [staffCustomPw, setStaffCustomPw] = useState('');
  const [mailboxState, setMailboxState] = useState<{
    loading: boolean;
    error: string | null;
    copied: boolean;
    created: null | {
      mode: 'live_api' | 'cli_command_ready';
      action: string;
      email: string;
      displayName: string;
      quotaGb: number;
      initialPassword: string;
      webmailUrl: string;
      imapHost: string;
      imapPort: number;
      smtpHost: string;
      smtpPort: number;
      cliCommand: string;
    };
  }>({ loading: false, error: null, copied: false, created: null });

  async function handleProvisionMailbox(e: React.FormEvent) {
    e.preventDefault();
    setMailboxState({ loading: true, error: null, copied: false, created: null });
    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'provision_mailbox',
          localPart: staffLocalPart,
          displayName: staffDisplayName,
          quotaGb: staffQuotaGb,
          password: staffCustomPw.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok && json.mailbox) {
        setMailboxState({ loading: false, error: null, copied: false, created: json.mailbox });
        setStaffCustomPw('');
      } else {
        setMailboxState({
          loading: false,
          error: json.message ?? json.error ?? 'Failed to provision staff mailbox.',
          copied: false,
          created: null,
        });
      }
    } catch (err) {
      setMailboxState({
        loading: false,
        error: err instanceof Error ? err.message : 'Network error',
        copied: false,
        created: null,
      });
    }
  }

  async function refreshStatus() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/email', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.infrastructure) setInfra(json.infrastructure);
        if (json.dnsChecks) setDnsChecks(json.dnsChecks);
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function runSmtpVerify() {
    setSmtpCheck({ loading: true, result: null });
    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_smtp' }),
      });
      const json = await res.json();
      if (json.verify) {
        setSmtpCheck({ loading: false, result: json.verify });
      } else {
        setSmtpCheck({
          loading: false,
          result: { ok: false, detail: json.error ?? 'Verification failed', latencyMs: 0, host: null, port: null },
        });
      }
    } catch (err) {
      setSmtpCheck({
        loading: false,
        result: {
          ok: false,
          detail: err instanceof Error ? err.message : 'Network error',
          latencyMs: 0,
          host: null,
          port: null,
        },
      });
    }
  }

  async function runDiagnosticSend(e: React.FormEvent) {
    e.preventDefault();
    setTestState({ loading: true, message: null, tone: null });
    try {
      const res = await fetch('/api/admin/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_test',
          recipient,
          ...(preferredProvider !== 'auto' ? { preferredProvider } : {}),
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setTestState({
          loading: false,
          tone: 'ok',
          message: `Delivered via '${json.provider}' (attempted: ${(json.attemptedProviders ?? []).join(' -> ')})${json.id ? ` · ID: ${json.id}` : ''}`,
        });
        await refreshStatus();
      } else {
        setTestState({
          loading: false,
          tone: 'err',
          message: json.message ?? json.error ?? 'Test send failed.',
        });
      }
    } catch (err) {
      setTestState({
        loading: false,
        tone: 'err',
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  const badgeColor = (status: 'pass' | 'warn' | 'missing') => {
    if (status === 'pass') return { bg: 'rgba(16, 185, 129, 0.14)', fg: '#047857', label: 'READY' };
    if (status === 'warn') return { bg: 'rgba(245, 158, 11, 0.16)', fg: '#b45309', label: 'STAGING / OPTIONAL' };
    return { bg: 'rgba(239, 68, 68, 0.14)', fg: '#b91c1c', label: 'MISSING' };
  };

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* Top KPI Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 14,
        }}
      >
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Monthly Infrastructure Cost</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>$0.00 / mo</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            OCI Always Free + Free Relay Pool
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Active Failover Chain</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
            {infra.activeChain.length > 0 ? infra.activeChain.join(' -> ') : 'None configured'}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            Strategy: <code>{infra.strategy}</code> · Auto-failover: {infra.fallbackEnabled ? 'ON' : 'OFF'}
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Free Transactional Capacity</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {infra.estimatedFreeMonthlyCapacity.toLocaleString()} / mo
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            Up to 12,000/mo when Brevo + Resend active
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Self-Hosted @jobiest.com Mailboxes</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>Unlimited</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            <a href={webmailUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
              Webmail ↗
            </a>{' '}
            ·{' '}
            <a href={mailAdminUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
              Stalwart Admin ↗
            </a>
          </div>
        </div>
      </div>

      {/* Transport Providers Table */}
      <div className="panel" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 17, margin: 0 }}>Outbound Transport Chain &amp; Runtime Telemetry</h2>
            <p style={{ fontSize: 13, opacity: 0.78, margin: '4px 0 0' }}>
              Automatic failover ensures signup OTPs, welcome letters, and security alerts still deliver if any single free tier hits its daily cap.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={refreshStatus} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Telemetry & DNS'}
          </button>
        </div>

        <div className="ad-scroll">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Transport</th>
                <th>Status</th>
                <th>Free Capacity</th>
                <th>Endpoint</th>
                <th>Default Sender</th>
                <th>Warm Sent / Fail</th>
              </tr>
            </thead>
            <tbody>
              {infra.providers.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.label}</strong>
                    <div className="ad-mono" style={{ fontSize: 11, opacity: 0.7 }}>{p.id}</div>
                  </td>
                  <td>
                    <span
                      className="ad-chip"
                      style={{
                        background: p.configured ? 'rgba(16, 185, 129, 0.14)' : 'rgba(148, 163, 184, 0.18)',
                        color: p.configured ? '#047857' : 'inherit',
                      }}
                    >
                      {p.configured ? 'CONFIGURED' : 'STANDBY'}
                    </span>
                  </td>
                  <td>
                    {p.monthlyFreeCapacity === 'unlimited_self_hosted'
                      ? 'Unlimited local + relay'
                      : `${p.monthlyFreeCapacity.toLocaleString()}/mo (${p.dailyFreeCap}/day)`}
                  </td>
                  <td className="ad-mono" style={{ fontSize: 12 }}>{p.endpointSummary}</td>
                  <td className="ad-mono" style={{ fontSize: 12 }}>{p.fromAddress}</td>
                  <td className="ad-mono">
                    {p.stats.sentCount} / {p.stats.failureCount}
                    {p.stats.lastErrorSummary && (
                      <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
                        {p.stats.lastErrorSummary}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live DNS Deliverability & Authentication Audit */}
      <div className="panel" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>Live DNS Deliverability &amp; Domain Authentication (`jobiest.com`)</h2>
        <p style={{ fontSize: 13, opacity: 0.78, margin: '0 0 12px' }}>
          Real-time DNS inspection across MX, SPF, DMARC, dual DKIM selectors (`resend._domainkey` + `mail._domainkey`), and RFC 8461 MTA-STS.
        </p>

        <div className="ad-scroll">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Hostname</th>
                <th>Status</th>
                <th>Live Records &amp; Action Guidance</th>
              </tr>
            </thead>
            <tbody>
              {dnsChecks.map((item) => {
                const badge = badgeColor(item.status);
                return (
                  <tr key={item.key}>
                    <td><strong>{item.label}</strong></td>
                    <td className="ad-mono" style={{ fontSize: 12 }}>{item.hostname}</td>
                    <td>
                      <span
                        className="ad-chip"
                        style={{ background: badge.bg, color: badge.fg, fontWeight: 600 }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                      {item.records.length > 0 && (
                        <div className="ad-mono" style={{ fontSize: 11.5, marginBottom: 4, wordBreak: 'break-all' }}>
                          {item.records.join(' | ')}
                        </div>
                      )}
                      <div style={{ opacity: 0.85 }}>{item.guidance}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Owner-Only Live SMTP Handshake & Controlled Test Send */}
      {isOwner && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          <div className="panel" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>1. Verify Self-Hosted SMTP Handshake</h2>
            <p style={{ fontSize: 13, opacity: 0.78, margin: '0 0 14px' }}>
              Tests live TCP, TLSv1.2+, and SMTP authentication against <code>SMTP_HOST</code> without sending an email.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={runSmtpVerify}
              disabled={smtpCheck.loading}
            >
              {smtpCheck.loading ? 'Verifying TLS Handshake...' : 'Verify SMTP Handshake'}
            </button>

            {smtpCheck.result && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12.5,
                  background: smtpCheck.result.ok ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                }}
              >
                <strong>{smtpCheck.result.ok ? 'Handshake OK' : 'Not Connected'}</strong>
                {smtpCheck.result.host ? ` (${smtpCheck.result.host}:${smtpCheck.result.port} · ${smtpCheck.result.latencyMs}ms)` : ''}
                <div style={{ marginTop: 4 }}>{smtpCheck.result.detail}</div>
              </div>
            )}
          </div>

          <div className="panel" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>2. Controlled Diagnostic Test Send</h2>
            <p style={{ fontSize: 13, opacity: 0.78, margin: '0 0 12px' }}>
              Restricted to your Owner email or official <code>@jobiest.com</code> mailboxes (never sends to external users).
            </p>
            <form onSubmit={runDiagnosticSend} style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <label htmlFor="diag-recipient" style={{ fontSize: 12, fontWeight: 600 }}>
                  Authorized Recipient
                </label>
                <input
                  id="diag-recipient"
                  className="input"
                  type="email"
                  required
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="philip@jobiest.com"
                />
              </div>

              <div style={{ display: 'grid', gap: 4 }}>
                <label htmlFor="diag-provider" style={{ fontSize: 12, fontWeight: 600 }}>
                  Transport Route
                </label>
                <select
                  id="diag-provider"
                  className="input"
                  value={preferredProvider}
                  onChange={(e) => setPreferredProvider(e.target.value as 'auto' | EmailProviderId)}
                >
                  <option value="auto">Automatic Failover Chain (Recommended)</option>
                  <option value="smtp">Self-Hosted Stalwart SMTP First (smtp)</option>
                  <option value="brevo">Brevo Free API First (brevo)</option>
                  <option value="resend">Resend Free API First (resend)</option>
                </select>
              </div>

              <div>
                <button type="submit" className="btn btn-primary btn-sm" disabled={testState.loading}>
                  {testState.loading ? 'Sending Diagnostic...' : 'Send Diagnostic Email'}
                </button>
              </div>

              {testState.message && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 12.5,
                    background: testState.tone === 'ok' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  }}
                >
                  {testState.message}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Owner-Only Staff @jobiest.com Mailbox Provisioner & Password Reset */}
      {isOwner && (
        <div className="panel" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>
              3. Create or Reset Staff <code>@jobiest.com</code> Business Mailbox
            </h2>
            <span
              className="ad-chip"
              style={{
                background: stalwartApiConnected ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.16)',
                color: stalwartApiConnected ? '#047857' : '#b45309',
              }}
            >
              {stalwartApiConnected ? 'LIVE STALWART API LINKED' : 'CLI / STAGING MODE'}
            </span>
          </div>
          <p style={{ fontSize: 13, opacity: 0.8, margin: '0 0 14px' }}>
            Creates a new staff <code>@jobiest.com</code> inbox or resets an existing staff member&apos;s password using salted{' '}
            <code>$scrypt$</code> hashing (plaintext passwords are never stored in Stalwart or Jobiest logs). Staff sign in to their inbox at{' '}
            <a href={webmailUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600, textDecoration: 'underline' }}>
              {webmailUrl}
            </a>
            .
          </p>

          <form
            onSubmit={handleProvisionMailbox}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <label htmlFor="staff-local" style={{ fontSize: 12, fontWeight: 600 }}>
                Staff Username (<code>@jobiest.com</code>)
              </label>
              <input
                id="staff-local"
                className="input"
                type="text"
                required
                placeholder="ada.okafor"
                value={staffLocalPart}
                onChange={(e) => setStaffLocalPart(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <label htmlFor="staff-name" style={{ fontSize: 12, fontWeight: 600 }}>
                Full Name &amp; Role
              </label>
              <input
                id="staff-name"
                className="input"
                type="text"
                required
                placeholder="Adaobi Okafor (Customer Support)"
                value={staffDisplayName}
                onChange={(e) => setStaffDisplayName(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <label htmlFor="staff-quota" style={{ fontSize: 12, fontWeight: 600 }}>
                Inbox Quota (GiB)
              </label>
              <select
                id="staff-quota"
                className="input"
                value={staffQuotaGb}
                onChange={(e) => setStaffQuotaGb(Number(e.target.value))}
              >
                <option value={1}>1 GiB</option>
                <option value={2}>2 GiB (Standard Staff)</option>
                <option value={3}>3 GiB (Team Lead)</option>
                <option value={5}>5 GiB (Executive / Support)</option>
                <option value={10}>10 GiB</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <label htmlFor="staff-pw" style={{ fontSize: 12, fontWeight: 600 }}>
                Initial Password (blank = auto-generate)
              </label>
              <input
                id="staff-pw"
                className="input"
                type="password"
                minLength={12}
                placeholder="Auto-generate 20-char secret"
                value={staffCustomPw}
                onChange={(e) => setStaffCustomPw(e.target.value)}
              />
            </div>

            <div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={mailboxState.loading}>
                {mailboxState.loading ? 'Provisioning...' : 'Create / Reset Mailbox'}
              </button>
            </div>
          </form>

          {mailboxState.error && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, fontSize: 12.5, background: 'rgba(239, 68, 68, 0.12)' }}>
              {mailboxState.error}
            </div>
          )}

          {mailboxState.created && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontSize: 12.5,
                lineHeight: 1.65,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>
                {mailboxState.created.mode === 'live_api'
                  ? `Mailbox ${mailboxState.created.action === 'CREATED' ? 'Created' : 'Password Reset'} Live on Stalwart`
                  : 'Staff Onboarding Card + 1-Line Server Command Ready'}
              </div>
              <div className="ad-mono" style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.04)', padding: 10, borderRadius: 6 }}>
                {[
                  `Staff Member    : ${mailboxState.created.displayName}`,
                  `Business Email  : ${mailboxState.created.email}`,
                  `Initial Password: ${mailboxState.created.initialPassword}  (shown once; share securely)`,
                  `Webmail Inbox   : ${mailboxState.created.webmailUrl}`,
                  `Mobile/Desktop  : IMAP ${mailboxState.created.imapHost}:${mailboxState.created.imapPort} (SSL/TLS) | SMTP ${mailboxState.created.smtpHost}:${mailboxState.created.smtpPort} (SSL/TLS)`,
                ].join('\n')}
              </div>
              {mailboxState.created.mode === 'cli_command_ready' && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600 }}>
                    Run once on your OCI Mail VM (or set <code>STALWART_API_URL=https://mail.jobiest.com</code> +{' '}
                    <code>STALWART_ADMIN_PASSWORD</code> in Vercel for instant 1-click provisioning):
                  </div>
                  <code style={{ display: 'block', marginTop: 4, padding: 8, background: 'rgba(0,0,0,0.06)', borderRadius: 6 }}>
                    {mailboxState.created.cliCommand}
                  </code>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    if (!mailboxState.created) return;
                    const text = [
                      `Welcome to Jobiest Business Email!`,
                      `Email: ${mailboxState.created.email}`,
                      `Temporary Password: ${mailboxState.created.initialPassword}`,
                      `Webmail Login Link: ${mailboxState.created.webmailUrl}`,
                      `Phone / Laptop App Settings: IMAP ${mailboxState.created.imapHost} (Port ${mailboxState.created.imapPort}, SSL/TLS) | SMTP ${mailboxState.created.smtpHost} (Port ${mailboxState.created.smtpPort}, SSL/TLS)`,
                    ].join('\n');
                    await navigator.clipboard?.writeText(text);
                    setMailboxState((prev) => ({ ...prev, copied: true }));
                  }}
                >
                  {mailboxState.copied ? 'Copied Staff Login Card!' : 'Copy Staff Login Card'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Provisioned Self-Hosted Mailboxes Directory */}
      <div className="panel" style={{ padding: 18 }}>
        <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>
          Self-Hosted `@jobiest.com` Departmental Mailboxes (`deploy/oci-mail/bootstrap-mailboxes.sh`)
        </h2>
        <p style={{ fontSize: 13, opacity: 0.78, margin: '0 0 12px' }}>
          Provisioned automatically on Oracle Cloud Always Free (`VM.Standard.E2.1.Micro`, `AD-1`) with IMAPS (`993`), Submission (`465/587`), JMAP, and SnappyMail Webmail.
        </p>

        <div className="ad-scroll">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Primary Mailbox</th>
                <th>Aliases</th>
                <th>Quota</th>
                <th>Operational Role</th>
              </tr>
            </thead>
            <tbody>
              {mailboxes.map((m) => (
                <tr key={m.address}>
                  <td className="ad-mono"><strong>{m.address}</strong></td>
                  <td className="ad-mono" style={{ fontSize: 12 }}>{m.aliases.join(', ')}</td>
                  <td>{m.quotaGb} GiB</td>
                  <td>{m.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
