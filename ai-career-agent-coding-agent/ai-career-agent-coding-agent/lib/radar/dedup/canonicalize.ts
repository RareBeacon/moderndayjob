import { createHash } from 'node:crypto';
import type { ApplyMechanism, RadarPostingInput, SupportedAutoApplyAdapter, WorkplaceType } from '../types';

/**
 * 4-Tier Requisition-Preserving Deduplication Engine (Condition 5)
 *
 * Core guarantee:
 * Employers frequently advertise identical job titles ("Senior Software Engineer",
 * "Account Executive") simultaneously in multiple countries or cities as distinct
 * headcount requisitions. This engine NEVER collapses distinct requisitions across:
 *   - different authoritative ATS requisition/job IDs on the same ATS,
 *   - different countries or cities,
 *   - different workplace modes (REMOTE vs ONSITE vs HYBRID),
 *   - different seniority levels when explicitly stated.
 *
 * At the same time, it deterministically merges syndicated copies of the EXACT SAME
 * vacancy across feeds (Tier 1 ATS ID -> Tier 2 Canonical Apply URL -> Tier 3
 * Employer+Title+Location+Workplace+Seniority -> Tier 4 64-bit SimHash within the
 * same Employer+Location+Workplace bucket), while emitting `requisitionClusterKey`
 * to group multi-location sibling campaigns without merging them.
 */

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gh_src',
  'lever-src',
  'lever-source',
  'ashby_jid_source',
  'src',
  'source',
  'ref',
  'referrer',
  'fbclid',
  'gclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'trk',
]);

const COUNTRY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  us: 'US',
  usa: 'US',
  'united states': 'US',
  'united states of america': 'US',
  uk: 'GB',
  gb: 'GB',
  'united kingdom': 'GB',
  england: 'GB',
  scotland: 'GB',
  canada: 'CA',
  ca: 'CA',
  nigeria: 'NG',
  ng: 'NG',
  kenya: 'KE',
  ke: 'KE',
  'south africa': 'ZA',
  za: 'ZA',
  ghana: 'GH',
  gh: 'GH',
  egypt: 'EG',
  eg: 'EG',
  germany: 'DE',
  deutschland: 'DE',
  de: 'DE',
  france: 'FR',
  fr: 'FR',
  netherlands: 'NL',
  nl: 'NL',
  spain: 'ES',
  es: 'ES',
  ireland: 'IE',
  ie: 'IE',
  sweden: 'SE',
  se: 'SE',
  poland: 'PL',
  pl: 'PL',
  india: 'IN',
  in: 'IN',
  singapore: 'SG',
  sg: 'SG',
  australia: 'AU',
  au: 'AU',
  brazil: 'BR',
  brasil: 'BR',
  br: 'BR',
  mexico: 'MX',
  mx: 'MX',
  uae: 'AE',
  'united arab emirates': 'AE',
  ae: 'AE',
  japan: 'JP',
  jp: 'JP',
});

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|plc|bv|ab|sas|pty|co)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 118);
}

export function normalizeJobTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\((?:m\/f\/d|f\/m\/d|m\/w\/d|all genders|h\/f)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonicalize an apply/posting URL while preserving requisition-identifying
 * query parameters (`gh_jid`, `jobId`, `reqId`, `postingId`, `id`, `loc`, `location`).
 */
export function canonicalizeJobUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    // Canonicalize Greenhouse alias hosts (`job-boards.greenhouse.io` / `boards.greenhouse.io`)
    if (host === 'job-boards.greenhouse.io') host = 'boards.greenhouse.io';

    const keptParams = [...parsed.searchParams.entries()]
      .filter(([key, val]) => {
        const k = key.toLowerCase();
        if (!val.trim()) return false;
        return !TRACKING_QUERY_PARAMS.has(k) && !k.startsWith('utm_');
      })
      .sort(([a], [b]) => a.localeCompare(b));

    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const qs = keptParams.length > 0
      ? `?${keptParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.trim())}`).join('&')}`
      : '';

    return `https://${host}${pathname}${qs}`;
  } catch {
    return null;
  }
}

/** Extract an embedded ATS provider + posting ID from known ATS URL shapes when present. */
export function extractAtsIdentityFromUrl(rawUrl: string): { provider: string; externalId: string } | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  // Greenhouse hosted or embedded (`?gh_jid=12345`)
  const ghJid = url.searchParams.get('gh_jid');
  if (ghJid && /^\d+$/.test(ghJid)) {
    return { provider: 'greenhouse', externalId: ghJid };
  }
  if ((host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') && parts.length >= 3 && parts[1] === 'jobs') {
    return { provider: 'greenhouse', externalId: `${parts[0].toLowerCase()}:${parts[2]}` };
  }
  if ((host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') && parts.length >= 2) {
    const postId = parts[1].toLowerCase();
    if (postId !== 'apply') {
      return { provider: host.includes('.eu.') ? 'lever_eu' : 'lever', externalId: `${parts[0].toLowerCase()}:${postId}` };
    }
  }
  if (host === 'jobs.ashbyhq.com' && parts.length >= 2) {
    return { provider: 'ashby', externalId: `${parts[0].toLowerCase()}:${parts[1].toLowerCase()}` };
  }
  if (host === 'apply.workable.com') {
    if (parts[0] === 'j' && parts[1]) {
      return { provider: 'workable', externalId: parts[1].toUpperCase() };
    }
    if (parts.length >= 3 && parts[1] === 'j' && parts[2]) {
      return { provider: 'workable', externalId: parts[2].toUpperCase() };
    }
  }
  return null;
}

/**
 * Parse structured location components carefully.
 * Note: "San Jose, CA" -> US (California), NOT Canada (`CA`)!
 */
export function normalizeLocationSignature(input: {
  locationRaw?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  countryCode?: string | null;
  workplaceType: WorkplaceType;
  remoteRegionRestriction?: string | null;
}): {
  normalizedCity: string | null;
  stateRegion: string | null;
  countryCode: string | null;
  signature: string;
} {
  let city = input.city?.trim() || null;
  let state = input.stateRegion?.trim() || null;
  let country = input.countryCode?.trim() || null;

  if (country) {
    const mapped = COUNTRY_ALIASES[country.toLowerCase()];
    country = mapped ?? (country.length === 2 ? country.toUpperCase() : country.toUpperCase().slice(0, 2));
  }

  const raw = (input.locationRaw ?? '').trim();
  if (raw && (!city || !country)) {
    // Strip workplace suffixes like "New York · Remote" or "London (Hybrid)"
    const cleaned = raw
      .replace(/[·•|]/g, ',')
      .replace(/\((?:remote|hybrid|on-?site|in-?office)[^)]*\)/gi, '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^(remote|hybrid|on-?site|full-?time|part-?time|contract)$/i.test(s));

    if (cleaned.length >= 3) {
      city = city ?? cleaned[0];
      state = state ?? cleaned[1];
      const last = cleaned[cleaned.length - 1].toLowerCase();
      country = country ?? COUNTRY_ALIASES[last] ?? null;
    } else if (cleaned.length === 2) {
      city = city ?? cleaned[0];
      const second = cleaned[1];
      const upperSecond = second.toUpperCase();
      // Guard against reading "San Jose, CA" (California) as Canada!
      if (US_STATE_CODES.has(upperSecond)) {
        state = state ?? upperSecond;
        country = country ?? 'US';
      } else {
        country = country ?? COUNTRY_ALIASES[second.toLowerCase()] ?? null;
      }
    } else if (cleaned.length === 1) {
      const only = cleaned[0];
      const mappedCountry = COUNTRY_ALIASES[only.toLowerCase()];
      if (mappedCountry) {
        country = country ?? mappedCountry;
      } else {
        city = city ?? only;
      }
    }
  }

  const normCity = city ? city.toLowerCase().replace(/\s+/g, ' ').trim() : null;
  const normState = state ? state.toLowerCase().replace(/\s+/g, ' ').trim() : null;
  const normCountry = country ? country.toUpperCase() : null;
  const normRemoteRegion = input.remoteRegionRestriction
    ? input.remoteRegionRestriction.toLowerCase().replace(/\s+/g, ' ').trim()
    : null;

  const signature = [
    input.workplaceType,
    normCountry ?? '_',
    normState ?? '_',
    normCity ?? '_',
    normRemoteRegion ?? '_',
  ].join(':');

  return {
    normalizedCity: normCity,
    stateRegion: normState,
    countryCode: normCountry,
    signature,
  };
}

/** Classify apply mechanism and supported auto-apply adapter from the destination URL. */
export function classifyApplyDestination(rawUrl: string): {
  applyMechanism: ApplyMechanism;
  autoApplyAdapter: SupportedAutoApplyAdapter | null;
  requiresHumanFormReview: boolean;
} {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { applyMechanism: 'EXTERNAL_REDIRECT', autoApplyAdapter: null, requiresHumanFormReview: true };
  }
  if (url.protocol === 'mailto:') {
    return { applyMechanism: 'EMAIL_APPLY', autoApplyAdapter: null, requiresHumanFormReview: true };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.toLowerCase();

  if (host === 'docs.google.com' && path.includes('/forms/')) {
    return { applyMechanism: 'GOOGLE_FORM', autoApplyAdapter: null, requiresHumanFormReview: true };
  }
  if (host === 'forms.gle') {
    return { applyMechanism: 'GOOGLE_FORM', autoApplyAdapter: null, requiresHumanFormReview: true };
  }
  if (host === 'tally.so' || host.endsWith('.tally.so')) {
    return { applyMechanism: 'TALLY_FORM', autoApplyAdapter: null, requiresHumanFormReview: true };
  }
  if (host === 'typeform.com' || host.endsWith('.typeform.com')) {
    return { applyMechanism: 'TYPEFORM', autoApplyAdapter: null, requiresHumanFormReview: true };
  }
  if (host === 'jotform.com' || host.endsWith('.jotform.com')) {
    return { applyMechanism: 'JOTFORM', autoApplyAdapter: null, requiresHumanFormReview: true };
  }
  if (host === 'forms.office.com' || host === 'forms.microsoft.com') {
    return { applyMechanism: 'MICROSOFT_FORM', autoApplyAdapter: null, requiresHumanFormReview: true };
  }
  if (host === 'airtable.com' && path.includes('/shr')) {
    return { applyMechanism: 'AIRTABLE_FORM', autoApplyAdapter: null, requiresHumanFormReview: true };
  }
  if (host === 'notion.site' || host.endsWith('.notion.site') || host === 'notion.so') {
    return { applyMechanism: 'NOTION_PAGE', autoApplyAdapter: null, requiresHumanFormReview: true };
  }

  // Native auto-apply supported ATS domains (aligned with lib/apply/registry.ts)
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    return { applyMechanism: 'ATS_NATIVE', autoApplyAdapter: 'greenhouse', requiresHumanFormReview: false };
  }
  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
    return { applyMechanism: 'ATS_NATIVE', autoApplyAdapter: 'lever', requiresHumanFormReview: false };
  }
  if (host === 'jobs.ashbyhq.com') {
    return { applyMechanism: 'ATS_NATIVE', autoApplyAdapter: 'ashby', requiresHumanFormReview: false };
  }
  if (host === 'apply.workable.com') {
    return { applyMechanism: 'ATS_NATIVE', autoApplyAdapter: 'workable', requiresHumanFormReview: false };
  }

  // Other verified ATS platforms (structured prep + direct link, no headless auto-submit)
  if (
    host.endsWith('.recruitee.com') ||
    host.endsWith('.jobs.personio.de') ||
    host.endsWith('.jobs.personio.com') ||
    host.endsWith('.pinpointhq.com') ||
    host === 'jobs.gem.com' ||
    host.endsWith('.breezy.hr') ||
    host.endsWith('.polymer.co') ||
    host === 'jobs.polymer.co' ||
    host.endsWith('.teamtailor.com') ||
    host === 'jobs.smartrecruiters.com'
  ) {
    return { applyMechanism: 'ATS_NATIVE', autoApplyAdapter: null, requiresHumanFormReview: true };
  }

  return { applyMechanism: 'DIRECT_CAREER_PAGE', autoApplyAdapter: null, requiresHumanFormReview: true };
}

/**
 * Deterministic 64-bit token SimHash (hex-encoded 16 chars) over normalized
 * job description text for Tier-4 near-duplicate syndication detection.
 */
export function computeDescriptionSimHash(text: string): string | null {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length >= 3);
  if (tokens.length < 8) return null;

  const weights = new Int32Array(64);
  for (const token of tokens) {
    // 8-byte SHA-256 prefix per token -> 64 bits
    const digest = createHash('sha256').update(token, 'utf8').digest();
    const hi = digest.readUInt32BE(0);
    const lo = digest.readUInt32BE(4);
    for (let bit = 0; bit < 32; bit++) {
      weights[bit] += (hi >>> (31 - bit)) & 1 ? 1 : -1;
      weights[bit + 32] += (lo >>> (31 - bit)) & 1 ? 1 : -1;
    }
  }

  let hex = '';
  for (let nibble = 0; nibble < 16; nibble++) {
    let val = 0;
    for (let b = 0; b < 4; b++) {
      if (weights[nibble * 4 + b] > 0) {
        val |= 1 << (3 - b);
      }
    }
    hex += val.toString(16);
  }
  return hex;
}

/** Bitwise Hamming distance between two 16-char hex 64-bit SimHashes. */
export function simhashHammingDistance(aHex: string | null | undefined, bHex: string | null | undefined): number {
  if (!aHex || !bHex || aHex.length !== 16 || bHex.length !== 16) return 64;
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    let xor = (Number.parseInt(aHex[i], 16) ^ Number.parseInt(bHex[i], 16)) & 0xf;
    while (xor > 0) {
      dist += xor & 1;
      xor >>>= 1;
    }
  }
  return dist;
}

export interface ComputedDedupIdentity {
  canonicalFingerprint: string;
  requisitionClusterKey: string;
  canonicalApplyUrl: string;
  canonicalUrlHash: string | null;
  titleCompanyLocHash: string;
  descriptionSimhash: string | null;
  normalizedTitle: string;
  employerKey: string;
  normalizedCity: string | null;
  stateRegion: string | null;
  countryCode: string | null;
  locationSignature: string;
  contentHash: string;
}

export function computeDedupIdentity(posting: RadarPostingInput): ComputedDedupIdentity {
  const employerKey =
    (posting.employerDomainHint ? normalizeSlug(posting.employerDomainHint) : '') ||
    (posting.employerSlugHint ? normalizeSlug(posting.employerSlugHint) : '') ||
    normalizeSlug(posting.companyName) ||
    'unknown-employer';

  const normalizedTitle = normalizeJobTitle(posting.title);
  const rawApplyUrl = posting.applyUrl?.trim() || posting.url.trim();
  const canonicalApplyUrl = canonicalizeJobUrl(rawApplyUrl) ?? rawApplyUrl;
  const canonicalUrlHash = canonicalApplyUrl ? sha256Hex(canonicalApplyUrl) : null;

  const loc = normalizeLocationSignature({
    locationRaw: posting.locationRaw,
    city: posting.city,
    stateRegion: posting.stateRegion,
    countryCode: posting.countryCode,
    workplaceType: posting.workplaceType,
    remoteRegionRestriction: posting.remoteRegionRestriction,
  });

  const seniorityNorm = (posting.seniorityLevel ?? '').trim().toLowerCase() || '_';
  const reqIdNorm = (posting.externalRequisitionId ?? '').trim().toLowerCase();

  // Multi-location sibling grouping key (shared by London + Lagos + Berlin openings of the same role)
  const requisitionClusterKey = sha256Hex(
    `cluster¦${employerKey}¦${normalizedTitle}¦${(posting.department ?? '').trim().toLowerCase()}`,
  );

  // Tier 3 composite hash (strictly includes locationSignature + seniority!)
  const titleCompanyLocHash = sha256Hex(
    `t3¦${employerKey}¦${normalizedTitle}¦${loc.signature}¦${seniorityNorm}`,
  );

  // Exact canonical vacancy fingerprint (Condition 5):
  // 1. If URL resolves to an authoritative ATS posting identity (e.g. boards.greenhouse.io/stripe/jobs/12345),
  //    both the direct ATS board and any aggregator pointing to that exact ATS URL share the same Tier-1 identity!
  // 2. Else if the source carries an explicit authoritative ATS externalId on a direct ATS source, bind to
  //    (providerKey, employerKey, externalId, locationSignature).
  // 3. Else bind to (canonicalUrlHash + locationSignature) so distinct location query/path pages stay separate.
  const atsFromUrl = extractAtsIdentityFromUrl(rawApplyUrl) ?? extractAtsIdentityFromUrl(posting.url);
  let canonicalFingerprint: string;
  if (atsFromUrl) {
    canonicalFingerprint = sha256Hex(`t1-ats-url¦${atsFromUrl.provider}¦${atsFromUrl.externalId}`);
  } else if (posting.discoveryOrigin === 'DIRECT_ATS_API' && posting.externalId.trim()) {
    canonicalFingerprint = sha256Hex(
      `t1-ats-id¦${posting.providerKey.toLowerCase()}¦${employerKey}¦${posting.externalId.trim()}¦${loc.signature}`,
    );
  } else if (reqIdNorm) {
    canonicalFingerprint = sha256Hex(`t1-req¦${employerKey}¦${reqIdNorm}¦${loc.signature}`);
  } else if (canonicalUrlHash) {
    canonicalFingerprint = sha256Hex(`t2-url¦${canonicalUrlHash}¦${loc.signature}`);
  } else {
    canonicalFingerprint = titleCompanyLocHash;
  }

  const descriptionSimhash = computeDescriptionSimHash(posting.descriptionPlain);
  const contentHash = sha256Hex(
    [
      employerKey,
      normalizedTitle,
      loc.signature,
      posting.salaryMin ?? '',
      posting.salaryMax ?? '',
      posting.salaryCurrency ?? '',
      posting.descriptionPlain.trim(),
    ].join('¦'),
  );

  return {
    canonicalFingerprint,
    requisitionClusterKey,
    canonicalApplyUrl,
    canonicalUrlHash,
    titleCompanyLocHash,
    descriptionSimhash,
    normalizedTitle,
    employerKey,
    normalizedCity: loc.normalizedCity,
    stateRegion: loc.stateRegion,
    countryCode: loc.countryCode,
    locationSignature: loc.signature,
    contentHash,
  };
}

/**
 * Determine whether two normalized postings represent the EXACT SAME vacancy
 * (syndication duplicate) vs distinct multi-city/multi-requisition openings.
 */
export function arePostingsSyndicationDuplicates(
  a: RadarPostingInput,
  b: RadarPostingInput,
): { duplicate: boolean; matchedTier: 1 | 2 | 3 | 4 | null } {
  // Never merge postings that declare different explicit requisition IDs on the same employer
  const idA = computeDedupIdentity(a);
  const idB = computeDedupIdentity(b);

  if (
    a.externalRequisitionId &&
    b.externalRequisitionId &&
    a.externalRequisitionId.trim().toLowerCase() !== b.externalRequisitionId.trim().toLowerCase()
  ) {
    return { duplicate: false, matchedTier: null };
  }

  if (
    a.discoveryOrigin === 'DIRECT_ATS_API' &&
    b.discoveryOrigin === 'DIRECT_ATS_API' &&
    a.providerKey.toLowerCase() === b.providerKey.toLowerCase() &&
    idA.employerKey === idB.employerKey &&
    a.externalId.trim() !== b.externalId.trim()
  ) {
    return { duplicate: false, matchedTier: null };
  }

  // Tier 1: Exact canonical fingerprint match (e.g. same Greenhouse/Lever/Ashby/Workable job ID)
  if (idA.canonicalFingerprint === idB.canonicalFingerprint) {
    return { duplicate: true, matchedTier: 1 };
  }

  // Condition 5 Guard: Never merge across different countries, cities, or workplace types!
  if (idA.locationSignature !== idB.locationSignature) {
    return { duplicate: false, matchedTier: null };
  }

  const senA = (a.seniorityLevel ?? '').trim().toLowerCase();
  const senB = (b.seniorityLevel ?? '').trim().toLowerCase();
  if (senA && senB && senA !== senB) {
    return { duplicate: false, matchedTier: null };
  }

  // Tier 2: Same canonical apply URL + same location signature
  if (idA.canonicalUrlHash && idA.canonicalUrlHash === idB.canonicalUrlHash) {
    return { duplicate: true, matchedTier: 2 };
  }

  // Tier 3 & Tier 4: Same employer + same normalized title + same location/workplace + near-identical description SimHash
  if (idA.titleCompanyLocHash === idB.titleCompanyLocHash) {
    if (idA.descriptionSimhash && idB.descriptionSimhash) {
      const dist = simhashHammingDistance(idA.descriptionSimhash, idB.descriptionSimhash);
      if (dist <= 3) {
        return { duplicate: true, matchedTier: 4 };
      }
      return { duplicate: false, matchedTier: null };
    }
    return { duplicate: true, matchedTier: 3 };
  }

  return { duplicate: false, matchedTier: null };
}
