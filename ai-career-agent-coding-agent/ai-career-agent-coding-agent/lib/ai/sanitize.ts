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
