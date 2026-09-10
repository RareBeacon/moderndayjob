/**
 * Em/en dash rule (spec §9): user-facing generated text must never contain
 * em dashes (U+2014), en dashes (U+2013), horizontal bars (U+2015) or figure
 * dashes (U+2012). They are replaced with a plain hyphen and collapsed
 * whitespace, since hyphens, commas, colons and parentheses are allowed.
 */
const DASH_RE = /[\u2012\u2013\u2014\u2015]/g;
/** Non-global twin for `hasDash`: a `/g` regex is stateful across `.test()` calls. */
const DASH_TEST = /[\u2012\u2013\u2014\u2015]/;

/** Replace every em/en-dash variant with a plain hyphen, then collapse runs. */
export function stripDashes(text: string): string {
  if (!text) return text;
  return text.replace(DASH_RE, '-').replace(/ {2,}/g, ' ');
}

/** True when the text contains any em/en-dash variant. */
export function hasDash(text: string): boolean {
  return DASH_TEST.test(text);
}

/**
 * Placeholder cleanup for generated text. Models sometimes emit "N/A"-style
 * tokens for missing facts despite instructions; leaving them in a saved CV
 * looks broken, so they are removed along with any separator left dangling
 * ("AI Engineer · N/A" becomes "AI Engineer"). Only N/A forms are removed
 * standalone (they are never legitimate prose); wordier tokens (Unknown, TBD,
 * ...) are removed solely in separator-led/trailed positions so real sentences
 * are never mangled. JSON-safe: quoted values become empty strings, structure
 * is preserved.
 */
const PLACEHOLDER_WORDS = 'n\\/a|n\\.a\\.|unknown|tbd|tba|tbc|not specified|not applicable';
const SEP = '[·•|/\\-]';
const TRAILING_PLACEHOLDER = new RegExp(`\\s*(?<![\\w/:])${SEP}\\s*(?:${PLACEHOLDER_WORDS})\\b`, 'gi');
const LEADING_PLACEHOLDER = new RegExp(`(?<![\\w/:])\\b(?:${PLACEHOLDER_WORDS})\\s*${SEP}\\s*`, 'gi');
const BARE_NA = /(?<![/:])\bn\/a\b/gi;
const BARE_NA_DOTS = /(?<![/:])\bn\.a\./gi;

export function stripPlaceholders(text: string): string {
  if (!text) return text;
  return text
    .replace(TRAILING_PLACEHOLDER, '')
    .replace(LEADING_PLACEHOLDER, '')
    .replace(BARE_NA, '')
    .replace(BARE_NA_DOTS, '')
    .replace(/ {2,}/g, ' ');
}
