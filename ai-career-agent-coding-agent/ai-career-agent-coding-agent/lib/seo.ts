import { SITE_URL } from './site';

/**
 * JSON-LD builders (spec Part 11.2: structured data).
 * Only truthful values: no invented ratings, aggregates, or counts.
 */

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Jobiest',
    url: SITE_URL,
    description: 'Your AI career agent: find roles, build ATS-ready documents, apply with approval, track everything.',
  };
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Jobiest',
    url: SITE_URL,
    logo: `${SITE_URL}/icon.svg`,
  };
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}

export function softwareAppJsonLd(name: string, description: string, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    url: `${SITE_URL}${path}`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'NGN' },
  };
}

export function jsonLdTag(data: object) {
  return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}
