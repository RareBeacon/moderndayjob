import { createHash } from 'node:crypto';
import { assertSafeNavigation, type LookupFn } from '@/lib/agent/ssrf';
import { RADAR_USER_AGENT } from '../compliance/robots';

/**
 * DNS-Resolved SSRF-Guarded Conditional HTTP Fetcher
 *
 * Security & Efficiency guarantees:
 * 1. Every initial URL AND every 301/302/303/307/308 redirect hop is validated
 *    via `assertSafeNavigation()` (DNS lookup blocking loopback, RFC1918, CGNAT,
 *    link-local 169.254.169.254, IPv6 ULA, and obfuscated octal/hex/decimal IPs)
 *    BEFORE the hop is followed (`redirect: 'manual'`, max 3 redirects).
 * 2. Conditional GET (`If-None-Match` + `If-Modified-Since`) short-circuits
 *    unchanged feeds on HTTP 304 (`NOT_MODIFIED_304`), and SHA-256 body comparison
 *    short-circuits servers that omit 304 (`UNCHANGED_HASH`).
 * 3. Streaming byte budget (default 2 MiB) aborts oversized responses mid-stream
 *    without buffering unbounded memory.
 */

export const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_REDIRECT_HOPS = 3;

const ALLOWED_CONTENT_TYPES = [
  'application/json',
  'application/ld+json',
  'application/xml',
  'text/xml',
  'application/rss+xml',
  'application/atom+xml',
  'text/html',
  'text/plain',
];

export type ConditionalFetchOutcome =
  | 'OK_MODIFIED'
  | 'NOT_MODIFIED_304'
  | 'UNCHANGED_HASH'
  | 'AUTHORITATIVE_NOT_FOUND'
  | 'RATE_LIMITED_429'
  | 'HTTP_ERROR'
  | 'SSRF_OR_POLICY_BLOCKED'
  | 'BODY_TOO_LARGE'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'NETWORK_ERROR';

export interface ConditionalFetchOptions {
  url: string;
  etag?: string | null;
  lastModifiedHeader?: string | null;
  previousPayloadHash?: string | null;
  allowedDomains?: string[];
  maxBytes?: number;
  timeoutMs?: number;
  requireHttps?: boolean;
  acceptHeader?: string;
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
}

export interface ConditionalFetchResult {
  outcome: ConditionalFetchOutcome;
  httpStatus: number | null;
  finalUrl: string;
  bodyText: string | null;
  bytesFetched: number;
  payloadHash: string | null;
  etag: string | null;
  lastModifiedHeader: string | null;
  xRobotsTag: string | null;
  retryAfterSeconds: number | null;
  errorCode: string | null;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function parseRetryAfterSeconds(raw: string | null, nowMs: number = Date.now()): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(86_400, Math.max(1, Number.parseInt(trimmed, 10)));
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const deltaSec = Math.ceil((dateMs - nowMs) / 1000);
    return Math.min(86_400, Math.max(1, deltaSec));
  }
  return null;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isAllowedContentType(headerVal: string | null): boolean {
  if (!headerVal) return true;
  const mediaType = headerVal.split(';')[0].trim().toLowerCase();
  if (!mediaType) return true;
  return ALLOWED_CONTENT_TYPES.includes(mediaType) || mediaType.endsWith('+json') || mediaType.endsWith('+xml');
}

async function readBoundedText(response: Response, maxBytes: number): Promise<{ ok: true; text: string; bytes: number } | { ok: false; bytes: number }> {
  const declaredLen = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    return { ok: false, bytes: declaredLen };
  }

  if (!response.body) {
    const text = await response.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > maxBytes) return { ok: false, bytes };
    return { ok: true, text, bytes };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          return { ok: false, bytes: total };
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const combined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { ok: true, text: combined.toString('utf8'), bytes: total };
}

export async function conditionalSafeFetch(opts: ConditionalFetchOptions): Promise<ConditionalFetchResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requireHttps = opts.requireHttps ?? true;

  let currentUrl = opts.url;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let validated: URL;
    try {
      validated = await assertSafeNavigation(currentUrl, opts.allowedDomains ?? [], opts.lookup);
      if (requireHttps && validated.protocol !== 'https:') {
        throw new Error('HTTPS_REQUIRED');
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : 'SSRF_BLOCKED';
      return {
        outcome: 'SSRF_OR_POLICY_BLOCKED',
        httpStatus: null,
        finalUrl: currentUrl,
        bodyText: null,
        bytesFetched: 0,
        payloadHash: null,
        etag: null,
        lastModifiedHeader: null,
        xRobotsTag: null,
        retryAfterSeconds: null,
        errorCode: code,
      };
    }

    const headers: Record<string, string> = {
      'user-agent': RADAR_USER_AGENT,
      accept: opts.acceptHeader ?? 'application/json, application/ld+json, application/xml, text/html;q=0.9, */*;q=0.1',
    };
    if (opts.etag) headers['if-none-match'] = opts.etag;
    if (opts.lastModifiedHeader) headers['if-modified-since'] = opts.lastModifiedHeader;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetchFn(validated.toString(), {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const code = err instanceof Error ? err.name || err.message : 'FETCH_ERROR';
      return {
        outcome: 'NETWORK_ERROR',
        httpStatus: null,
        finalUrl: validated.toString(),
        bodyText: null,
        bytesFetched: 0,
        payloadHash: null,
        etag: null,
        lastModifiedHeader: null,
        xRobotsTag: null,
        retryAfterSeconds: null,
        errorCode: code,
      };
    } finally {
      clearTimeout(timer);
    }

    if (isRedirectStatus(res.status)) {
      const loc = res.headers.get('location');
      if (!loc || hop === MAX_REDIRECT_HOPS) {
        return {
          outcome: 'SSRF_OR_POLICY_BLOCKED',
          httpStatus: res.status,
          finalUrl: validated.toString(),
          bodyText: null,
          bytesFetched: 0,
          payloadHash: null,
          etag: null,
          lastModifiedHeader: null,
          xRobotsTag: null,
          retryAfterSeconds: null,
          errorCode: !loc ? 'REDIRECT_WITHOUT_LOCATION' : 'TOO_MANY_REDIRECTS',
        };
      }
      try {
        currentUrl = new URL(loc, validated).toString();
      } catch {
        return {
          outcome: 'SSRF_OR_POLICY_BLOCKED',
          httpStatus: res.status,
          finalUrl: validated.toString(),
          bodyText: null,
          bytesFetched: 0,
          payloadHash: null,
          etag: null,
          lastModifiedHeader: null,
          xRobotsTag: null,
          retryAfterSeconds: null,
          errorCode: 'INVALID_REDIRECT_URL',
        };
      }
      continue;
    }

    const etag = res.headers.get('etag');
    const lastModifiedHeader = res.headers.get('last-modified');
    const xRobotsTag = res.headers.get('x-robots-tag');
    const retryAfterSeconds = parseRetryAfterSeconds(res.headers.get('retry-after'));

    if (res.status === 304) {
      return {
        outcome: 'NOT_MODIFIED_304',
        httpStatus: 304,
        finalUrl: validated.toString(),
        bodyText: null,
        bytesFetched: 0,
        payloadHash: opts.previousPayloadHash ?? null,
        etag: etag ?? opts.etag ?? null,
        lastModifiedHeader: lastModifiedHeader ?? opts.lastModifiedHeader ?? null,
        xRobotsTag,
        retryAfterSeconds: null,
        errorCode: null,
      };
    }

    if (res.status === 404 || res.status === 410) {
      return {
        outcome: 'AUTHORITATIVE_NOT_FOUND',
        httpStatus: res.status,
        finalUrl: validated.toString(),
        bodyText: null,
        bytesFetched: 0,
        payloadHash: null,
        etag: null,
        lastModifiedHeader: null,
        xRobotsTag,
        retryAfterSeconds: null,
        errorCode: `HTTP_${res.status}`,
      };
    }

    if (res.status === 429) {
      return {
        outcome: 'RATE_LIMITED_429',
        httpStatus: 429,
        finalUrl: validated.toString(),
        bodyText: null,
        bytesFetched: 0,
        payloadHash: null,
        etag: null,
        lastModifiedHeader: null,
        xRobotsTag,
        retryAfterSeconds: retryAfterSeconds ?? 300,
        errorCode: 'HTTP_429',
      };
    }

    if (!res.ok) {
      return {
        outcome: 'HTTP_ERROR',
        httpStatus: res.status,
        finalUrl: validated.toString(),
        bodyText: null,
        bytesFetched: 0,
        payloadHash: null,
        etag: null,
        lastModifiedHeader: null,
        xRobotsTag,
        retryAfterSeconds,
        errorCode: `HTTP_${res.status}`,
      };
    }

    if (!isAllowedContentType(res.headers.get('content-type'))) {
      return {
        outcome: 'UNSUPPORTED_CONTENT_TYPE',
        httpStatus: res.status,
        finalUrl: validated.toString(),
        bodyText: null,
        bytesFetched: 0,
        payloadHash: null,
        etag,
        lastModifiedHeader,
        xRobotsTag,
        retryAfterSeconds: null,
        errorCode: 'UNSUPPORTED_CONTENT_TYPE',
      };
    }

    const bounded = await readBoundedText(res, maxBytes);
    if (!bounded.ok) {
      return {
        outcome: 'BODY_TOO_LARGE',
        httpStatus: res.status,
        finalUrl: validated.toString(),
        bodyText: null,
        bytesFetched: bounded.bytes,
        payloadHash: null,
        etag,
        lastModifiedHeader,
        xRobotsTag,
        retryAfterSeconds: null,
        errorCode: 'MAX_BYTES_EXCEEDED',
      };
    }

    const payloadHash = sha256Hex(bounded.text);
    if (opts.previousPayloadHash && payloadHash === opts.previousPayloadHash) {
      return {
        outcome: 'UNCHANGED_HASH',
        httpStatus: res.status,
        finalUrl: validated.toString(),
        bodyText: null,
        bytesFetched: bounded.bytes,
        payloadHash,
        etag,
        lastModifiedHeader,
        xRobotsTag,
        retryAfterSeconds: null,
        errorCode: null,
      };
    }

    return {
      outcome: 'OK_MODIFIED',
      httpStatus: res.status,
      finalUrl: validated.toString(),
      bodyText: bounded.text,
      bytesFetched: bounded.bytes,
      payloadHash,
      etag,
      lastModifiedHeader,
      xRobotsTag,
      retryAfterSeconds: null,
      errorCode: null,
    };
  }

  return {
    outcome: 'SSRF_OR_POLICY_BLOCKED',
    httpStatus: null,
    finalUrl: currentUrl,
    bodyText: null,
    bytesFetched: 0,
    payloadHash: null,
    etag: null,
    lastModifiedHeader: null,
    xRobotsTag: null,
    retryAfterSeconds: null,
    errorCode: 'TOO_MANY_REDIRECTS',
  };
}
