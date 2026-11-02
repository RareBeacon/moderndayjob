import { requireUserOrRedirect } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import {
  getEmailInfrastructureStatus,
  inspectDomainEmailDns,
  isStalwartAdminConfigured,
} from '@/lib/email/transport';
import { EmailInfraClient } from './EmailInfraClient';

export const dynamic = 'force-dynamic';

const CORE_JOBIEST_MAILBOXES = [
  { address: 'philip@jobiest.com', purpose: 'CEO & Founder executive correspondence', aliases: ['ceo@jobiest.com', 'founder@jobiest.com'], quotaGb: 5 },
  { address: 'admin@jobiest.com', purpose: 'Platform operations, postmaster & DMARC reports', aliases: ['postmaster@jobiest.com', 'abuse@jobiest.com', 'dmarc@jobiest.com'], quotaGb: 2 },
  { address: 'support@jobiest.com', purpose: 'Customer support & user inquiries', aliases: ['help@jobiest.com'], quotaGb: 5 },
  { address: 'hello@jobiest.com', purpose: 'General brand & community inquiries', aliases: ['info@jobiest.com', 'contact@jobiest.com'], quotaGb: 2 },
  { address: 'careers@jobiest.com', purpose: 'Founding Contributor Programme & hiring', aliases: ['jobs@jobiest.com', 'apply@jobiest.com', 'talent@jobiest.com'], quotaGb: 3 },
  { address: 'partnerships@jobiest.com', purpose: 'US/UK employer & agency partnerships', aliases: ['partners@jobiest.com', 'employers@jobiest.com', 'bd@jobiest.com'], quotaGb: 3 },
  { address: 'finance@jobiest.com', purpose: 'Billing, vendor & corporate finance', aliases: ['billing@jobiest.com', 'invoices@jobiest.com'], quotaGb: 2 },
  { address: 'privacy@jobiest.com', purpose: 'NDPA / GDPR Data Protection & security', aliases: ['dpo@jobiest.com', 'legal@jobiest.com', 'security@jobiest.com'], quotaGb: 2 },
  { address: 'no-reply@jobiest.com', purpose: 'Automated transactional SMTP sender', aliases: ['notifications@jobiest.com'], quotaGb: 1 },
] as const;

export default async function AdminEmailInfrastructurePage() {
  const user = await requireUserOrRedirect('/admin/email');

  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id, role, is_owner, is_active, permissions')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!admin || admin.is_active === false) return <AdminForbidden />;

  const isOwner = Boolean(admin.is_owner) || admin.role === 'OWNER';
  const perms = (admin.permissions ?? {}) as Record<string, boolean>;
  if (!isOwner && !perms.can_view_security && admin.role !== 'SUB_ADMIN') {
    return <AdminForbidden />;
  }

  const [infrastructure, dnsChecks] = await Promise.all([
    Promise.resolve(getEmailInfrastructureStatus()),
    inspectDomainEmailDns('jobiest.com'),
  ]);

  return (
    <AdminShell active="email">
      <h1 className="ad-h1">Self-Hosted Email &amp; Multi-Transport Infrastructure</h1>
      <p className="ad-lede">
        Zero-cost (`$0.00/mo`) corporate mailbox stack (`Stalwart + SnappyMail + Caddy` on Oracle Cloud Always Free)
        paired with automatic multi-provider failover (`Self-Hosted SMTP -&gt; Brevo Free -&gt; Resend Free`).
      </p>

      <EmailInfraClient
        isOwner={isOwner}
        ownerEmail={user.email ?? ''}
        stalwartApiConnected={isStalwartAdminConfigured()}
        initialInfrastructure={infrastructure}
        initialDnsChecks={dnsChecks}
        mailboxes={CORE_JOBIEST_MAILBOXES}
        webmailUrl="https://webmail.jobiest.com"
        mailAdminUrl="https://mail.jobiest.com"
      />
    </AdminShell>
  );
}
