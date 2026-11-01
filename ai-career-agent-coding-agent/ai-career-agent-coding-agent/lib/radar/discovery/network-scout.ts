/**
 * Phase 3 - Global Employment Intelligence Network Scout (Stages 1, 2 & 6)
 * =========================================================================
 * Discovers legitimate employers, newly exposed hiring infrastructure (ATS boards,
 * corporate `careers.*` / `jobs.*` subdomains, external application forms), and
 * community/open-feed opportunities using ZERO paid services:
 *
 *   1. Hacker News "Who is Hiring?" Algolia Item Parser (`hn.algolia.com/api/v1/items/<id>`)
 *   2. Certificate Transparency (`crt.sh/?q=%25.<domain>&output=json`) Career Subdomain Scout
 *   3. Common Crawl CDX JSONL (`index.commoncrawl.org/...`) ATS & Career Infrastructure Scout
 *   4. Compliant Keyless Public Job Feeds (`Arbeitnow`, `Jobicy`) tagged as
 *      `PUBLIC_AGGREGATOR_FEED` with mandatory attribution so `computeFirstMoverMetrics()`
 *      benchmarks Jobiest's direct-source lead time (`lead_time_hours`).
 */

import { capText, cleanLine, htmlToText } from '@/lib/jobsources/normalize';
import {
  detectHiringInfrastructureFromUrl,
  type DetectedHiringInfrastructure,
} from '@/lib/radar/intelligence/first-mover';
import type { RadarPostingInput, WorkplaceType } from '@/lib/radar/types';

export type DiscoveryChannel =
  | 'COMMON_CRAWL_CDX'
  | 'CT_SUBDOMAIN_LOG'
  | 'EMPLOYER_HOMEPAGE_LINK'
  | 'COMMUNITY_THREAD_LINK'
  | 'ADMIN_SUBMISSION';

export interface DiscoveredSourceCandidate {
  discoveredUrl: string;
  normalizedHost: string;
  detectedProvider: string | null;
  detectedBoardToken: string | null;
  employerDomainHint: string | null;
  discoveryChannel: DiscoveryChannel;
  sourceRegistryId: string | null;
}

export interface HnScoutResult {
  threadId: string;
  postings: RadarPostingInput[];
  discoveredCandidates: DiscoveredSourceCandidate[];
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function extractUrlsFromHtmlOrText(raw: string): string[] {
  const out = new Set<string>();
  const hrefRe = /href\s*=\s*["'](https?:\/\/[^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(raw)) !== null) {
    out.add(m[1].replace(/[.,;!?]+$/, ''));
  }
  const plain = htmlToText(raw);
  let um: RegExpExecArray | null;
  while ((um = URL_IN_TEXT_RE.exec(plain)) !== null) {
    out.add(um[0].replace(/[.,;!?]+$/, ''));
  }
  return [...out];
}

function inferWorkplaceFromSnippet(text: string): WorkplaceType {
  const lower = text.toLowerCase();
  if (/\bhybrid\b/.test(lower)) return 'HYBRID';
  if (/\bremote\b/.test(lower) && !/\bno\s+remote\b|\bonsite\s+only\b/.test(lower)) return 'REMOTE';
  if (/\bonsite\b|\bon-site\b|\bin-office\b/.test(lower)) return 'ONSITE';
  return 'UNKNOWN';
}

function toCandidateFromInfrastructure(
  infra: DetectedHiringInfrastructure,
  channel: DiscoveryChannel,
  domainHint: string | null = null,
): DiscoveredSourceCandidate | null {
  try {
    const parsed = new URL(infra.canonicalSourceUrl);
    return {
      discoveredUrl: infra.canonicalSourceUrl,
      normalizedHost: parsed.hostname.toLowerCase().replace(/^www\./, ''),
      detectedProvider: infra.providerKey,
      detectedBoardToken: infra.boardOrFormToken,
      employerDomainHint: domainHint,
      discoveryChannel: channel,
      sourceRegistryId: infra.sourceRegistryId,
    };
  } catch {
    return null;
  }
}

/**
 * Parse an Algolia Hacker News "Ask HN: Who is hiring?" thread JSON payload
 * (`https://hn.algolia.com/api/v1/items/<objectID>`).
 *
 * Standard HN top-level comment header convention:
 *   `Company Name | Role Title | Location | Remote / Onsite | Salary | https://...`
 */
export function parseHnWhoIsHiringItemJson(rawJson: string): HnScoutResult {
  const parsed = JSON.parse(rawJson) as {
    id?: number | string;
    title?: string;
    children?: Array<{
      id?: number | string;
      text?: string | null;
      created_at?: string | null;
    }>;
  };

  const threadId = String(parsed.id ?? 'unknown');
  const postings: RadarPostingInput[] = [];
  const candidateMap = new Map<string, DiscoveredSourceCandidate>();

  for (const child of parsed.children ?? []) {
    if (!child?.text || !child.id) continue;
    const plain = htmlToText(child.text);
    if (plain.length < 40) continue;

    const lines = plain
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const firstLine = lines[0];
    // Require pipe-delimited header (`Company | Role | ...`) to avoid non-job meta discussion
    const segments = firstLine.split('|').map((s) => cleanLine(s)).filter((s): s is string => Boolean(s));
    if (segments.length < 2) continue;

    const urls = extractUrlsFromHtmlOrText(child.text);
    let primaryApplyUrl: string | null = null;
    let domainHint: string | null = null;

    for (const u of urls) {
      const infra = detectHiringInfrastructureFromUrl(u);
      if (infra) {
        const cand = toCandidateFromInfrastructure(infra, 'COMMUNITY_THREAD_LINK', domainHint);
        if (cand && !candidateMap.has(cand.discoveredUrl)) {
          candidateMap.set(cand.discoveredUrl, cand);
        }
        if (!primaryApplyUrl) primaryApplyUrl = u;
      } else {
        try {
          const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '');
          if (!host.endsWith('ycombinator.com') && !host.endsWith('github.com')) {
            if (!domainHint) domainHint = host;
            if (!primaryApplyUrl) primaryApplyUrl = u;
          }
        } catch {
          // ignore invalid URL
        }
      }
    }

    const companyName = segments[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
    const roleCandidate = segments[1];
    if (!companyName || !roleCandidate || companyName.length > 90) continue;

    const locationSegment =
      segments.find((s, idx) => idx >= 2 && !/^https?:\/\//i.test(s) && !/^\$?\d/.test(s)) ?? null;

    const hnPermalink = `https://news.ycombinator.com/item?id=${child.id}`;
    const applyUrl = primaryApplyUrl ?? hnPermalink;

    postings.push({
      providerKey: 'hn_whoishiring',
      sourceId: `hn_whoishiring:${threadId}`,
      externalId: String(child.id),
      companyName,
      employerDomainHint: domainHint,
      title: capText(roleCandidate, 160),
      url: hnPermalink,
      applyUrl,
      descriptionPlain: capText(plain, 12_000),
      locationRaw: locationSegment,
      workplaceType: inferWorkplaceFromSnippet(firstLine),
      postedAt: child.created_at ? new Date(child.created_at).toISOString() : null,
      discoveryOrigin: 'COMMUNITY_HIRING_THREAD',
      attributionText: 'Discovered via Hacker News Who is Hiring community thread',
    });
  }

  return {
    threadId,
    postings,
    discoveredCandidates: [...candidateMap.values()],
  };
}

/**
 * Parse Certificate Transparency (`crt.sh/?q=%25.<domain>&output=json`) entries
 * to identify live hiring/career subdomains (`careers.acme.com`, `jobs.acme.com`,
 * `talent.acme.com`) without brute-forcing DNS.
 */
export function parseCrtShCertificatesJson(
  rawJson: string,
  opts: { nowMs?: number } = {},
): DiscoveredSourceCandidate[] {
  const nowMs = opts.nowMs ?? Date.now();
  const rows = JSON.parse(rawJson) as Array<{
    name_value?: string;
    common_name?: string;
    not_after?: string;
  }>;

  const CAREER_SUBDOMAIN_RE = /^(?:careers|jobs|hiring|talent|work|join)\.[a-z0-9.-]+\.[a-z]{2,}$/i;
  const seen = new Map<string, DiscoveredSourceCandidate>();

  for (const row of rows) {
    if (row.not_after) {
      const exp = Date.parse(row.not_after);
      if (Number.isFinite(exp) && exp < nowMs) continue;
    }

    const names = [
      ...(row.name_value ? row.name_value.split(/\r?\n/) : []),
      ...(row.common_name ? [row.common_name] : []),
    ];

    for (const rawName of names) {
      const host = rawName.trim().toLowerCase().replace(/^\*\./, '');
      if (!CAREER_SUBDOMAIN_RE.test(host)) continue;
      const parts = host.split('.');
      const rootDomain = parts.length >= 2 ? parts.slice(1).join('.') : host;
      const discoveredUrl = `https://${host}/`;
      if (!seen.has(discoveredUrl)) {
        seen.set(discoveredUrl, {
          discoveredUrl,
          normalizedHost: host,
          detectedProvider: 'jsonld_career',
          detectedBoardToken: host,
          employerDomainHint: rootDomain,
          discoveryChannel: 'CT_SUBDOMAIN_LOG',
          sourceRegistryId: `jsonld_career:${host}`,
        });
      }
    }
  }

  return [...seen.values()];
}

/**
 * Parse Common Crawl CDX Index JSON-Lines (`output=json`) to discover ATS board
 * tokens (`greenhouse`, `lever`, `ashby`, `workable`, `recruitee`, `pinpoint`,
 * `breezy`, `polymer`, `gem`, `teamtailor`, `personio`) at zero crawl cost.
 */
export function parseCommonCrawlCdxJsonLines(rawJsonLines: string): DiscoveredSourceCandidate[] {
  const seen = new Map<string, DiscoveredSourceCandidate>();
  const lines = rawJsonLines.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const rec = JSON.parse(trimmed) as { url?: string; status?: string | number };
      const status = Number(rec.status ?? 200);
      if (status >= 400 || !rec.url) continue;

      const infra = detectHiringInfrastructureFromUrl(rec.url);
      if (!infra || infra.kind !== 'ATS_BOARD' || !infra.boardOrFormToken) continue;

      const cand = toCandidateFromInfrastructure(infra, 'COMMON_CRAWL_CDX');
      if (cand && !seen.has(cand.discoveredUrl)) {
        seen.set(cand.discoveredUrl, cand);
      }
    } catch {
      // skip malformed JSONL line
    }
  }

  return [...seen.values()];
}

/**
 * Parse Arbeitnow keyless public API (`https://www.arbeitnow.com/api/job-board-api`).
 * Tagged as `PUBLIC_AGGREGATOR_FEED` with attribution so First-Mover metrics measure
 * lead time accurately against syndicated feeds.
 */
export function parseArbeitnowPayload(rawJson: string): RadarPostingInput[] {
  const parsed = JSON.parse(rawJson) as {
    data?: Array<{
      slug?: string;
      company_name?: string;
      title?: string;
      description?: string;
      remote?: boolean;
      url?: string;
      tags?: string[];
      job_types?: string[];
      location?: string;
      created_at?: number | string;
    }>;
  };

  const out: RadarPostingInput[] = [];
  for (const item of parsed.data ?? []) {
    if (!item.slug || !item.title || !item.company_name || !item.url) continue;
    const desc = htmlToText(item.description ?? '');
    if (desc.length < 20) continue;

    const createdSec = typeof item.created_at === 'number' ? item.created_at : Number(item.created_at);
    const postedAt =
      Number.isFinite(createdSec) && createdSec > 1_000_000_000
        ? new Date(createdSec * 1000).toISOString()
        : null;

    out.push({
      providerKey: 'arbeitnow_api',
      sourceId: 'arbeitnow_api:global',
      externalId: item.slug,
      companyName: item.company_name.trim(),
      title: cleanLine(item.title) ?? item.title.trim(),
      url: item.url,
      applyUrl: item.url,
      descriptionPlain: capText(desc, 16_000),
      locationRaw: cleanLine(item.location ?? '') ?? null,
      workplaceType: item.remote ? 'REMOTE' : item.location ? 'ONSITE' : 'UNKNOWN',
      employmentType: item.job_types?.length ? item.job_types.join(', ') : null,
      postedAt,
      discoveryOrigin: 'PUBLIC_AGGREGATOR_FEED',
      attributionText: 'Syndicated feed attribution: Arbeitnow (arbeitnow.com)',
    });
  }
  return out;
}

/**
 * Parse Jobicy keyless remote jobs API (`https://jobicy.com/api/v2/remote-jobs`).
 */
export function parseJobicyPayload(rawJson: string): RadarPostingInput[] {
  const parsed = JSON.parse(rawJson) as {
    jobs?: Array<{
      id?: number | string;
      url?: string;
      jobTitle?: string;
      companyName?: string;
      jobGeo?: string;
      jobLevel?: string;
      jobType?: string[];
      pubDate?: string;
      jobDescription?: string;
      annualSalaryMin?: number | string;
      annualSalaryMax?: number | string;
      salaryCurrency?: string;
    }>;
  };

  const out: RadarPostingInput[] = [];
  for (const j of parsed.jobs ?? []) {
    if (!j.id || !j.jobTitle || !j.companyName || !j.url) continue;
    const desc = htmlToText(j.jobDescription ?? '');
    if (desc.length < 20) continue;

    const sMin = j.annualSalaryMin != null && j.annualSalaryMin !== '' ? Number(j.annualSalaryMin) : null;
    const sMax = j.annualSalaryMax != null && j.annualSalaryMax !== '' ? Number(j.annualSalaryMax) : null;

    out.push({
      providerKey: 'jobicy_api',
      sourceId: 'jobicy_api:remote',
      externalId: String(j.id),
      companyName: htmlToText(j.companyName),
      title: htmlToText(j.jobTitle),
      url: j.url,
      applyUrl: j.url,
      descriptionPlain: capText(desc, 16_000),
      locationRaw: cleanLine(j.jobGeo ?? '') ?? 'Remote',
      workplaceType: 'REMOTE',
      remoteRegionRestriction: cleanLine(j.jobGeo ?? '') ?? null,
      seniorityLevel: cleanLine(j.jobLevel ?? '') ?? null,
      employmentType: j.jobType?.length ? j.jobType.join(', ') : null,
      salaryMin: sMin && Number.isFinite(sMin) && sMin > 0 ? sMin : null,
      salaryMax: sMax && Number.isFinite(sMax) && sMax > 0 ? sMax : null,
      salaryCurrency: j.salaryCurrency ? j.salaryCurrency.trim().toUpperCase() : null,
      salaryPeriod: sMin || sMax ? 'YEAR' : null,
      postedAt: j.pubDate && !Number.isNaN(Date.parse(j.pubDate)) ? new Date(j.pubDate).toISOString() : null,
      discoveryOrigin: 'PUBLIC_AGGREGATOR_FEED',
      attributionText: 'Syndicated feed attribution: Jobicy (jobicy.com)',
    });
  }
  return out;
}
