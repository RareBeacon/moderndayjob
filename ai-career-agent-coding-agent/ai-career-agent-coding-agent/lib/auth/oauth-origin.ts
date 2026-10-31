import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export const OAUTH_CTX_COOKIE = 'jobiest_oauth_ctx';

export function isAllowedOAuthHost(host: string): boolean {
  const clean = host.toLowerCase().split(':')[0] ?? '';
  if (
    clean === 'jobiest.com' ||
    clean === 'www.jobiest.com' ||
    clean === 'localhost' ||
    clean === '127.0.0.1' ||
    clean.endsWith('.vercel.app') ||
    clean.endsWith('.e2b.app')
  ) {
    return true;
  }
  try {
    const configuredHost = new URL(env.NEXT_PUBLIC_APP_URL).hostname.toLowerCase();
    if (configuredHost && clean === configuredHost) return true;
  } catch {}
  return false;
}

export function resolveRequestOrigin(request: NextRequest): string {
  const reqUrl = new URL(request.url);
  const fwdHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const fwdProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (fwdHost && isAllowedOAuthHost(fwdHost)) {
    const proto = fwdProto === 'http' || fwdProto === 'https' ? fwdProto : reqUrl.protocol.replace(':', '');
    return `${proto}://${fwdHost}`;
  }
  if (isAllowedOAuthHost(reqUrl.host)) {
    return reqUrl.origin;
  }
  return (env.NEXT_PUBLIC_APP_URL || 'https://jobiest.com').replace(/\/$/, '');
}
