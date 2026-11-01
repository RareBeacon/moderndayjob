import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // authenticated surfaces, auth recovery flows, and API have no business in an index
        disallow: [
          '/api/',
          '/dashboard',
          '/onboarding',
          '/profile',
          '/settings',
          '/documents',
          '/applications',
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
