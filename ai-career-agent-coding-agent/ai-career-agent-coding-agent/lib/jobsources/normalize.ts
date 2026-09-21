/** Shared normalization helpers for job source adapters. */

/** Strip HTML to plain text (dependency-free). Listing HTML is untrusted
 *  input: we only extract text, never interpret it. Greenhouse serves the
 *  HTML itself entity-escaped (&lt;p&gt;…), so we unescape the outer layer
 *  first, strip tags, then unescape whatever entities the inner layer kept
 *  (after stripping, so text like "&lt;3" can never become a live tag). */
const unescapeOnce = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

export function htmlToText(html: string): string {
  const stripped = unescapeOnce(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '');
  return unescapeOnce(stripped)
    .replace(/&nbsp;/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cap stored description length (listing bodies can be huge). */
export function capText(text: string, max = 20_000): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n\n[Truncated at ${max} characters]`;
}

/** Deterministic content hash for change detection. */
export async function contentHash(parts: Array<string | null | undefined>): Promise<string> {
  const joined = parts.filter((p) => p != null).join('¦');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(joined));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clean single-line strings; empty → null. */
export function cleanLine(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s.slice(0, 240) : null;
}
