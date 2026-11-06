import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import nodemailer from 'nodemailer';
import { env } from '@/lib/env';

export type EmailProviderId = 'smtp' | 'brevo' | 'resend';

export interface TransactionalEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
  /** Optional explicit provider override for admin diagnostics. */
  preferredProvider?: EmailProviderId;
}

export interface TransactionalEmailResult {
  skipped: boolean;
  id?: string;
  provider?: EmailProviderId;
  attemptedProviders?: EmailProviderId[];
}

export interface ProviderRuntimeStats {
  sentCount: number;
  failureCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorSummary: string | null;
}

export interface EmailProviderStatus {
  id: EmailProviderId;
  label: string;
  configured: boolean;
  monthlyFreeCapacity: number | 'unlimited_self_hosted';
  dailyFreeCap: number | 'relay_dependent';
  endpointSummary: string;
  fromAddress: string;
  stats: ProviderRuntimeStats;
}

export interface DomainDnsCheckItem {
  key: 'mx' | 'spf' | 'dmarc' | 'dkim_resend' | 'dkim_self_hosted' | 'mta_sts' | 'mail_host_a';
  label: string;
  hostname: string;
  status: 'pass' | 'warn' | 'missing';
  records: string[];
  guidance: string;
}

const VALID_PROVIDERS: readonly EmailProviderId[] = ['smtp', 'brevo', 'resend'] as const;

const runtimeStats: Record<EmailProviderId, ProviderRuntimeStats> = {
  smtp: { sentCount: 0, failureCount: 0, lastSuccessAt: null, lastFailureAt: null, lastErrorSummary: null },
  brevo: { sentCount: 0, failureCount: 0, lastSuccessAt: null, lastFailureAt: null, lastErrorSummary: null },
  resend: { sentCount: 0, failureCount: 0, lastSuccessAt: null, lastFailureAt: null, lastErrorSummary: null },
};

let totalFailovers = 0;

interface DynamicResendConfig {
  apiKey: string;
  from: string;
  cachedAt: number;
}
let cachedDynamicResendConfig: DynamicResendConfig | null = null;
const DYNAMIC_CONFIG_TTL_MS = 60_000;

export async function prewarmDynamicEmailConfig(): Promise<void> {
  const envKey = readEnvString('RESEND_API_KEY');
  if (envKey) return;

  const now = Date.now();
  if (cachedDynamicResendConfig && now - cachedDynamicResendConfig.cachedAt < DYNAMIC_CONFIG_TTL_MS) {
    return;
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { data } = await supabaseAdmin
      .from('app_config')
      .select('value')
      .eq('key', 'email_transport')
      .maybeSingle();

    const val = data?.value as Record<string, unknown> | null;
    if (typeof val?.resend_api_key === 'string' && val.resend_api_key.trim()) {
      cachedDynamicResendConfig = {
        apiKey: val.resend_api_key.trim(),
        from: typeof val?.resend_from === 'string' && val.resend_from.trim() ? val.resend_from.trim() : '',
        cachedAt: now,
      };
    }
  } catch {
    // Non-blocking fallback if database config read fails
  }
}

function readEnvString(key: keyof typeof env, fallback = ''): string {
  const raw = (env as Record<string, unknown> | undefined)?.[key];
  return typeof raw === 'string' ? raw.trim() : fallback;
}

function sanitizeErrorSummary(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? 'Unknown transport error');
  // Redact any accidental credential-like tokens and cap length for safe admin display.
  return msg
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/xkeysib-[A-Za-z0-9._-]+/gi, '[REDACTED]')
    .replace(/re_[A-Za-z0-9._-]+/gi, '[REDACTED]')
    .slice(0, 240);
}

/**
 * Parses RFC 5322 display-name addresses such as `Jobiest <no-reply@jobiest.com>`
 * or plain `no-reply@jobiest.com` into `{ name, email }`.
 */
export function parseSenderAddress(raw: string): { name: string; email: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>$/);
  if (match) {
    const name = (match[1] ?? '').trim() || 'Jobiest';
    return { name, email: match[2].trim() };
  }
  return { name: 'Jobiest', email: trimmed || 'no-reply@jobiest.com' };
}

export function formatSenderAddress(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Jobiest <no-reply@jobiest.com>';
  if (trimmed.includes('<') && trimmed.includes('>')) return trimmed;
  return `Jobiest <${trimmed}>`;
}

export function isProviderConfigured(provider: EmailProviderId): boolean {
  if (provider === 'smtp') {
    const host = readEnvString('SMTP_HOST');
    return Boolean(host);
  }
  if (provider === 'brevo') {
    return Boolean(readEnvString('BREVO_API_KEY'));
  }
  if (provider === 'resend') {
    return Boolean(readEnvString('RESEND_API_KEY')) || Boolean(cachedDynamicResendConfig?.apiKey);
  }
  return false;
}

function isFallbackEnabled(): boolean {
  const raw = readEnvString('SMTP_FALLBACK', 'resend').toLowerCase();
  return !['false', '0', 'none', 'off', 'disabled'].includes(raw);
}

function parseConfiguredOrder(): EmailProviderId[] {
  const rawOrder = readEnvString('EMAIL_PROVIDER_ORDER', 'smtp,brevo,resend');
  const parsed: EmailProviderId[] = [];
  for (const part of rawOrder.split(',')) {
    const candidate = part.trim().toLowerCase() as EmailProviderId;
    if ((VALID_PROVIDERS as readonly string[]).includes(candidate) && !parsed.includes(candidate)) {
      parsed.push(candidate);
    }
  }
  for (const fallbackProvider of VALID_PROVIDERS) {
    if (!parsed.includes(fallbackProvider)) {
      parsed.push(fallbackProvider);
    }
  }
  return parsed;
}

/**
 * Resolves the ordered list of configured email transports to attempt for an
 * outgoing message, honoring `TRANSACTIONAL_STRATEGY`, `EMAIL_PROVIDER_ORDER`,
 * and `SMTP_FALLBACK`.
 */
export function resolveProviderChain(preferredProvider?: EmailProviderId): EmailProviderId[] {
  const baseOrder = parseConfiguredOrder();
  const strategy = readEnvString('TRANSACTIONAL_STRATEGY', 'auto').toLowerCase();
  const fallbackAllowed = isFallbackEnabled();

  let ordered: EmailProviderId[] = baseOrder;

  if (preferredProvider && (VALID_PROVIDERS as readonly string[]).includes(preferredProvider)) {
    ordered = [preferredProvider, ...baseOrder.filter((p) => p !== preferredProvider)];
  } else if (strategy === 'smtp' || strategy === 'brevo' || strategy === 'resend') {
    const primary = strategy as EmailProviderId;
    ordered = fallbackAllowed
      ? [primary, ...baseOrder.filter((p) => p !== primary)]
      : [primary];
  }

  return ordered.filter((provider) => isProviderConfigured(provider));
}

function resolveDefaultFrom(provider: EmailProviderId, explicitFrom?: string): string {
  if (explicitFrom && explicitFrom.trim()) {
    return formatSenderAddress(explicitFrom);
  }
  if (provider === 'smtp') {
    const emailFrom = readEnvString('EMAIL_FROM');
    const resendFrom = readEnvString('RESEND_FROM', 'no-reply@jobiest.com');
    return formatSenderAddress(emailFrom || resendFrom);
  }
  if (provider === 'brevo') {
    const brevoFrom = readEnvString('BREVO_FROM');
    const emailFrom = readEnvString('EMAIL_FROM');
    const resendFrom = readEnvString('RESEND_FROM', 'no-reply@jobiest.com');
    return formatSenderAddress(brevoFrom || emailFrom || resendFrom);
  }
  const resendFrom = readEnvString('RESEND_FROM', 'no-reply@jobiest.com');
  return formatSenderAddress(resendFrom);
}

function buildSmtpTransport() {
  const host = readEnvString('SMTP_HOST');
  const portNum = Number.parseInt(readEnvString('SMTP_PORT', '587'), 10) || 587;
  const secureRaw = readEnvString('SMTP_SECURE').toLowerCase();
  const secure = secureRaw ? ['true', '1', 'yes', 'tls'].includes(secureRaw) : portNum === 465;
  const user = readEnvString('SMTP_USER');
  const pass = readEnvString('SMTP_PASSWORD');

  return nodemailer.createTransport({
    host,
    port: portNum,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  });
}

async function sendViaSmtp(opts: TransactionalEmailOptions): Promise<string | undefined> {
  const transporter = buildSmtpTransport();
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const info = await transporter.sendMail({
    from: resolveDefaultFrom('smtp', opts.from),
    to: recipients.join(', '),
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
  });
  return typeof info.messageId === 'string' ? info.messageId : undefined;
}

async function sendViaBrevo(opts: TransactionalEmailOptions): Promise<string | undefined> {
  const apiKey = readEnvString('BREVO_API_KEY');
  const sender = parseSenderAddress(resolveDefaultFrom('brevo', opts.from));
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).map((addr) => {
    const parsed = parseSenderAddress(addr);
    return { email: parsed.email };
  });

  const payload: Record<string, unknown> = {
    sender,
    to: recipients,
    subject: opts.subject,
    htmlContent: opts.html,
  };
  if (opts.text) payload.textContent = opts.text;
  if (opts.replyTo) {
    const rt = parseSenderAddress(opts.replyTo);
    payload.replyTo = { email: rt.email };
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo API error (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json().catch(() => ({}))) as { messageId?: string };
  return data.messageId;
}

async function sendViaResend(opts: TransactionalEmailOptions): Promise<string | undefined> {
  const apiKey = readEnvString('RESEND_API_KEY') || cachedDynamicResendConfig?.apiKey;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY_MISSING');
  }
  const defaultFrom = cachedDynamicResendConfig?.from || undefined;
  const from = resolveDefaultFrom('resend', opts.from || defaultFrom);
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (res.ok && typeof json.id === 'string' && json.id.length > 0) {
    return json.id;
  }
  throw new Error(res.ok ? 'RESEND_MISSING_ID' : json.message ?? `RESEND_${res.status}`);
}

/**
 * Multi-transport transactional email router with automatic failover across
 * Self-Hosted Stalwart SMTP (`$0/mo`), Brevo Free (`9,000/mo` at `$0`), and
 * Resend Free (`3,000/mo` at `$0`).
 */
export async function sendTransactionalEmail(
  opts: TransactionalEmailOptions,
): Promise<TransactionalEmailResult> {
  if (!readEnvString('RESEND_API_KEY')) {
    await prewarmDynamicEmailConfig();
  }
  const chain = resolveProviderChain(opts.preferredProvider);
  if (chain.length === 0) {
    console.info('[email] No email transport configured; skipping send:', opts.subject);
    return { skipped: true, attemptedProviders: [] };
  }

  const attempted: EmailProviderId[] = [];
  const errors: string[] = [];

  for (let idx = 0; idx < chain.length; idx += 1) {
    const provider = chain[idx];
    attempted.push(provider);
    try {
      let messageId: string | undefined;
      if (provider === 'smtp') {
        messageId = await sendViaSmtp(opts);
      } else if (provider === 'brevo') {
        messageId = await sendViaBrevo(opts);
      } else {
        messageId = await sendViaResend(opts);
      }

      runtimeStats[provider].sentCount += 1;
      runtimeStats[provider].lastSuccessAt = new Date().toISOString();
      if (idx > 0) {
        totalFailovers += 1;
      }

      return {
        skipped: false,
        id: messageId,
        provider,
        attemptedProviders: attempted,
      };
    } catch (err) {
      const safeMsg = sanitizeErrorSummary(err);
      runtimeStats[provider].failureCount += 1;
      runtimeStats[provider].lastFailureAt = new Date().toISOString();
      runtimeStats[provider].lastErrorSummary = safeMsg;
      errors.push(`${provider}: ${safeMsg}`);

      if (idx + 1 < chain.length) {
        console.warn(`[email] Provider '${provider}' failed (${safeMsg}); failing over to '${chain[idx + 1]}'`);
      }
    }
  }

  throw new Error(`All configured email transports failed (${errors.join(' | ')})`);
}

/**
 * Performs a live TCP + TLS + AUTH handshake check against the configured
 * self-hosted SMTP server (`mail.jobiest.com`) without sending an email.
 */
export async function verifySmtpConnection(): Promise<{
  configured: boolean;
  ok: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  latencyMs: number;
  detail: string;
}> {
  const host = readEnvString('SMTP_HOST');
  if (!host) {
    return {
      configured: false,
      ok: false,
      host: null,
      port: null,
      secure: false,
      latencyMs: 0,
      detail: 'SMTP_HOST is not set yet. Deploy deploy/oci-mail and set SMTP_HOST=mail.jobiest.com.',
    };
  }

  const port = Number.parseInt(readEnvString('SMTP_PORT', '587'), 10) || 587;
  const secureRaw = readEnvString('SMTP_SECURE').toLowerCase();
  const secure = secureRaw ? ['true', '1', 'yes', 'tls'].includes(secureRaw) : port === 465;

  const started = Date.now();
  try {
    const transporter = buildSmtpTransport();
    await transporter.verify();
    return {
      configured: true,
      ok: true,
      host,
      port,
      secure,
      latencyMs: Date.now() - started,
      detail: 'SMTP TLS & authentication handshake verified.',
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      host,
      port,
      secure,
      latencyMs: Date.now() - started,
      detail: sanitizeErrorSummary(err),
    };
  }
}

export function getEmailInfrastructureStatus(): {
  strategy: string;
  fallbackEnabled: boolean;
  activeChain: EmailProviderId[];
  estimatedFreeMonthlyCapacity: number;
  totalFailovers: number;
  providers: EmailProviderStatus[];
} {
  const smtpHost = readEnvString('SMTP_HOST');
  const smtpPort = Number.parseInt(readEnvString('SMTP_PORT', '587'), 10) || 587;
  const activeChain = resolveProviderChain();

  const brevoReady = isProviderConfigured('brevo');
  const resendReady = isProviderConfigured('resend');
  const smtpReady = isProviderConfigured('smtp');

  let estimatedFreeMonthlyCapacity = 0;
  if (brevoReady) estimatedFreeMonthlyCapacity += 9_000;
  if (resendReady) estimatedFreeMonthlyCapacity += 3_000;
  // Self-hosted Stalwart adds unlimited local mailbox delivery + its own relay pool if separate.
  if (smtpReady && !brevoReady) estimatedFreeMonthlyCapacity += 9_000;

  const providers: EmailProviderStatus[] = [
    {
      id: 'smtp',
      label: 'Self-Hosted Stalwart SMTP (OCI Always Free)',
      configured: smtpReady,
      monthlyFreeCapacity: 'unlimited_self_hosted',
      dailyFreeCap: 'relay_dependent',
      endpointSummary: smtpReady ? `${smtpHost}:${smtpPort}` : 'Not configured (set SMTP_HOST=mail.jobiest.com)',
      fromAddress: resolveDefaultFrom('smtp'),
      stats: { ...runtimeStats.smtp },
    },
    {
      id: 'brevo',
      label: 'Brevo Free Transactional API ($0/mo)',
      configured: brevoReady,
      monthlyFreeCapacity: 9_000,
      dailyFreeCap: 300,
      endpointSummary: 'https://api.brevo.com/v3/smtp/email',
      fromAddress: resolveDefaultFrom('brevo'),
      stats: { ...runtimeStats.brevo },
    },
    {
      id: 'resend',
      label: 'Resend Free Transactional API ($0/mo)',
      configured: resendReady,
      monthlyFreeCapacity: 3_000,
      dailyFreeCap: 100,
      endpointSummary: 'https://api.resend.com/emails',
      fromAddress: resolveDefaultFrom('resend'),
      stats: { ...runtimeStats.resend },
    },
  ];

  return {
    strategy: readEnvString('TRANSACTIONAL_STRATEGY', 'auto'),
    fallbackEnabled: isFallbackEnabled(),
    activeChain,
    estimatedFreeMonthlyCapacity,
    totalFailovers,
    providers,
  };
}

async function safeResolveTxt(hostname: string): Promise<string[]> {
  try {
    const chunks = await dns.resolveTxt(hostname);
    return chunks.map((parts) => parts.join(''));
  } catch {
    return [];
  }
}

async function safeResolveMx(hostname: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(hostname);
    return records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => `${r.priority} ${r.exchange}`);
  } catch {
    return [];
  }
}

async function safeResolveA(hostname: string): Promise<string[]> {
  try {
    return await dns.resolve4(hostname);
  } catch {
    return [];
  }
}

/**
 * Live DNS readiness audit for `@jobiest.com` self-hosted + multi-relay email
 * deliverability (MX, SPF, DMARC, Resend DKIM, Stalwart DKIM, MTA-STS, Mail Host A).
 */
export async function inspectDomainEmailDns(domain = 'jobiest.com'): Promise<DomainDnsCheckItem[]> {
  const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '') || 'jobiest.com';
  const mailHost = readEnvString('SMTP_HOST') || `mail.${cleanDomain}`;

  const [mxRecords, rootTxt, dmarcTxt, resendDkimTxt, selfHostedDkimTxt, mtaStsTxt, mailHostIps] =
    await Promise.all([
      safeResolveMx(cleanDomain),
      safeResolveTxt(cleanDomain),
      safeResolveTxt(`_dmarc.${cleanDomain}`),
      safeResolveTxt(`resend._domainkey.${cleanDomain}`),
      safeResolveTxt(`mail._domainkey.${cleanDomain}`),
      safeResolveTxt(`_mta-sts.${cleanDomain}`),
      safeResolveA(mailHost),
    ]);

  const spfRecords = rootTxt.filter((r) => r.toLowerCase().startsWith('v=spf1'));
  const dmarcRecords = dmarcTxt.filter((r) => r.toLowerCase().startsWith('v=dmarc1'));

  const selfHostedMxActive = mxRecords.some((r) => r.toLowerCase().includes(mailHost.toLowerCase()));

  return [
    {
      key: 'mail_host_a',
      label: 'Self-Hosted Mail Server A Record',
      hostname: mailHost,
      status: mailHostIps.length > 0 ? 'pass' : 'missing',
      records: mailHostIps,
      guidance:
        mailHostIps.length > 0
          ? `Resolves to ${mailHostIps.join(', ')}. Ensure this matches your OCI Always Free jobiest-mail VM IP.`
          : `Point DNS A record ${mailHost} to your OCI Always Free jobiest-mail public IP (DNS-only / grey cloud).`,
    },
    {
      key: 'mx',
      label: 'Inbound MX Routing',
      hostname: cleanDomain,
      status: mxRecords.length === 0 ? 'missing' : selfHostedMxActive ? 'pass' : 'warn',
      records: mxRecords,
      guidance:
        mxRecords.length === 0
          ? `Add MX record (priority 10) -> ${mailHost} once Stalwart is live.`
          : selfHostedMxActive
            ? `Self-hosted Stalwart MX (${mailHost}) is active.`
            : `Currently routed via external forwarder (${mxRecords.join(', ')}). Cut over to ${mailHost} after Step C staging verification.`,
    },
    {
      key: 'spf',
      label: 'SPF Sender Policy (TXT)',
      hostname: cleanDomain,
      status: spfRecords.length === 1 ? 'pass' : spfRecords.length > 1 ? 'warn' : 'missing',
      records: spfRecords,
      guidance:
        spfRecords.length === 1
          ? 'Single valid SPF policy published. Include spf.brevo.com and ip4:<MAIL_PUBLIC_IP> when adding Brevo/OCI.'
          : spfRecords.length > 1
            ? 'Multiple v=spf1 records detected (RFC 7208 permerror risk). Merge into a single TXT record.'
            : 'Publish v=spf1 include:_spf.resend.com include:spf.brevo.com ~all on root domain.',
    },
    {
      key: 'dmarc',
      label: 'DMARC Alignment Policy',
      hostname: `_dmarc.${cleanDomain}`,
      status: dmarcRecords.length > 0 ? 'pass' : 'missing',
      records: dmarcRecords,
      guidance:
        dmarcRecords.length > 0
          ? 'DMARC policy active for domain alignment.'
          : `Publish TXT _dmarc.${cleanDomain} -> v=DMARC1; p=quarantine; rua=mailto:admin@${cleanDomain}`,
    },
    {
      key: 'dkim_resend',
      label: 'DKIM Selector (Resend Fallback)',
      hostname: `resend._domainkey.${cleanDomain}`,
      status: resendDkimTxt.length > 0 ? 'pass' : 'warn',
      records: resendDkimTxt.map((r) => (r.length > 90 ? `${r.slice(0, 90)}...` : r)),
      guidance:
        resendDkimTxt.length > 0
          ? 'Resend DKIM selector verified (preserve alongside self-hosted DKIM).'
          : 'Add resend._domainkey TXT record if Resend fallback is enabled.',
    },
    {
      key: 'dkim_self_hosted',
      label: 'DKIM Selector (Self-Hosted Stalwart)',
      hostname: `mail._domainkey.${cleanDomain}`,
      status: selfHostedDkimTxt.length > 0 ? 'pass' : 'warn',
      records: selfHostedDkimTxt.map((r) => (r.length > 90 ? `${r.slice(0, 90)}...` : r)),
      guidance:
        selfHostedDkimTxt.length > 0
          ? 'Self-hosted Stalwart 2048-bit RSA DKIM key published.'
          : `After running bootstrap-mailboxes.sh, publish mail._domainkey.${cleanDomain} TXT key from Stalwart Admin.`,
    },
    {
      key: 'mta_sts',
      label: 'MTA-STS Inbound TLS Policy',
      hostname: `_mta-sts.${cleanDomain}`,
      status: mtaStsTxt.length > 0 ? 'pass' : 'warn',
      records: mtaStsTxt,
      guidance:
        mtaStsTxt.length > 0
          ? 'RFC 8461 MTA-STS inbound TLS enforcement record present.'
          : `Optional hardening: publish TXT _mta-sts.${cleanDomain} -> v=STSv1; id=20261101 (served automatically by deploy/oci-mail/Caddyfile).`,
    },
  ];
}

export function isStalwartAdminConfigured(): boolean {
  const url = readEnvString('STALWART_API_URL');
  const pass = readEnvString('STALWART_ADMIN_PASSWORD');
  return Boolean(url && pass);
}

/**
 * Generates a cryptographically strong 20-character initial mailbox password.
 * Never persisted or logged on the server.
 */
export function generateInitialMailboxPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^*_';
  const bytes = crypto.randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

/**
 * Computes a salted PHC `$scrypt$` hash natively verified by Stalwart so
 * plaintext staff passwords are never stored in Stalwart's database.
 */
export function hashStalwartScryptSecret(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32, {
    N: 16384, // ln = 14
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const saltB64 = salt.toString('base64').replace(/=+$/, '');
  const hashB64 = derived.toString('base64').replace(/=+$/, '');
  return `$scrypt$ln=14,r=8,p=1$${saltB64}$${hashB64}`;
}

export async function provisionStalwartMailbox(input: {
  localPart: string;
  displayName: string;
  quotaGb: number;
  password?: string;
}): Promise<{
  mode: 'live_api' | 'cli_command_ready';
  action: 'CREATED' | 'PASSWORD_RESET' | 'CLI_PENDING';
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
}> {
  const cleanLocal = input.localPart.trim().toLowerCase().replace(/@jobiest\.com$/i, '');
  if (!/^[a-z0-9._-]{2,40}$/.test(cleanLocal)) {
    throw new Error('INVALID_MAILBOX_USERNAME');
  }

  const email = `${cleanLocal}@jobiest.com`;
  const displayName = input.displayName.trim().slice(0, 120) || cleanLocal;
  const quotaGb = Math.min(Math.max(Math.trunc(input.quotaGb || 2), 1), 10);
  const quotaBytes = quotaGb * 1073741824;
  const initialPassword =
    input.password && input.password.trim().length >= 12
      ? input.password.trim()
      : generateInitialMailboxPassword();

  const safeDisplayForShell = displayName.replace(/'/g, '');
  const cliCommand = `sudo /opt/jobiest-mail/create-staff-mailbox.sh '${email}' '${safeDisplayForShell}' ${quotaGb}`;

  const mailHost = readEnvString('SMTP_HOST') || 'mail.jobiest.com';
  const baseResult = {
    email,
    displayName,
    quotaGb,
    initialPassword,
    webmailUrl: 'https://webmail.jobiest.com',
    imapHost: mailHost,
    imapPort: 993,
    smtpHost: mailHost,
    smtpPort: 465,
    cliCommand,
  };

  if (!isStalwartAdminConfigured()) {
    return {
      ...baseResult,
      mode: 'cli_command_ready',
      action: 'CLI_PENDING',
    };
  }

  const rawBaseUrl = readEnvString('STALWART_API_URL').replace(/\/+$/, '');
  const adminUser = readEnvString('STALWART_ADMIN_USER', 'postmaster');
  const adminPass = readEnvString('STALWART_ADMIN_PASSWORD');
  const basicAuth = Buffer.from(`${adminUser}:${adminPass}`, 'utf-8').toString('base64');
  const secretHash = hashStalwartScryptSecret(initialPassword);

  const checkRes = await fetch(`${rawBaseUrl}/api/principal/${encodeURIComponent(email)}`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (checkRes.status === 404) {
    const createRes = await fetch(`${rawBaseUrl}/api/principal`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        type: 'individual',
        name: email,
        description: displayName,
        secrets: [secretHash],
        emails: [email],
        quota: quotaBytes,
        roles: ['user'],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => '');
      throw new Error(`Stalwart create error (${createRes.status}): ${sanitizeErrorSummary(detail)}`);
    }

    return {
      ...baseResult,
      mode: 'live_api',
      action: 'CREATED',
    };
  }

  if (!checkRes.ok) {
    const detail = await checkRes.text().catch(() => '');
    throw new Error(`Stalwart lookup error (${checkRes.status}): ${sanitizeErrorSummary(detail)}`);
  }

  const patchRes = await fetch(`${rawBaseUrl}/api/principal/${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify([
      { action: 'set', field: 'secrets', value: [secretHash] },
      { action: 'set', field: 'description', value: displayName },
      { action: 'set', field: 'quota', value: quotaBytes },
    ]),
    signal: AbortSignal.timeout(10_000),
  });

  if (!patchRes.ok) {
    const detail = await patchRes.text().catch(() => '');
    throw new Error(`Stalwart update error (${patchRes.status}): ${sanitizeErrorSummary(detail)}`);
  }

  return {
    ...baseResult,
    mode: 'live_api',
    action: 'PASSWORD_RESET',
  };
}

export function resetEmailTransportStatsForTests(): void {
  for (const p of VALID_PROVIDERS) {
    runtimeStats[p] = {
      sentCount: 0,
      failureCount: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorSummary: null,
    };
  }
  totalFailovers = 0;
}
