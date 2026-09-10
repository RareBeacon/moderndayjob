/**
 * Prompt-injection defenses (defense-in-depth, never a claim of immunity).
 *
 * User-supplied text (job descriptions, pasted resumes, notes) is UNTRUSTED
 * data. Before any of it is interpolated into a prompt we:
 *   1. cap its length (context / cost control);
 *   2. neutralize the most common instruction-injection patterns so they stop
 *      reading like system directives;
 *   3. (optionally) wrap it in explicit <UNTRUSTED ...> delimiters.
 *
 * These layers complement the system-prompt rule that untrusted text is data
 * only, and are deliberately conservative so normal job text is preserved.
 */

export const MAX_UNTRUSTED_CHARS = 12000;

// Patterns that try to escape the data context and speak as the system.
// Each maps to a safe replacement (never to an empty string that could merge
// words and corrupt the document).
const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  // "ignore all previous instructions", "disregard the above rules", ...
  [/\b(ignore|disregard|forget|override)\s+(all\s+)?(previous|prior|above|earlier|the)\s+(instructions?|rules?|prompts?|directions?)/gi, '[removed]'],
  // "you are now X", "you are no longer X", "from now on you are X"
  [/\byou\s+are\s+(now|no longer|actually)\b/gi, 'you are'],
  // role markers that read like a new message from another participant
  [/\b(system|assistant|developer)\s*:/gi, ''],
  // impersonation / persona commands
  [/\b(pretend|roleplay|impersonate)\b/gi, 'describe'],
  [/\bact\s+as\s+(an?\s+)?(ai|assistant|chatbot|model|language model)\b/gi, 'assist'],
  // prompt-exfiltration requests
  [/\b(reveal|print|show|repeat|output|echo)\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?|context)\b/gi, '[removed]'],
  // "developer mode" jailbreak phrases
  [/\b(developer|dummy|jailbreak|dan)\s+mode\b/gi, 'normal mode'],
  // code fences that could fake a structured/JSON boundary
  [/```/g, ''],
  // meta-instructions about the surrounding text
  [/\bthe\s+(above|previous|following)\s+(text|instructions?|content)\s+is\b/gi, 'the text is'],
];

/** Cap length and neutralize common instruction-injection patterns. */
export function defangUntrustedText(text: string, max: number = MAX_UNTRUSTED_CHARS): string {
  if (!text) return '';
  let out = String(text).slice(0, max);
  for (const [re, rep] of INJECTION_PATTERNS) out = out.replace(re, rep);
  return out.trim();
}

/** Wrap defanged text in explicit untrusted-data delimiters. */
export function wrapUntrusted(label: string, text: string, max?: number): string {
  const clean = defangUntrustedText(text, max);
  return `<UNTRUSTED:${label}>\n${clean}\n</UNTRUSTED:${label}>`;
}
