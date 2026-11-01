import type { DiscoveryOrigin, ExclusivityTier } from '../types';

/**
 * Jobiest Global Opportunity Radar - Employment Intelligence & First-Mover Engine
 *
 * Strategic North Star:
 * Beyond collecting jobs, Radar continuously maps employer hiring infrastructure
 * (ATS boards, career subdomains, external application forms) and measures
 * First-Mover Lead Time: how many hours earlier Jobiest discovered a verified
 * vacancy directly on employer infrastructure before any syndicated job board.
 */

export interface DetectedHiringInfrastructure {
  kind: 'ATS_BOARD' | 'EXTERNAL_APPLICATION_FORM' | 'CAREER_PAGE';
  providerKey: string;
  boardOrFormToken: string | null;
  canonicalSourceUrl: string;
  sourceRegistryId: string | null;
}

const DIRECT_ORIGINS = new Set<DiscoveryOrigin>([
  'FIRST_PARTY_EMPLOYER',
  'DIRECT_ATS_API',
  'DIRECT_EMPLOYER_CAREER_PAGE',
  'DIRECT_EXTERNAL_FORM',
  'COMMUNITY_HIRING_THREAD',
]);

/**
 * Inspect any outbound link found on an employer homepage, career page, Common Crawl
 * record, or hiring post and identify underlying ATS boards or external form infrastructure.
 */
export function detectHiringInfrastructureFromUrl(rawUrl: string): DetectedHiringInfrastructure | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if ((host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') && parts[0]) {
    const token = parts[0].toLowerCase();
    if (token !== 'embed' && token !== 'v1') {
      return {
        kind: 'ATS_BOARD',
        providerKey: 'greenhouse',
        boardOrFormToken: token,
        canonicalSourceUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true&pay_transparency=true`,
        sourceRegistryId: `greenhouse:${token}`,
      };
    }
  }

  if ((host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') && parts[0]) {
    const slug = parts[0].toLowerCase();
    const isEu = host.includes('.eu.');
    const providerKey = isEu ? 'lever_eu' : 'lever';
    const apiHost = isEu ? 'api.eu.lever.co' : 'api.lever.co';
    return {
      kind: 'ATS_BOARD',
      providerKey,
      boardOrFormToken: slug,
      canonicalSourceUrl: `https://${apiHost}/v0/postings/${encodeURIComponent(slug)}?mode=json`,
      sourceRegistryId: `${providerKey}:${slug}`,
    };
  }

  if (host === 'jobs.ashbyhq.com' && parts[0]) {
    const org = parts[0].toLowerCase();
    return {
      kind: 'ATS_BOARD',
      providerKey: 'ashby',
      boardOrFormToken: org,
      canonicalSourceUrl: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`,
      sourceRegistryId: `ashby:${org}`,
    };
  }

  if (host === 'apply.workable.com' && parts[0] && parts[0] !== 'j' && parts[0] !== 'api') {
    const account = parts[0].toLowerCase();
    return {
      kind: 'ATS_BOARD',
      providerKey: 'workable',
      boardOrFormToken: account,
      canonicalSourceUrl: `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`,
      sourceRegistryId: `workable:${account}`,
    };
  }

  if (host.endsWith('.recruitee.com')) {
    const slug = host.slice(0, -'.recruitee.com'.length);
    if (slug && slug !== 'api' && slug !== 'app') {
      return {
        kind: 'ATS_BOARD',
        providerKey: 'recruitee',
        boardOrFormToken: slug,
        canonicalSourceUrl: `https://${slug}.recruitee.com/api/offers/`,
        sourceRegistryId: `recruitee:${slug}`,
      };
    }
  }

  if (host.endsWith('.jobs.personio.de') || host.endsWith('.jobs.personio.com')) {
    const suffix = host.endsWith('.de') ? '.jobs.personio.de' : '.jobs.personio.com';
    const slug = host.slice(0, -suffix.length);
    if (slug) {
      return {
        kind: 'ATS_BOARD',
        providerKey: 'personio',
        boardOrFormToken: slug,
        canonicalSourceUrl: `https://${host}/xml?language=en`,
        sourceRegistryId: `personio:${slug}`,
      };
    }
  }

  if (host.endsWith('.pinpointhq.com')) {
    const slug = host.slice(0, -'.pinpointhq.com'.length);
    if (slug && slug !== 'app') {
      return {
        kind: 'ATS_BOARD',
        providerKey: 'pinpoint',
        boardOrFormToken: slug,
        canonicalSourceUrl: `https://${slug}.pinpointhq.com/postings.json`,
        sourceRegistryId: `pinpoint:${slug}`,
      };
    }
  }

  if (host === 'jobs.gem.com' && parts[0]) {
    const slug = parts[0].toLowerCase();
    return {
      kind: 'ATS_BOARD',
      providerKey: 'gem',
      boardOrFormToken: slug,
      canonicalSourceUrl: `https://api.gem.com/job_board/v0/${encodeURIComponent(slug)}/job_posts/`,
      sourceRegistryId: `gem:${slug}`,
    };
  }

  if (host === 'jobs.polymer.co' && parts[0]) {
    const slug = parts[0].toLowerCase();
    return {
      kind: 'ATS_BOARD',
      providerKey: 'polymer',
      boardOrFormToken: slug,
      canonicalSourceUrl: `https://api.polymer.co/v1/hire/organizations/${encodeURIComponent(slug)}/jobs`,
      sourceRegistryId: `polymer:${slug}`,
    };
  }

  if (host.endsWith('.breezy.hr')) {
    const slug = host.slice(0, -'.breezy.hr'.length);
    if (slug && slug !== 'app') {
      return {
        kind: 'ATS_BOARD',
        providerKey: 'breezy',
        boardOrFormToken: slug,
        canonicalSourceUrl: `https://${slug}.breezy.hr/json`,
        sourceRegistryId: `breezy:${slug}`,
      };
    }
  }

  if (host === 'docs.google.com' && parts[0] === 'forms' && parts.includes('e')) {
    const eIdx = parts.indexOf('e');
    const formId = parts[eIdx + 1] ?? null;
    if (formId) {
      return {
        kind: 'EXTERNAL_APPLICATION_FORM',
        providerKey: 'google_form',
        boardOrFormToken: formId,
        canonicalSourceUrl: `https://docs.google.com/forms/d/e/${formId}/viewform`,
        sourceRegistryId: null,
      };
    }
  }

  if (host === 'tally.so' && parts[0] === 'r' && parts[1]) {
    return {
      kind: 'EXTERNAL_APPLICATION_FORM',
      providerKey: 'tally_form',
      boardOrFormToken: parts[1],
      canonicalSourceUrl: `https://tally.so/r/${parts[1]}`,
      sourceRegistryId: null,
    };
  }

  if (
    /^\/(careers|jobs|open-roles|join-us|work-with-us)(\/|$)/i.test(url.pathname) ||
    host.startsWith('careers.') ||
    host.startsWith('jobs.')
  ) {
    return {
      kind: 'CAREER_PAGE',
      providerKey: 'jsonld_career',
      boardOrFormToken: host,
      canonicalSourceUrl: `https://${host}${url.pathname.replace(/\/+$/, '') || '/'}`,
      sourceRegistryId: `jsonld_career:${host}`,
    };
  }

  return null;
}

export interface FirstMoverMetrics {
  firstDirectSeenAt: string | null;
  firstSyndicatedSeenAt: string | null;
  leadTimeHours: number | null;
  exclusivityTier: ExclusivityTier;
}

/**
 * Compute or update First-Mover exclusivity and lead-time metrics when an
 * opportunity is observed from either a direct employer channel or an aggregator.
 */
export function computeFirstMoverMetrics(params: {
  existingFirstDirectSeenAt?: string | null;
  existingFirstSyndicatedSeenAt?: string | null;
  newObservationOrigin: DiscoveryOrigin;
  observedAtIso: string;
}): FirstMoverMetrics {
  const isFirstParty = params.newObservationOrigin === 'FIRST_PARTY_EMPLOYER';
  const isDirect = DIRECT_ORIGINS.has(params.newObservationOrigin);

  let firstDirect = params.existingFirstDirectSeenAt ?? null;
  let firstSyndicated = params.existingFirstSyndicatedSeenAt ?? null;

  if (isDirect) {
    if (!firstDirect || new Date(params.observedAtIso).getTime() < new Date(firstDirect).getTime()) {
      firstDirect = params.observedAtIso;
    }
  } else {
    if (!firstSyndicated || new Date(params.observedAtIso).getTime() < new Date(firstSyndicated).getTime()) {
      firstSyndicated = params.observedAtIso;
    }
  }

  if (isFirstParty && !firstSyndicated) {
    return {
      firstDirectSeenAt: firstDirect,
      firstSyndicatedSeenAt: null,
      leadTimeHours: null,
      exclusivityTier: 'FIRST_PARTY_EXCLUSIVE',
    };
  }

  if (firstDirect && !firstSyndicated) {
    return {
      firstDirectSeenAt: firstDirect,
      firstSyndicatedSeenAt: null,
      leadTimeHours: null,
      exclusivityTier: 'FIRST_MOVER_EXCLUSIVE',
    };
  }

  if (firstDirect && firstSyndicated) {
    const deltaHours = Number(
      ((new Date(firstSyndicated).getTime() - new Date(firstDirect).getTime()) / 3_600_000).toFixed(2),
    );
    return {
      firstDirectSeenAt: firstDirect,
      firstSyndicatedSeenAt: firstSyndicated,
      leadTimeHours: deltaHours,
      exclusivityTier: deltaHours > 0 ? 'EARLY_DIRECT' : 'SYNDICATED',
    };
  }

  return {
    firstDirectSeenAt: null,
    firstSyndicatedSeenAt: firstSyndicated,
    leadTimeHours: null,
    exclusivityTier: 'SYNDICATED',
  };
}
