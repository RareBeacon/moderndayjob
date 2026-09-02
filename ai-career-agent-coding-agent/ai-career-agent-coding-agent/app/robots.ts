import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // authenticated surfaces and API have no business in an index
        disallow: ['/api/', '/dashboard', '/onboarding', '/profile', '/documents', '/applications', '/billing', '/jobs', '/match', '/generate', '/admin'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
