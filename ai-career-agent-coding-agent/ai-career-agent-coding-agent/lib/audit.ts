import { supabaseAdmin } from '@/lib/supabase';

/**
 * Audit-logging helper (Book III B-060/B-063; Book IV A5, L1-L3).
 *
 * Security invariants:
 *   1. Standard audit calls are best-effort: regular user flows should not
 *      500 if the audit sink blips.
 *   2. Sensitive-PII disclosures (`requireAuditEvent`, B-063) are FAIL-CLOSED:
 *      if the audit write throws OR PostgREST returns `{ error }`, the read
 *      MUST NOT proceed. An unlogged admin PII read is treated as a security
 *      failure.
 *   3. No secrets in `meta`: known secret-shaped values are redacted
 *      recursively across nested objects and arrays before persistence.
 *   4. Writes use the service-role client because `audit_logs` has no client
 *      INSERT policy (migration 011).
 */

export type AuditOutcome = 'allow' | 'deny' | 'error';

export interface AuditInput {
  action: string;
  resource: string;
  resourceId?: string | null;
  userId?: string | null;
  meta?: Record<string, unknown>;
  outcome?: AuditOutcome;
  requestId?: string | null;
  ipHash?: string | null;
  uaHash?: string | null;
}

const LABELED_SECRET_PATTERNS: RegExp[] = [
  // Must run BEFORE the generic `authorization[:=]` rule so
  // `Authorization: Bearer <tok>` collapses cleanly.
  /(authorization)\s*[:=]\s*bearer\s+[^\s"',]+/gi,
  /(password|secret|token|api[_-]?key|service[_-]?role)\s*[:=]\s*[^\s"',]+/gi,
];

const RAW_SECRET_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bsk-[A-Za-z0-9._-]{16,}\b/g,
];

const MAX_META_STRING = 500;
const MAX_SANITIZE_DEPTH = 5;

export function redactSecrets(input: string): string {
  let out = input;
  for (const re of LABELED_SECRET_PATTERNS) {
    out = out.replace(re, '$1=<redacted>');
  }
  for (const re of RAW_SECRET_PATTERNS) {
    out = out.replace(re, '<redacted>');
  }
  return out;
}

function sanitizeNestedValue(value: unknown, depth: number): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') {
    return redactSecrets(value).slice(0, MAX_META_STRING);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (depth >= MAX_SANITIZE_DEPTH) {
    return '[truncated]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeNestedValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      const safeKey = k.slice(0, 64);
      if (/^(password|secret|token|api[_-]?key|ciphertext|service[_-]?role|authorization)$/i.test(safeKey)) {
        out[safeKey] = '<redacted>';
      } else {
        out[safeKey] = sanitizeNestedValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(value).slice(0, MAX_META_STRING);
}

export function sanitizeMeta(meta?: Record<string, unknown>): Record<string, unknown> {
  if (!meta) return {};
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    const key = k.slice(0, 64);
    if (/^(password|secret|token|api[_-]?key|ciphertext|service[_-]?role|authorization)$/i.test(key)) {
      clean[key] = '<redacted>';
    } else if (typeof v === 'string') {
      clean[key] = redactSecrets(v).slice(0, MAX_META_STRING);
    } else {
      try {
        const cloned = JSON.parse(JSON.stringify(v));
        clean[key] = sanitizeNestedValue(cloned, 1);
      } catch {
        clean[key] = String(v).slice(0, MAX_META_STRING);
      }
    }
  }
  return clean;
}

async function insertAuditRow(input: AuditInput): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: input.userId ?? null,
    action: input.action.slice(0, 80),
    resource: input.resource.slice(0, 80),
    resource_id: input.resourceId ?? null,
    meta: sanitizeMeta(input.meta),
  };
  if (input.outcome) row.outcome = input.outcome;
  if (input.requestId) row.request_id = input.requestId.slice(0, 80);
  if (input.ipHash) row.ip_hash = input.ipHash.slice(0, 64);
  if (input.uaHash) row.ua_hash = input.uaHash.slice(0, 64);
  const res = (await supabaseAdmin.from('audit_logs').insert(row)) as { error?: { message?: string } | null } | undefined;
  if (res && typeof res === 'object' && 'error' in res && res.error) {
    throw new Error(res.error.message || 'AUDIT_LOG_INSERT_FAILED');
  }
}

export async function auditEvent(input: AuditInput): Promise<void> {
  try {
    await insertAuditRow(input);
  } catch {
    // Best-effort only: regular user flows must not fail if audit sink blips.
  }
}

/** Fail-closed variant for admin PII reads (B-063): throws if the audit row
 *  cannot be persisted so the caller aborts before returning the PII. */
export async function requireAuditEvent(input: AuditInput): Promise<void> {
  await insertAuditRow(input);
}
