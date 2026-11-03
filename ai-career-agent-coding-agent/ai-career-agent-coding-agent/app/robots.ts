import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The owner allows compliant search, answer, and training crawlers on public pages.
        // Private surfaces remain disallowed; robots directives are not access control.
        disallow: [
          '/api/',
          '/dashboard',
          '/onboarding',
          '/profile',
          '/settings',
          '/documents',
          '/applications',
          '/opportunities',
          '/portfolios',
          '/auto-apply',
          '/billing',
          '/generate',
          '/talent-pool',
          '/employer',
          '/admin',
          '/forgot-password',
          '/reset-password',
          '/verify-email',
          '/mfa-verify',
          '/complete-account',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
