/**
 * Deterministic `schema.org/JobPosting` Career-Page Parser & Link Graph Extractor
 * ===============================================================================
 * Supports Stage 2 (Hiring Infrastructure Discovery) and Stage 3 (Opportunity
 * Discovery) on verified corporate career pages without LLM guessing:
 *   - Honors `<meta name="robots" content="noindex">` / `X-Robots-Tag: noindex`.
 *   - Parses single objects, arrays, and `@graph` JSON-LD envelopes.
 *   - Detects expired postings via `validThrough` (`AUTHORITATIVE_VALID_THROUGH_EXPIRED`).
 *   - Extracts outbound ATS & external application form links so the Radar can
 *     continuously expand its Employment Intelligence graph.
 */

import { htmlToText } from '@/lib/jobsources/normalize';
import { isPageIndexingDisallowed } from '@/lib/radar/compliance/robots';
import {
  detectHiringInfrastructureFromUrl,
  type DetectedHiringInfrastructure,
} from '@/lib/radar/intelligence/first-mover';
import type { RadarPostingInput, SalaryPeriod, WorkplaceType } from '@/lib/radar/types';

export interface JsonLdExtractionResult {
  indexingBlocked: boolean;
  postings: RadarPostingInput[];
  expiredExternalIds: string[];
  discoveredInfrastructure: DetectedHiringInfrastructure[];
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function isJobPostingType(t: unknown): boolean {
  for (const item of asArray(t)) {
    if (typeof item === 'string' && /(?:^|\/|:)JobPosting$/i.test(item.trim())) {
      return true;
    }
  }
  return false;
}

function flattenJsonLdNodes(node: unknown, acc: Record<string, unknown>[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) flattenJsonLdNodes(child, acc);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (isJobPostingType(obj['@type'])) {
      acc.push(obj);
    }
    if (obj['@graph']) {
      flattenJsonLdNodes(obj['@graph'], acc);
    }
  }
}

function extractWorkplaceFromJsonLd(obj: Record<string, unknown>, locationText: string): WorkplaceType {
  const locType = String(obj.jobLocationType ?? '').toUpperCase();
  if (locType.includes('TELECOMMUTE') || locType.includes('REMOTE')) return 'REMOTE';
  const raw = locationText.toLowerCase();
  if (/\bhybrid\b/.test(raw)) return 'HYBRID';
  if (/\bremote\b/.test(raw)) return 'REMOTE';
  return locationText ? 'ONSITE' : 'UNKNOWN';
}

function normalizeJsonLdSalaryPeriod(raw: unknown): SalaryPeriod | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim().toUpperCase();
  if (u === 'YEAR' || u === 'ANNUAL' || u === 'YEARLY') return 'YEAR';
  if (u === 'MONTH' || u === 'MONTHLY') return 'MONTH';
  if (u === 'WEEK' || u === 'WEEKLY') return 'WEEK';
  if (u === 'DAY' || u === 'DAILY') return 'DAY';
  if (u === 'HOUR' || u === 'HOURLY') return 'HOUR';
  return null;
}

export function extractCareerPageIntelligence(input: {
  pageUrl: string;
  sourceId: string;
  companyFallback: string;
  html: string;
  xRobotsTagHeader?: string | null;
  nowMs?: number;
}): JsonLdExtractionResult {
  const nowMs = input.nowMs ?? Date.now();
  const headSample = input.html.slice(0, 16_384);

  if (
    isPageIndexingDisallowed({
      xRobotsTagHeader: input.xRobotsTagHeader,
      htmlHeadSample: headSample,
    })
  ) {
    return {
      indexingBlocked: true,
      postings: [],
      expiredExternalIds: [],
      discoveredInfrastructure: [],
    };
  }

  // 1. Discover outbound ATS / Form links embedded in the career page
  const discoveredMap = new Map<string, DetectedHiringInfrastructure>();
  const hrefRe = /href\s*=\s*["']([^"'#]+)["']/gi;
  let hrefMatch: RegExpExecArray | null;
  while ((hrefMatch = hrefRe.exec(input.html)) !== null) {
    try {
      const resolved = new URL(hrefMatch[1], input.pageUrl).toString();
      const hit = detectHiringInfrastructureFromUrl(resolved);
      if (hit) {
        const key = `${hit.providerKey}:${hit.boardOrFormToken ?? hit.canonicalSourceUrl}`;
        if (!discoveredMap.has(key)) discoveredMap.set(key, hit);
      }
    } catch {
      // ignore malformed href
    }
  }

  // 2. Extract `<script type="application/ld+json">` blocks
  const nodes: Record<string, unknown>[] = [];
  const scriptRe = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptRe.exec(input.html)) !== null) {
    const rawJson = scriptMatch[1].trim();
    if (!rawJson) continue;
    try {
      const parsed: unknown = JSON.parse(rawJson);
      flattenJsonLdNodes(parsed, nodes);
    } catch {
      // skip invalid JSON-LD block without failing valid siblings
    }
  }

  const postings: RadarPostingInput[] = [];
  const expiredExternalIds: string[] = [];

  for (const node of nodes) {
    const title = typeof node.title === 'string' ? htmlToText(node.title) : '';
    const descHtml = typeof node.description === 'string' ? node.description : '';
    const descriptionPlain = htmlToText(descHtml);

    const identifierObj =
      node.identifier && typeof node.identifier === 'object'
        ? (node.identifier as Record<string, unknown>)
        : null;
    const reqId =
      typeof identifierObj?.value === 'string' || typeof identifierObj?.value === 'number'
        ? String(identifierObj.value)
        : typeof node.identifier === 'string'
          ? node.identifier
          : null;

    const rawUrl = typeof node.url === 'string' ? node.url : input.pageUrl;
    let resolvedUrl = input.pageUrl;
    try {
      resolvedUrl = new URL(rawUrl, input.pageUrl).toString();
    } catch {
      resolvedUrl = input.pageUrl;
    }

    const externalId = reqId || resolvedUrl;

    // Authoritative `validThrough` check
    if (typeof node.validThrough === 'string') {
      const validMs = Date.parse(node.validThrough);
      if (Number.isFinite(validMs) && validMs < nowMs) {
        expiredExternalIds.push(externalId);
        continue;
      }
    }

    if (!title || descriptionPlain.length < 15) continue;

    const org =
      node.hiringOrganization && typeof node.hiringOrganization === 'object'
        ? (node.hiringOrganization as Record<string, unknown>)
        : null;
    const companyName =
      typeof org?.name === 'string' && org.name.trim() ? org.name.trim() : input.companyFallback;

    const firstLoc = asArray(node.jobLocation)[0];
    const addr =
      firstLoc && typeof firstLoc === 'object' && (firstLoc as Record<string, unknown>).address
        ? ((firstLoc as Record<string, unknown>).address as Record<string, unknown>)
        : null;

    const city = typeof addr?.addressLocality === 'string' ? addr.addressLocality : null;
    const stateRegion = typeof addr?.addressRegion === 'string' ? addr.addressRegion : null;
    const countryRaw = typeof addr?.addressCountry === 'string' ? addr.addressCountry : null;
    const countryCode = countryRaw && /^[A-Za-z]{2}$/.test(countryRaw.trim()) ? countryRaw.trim().toUpperCase() : null;
    const locationParts = [city, stateRegion, countryRaw].filter(Boolean);
    const locationRaw = locationParts.length > 0 ? locationParts.join(', ') : null;

    let salaryMin: number | null = null;
    let salaryMax: number | null = null;
    let salaryCurrency: string | null = null;
    let salaryPeriod: SalaryPeriod | null = null;
    if (node.baseSalary && typeof node.baseSalary === 'object') {
      const bs = node.baseSalary as Record<string, unknown>;
      salaryCurrency = typeof bs.currency === 'string' ? bs.currency.toUpperCase() : null;
      if (bs.value && typeof bs.value === 'object') {
        const v = bs.value as Record<string, unknown>;
        salaryMin = typeof v.minValue === 'number' ? v.minValue : typeof v.value === 'number' ? v.value : null;
        salaryMax = typeof v.maxValue === 'number' ? v.maxValue : salaryMin;
        salaryPeriod = normalizeJsonLdSalaryPeriod(v.unitText);
      }
    }

    const applyUrlRaw =
      typeof node.directApply === 'string'
        ? node.directApply
        : typeof node.applicationContact === 'string'
          ? node.applicationContact
          : resolvedUrl;

    postings.push({
      providerKey: 'jsonld_career',
      sourceId: input.sourceId,
      externalId,
      externalRequisitionId: reqId,
      companyName,
      title,
      url: resolvedUrl,
      applyUrl: applyUrlRaw,
      descriptionPlain,
      locationRaw,
      city,
      stateRegion,
      countryCode,
      workplaceType: extractWorkplaceFromJsonLd(node, locationRaw ?? ''),
      employmentType: Array.isArray(node.employmentType)
        ? node.employmentType.join(', ')
        : typeof node.employmentType === 'string'
          ? node.employmentType
          : null,
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryPeriod,
      postedAt: typeof node.datePosted === 'string' ? new Date(node.datePosted).toISOString() : null,
      discoveryOrigin: 'DIRECT_EMPLOYER_CAREER_PAGE',
    });
  }

  return {
    indexingBlocked: false,
    postings,
    expiredExternalIds,
    discoveredInfrastructure: [...discoveredMap.values()],
  };
}
