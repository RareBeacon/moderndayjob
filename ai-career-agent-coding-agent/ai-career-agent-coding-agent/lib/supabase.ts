import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

/**
 * `supabaseAdmin` is lazy so route modules can be imported at build time
 * (Next.js page-data collection) in environments without runtime secrets,
 * e.g. Vercel preview builds whose env vars are scoped to Production only.
 * The client is created on first real use at request time; a request that
 * needs the missing variables then fails loudly with the original Zod error.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseAdmin()[prop as keyof SupabaseClient];
  },
});
