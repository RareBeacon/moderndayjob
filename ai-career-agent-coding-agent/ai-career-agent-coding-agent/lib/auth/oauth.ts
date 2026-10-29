'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

function safeNext(next?: string | null): string | null {
  if (!next) return null;
  const trimmed = next.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('://')) return null;
  return trimmed;
}

/**
 * Fresh OAuth starter — minimal, correct, single purpose.
 * - Uses Supabase SSR httpOnly PKCE verifier (no client JS cookie)
 * - redirectTo is always https://jobiest.com/auth/callback plus optional ?next
 * - Only exchange happens in app/auth/callback/route.ts
 */
export async function startOAuth(formData: FormData): Promise<void> {
  const rawProvider = formData.get('provider');
  const rawNext = formData.get('next');
  const provider = rawProvider === 'linkedin_oidc' || rawProvider === 'google' ? rawProvider : null;
  if (!provider) throw new Error('Invalid provider');

  const next = typeof rawNext === 'string' ? safeNext(rawNext) : null;
  const base = (env.NEXT_PUBLIC_APP_URL || 'https://jobiest.com').replace(/\/$/, '');
  const redirectTo = `${base}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });
  if (error) throw new Error(error.message || 'oauth_failed');
  if (!data?.url) throw new Error('No OAuth URL returned');
  redirect(data.url);
}

export async function getOAuthUrl(provider: 'google' | 'linkedin_oidc', next?: string | null): Promise<string> {
  const safe = safeNext(next);
  const base = (env.NEXT_PUBLIC_APP_URL || 'https://jobiest.com').replace(/\/$/, '');
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
