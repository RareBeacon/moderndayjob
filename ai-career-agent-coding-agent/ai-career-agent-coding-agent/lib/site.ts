/** Canonical site origin, env-driven so the production domain can change
 *  (now jobiest.com) without a code edit. Falls back to the Vercel URL for
 *  dev/preview where NEXT_PUBLIC_APP_URL is unset.
 *  (Lives outside app/layout.tsx because Next restricts layout exports.) */
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://modernjob.vercel.app';
