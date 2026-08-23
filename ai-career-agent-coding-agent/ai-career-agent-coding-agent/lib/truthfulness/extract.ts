/**
 * Deterministic extraction helpers for the truthfulness checker. No AI — these
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
 * deliberately excluded — they are too noisy and often derivable from dates.
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
 * Does `claimed` match any known value? Bidirectional substring match after
 * normalization so "Google" matches "Google LLC" and vice-versa.
 */
export function matchesAny(claimed: string, known: string[]): boolean {
  const c = norm(claimed);
  if (!c) return true; // empty claim = nothing asserted
  return known.some((k) => {
    const n = norm(k);
    return n && (c === n || c.includes(n) || n.includes(c));
  });
}

/**
 * Detect credential CLAIMS coarsely: the word "certified", or a known cert
 * acronym. Coarse on purpose — the value is checked against the profile, so a
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
