/**
 * Phase 4 - Deterministic Domain, DNS/MX & Corporate-to-ATS Link Corroborator
 * ===========================================================================
 * Enforces Condition 2:
 *   - Certifies employer domains ONLY using independently verifiable deterministic
 *     signals (DNS A/AAAA resolution, MX mail-server presence, and corporate
 *     website <-> ATS board cross-link attestation).
 *   - Produces audit-ready `VerificationEvidenceItem[]` with SHA-256 provenance
 *     hashes for `public.radar_verification_evidence`.
 */

import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import {
  detectHiringInfrastructureFromUrl,
  type DetectedHiringInfrastructure,
} from '@/lib/radar/intelligence/first-mover';
import type {
  DeterministicEmployerFacts,
  VerificationEvidenceItem,
} from '@/lib/radar/verification/evidence';

export interface DnsProbeAdapter {
  resolveAnyAddress(hostname: string): Promise<boolean>;
  resolveMxPresent(hostname: string): Promise<boolean>;
}

const defaultDnsProbe: DnsProbeAdapter = {
  async resolveAnyAddress(hostname: string): Promise<boolean> {
    try {
      const v4 = await dns.resolve4(hostname).catch(() => [] as string[]);
      if (v4.length > 0) return true;
      const v6 = await dns.resolve6(hostname).catch(() => [] as string[]);
      return v6.length > 0;
    } catch {
      return false;
    }
  },
  async resolveMxPresent(hostname: string): Promise<boolean> {
    try {
      const mx = await dns.resolveMx(hostname);
      return Array.isArray(mx) && mx.some((r) => Boolean(r.exchange && r.exchange.trim()));
    } catch {
      return false;
    }
  },
};

export function normalizeRegistrableDomain(rawDomainOrUrl: string | null | undefined): string | null {
  if (!rawDomainOrUrl || !rawDomainOrUrl.trim()) return null;
  const trimmed = rawDomainOrUrl.trim().toLowerCase();
  try {
    const candidate = trimmed.includes('://') ? new URL(trimmed).hostname : trimmed.split('/')[0];
    const clean = candidate.replace(/^www\./, '').replace(/\.$/, '');
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,24}$/.test(clean)) return null;
    return clean;
  } catch {
    return null;
  }
}

export interface CorroboratedDomainResult {
  normalizedDomain: string | null;
  domainResolves: boolean;
  mxPresent: boolean;
  linkedAtsBoards: DetectedHiringInfrastructure[];
  corporateLinksToTargetBoard: boolean;
  employerFacts: DeterministicEmployerFacts;
  evidenceItems: VerificationEvidenceItem[];
}

function hashEvidence(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export async function corroborateEmployerDomain(params: {
  domainOrWebsite: string | null | undefined;
  corporateHtmlSample?: string | null;
  expectedProviderKey?: string | null;
  expectedBoardToken?: string | null;
  dnsProbe?: DnsProbeAdapter;
}): Promise<CorroboratedDomainResult> {
  const normalizedDomain = normalizeRegistrableDomain(params.domainOrWebsite);
  if (!normalizedDomain) {
    return {
      normalizedDomain: null,
      domainResolves: false,
      mxPresent: false,
      linkedAtsBoards: [],
      corporateLinksToTargetBoard: false,
      employerFacts: {},
      evidenceItems: [],
    };
  }

  const probe = params.dnsProbe ?? defaultDnsProbe;
  const [domainResolves, mxPresent] = await Promise.all([
    probe.resolveAnyAddress(normalizedDomain),
    probe.resolveMxPresent(normalizedDomain),
  ]);

  const evidenceItems: VerificationEvidenceItem[] = [];
  if (domainResolves) {
    evidenceItems.push({
      evidenceKind: 'DNS_HTTPS_DOMAIN_RESOLUTION',
      isDeterministic: true,
      direction: 'POSITIVE',
      scoreDelta: 15,
      evidenceSummary: `Corporate domain ${normalizedDomain} resolves publicly via DNS A/AAAA`,
      evidenceHash: hashEvidence(`dns:${normalizedDomain}:ok`),
    });
  }

  if (mxPresent) {
    evidenceItems.push({
      evidenceKind: 'MX_RECORD_PRESENT',
      isDeterministic: true,
      direction: 'POSITIVE',
      scoreDelta: 10,
      evidenceSummary: `Corporate domain ${normalizedDomain} publishes active MX mail records`,
      evidenceHash: hashEvidence(`mx:${normalizedDomain}:ok`),
    });
  }

  const linkedMap = new Map<string, DetectedHiringInfrastructure>();
  let hasSchemaOrgOrganization = false;
  if (params.corporateHtmlSample) {
    hasSchemaOrgOrganization = /"@type"\s*:\s*"Organization"/i.test(params.corporateHtmlSample);
    const hrefRe = /href\s*=\s*["']([^"'#]+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = hrefRe.exec(params.corporateHtmlSample)) !== null) {
      try {
        const full = new URL(match[1], `https://${normalizedDomain}`).toString();
        const hit = detectHiringInfrastructureFromUrl(full);
        if (hit) {
          const key = `${hit.providerKey}:${(hit.boardOrFormToken ?? hit.canonicalSourceUrl).toLowerCase()}`;
          if (!linkedMap.has(key)) linkedMap.set(key, hit);
        }
      } catch {
        // ignore relative or malformed href
      }
    }
  }

  const linkedAtsBoards = [...linkedMap.values()];
  const expectedProvider = params.expectedProviderKey?.trim().toLowerCase() ?? null;
  const expectedToken = params.expectedBoardToken?.trim().toLowerCase() ?? null;
  const corporateLinksToTargetBoard = Boolean(
    expectedProvider &&
      expectedToken &&
      linkedAtsBoards.some(
        (b) =>
          b.providerKey.toLowerCase() === expectedProvider &&
          (b.boardOrFormToken ?? '').toLowerCase() === expectedToken,
      ),
  );

  if (corporateLinksToTargetBoard) {
    evidenceItems.push({
      evidenceKind: 'CORPORATE_DOMAIN_LINKS_TO_ATS',
      isDeterministic: true,
      direction: 'POSITIVE',
      scoreDelta: 30,
      evidenceSummary: `Official website https://${normalizedDomain} links directly to ${expectedProvider}:${expectedToken}`,
      evidenceHash: hashEvidence(`ats_link:${normalizedDomain}:${expectedProvider}:${expectedToken}`),
    });
  }

  if (hasSchemaOrgOrganization) {
    evidenceItems.push({
      evidenceKind: 'SCHEMA_ORG_ORGANIZATION_MATCH',
      isDeterministic: true,
      direction: 'POSITIVE',
      scoreDelta: 10,
      evidenceSummary: `Official website https://${normalizedDomain} embeds schema.org/Organization metadata`,
      evidenceHash: hashEvidence(`schema_org:${normalizedDomain}`),
    });
  }

  return {
    normalizedDomain,
    domainResolves,
    mxPresent,
    linkedAtsBoards,
    corporateLinksToTargetBoard,
    employerFacts: {
      corporateDomain: normalizedDomain,
      corporateDomainLinksToAtsBoard: corporateLinksToTargetBoard,
      domainResolvesHttps: domainResolves,
      mxRecordPresent: mxPresent,
      schemaOrgOrganizationMatched: hasSchemaOrgOrganization,
    },
    evidenceItems,
  };
}
