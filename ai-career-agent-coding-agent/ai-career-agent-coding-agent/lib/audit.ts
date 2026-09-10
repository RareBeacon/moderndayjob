import { supabaseAdmin } from '@/lib/supabase';

/**
 * Security audit trail (spec 48). Writes into public.audit_logs (see
 * supabase/migrations/011_audit_logs.sql), which has NO RLS policies so only
 * the service role can read or write it. Events are best-effort: an audit
 * write must never fail or slow down the request it is recording.
 *
 * `sanitizeMeta` and `redactSecrets` are pure and exported for unit tests.
 */

export type AuditAction =
  | 'USER_SIGNUP'
  | 'USER_SIGNIN'
  | 'USER_SIGNOUT'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_COMPLETED'
  | 'EMAIL_VERIFICATION_RESENT'
  | 'AI_RESUME_GENERATED'
  | 'AI_ANALYSIS_GENERATED'
  | 'RESUME_EXPORT'
  | 'APPLICATION_SUBMITTED'
  | 'ADMIN_USER_SUSPEND'
  | 'ADMIN_USER_TERMINATE'
  | (string & {});

export interface AuditInput {
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  userId?: string | null;
  meta?: Record<string, unknown>;
}

const SECRET_PATTERN =
  /(secret|token|password|passwd|api[_-]?key|authorization|credential|ciphertext|private[_-]?key|bearer)\s*[:=]\s*(?:bearer\s+)?[^\s,"'}\]]+/gi;

/** Redact anything that looks like a secret value in free-form text. */
export function redactSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, '$1=<redacted>');
}

/** Stringify and sanitize audit metadata: redact secrets, cap size, drop
 *  anything that cannot be serialized. */
export function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta ?? {})) {
    if (v === undefined || v === null) continue;
    let value: unknown;
    try {
      if (typeof v === 'string') {
        value = redactSecrets(v).slice(0, 500);
      } else {
        // deep copy; throws on cycles/functions, which we drop
        value = JSON.parse(JSON.stringify(v));
      }
    } catch {
      value = '[unserializable]';
    }
    out[k.slice(0, 64)] = value;
  }
  return out;
}

/** Best-effort audit event. Never throws. */
export async function auditEvent(input: AuditInput): Promise<void> {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      user_id: input.userId ?? null,
      action: String(input.action).slice(0, 100),
      resource: input.resource?.slice(0, 100) ?? null,
      resource_id: input.resourceId?.slice(0, 100) ?? null,
      meta: input.meta ? sanitizeMeta(input.meta) : null,
    });
  } catch {
    // audit is best-effort: a missing table or DB hiccup must not break a request
  }
}
