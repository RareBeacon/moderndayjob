/**
 * Deterministic extraction helpers for the truthfulness checker. No AI, these
 * are the authoritative, side-effect-free signals (ARCHITECTURE §2: the AI must
 * never be the sole authority for truthfulness).
 */

/** Normalize a string for fuzzy matching: lowercase, collapse spaces, trim. */
export function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract quantitative claims that are classic fabrication vectors: percentages,
 * multipliers (e.g. "3x"), and currency amounts. Bare counts and years are
 * deliberately excluded, they are too noisy and often derivable from dates.
 *
 * Each match is returned lowercased with spaces removed so that "40 %" and
 * "40%" compare equal.
 */
export function extractMetrics(text: string): string[] {
  const out = new Set<string>();
  const clean = text ?? '';
  const patterns = [
    /\b\d+(?:[.,]\d+)?\s?%/g, // 40% / 12.5 %
    /\b\d+(?:\.\d+)?x\b/gi, // 3x / 2.5x
    /[$₦€£]\s?\d+(?:[.,]\d+)?\s?[kKmMbB]?/g, // $50k / ₦5,000
  ];
  for (const re of patterns) {
    for (const m of clean.matchAll(re)) {
      out.add(m[0].toLowerCase().replace(/\s+/g, ''));
    }
  }
  return [...out];
}

/**
 * Placeholder tokens models emit for missing facts. These assert nothing, so
 * they must never fail verification (a model writing "N/A" for an unknown
 * company is being honest, not fabricating). Checked only AFTER a profile
 * match fails, so a real entity that happens to look like one still passes
 * via the profile first.
 */
const PLACEHOLDERS = new Set([
  'n/a', 'n.a.', 'na', 'none', 'nil', 'null', 'undefined',
  'unknown', 'tbd', 'tba', 'tbc', '-', '--', 'not specified', 'not applicable',
]);

/** True when the value is a placeholder token (or empty), not a real asserted entity. */
export function isPlaceholder(value: string): boolean {
  const n = norm(value ?? '');
  return n === '' || PLACEHOLDERS.has(n);
}

/**
 * Does `claimed` match any known value? Bidirectional substring match after
 * normalization so "Google" matches "Google LLC" and vice-versa.
 */
export function matchesAny(claimed: string, known: string[]): boolean {
  const c = norm(claimed);
  if (!c) return true; // empty claim = nothing asserted
  const hit = known.some((k) => {
    const n = norm(k);
    return n && (c === n || c.includes(n) || n.includes(c));
  });
  if (hit) return true;
  return isPlaceholder(c); // placeholder with no profile grounding = nothing asserted
}

/**
 * Extract contact channels (emails, URLs, phone numbers) from generated text.
 * These are the classic prompt-injection payload: a malicious job description
 * can try to make the model embed an attacker's address or link into an
 * application document. Like metrics, every channel must be grounded in the
 * profile's own text or the document is rejected.
 *
 * Phone patterns are deliberately narrow (leading +, parentheses, or
 * 3-3-4/4-3-4 separated groups) so ranges like "2020-2021" or currency
 * amounts like "$5,000" never match.
 */
export interface ContactChannel {
  kind: 'email' | 'url' | 'phone';
  /** Normalized channel text as it appears in the document. */
  value: string;
  /** Lowercased URL host when kind === 'url', else null. */
  host: string | null;
}

export function extractContactChannels(text: string): ContactChannel[] {
  const clean = text ?? '';
  const out = new Map<string, ContactChannel>();
  const patterns: Array<[RegExp, ContactChannel['kind']]> = [
    [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g, 'email'],
    [/https?:\/\/[^\s<>"')\]]+/gi, 'url'],
    [/\bwww\.[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+[^\s<>"')\]]*/gi, 'url'],
    [/\+\d{1,3}[\s-]?(?:\d[\s-]?){8,12}/g, 'phone'],
    [/\(\d{3}\)\s?\d{3}[\s-]?\d{4}/g, 'phone'],
    [/\b\d{3}-\d{3}-\d{4}\b/g, 'phone'],
    [/\b0\d{3}[\s-]\d{3}[\s-]\d{4}\b/g, 'phone'],
    [/\b0\d{10}\b/g, 'phone'],
  ];
  for (const [re, kind] of patterns) {
    for (const m of clean.matchAll(re)) {
      const hit = m[0].replace(/[.,;:!?]+$/, '').replace(/\s+/g, ' ').trim();
      if (!hit) continue;
      let host: string | null = null;
      if (kind === 'url') {
        try {
          host = new URL(hit.startsWith('www.') ? `https://${hit}` : hit).host.toLowerCase();
        } catch {
          host = null;
        }
      }
      const value = kind === 'phone' ? hit.replace(/[^\d+]/g, '') : hit.toLowerCase();
      if (value) out.set(`${kind}:${value}`, { kind, value, host });
    }
  }
  return [...out.values()];
}

/**
 * Detect credential CLAIMS coarsely: the word "certified", or a known cert
 * acronym. Coarse on purpose, the value is checked against the profile, so a
 * claim with no profile grounding is flagged without fragile title parsing.
 */
export function extractCredentials(text: string): string[] {
  const clean = (text ?? '').toLowerCase();
  const out = new Set<string>();
  if (/\bcertified\b/.test(clean)) out.add('certified');
  for (const ac of ['pmp', 'cpa', 'cfa', 'cias', 'ceh', 'cissp', 'phr', 'shrm', 'aws', 'ccna', 'comptia', 'prince2']) {
    if (new RegExp(`\\b${ac}\\b`).test(clean)) out.add(ac);
  }
  return [...out];
}
