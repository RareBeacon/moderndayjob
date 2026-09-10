import { SITE_URL } from '@/lib/site';

export const CORE_SEO_PATHS = [
  '/',
  '/how-it-works',
  '/about',
  '/pricing',
  '/blog',
  '/terms',
  '/privacy',
  '/refund',
] as const;

export const FREE_TOOL_SEO_PATHS = [
  '/free-job-description-analyzer',
  '/free-cover-letter-writer',
  '/free-resume-summary-generator',
  '/free-linkedin-headline-builder',
  '/free-interview-question-generator',
  '/free-skills-matcher',
  '/free-ats-resume-scanner',
  '/free-follow-up-email-writer',
  '/free-career-path-explorer',
  '/free-salary-insights',
] as const;

export const EXCLUDED_SEO_PATH_PREFIXES = [
  '/api',
  '/admin',
  '/dashboard',
  '/onboarding',
  '/profile',
  '/documents',
  '/applications',
  '/billing',
  '/jobs',
  '/match',
  '/generate',
  '/login',
  '/signup',
  '/reset-password',
] as const;

export function canonicalPublicUrl(path: string) {
  if (/^https:\/\//i.test(path)) return path.replace(/\/$/, '') || SITE_URL;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean === '/' ? SITE_URL : `${SITE_URL}${clean}`;
}

export function isAllowedPublicSeoUrl(urlOrPath: string) {
  try {
    const url = /^https?:\/\//i.test(urlOrPath) ? new URL(urlOrPath) : new URL(canonicalPublicUrl(urlOrPath));
    const site = new URL(SITE_URL);
    if (url.protocol !== 'https:') return false;
    if (url.hostname !== site.hostname) return false;
    if (url.search || url.hash) return false;
    const path = url.pathname.replace(/\/$/, '') || '/';
    return !EXCLUDED_SEO_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  } catch {
    return false;
  }
}
