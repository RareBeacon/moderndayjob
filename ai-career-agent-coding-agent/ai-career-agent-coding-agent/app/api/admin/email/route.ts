import { z } from 'zod';
import {
  requireOwnerAdmin,
  requireAdminPermission,
  appendAdminAuditLog,
  adminErrorResponse,
} from '@/lib/admin';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import {
  getEmailInfrastructureStatus,
  inspectDomainEmailDns,
  isStalwartAdminConfigured,
  provisionStalwartMailbox,
  verifySmtpConnection,
} from '@/lib/email/transport';
import { sendEmail } from '@/lib/email/resend';
import {
  composeEmail,
  emailHeading,
  emailHero,
  emailInfoCard,
  emailParagraph,
  escapeHtmlEmail,
} from '@/lib/email/templates';

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

const ALLOWED_INTERNAL_RECIPIENTS = new Set(
  CORE_JOBIEST_MAILBOXES.map((m) => m.address.toLowerCase()),
);

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('verify_smtp'),
  }),
  z.object({
    action: z.literal('send_test'),
    recipient: z.string().trim().email().max(200),
    preferredProvider: z.enum(['smtp', 'brevo', 'resend']).optional(),
  }),
  z.object({
    action: z.literal('provision_mailbox'),
    localPart: z.string().trim().min(2).max(60),
    displayName: z.string().trim().min(2).max(120),
    quotaGb: z.coerce.number().int().min(1).max(10).default(2),
    password: z.string().trim().min(12).max(128).optional().or(z.literal('')),
  }),
]);

export async function GET(req: Request) {
  const rl = await enforceRateLimit(`admin:email:get:${requestIp(req)}`, 30, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const { user, admin } = await requireAdminPermission('can_view_security', req);
    const [infrastructure, dnsChecks] = await Promise.all([
      Promise.resolve(getEmailInfrastructureStatus()),
      inspectDomainEmailDns('jobiest.com'),
    ]);

    return Response.json({
      viewer: {
        userId: admin.userId,
        role: admin.role,
        isOwner: admin.isOwner,
        email: user.email ?? '',
      },
      infrastructure,
      dnsChecks,
      stalwartApiConnected: isStalwartAdminConfigured(),
      mailboxes: CORE_JOBIEST_MAILBOXES,
      webmailUrl: 'https://webmail.jobiest.com',
      mailAdminUrl: 'https://mail.jobiest.com',
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:email:post:${requestIp(req)}`, 6, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    const { user, admin } = await requireOwnerAdmin(req);
    const raw = await req.json().catch(() => null);
    const parsed = postSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'INVALID_BODY', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.action === 'verify_smtp') {
      const verify = await verifySmtpConnection();
      await appendAdminAuditLog({
        actorUserId: admin.userId,
        actorRole: admin.role,
        action: 'EMAIL_SMTP_VERIFY',
        targetType: 'email_infrastructure',
        targetId: verify.host ?? 'unconfigured',
        afterState: {
          configured: verify.configured,
          ok: verify.ok,
          port: verify.port,
          secure: verify.secure,
          latencyMs: verify.latencyMs,
        },
        reason: 'Owner triggered live SMTP TLS handshake verification',
        req,
      });
      return Response.json({ ok: verify.ok, verify });
    }

    if (parsed.data.action === 'provision_mailbox') {
      const mailboxRes = await provisionStalwartMailbox({
        localPart: parsed.data.localPart,
        displayName: parsed.data.displayName,
        quotaGb: parsed.data.quotaGb,
        password: parsed.data.password || undefined,
      });

      // Rule #10: NEVER log passwords or password hashes into admin_audit_logs.
      await appendAdminAuditLog({
        actorUserId: admin.userId,
        actorRole: admin.role,
        action: `EMAIL_MAILBOX_${mailboxRes.action}`,
        targetType: 'staff_mailbox',
        targetId: mailboxRes.email,
        afterState: {
          mode: mailboxRes.mode,
          action: mailboxRes.action,
          email: mailboxRes.email,
          displayName: mailboxRes.displayName,
          quotaGb: mailboxRes.quotaGb,
        },
        reason: `Owner provisioned/updated @jobiest.com mailbox (${mailboxRes.email})`,
        req,
      });

      return Response.json({
        ok: true,
        mailbox: mailboxRes,
      });
    }

    // Rule #13 safety guard: never send diagnostic emails to external customer addresses.
    const recipientLower = parsed.data.recipient.toLowerCase();
    const ownerEmailLower = (user.email ?? '').trim().toLowerCase();
    const isAuthorizedRecipient =
      (ownerEmailLower.length > 0 && recipientLower === ownerEmailLower) ||
      ALLOWED_INTERNAL_RECIPIENTS.has(recipientLower);

    if (!isAuthorizedRecipient) {
      return Response.json(
        {
          error: 'RECIPIENT_NOT_AUTHORIZED_FOR_QA',
          message:
            'Diagnostic sends are restricted to your authenticated Owner email or official @jobiest.com mailboxes.',
        },
        { status: 400 },
      );
    }

    const nowUtc = new Date().toISOString();
    const requestedRoute = parsed.data.preferredProvider ?? 'auto-failover';
    const html = composeEmail(
      [
        emailHero('Email infrastructure check'),
        emailHeading('Self-hosted & multi-transport diagnostic'),
        emailParagraph(
          'This controlled diagnostic email confirms that Jobiest outbound email routing, branding templates, and domain authentication headers are operational.',
        ),
        emailInfoCard('Diagnostic metadata', [
          `<strong>Requested route:</strong> ${escapeHtmlEmail(requestedRoute)}`,
          `<strong>Recipient:</strong> ${escapeHtmlEmail(recipientLower)}`,
          `<strong>Timestamp (UTC):</strong> ${escapeHtmlEmail(nowUtc)}`,
        ]),
        emailParagraph(
          'If you have any issues or enquiry, you can reach out to us at support@jobiest.com',
          { muted: true },
        ),
      ],
      'Jobiest Email Infrastructure Diagnostic',
    );

    const text = [
      'Jobiest Email Infrastructure Diagnostic',
      '',
      `Requested route: ${requestedRoute}`,
      `Recipient: ${recipientLower}`,
      `Timestamp (UTC): ${nowUtc}`,
      '',
      'If you have any issues or enquiry, you can reach out to us at support@jobiest.com',
    ].join('\n');

    const sendRes = await sendEmail({
      to: recipientLower,
      subject: `[Jobiest Diagnostic] Outbound transport check (${requestedRoute})`,
      html,
      text,
      preferredProvider: parsed.data.preferredProvider,
      replyTo: 'support@jobiest.com',
    });

    await appendAdminAuditLog({
      actorUserId: admin.userId,
      actorRole: admin.role,
      action: 'EMAIL_DIAGNOSTIC_TEST_SEND',
      targetType: 'email_infrastructure',
      targetId: recipientLower,
      afterState: {
        ok: sendRes.ok,
        provider: sendRes.provider ?? null,
        attemptedProviders: sendRes.attemptedProviders ?? [],
        requestedRoute,
      },
      reason: `Owner diagnostic email test (${requestedRoute})`,
      req,
    });

    return Response.json({
      ok: sendRes.ok,
      id: sendRes.id ?? null,
      provider: sendRes.provider ?? null,
      attemptedProviders: sendRes.attemptedProviders ?? [],
      error: sendRes.error ?? null,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
