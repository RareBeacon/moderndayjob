import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/config · public runtime configuration for the native
 * Android app (`apps/jobiest-mobile`).
 *
 * Why this exists: an APK is installed on a device long after it was built, so
 * baking an API origin and an auth-project reference into the binary makes the
 * app break whenever the deployment moves. The native client fetches this once
 * at launch and falls back to its compiled-in defaults if the call fails.
 *
 * What it returns is public by design:
 *  - `apiBaseUrl`      the canonical origin (`NEXT_PUBLIC_APP_URL`), already
 *                      public in every email and canonical link;
 *  - `supabaseUrl` and `supabaseAnonKey` are the same `NEXT_PUBLIC_*` values the
 *                      website already ships in the browser bundle. The anon
 *                      key is a *public client* key: it grants nothing on its
 *                      own, every table it can reach is governed by Postgres
 *                      Row Level Security, and privileged work stays behind
 *                      server routes with the service-role key.
 *
 * No secret is exposed here: the service-role key, API keys, payment keys and
 * email keys never leave the server.
 */
export async function GET() {
  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  return NextResponse.json(
    {
      apiBaseUrl: appUrl,
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supportEmail: 'support@jobiest.com',
      // The native client uses this to refuse configurations it cannot talk to.
      minSupportedVersionCode: 1,
    },
    {
      headers: {
        // Public, non-user-specific: safe for short-lived caches.
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    },
  );
}
