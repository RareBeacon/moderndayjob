/** Canonical site origin, env-driven so the production domain can change
 *  without a code edit. Falls back to the canonical production domain
 *  (jobiest.com) so transactional emails and canonical URLs never point at
 *  a stale host if NEXT_PUBLIC_APP_URL is missing. */
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://jobiest.com';
