import { redactSecrets } from '@/lib/audit';

/**
 * Structured observability, request correlation IDs, and deterministic error
 * classification (Master Engineering Reliability Standard).
 *
 * Edge- and Node-runtime compatible: uses Web Crypto (`globalThis.crypto`)
 * only and never throws during error handling or logging.
 */

export const CORRELATION_HEADER = 'x-request-id';

export type ErrorCategory =
  | 'AUTH'
  | 'DATABASE'
  | 'NETWORK'
  | 'EXTERNAL_API'
  | 'VALIDATION'
  | 'RATE_LIMIT'
  | 'ENTITLEMENT'
  | 'INTERNAL';

export type LogLevel = 'info' | 'warn' | 'error';

const SAFE_ID_RE = /^[A-Za-z0-9._:-]{6,128}$/;

function generateCorrelationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Resolve a safe correlation ID from incoming request headers (`x-request-id`
 * or Vercel's `x-vercel-id`), or mint a fresh UUID when absent/malformed.
 */
export function resolveRequestId(input?: Request | Headers | null): string {
  const headers =
    input && 'headers' in input && input.headers instanceof Headers
      ? input.headers
      : input instanceof Headers
        ? input
        : null;

  if (headers) {
    const direct = headers.get(CORRELATION_HEADER)?.trim();
    if (direct && SAFE_ID_RE.test(direct)) return direct;

    const vercelId = headers.get('x-vercel-id')?.trim();
    if (vercelId && SAFE_ID_RE.test(vercelId)) return vercelId;
  }

  return generateCorrelationId();
}

/**
 * Classify an unknown runtime error into a deterministic operational category
 * without exposing raw sensitive messages to end users.
 */
export function classifyError(error: unknown): ErrorCategory {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? String((error as { code: string }).code)
    : '';
  const name = error instanceof Error ? error.name : '';
  const msg = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : String((error as { message?: unknown })?.message ?? '');
  const combined = `${name} ${code} ${msg}`;

  if (
    /UNAUTHENTICATED|FORBIDDEN|SESSION_|NO_APP_SESSION|MFA_REQUIRED|ACCOUNT_SUSPENDED|ACCOUNT_TERMINATED|INVALID_SIGNATURE|bad_oauth_state/i.test(
      combined,
    )
  ) {
    return 'AUTH';
  }
  if (/RATE_LIMITED|429|too many requests/i.test(combined)) {
    return 'RATE_LIMIT';
  }
  if (
    /CREDIT_EXHAUSTED|AI_QUOTA_EXHAUSTED|AUTOMATION_NOT_ENTITLED|DAILY_AI_CREDITS_EXHAUSTED|ACCOUNT_BLOCKED/i.test(
      combined,
    )
  ) {
    return 'ENTITLEMENT';
  }
  if (
    name.includes('ZodError') ||
    Array.isArray((error as { issues?: unknown })?.issues) ||
    /INVALID_BODY|INVALID_FORMAT|REQUIRED_FIELDS_MISSING|FILE_REQUIRED|PDF_REQUIRED|INVALID_PDF_SIGNATURE|PHOTO_REQUIRED|CONTACT_REQUIRED|TRUTHFULNESS_FAILED/i.test(
      combined,
    )
  ) {
    return 'VALIDATION';
  }
  if (/^(PGRST|42P|235|22P|080)/i.test(code) || /PGRST\d+|postgres|supabase|DB_ERROR|relation .* does not exist/i.test(combined)) {
    return 'DATABASE';
  }
  if (/AbortError|TimeoutError|ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed|network/i.test(combined)) {
    return 'NETWORK';
  }
  if (/AIGatewayError|PAYSTACK|FLUTTERWAVE|DODO|RESEND|PROVIDER_|UPSTREAM/i.test(combined)) {
    return 'EXTERNAL_API';
  }
  return 'INTERNAL';
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSecrets(value).slice(0, 600);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 2) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 24)) {
      if (/^(password|secret|token|authorization|apikey|api_key|service_role)$/i.test(k)) {
        out[k] = '<redacted>';
      } else {
        out[k.slice(0, 64)] = sanitizeLogValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(value).slice(0, 200);
}

/**
 * Emit a structured JSON server log entry with secret redaction, request
 * correlation ID, and deterministic error classification. Never throws.
 */
export function logServerEvent(
  level: LogLevel,
  event: string,
  context: {
    requestId?: string | null;
    route?: string;
    userId?: string | null;
    error?: unknown;
    meta?: Record<string, unknown>;
  } = {},
): void {
  try {
    const payload: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      event: event.slice(0, 120),
      requestId: context.requestId ?? null,
    };
    if (context.route) payload.route = context.route.slice(0, 160);
    if (context.userId) payload.userId = context.userId.slice(0, 36);
    if (context.error !== undefined) {
      payload.category = classifyError(context.error);
      const rawMessage =
        context.error instanceof Error
          ? context.error.message
          : String((context.error as { message?: unknown })?.message ?? context.error);
      payload.errorMessage = redactSecrets(rawMessage).slice(0, 500);
      const digest = (context.error as { digest?: unknown })?.digest;
      if (typeof digest === 'string' && digest) payload.digest = digest.slice(0, 80);
    }
    if (context.meta) {
      payload.meta = sanitizeLogValue(context.meta);
    }
    const serialized = JSON.stringify(payload);
    if (level === 'error') console.error(serialized);
    else if (level === 'warn') console.warn(serialized);
    else console.info(serialized);
  } catch {
    // Observability must never interrupt request handling.
  }
}
