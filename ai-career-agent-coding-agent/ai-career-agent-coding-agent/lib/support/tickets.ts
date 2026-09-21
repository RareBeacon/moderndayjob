/** Support ticket helpers (Workstream B). Shared by the API route and tests. */

export const SUPPORT_CATEGORIES = [
  'Account & Login',
  'Jobs',
  'CV & Resume',
  'Applications',
  'AI Agent',
  'Payments & Subscription',
  'Technical Issue',
  'Other',
] as const;

export const TICKET_ID_PATTERN = /^JBT-\d{8}-[A-Z2-9]{4}$/;

const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Ticket ids follow JBT-YYYYMMDD-XXXX with a random suffix per day. */
export function makeTicketId(now: Date = new Date()): string {
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const suffix = Array.from({ length: 4 }, () => SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)]).join('');
  return `JBT-${date}-${suffix}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
