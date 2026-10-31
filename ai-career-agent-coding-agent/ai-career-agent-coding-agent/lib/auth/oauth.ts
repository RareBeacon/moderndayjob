'use server';

import { headers } from 'next/headers';
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

async function resolveActionOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0]?.trim();
    const proto = (h.get('x-forwarded-proto') || 'https').split(',')[0]?.trim();
    const clean = host.toLowerCase().split(':')[0] ?? '';
    if (
      clean === 'jobiest.com' ||
      clean === 'www.jobiest.com' ||
      clean === 'localhost' ||
      clean === '127.0.0.1' ||
      clean.endsWith('.vercel.app') ||
      clean.endsWith('.e2b.app')
    ) {
      return `${proto === 'http' ? 'http' : 'https'}://${host}`;
    }
  } catch {}
  return (env.NEXT_PUBLIC_APP_URL || 'https://jobiest.com').replace(/\/$/, '');
}

/**
 * Server Action fallback OAuth starter (primary buttons use GET /api/auth/oauth
 * so PKCE cookies are attached directly onto a standard HTTP 302 response).
 */
export async function startOAuth(formData: FormData): Promise<void> {
  const rawProvider = formData.get('provider');
  const rawNext = formData.get('next');
  const provider = rawProvider === 'linkedin_oidc' || rawProvider === 'google' ? rawProvider : null;
  if (!provider) throw new Error('Invalid provider');

  const next = typeof rawNext === 'string' ? safeNext(rawNext) : null;
  const base = await resolveActionOrigin();
  const qs = new URLSearchParams({ provider });
  if (next) qs.set('next', next);
  redirect(`${base}/api/auth/oauth?${qs.toString()}`);
}
