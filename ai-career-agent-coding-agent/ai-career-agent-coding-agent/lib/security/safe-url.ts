/**
 * Client- and server-safe URL & PII masking helpers (zero Node/env imports).
 *
 * Security rationale:
 *   1. Zod's `z.string().url()` delegates to `new URL(...)`, which accepts
 *      dangerous schemes such as `javascript:alert(1)`, `data:text/html,...`,
 *      and `vbscript:...`. Any user-supplied URL that may later be rendered in
 *      an `<a href="...">` inside the Admin Panel, Employer Portal, or
 *      Dashboard MUST be restricted to `http:` / `https:`.
 *   2. Admin views outside the B-063 password-reauth flow must mask user email
 *      local-parts (`j***@domain.com`) until an audited reveal occurs.
 */

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
const EMAIL_IN_TEXT_RE = /\b([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;

export function isSafeHttpUrl(value: unknown, maxLength = 2048): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return false;
  if (CONTROL_CHARS_RE.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return Boolean(parsed.hostname && parsed.hostname.length > 0);
  } catch {
    return false;
  }
}

export function safeExternalHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isSafeHttpUrl(trimmed) ? trimmed : null;
}

export function maskEmailAddress(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '-';
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return '-';
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  return `${local[0]}***@${domain}`;
}

export function maskEmailsInStructure<T>(input: T, depth = 0): T {
  if (depth > 5 || input == null) return input;
  if (typeof input === 'string') {
    return input.replace(EMAIL_IN_TEXT_RE, '$1***@$2') as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => maskEmailsInStructure(item, depth + 1)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = maskEmailsInStructure(v, depth + 1);
    }
    return out as T;
  }
  return input;
}
