'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

function safeNext(next?: string | null): string | null {
  if (!next) return null;
  const trimmed = next.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  // Prevent open redirects to external hosts via // or http
  if (trimmed.includes('://')) return null;
  return trimmed;
}

/**
 * Start OAuth via Server Action — stores PKCE verifier as httpOnly cookie.
 * This replaces the previous client-side signInWithOAuth which used JS-accessible cookies
 * and was prone to bad_oauth_state from double-clicks and cookie loss.
 */
export async function startOAuth(formData: FormData): Promise<void> {
  const rawProvider = formData.get('provider');
  const rawNext = formData.get('next');
  const provider = rawProvider === 'linkedin_oidc' || rawProvider === 'google' ? rawProvider : null;
  if (!provider) throw new Error('Invalid provider');

  const next = typeof rawNext === 'string' ? safeNext(rawNext) : null;
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const redirectTo = `${base}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      // Google prompt select_account helps returning users pick correct account
      queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });
  if (error) {
    const msg = error.message || 'oauth_failed';
    throw new Error(msg);
  }
  if (!data?.url) throw new Error('No OAuth URL returned');
  redirect(data.url);
}

/**
 * API equivalent for fetch-based starters (optional, keeps old buttons working during migration)
 */
export async function getOAuthUrl(provider: 'google' | 'linkedin_oidc', next?: string | null): Promise<string> {
  const safe = safeNext(next);
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const redirectTo = `${base}/auth/callback${safe ? `?next=${encodeURIComponent(safe)}` : ''}`;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined },
  });
  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL');
  return data.url;
}
