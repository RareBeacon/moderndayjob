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
    description: 'Jobiest is an AI career agent that finds job openings, prepares truthful tailored applications, and submits them only after the user approves. Includes 10 free career tools. Built in Lagos, Nigeria.',
    sameAs: [
      'https://www.instagram.com/jobiest_ai',
      'https://www.tiktok.com/@jobiest',
      'https://x.com/Jobiest_ai',
      'https://whatsapp.com/channel/0029VbE1oVxHVvTk2cnfdj2r',
    ],
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

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
