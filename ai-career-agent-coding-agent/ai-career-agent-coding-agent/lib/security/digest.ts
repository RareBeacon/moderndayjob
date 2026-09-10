import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/email/resend';

/**
 * Daily security digest (SECURITY_AUDIT §20.3). Aggregates the last 24 hours
 * of `public.audit_logs` into a one-page summary emailed to the admin
 * address (`ADMIN_ALERT_EMAIL`). Triggered by Vercel Cron
 * (`/api/cron/security-digest`, see vercel.json).
 *
 * Safety properties:
 * - Read-only against the audit table (service role, server only).
 * - Skips silently when `ADMIN_ALERT_EMAIL` is unset (opt-in, never breaks
 *   a deploy) and never throws (a digest failure must not fail the cron).
 * - Email bodies escape all event content; audit `meta` is already
 *   secret-sanitized at write time (see lib/audit.ts).
 */

export interface DigestEvent {
  action: string;
  resource: string | null;
  resource_id: string | null;
  user_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface DigestFlagItem {
  action: string;
  resource: string | null;
  created_at: string;
  detail: string;
}

export interface DigestData {
  windowStart: string;
  windowEnd: string;
  total: number;
  truncated: boolean;
  byAction: Record<string, number>;
  signups: number;
  passwordResets: number;
  suspicious: DigestFlagItem[];
  adminActions: DigestFlagItem[];
  flags: string[];
}

/** Max rows pulled per digest; keeps the cron bounded if volume spikes. */
export const DIGEST_EVENT_LIMIT = 1000;

/** Max flagged rows rendered per section; counts always reflect the full set. */
export const DIGEST_FLAG_RENDER_LIMIT = 20;

const ADMIN_ACTION_PREFIX = 'ADMIN_';

/** Pure aggregation: events in, digest data out. Exported for unit tests. */
export function summarizeEvents(events: DigestEvent[], now: Date = new Date()): DigestData {
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const byAction: Record<string, number> = {};
  const suspicious: DigestFlagItem[] = [];
  const adminActions: DigestFlagItem[] = [];
  let signups = 0;
  let passwordResets = 0;

  for (const e of events) {
    const action = String(e.action ?? 'UNKNOWN').slice(0, 100);
    byAction[action] = (byAction[action] ?? 0) + 1;
    if (action === 'USER_SIGNUP') signups += 1;
    if (action === 'PASSWORD_RESET_REQUEST') passwordResets += 1;
    const item: DigestFlagItem = {
      action,
      resource: e.resource ?? null,
      created_at: e.created_at,
      detail: describeMeta(e.meta),
    };
    if (action === 'SUSPICIOUS_REGISTRATION') suspicious.push(item);
    else if (action.startsWith(ADMIN_ACTION_PREFIX)) adminActions.push(item);
  }

  const flags: string[] = [];
  if (suspicious.length > 0) flags.push(`${suspicious.length} blocked suspicious registration(s) in the last 24h`);
  if (adminActions.length > 0) flags.push(`${adminActions.length} admin action(s) in the last 24h`);
  if (passwordResets >= 5 && passwordResets > signups * 3) {
    flags.push(`password-reset spike: ${passwordResets} resets vs ${signups} signups`);
  }

  return {
    windowStart,
    windowEnd,
    total: events.length,
    truncated: events.length >= DIGEST_EVENT_LIMIT,
    byAction,
    signups,
    passwordResets,
    suspicious,
    adminActions,
    flags,
  };
}

function describeMeta(meta: Record<string, unknown> | null): string {
  if (!meta || typeof meta !== 'object') return '';
  try {
    return JSON.stringify(meta).slice(0, 300);
  } catch {
    return '[unserializable]';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Pure HTML render. Exported for unit tests. */
export function renderDigestHtml(data: DigestData): string {
  const rows = Object.entries(data.byAction)
    .sort((a, b) => b[1] - a[1])
    .map(([action, count]) => `<tr><td>${escapeHtml(action)}</td><td style="text-align:right">${count}</td></tr>`)
    .join('\n');
  const flagBlock =
    data.flags.length > 0
      ? `<h3 style="margin:16px 0 8px">Needs attention</h3><ul style="margin:0 0 8px;padding-left:20px">${data.flags.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
      : '<p style="margin:16px 0 8px">No anomalies flagged. All quiet.</p>';
  const section = (title: string, items: DigestFlagItem[]) => {
    if (items.length === 0) return '';
    const shown = items.slice(0, DIGEST_FLAG_RENDER_LIMIT);
    const extra = items.length > shown.length ? `<p style="color:#64748b">Showing ${shown.length} of ${items.length}.</p>` : '';
    const lis = shown
      .map((i) => `<li><code>${escapeHtml(i.created_at)}</code> ${escapeHtml(i.action)}${i.resource ? ` (${escapeHtml(i.resource)})` : ''}${i.detail ? ` - ${escapeHtml(i.detail)}` : ''}</li>`)
      .join('');
    return `<h3 style="margin:16px 0 8px">${escapeHtml(title)} (${items.length})</h3><ul style="margin:0 0 8px;padding-left:20px;font-size:13px">${lis}</ul>${extra}`;
  };
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1a1a2e;line-height:1.6">',
    '<h2 style="margin:0 0 4px">Jobiest security digest</h2>',
    `<p style="margin:0 0 16px;color:#64748b">${escapeHtml(data.windowStart)} to ${escapeHtml(data.windowEnd)} - ${data.total} event(s)${data.truncated ? ' (truncated at limit)' : ''}.</p>`,
    flagBlock,
    '<h3 style="margin:16px 0 8px">Events by action</h3>',
    `<table style="border-collapse:collapse;width:100%;font-size:14px"><tbody>${rows || '<tr><td>No events recorded.</td></tr>'}</tbody></table>`,
    section('Suspicious registrations', data.suspicious),
    section('Admin actions', data.adminActions),
    '</div>',
  ].join('\n');
}

/** Pure plain-text render. Exported for unit tests. */
export function renderDigestText(data: DigestData): string {
  const lines = [
    `Jobiest security digest (${data.windowStart} to ${data.windowEnd})`,
    `Events: ${data.total}${data.truncated ? ' (truncated at limit)' : ''}. Signups: ${data.signups}. Password resets: ${data.passwordResets}.`,
    '',
    data.flags.length > 0 ? `NEEDS ATTENTION:\n${data.flags.map((f) => `- ${f}`).join('\n')}` : 'No anomalies flagged. All quiet.',
    '',
    'Events by action:',
    ...Object.entries(data.byAction)
      .sort((a, b) => b[1] - a[1])
      .map(([action, count]) => `- ${action}: ${count}`),
  ];
  const section = (title: string, items: DigestFlagItem[]) => {
    if (items.length === 0) return;
    lines.push('', `${title} (${items.length}):`);
    for (const i of items.slice(0, DIGEST_FLAG_RENDER_LIMIT)) {
      lines.push(`- ${i.created_at} ${i.action}${i.resource ? ` (${i.resource})` : ''}${i.detail ? ` ${i.detail}` : ''}`);
    }
    if (items.length > DIGEST_FLAG_RENDER_LIMIT) lines.push(`(showing ${DIGEST_FLAG_RENDER_LIMIT} of ${items.length})`);
  };
  section('Suspicious registrations', data.suspicious);
  section('Admin actions', data.adminActions);
  return lines.join('\n');
}

export interface DigestDeps {
  /** Recipient; defaults to process.env.ADMIN_ALERT_EMAIL. Empty = skip. */
  to?: string;
  queryEvents?: (sinceIso: string) => Promise<DigestEvent[]>;
  send?: (to: string, subject: string, html: string, text: string) => Promise<{ ok: boolean; id?: string; error?: string }>;
  now?: Date;
}

export interface DigestReport {
  ok: boolean;
  skipped?: 'ADMIN_ALERT_EMAIL_NOT_SET';
  total?: number;
  flags?: string[];
  emailed?: boolean;
  emailId?: string;
  emailError?: string;
  error?: string;
}

async function defaultQueryEvents(sinceIso: string): Promise<DigestEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .select('action,resource,resource_id,user_id,meta,created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(DIGEST_EVENT_LIMIT);
  if (error) throw error;
  return (data ?? []) as DigestEvent[];
}

/**
 * Run the digest: query, summarize, email. Never throws; failures are
 * reported in the returned object so the cron route stays honest.
 */
export async function runSecurityDigest(deps: DigestDeps = {}): Promise<DigestReport> {
  const to = (deps.to ?? process.env.ADMIN_ALERT_EMAIL ?? '').trim();
  if (!to || !to.includes('@')) return { ok: true, skipped: 'ADMIN_ALERT_EMAIL_NOT_SET' };
  try {
    const now = deps.now ?? new Date();
    const sinceIso = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const query = deps.queryEvents ?? defaultQueryEvents;
    const events = await query(sinceIso);
    const data = summarizeEvents(events, now);
    const subject = data.flags.length > 0 ? `Jobiest security digest: ${data.flags.length} flag(s), ${data.total} events` : `Jobiest security digest: all quiet (${data.total} events)`;
    const send = deps.send ?? (async (toAddr: string, subj: string, html: string, text: string) => sendEmail({ to: toAddr, subject: subj, html, text }));
    const result = await send(to, subject, renderDigestHtml(data), renderDigestText(data));
    return result.ok
      ? { ok: true, total: data.total, flags: data.flags, emailed: true, emailId: result.id }
      : { ok: true, total: data.total, flags: data.flags, emailed: false, emailError: result.error ?? 'SEND_FAILED' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'DIGEST_FAILED' };
  }
}
