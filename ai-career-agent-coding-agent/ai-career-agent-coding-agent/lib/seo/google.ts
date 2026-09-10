import { env } from '@/lib/env';
import { decryptSecret, encryptSecret } from '@packages/security/crypto';

export const GOOGLE_SEARCH_CONSOLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
];

export interface StoredGoogleTokens {
  accessTokenCiphertext?: string | null;
  refreshTokenCiphertext?: string | null;
  expiresAt?: string | null;
}

export interface OAuthTokenSet {
  accessTokenCiphertext: string;
  refreshTokenCiphertext?: string;
  expiresAt: string;
  rawScope?: string;
}

export interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface SearchAnalyticsRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SitemapEntry {
  path: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  lastDownloaded?: string;
  warnings?: string;
  errors?: string;
  contents?: unknown[];
}

export interface UrlInspectionResult {
  inspectionResult?: {
    inspectionResultLink?: string;
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
      sitemap?: string[];
      referringUrls?: string[];
      lastCrawlTime?: string;
    };
    richResultsResult?: unknown;
    ampResult?: unknown;
  };
}

function configuredRedirectUri(requestOrigin?: string): string {
  return env.GOOGLE_REDIRECT_URI || `${requestOrigin ?? env.NEXT_PUBLIC_APP_URL ?? 'https://jobiest.com'}/api/admin/seo/oauth/callback`;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function buildGoogleAuthUrl(input: { state: string; requestOrigin?: string }): string {
  if (!googleOAuthConfigured()) throw new Error('GOOGLE_OAUTH_NOT_CONFIGURED');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', configuredRedirectUri(input.requestOrigin));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('scope', GOOGLE_SEARCH_CONSOLE_SCOPES.join(' '));
  url.searchParams.set('state', input.state);
  return url.toString();
}

export async function exchangeGoogleCode(input: { code: string; requestOrigin?: string }): Promise<OAuthTokenSet> {
  if (!googleOAuthConfigured()) throw new Error('GOOGLE_OAUTH_NOT_CONFIGURED');
  const body = new URLSearchParams({
    code: input.code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: configuredRedirectUri(input.requestOrigin),
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`GOOGLE_TOKEN_${res.status}`);
  const json = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!json.access_token) throw new Error('GOOGLE_TOKEN_MISSING_ACCESS_TOKEN');
  return {
    accessTokenCiphertext: encryptSecret(json.access_token),
    refreshTokenCiphertext: json.refresh_token ? encryptSecret(json.refresh_token) : undefined,
    expiresAt: new Date(Date.now() + ((json.expires_in ?? 3600) - 60) * 1000).toISOString(),
    rawScope: json.scope,
  };
}

export async function refreshGoogleAccessToken(tokens: StoredGoogleTokens): Promise<OAuthTokenSet | null> {
  if (!tokens.refreshTokenCiphertext || !googleOAuthConfigured()) return null;
  const refreshToken = decryptSecret(tokens.refreshTokenCiphertext);
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`GOOGLE_REFRESH_${res.status}`);
  const json = await res.json() as { access_token: string; expires_in?: number; scope?: string };
  if (!json.access_token) throw new Error('GOOGLE_REFRESH_MISSING_ACCESS_TOKEN');
  return {
    accessTokenCiphertext: encryptSecret(json.access_token),
    expiresAt: new Date(Date.now() + ((json.expires_in ?? 3600) - 60) * 1000).toISOString(),
    rawScope: json.scope,
  };
}

export function tokenNeedsRefresh(tokens: StoredGoogleTokens): boolean {
  if (!tokens.accessTokenCiphertext || !tokens.expiresAt) return true;
  return new Date(tokens.expiresAt).getTime() <= Date.now() + 120_000;
}

export function decryptAccessToken(tokens: StoredGoogleTokens): string {
  if (!tokens.accessTokenCiphertext) throw new Error('GOOGLE_ACCESS_TOKEN_MISSING');
  return decryptSecret(tokens.accessTokenCiphertext);
}

async function googleFetch<T>(tokens: StoredGoogleTokens, url: string, init: RequestInit = {}): Promise<T> {
  const accessToken = decryptAccessToken(tokens);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GOOGLE_API_${res.status}:${text.slice(0, 300)}`);
  }
  if (res.status === 204) return {} as T;
  return await res.json() as T;
}

function site(siteUrl: string): string {
  return encodeURIComponent(siteUrl);
}

function feed(feedPath: string): string {
  return encodeURIComponent(feedPath);
}

export async function listSearchConsoleSites(tokens: StoredGoogleTokens): Promise<SearchConsoleSite[]> {
  const out = await googleFetch<{ siteEntry?: SearchConsoleSite[] }>(tokens, 'https://www.googleapis.com/webmasters/v3/sites');
  return out.siteEntry ?? [];
}

export async function querySearchAnalytics(tokens: StoredGoogleTokens, input: {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: unknown[];
}): Promise<SearchAnalyticsRow[]> {
  const body = {
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions: input.dimensions ?? ['query', 'page'],
    rowLimit: input.rowLimit ?? 25000,
    startRow: input.startRow ?? 0,
    dimensionFilterGroups: input.dimensionFilterGroups,
  };
  const out = await googleFetch<{ rows?: SearchAnalyticsRow[] }>(
    tokens,
    `https://www.googleapis.com/webmasters/v3/sites/${site(input.siteUrl)}/searchAnalytics/query`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  return out.rows ?? [];
}

export async function listSitemaps(tokens: StoredGoogleTokens, siteUrl: string): Promise<SitemapEntry[]> {
  const out = await googleFetch<{ sitemap?: SitemapEntry[] }>(
    tokens,
    `https://www.googleapis.com/webmasters/v3/sites/${site(siteUrl)}/sitemaps`,
  );
  return out.sitemap ?? [];
}

export async function getSitemap(tokens: StoredGoogleTokens, siteUrl: string, sitemapUrl: string): Promise<SitemapEntry> {
  return await googleFetch<SitemapEntry>(
    tokens,
    `https://www.googleapis.com/webmasters/v3/sites/${site(siteUrl)}/sitemaps/${feed(sitemapUrl)}`,
  );
}

export async function submitSitemap(tokens: StoredGoogleTokens, siteUrl: string, sitemapUrl: string): Promise<void> {
  await googleFetch<Record<string, never>>(
    tokens,
    `https://www.googleapis.com/webmasters/v3/sites/${site(siteUrl)}/sitemaps/${feed(sitemapUrl)}`,
    { method: 'PUT' },
  );
}

export async function inspectUrl(tokens: StoredGoogleTokens, input: { siteUrl: string; inspectionUrl: string; languageCode?: string }): Promise<UrlInspectionResult> {
  return await googleFetch<UrlInspectionResult>(tokens, 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    body: JSON.stringify({
      siteUrl: input.siteUrl,
      inspectionUrl: input.inspectionUrl,
      languageCode: input.languageCode ?? 'en-US',
    }),
  });
}

/**
 * Google Indexing API is intentionally not used for normal blog/content URLs.
 * Official docs restrict it to JobPosting and BroadcastEvent-in-VideoObject.
 */
export function indexingApiSupportedFor(contentType: string): boolean {
  return contentType === 'JobPosting' || contentType === 'BroadcastEvent';
}
