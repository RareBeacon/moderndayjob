import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  return {
    authedUser: null as { id: string; email: string } | null,
    adminUser: null as { id: string; email: string } | null,
    simulateMissingSchema: false,
    radarJobRows: [] as Record<string, unknown>[],
    candidateRow: null as Record<string, unknown> | null,
    upsertedSources: [] as Record<string, unknown>[],
    upsertedExclusions: [] as Record<string, unknown>[],
  };
});

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(async () => {
    if (!m.authedUser) throw new Error('UNAUTHENTICATED');
    return m.authedUser;
  }),
}));

vi.mock('@/lib/admin', () => ({
  requireAdminUser: vi.fn(async () => {
    if (!m.adminUser) {
      const err = new Error('FORBIDDEN') as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    return m.adminUser;
  }),
  adminErrorResponse: vi.fn((err: { status?: number; message?: string }) =>
    new Response(JSON.stringify({ error: err.message ?? 'FORBIDDEN' }), { status: err.status ?? 403 }),
  ),
}));

vi.mock('@/lib/audit', () => ({
  auditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true })),
  requestIp: vi.fn(() => '198.51.100.7'),
}));

vi.mock('@/lib/supabase', () => {
  const missingErr = { code: '42P01', message: 'relation "public.radar_jobs" does not exist' };

  const from = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () => chain,
      not: () => chain,
      eq: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      update: () => chain,
      upsert: (payload: Record<string, unknown>) => {
        if (table === 'job_sources') m.upsertedSources.push(payload);
        if (table === 'radar_exclusions') m.upsertedExclusions.push(payload);
        return Promise.resolve({
          data: payload,
          error: m.simulateMissingSchema ? missingErr : null,
        });
      },
      maybeSingle: async () => {
        if (m.simulateMissingSchema && table.startsWith('radar_')) {
          return { data: null, error: missingErr };
        }
        if (table === 'radar_source_candidates') {
          return { data: m.candidateRow, error: null };
        }
        if (table === 'job_preferences') {
          return {
            data: {
              target_roles: ['Backend Engineer'],
              preferred_locations: ['Lagos', 'London'],
              remote_only: false,
              min_salary: 80000,
              salary_currency: 'USD',
            },
            error: null,
          };
        }
        if (table === 'career_profiles') {
          return {
            data: {
              headline: 'Senior Go & PostgreSQL Engineer',
              summary: 'Distributed payment systems and Kubernetes infrastructure.',
              skills: ['go', 'postgresql', 'kubernetes'],
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
      then: (res: (v: unknown) => void) => {
        if (m.simulateMissingSchema && table.startsWith('radar_')) {
          return res({ data: null, error: missingErr });
        }
        if (table === 'radar_jobs') {
          return res({ data: m.radarJobRows, error: null });
        }
        return res({ data: [], error: null });
      },
    };
    return chain;
  };

  const rpc = vi.fn(async (fnName: string) => {
    if (m.simulateMissingSchema) {
      return { data: null, error: missingErr };
    }
    if (fnName === 'get_radar_intelligence_summary') {
      return {
        data: {
          total_active_jobs: 12,
          first_party_exclusive_count: 3,
          first_mover_exclusive_count: 7,
          early_direct_count: 2,
          syndicated_count: 0,
          avg_lead_time_hours: 19.4,
          verified_employers_count: 8,
          pending_source_candidates_count: 4,
          scams_rejected_count: 2,
          active_exclusions_count: 1,
        },
        error: null,
      };
    }
    return { data: [], error: null };
  });

  return { supabaseAdmin: { from, rpc } };
});

import {
  parseArbeitnowPayload,
  parseCommonCrawlCdxJsonLines,
  parseCrtShCertificatesJson,
  parseHnWhoIsHiringItemJson,
  parseJobicyPayload,
} from '@/lib/radar/discovery/network-scout';
import {
  buildRadarJobEmbedding384,
  formatPgVectorLiteral,
  rankRadarOpportunitiesForCandidate,
} from '@/lib/radar/matching/semantic-matcher';
import type { RadarJobRow } from '@/lib/radar/types';
import { GET as getRadarOpportunities } from '@/app/api/radar/opportunities/route';
import { GET as getAdminRadar, POST as postAdminRadar } from '@/app/api/admin/radar/route';

function sampleRadarJob(overrides: Partial<RadarJobRow> = {}): RadarJobRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    employer_id: '22222222-2222-4222-8222-222222222222',
    recruitment_vacancy_id: null,
    primary_source_id: 'greenhouse:paygrid',
    canonical_fingerprint: 'a'.repeat(64),
    requisition_cluster_key: 'b'.repeat(24),
    canonical_url_hash: 'c'.repeat(64),
    title_company_loc_hash: 'd'.repeat(64),
    description_simhash: '0011223344556677',
    external_requisition_id: 'REQ-1',
    title: 'Senior Backend Engineer',
    normalized_title: 'senior backend engineer',
    company_name: 'PayGrid',
    department: 'Core Infrastructure',
    career_category: 'Engineering',
    seniority_level: 'SENIOR',
    employment_type: 'FULL_TIME',
    workplace_type: 'REMOTE',
    location_raw: 'Lagos, Nigeria',
    normalized_city: 'lagos',
    state_region: null,
    country_code: 'NG',
    country_codes: ['NG'],
    remote_region_restriction: null,
    visa_sponsorship: true,
    salary_min: 110000,
    salary_max: 145000,
    salary_currency: 'USD',
    salary_period: 'YEAR',
    skills_required: ['go', 'postgresql', 'kubernetes'],
    skills_preferred: ['rust'],
    experience_years_min: 5,
    experience_years_max: 8,
    description_clean:
      'Design high-throughput payment ledgers in Go, PostgreSQL, and Kubernetes across African and European markets.',
    content_hash: 'e'.repeat(64),
    extraction_method: 'DETERMINISTIC',
    apply_url: 'https://boards.greenhouse.io/paygrid/jobs/101',
    canonical_apply_url: 'https://boards.greenhouse.io/paygrid/jobs/101',
    apply_mechanism: 'ATS_NATIVE',
    auto_apply_adapter: 'greenhouse',
    requires_human_form_review: false,
    employer_verification_status: 'EVIDENCE_VERIFIED',
    vacancy_authenticity_status: 'DOMAIN_CORROBORATED',
    verified_by_deterministic_evidence: true,
    employer_legitimacy_score: 92,
    job_authenticity_score: 94,
    application_safety_score: 96,
    composite_confidence: 94,
    verification_status: 'VERIFIED_HIGH_TRUST',
    risk_flags: [],
    lifecycle_status: 'ACTIVE',
    missing_poll_streak: 0,
    first_missing_at: null,
    closure_signal: 'NONE',
    posted_at: '2026-10-31T12:00:00.000Z',
    valid_through: null,
    first_seen_at: '2026-10-31T12:00:00.000Z',
    last_seen_at: '2026-11-01T08:00:00.000Z',
    last_confirmed_live_at: '2026-11-01T08:00:00.000Z',
    expired_at: null,
    discovery_origin: 'DIRECT_ATS_API',
    first_direct_seen_at: '2026-10-31T12:00:00.000Z',
    first_syndicated_seen_at: null,
    lead_time_hours: null,
    exclusivity_tier: 'FIRST_MOVER_EXCLUSIVE',
    attribution_text: null,
    ...overrides,
  };
}

beforeEach(() => {
  m.authedUser = null;
  m.adminUser = null;
  m.simulateMissingSchema = false;
  m.radarJobRows = [];
  m.candidateRow = null;
  m.upsertedSources.length = 0;
  m.upsertedExclusions.length = 0;
});

describe('Phase 3: Employment Intelligence Network Scout (HN, CT Logs, Common Crawl CDX, Open Feeds)', () => {
  it('parses HN Who is Hiring threads into direct postings + discovered ATS/Form candidates', () => {
    const hnPayload = JSON.stringify({
      id: 49922569,
      title: 'Ask HN: Who is hiring? (November 2026)',
      children: [
        {
          id: 49930001,
          created_at: '2026-11-01T09:00:00.000Z',
          text: '<p>FluxDB (YC S25) | Founding Storage Engineer | San Francisco, CA | Hybrid | $190k-$240k | <a href="https://jobs.ashbyhq.com/fluxdb/role-1">https://jobs.ashbyhq.com/fluxdb/role-1</a></p><p>Building next-gen NVMe storage engines in Rust.</p>',
        },
        {
          id: 49930002,
          created_at: '2026-11-01T09:10:00.000Z',
          text: '<p>Kora Studio | Product Designer | Remote (Africa/EU) | <a href="https://tally.so/r/w8Lm2Q">https://tally.so/r/w8Lm2Q</a> - Designing cross-border treasury tools.</p>',
        },
        {
          id: 49930003,
          text: '<p>Just a meta comment asking if salaries are trending up this quarter.</p>',
        },
      ],
    });

    const out = parseHnWhoIsHiringItemJson(hnPayload);
    expect(out.postings).toHaveLength(2);
    expect(out.postings[0].companyName).toBe('FluxDB');
    expect(out.postings[0].workplaceType).toBe('HYBRID');
    expect(out.discoveredCandidates.map((c) => `${c.detectedProvider}:${c.detectedBoardToken}`)).toEqual([
      'ashby:fluxdb',
      'tally_form:w8Lm2Q',
    ]);
  });

  it('extracts live career subdomains from Certificate Transparency JSON and skips expired certs', () => {
    const crtPayload = JSON.stringify([
      {
        name_value: 'careers.moniepoint.com\n*.careers.moniepoint.com\napi.moniepoint.com',
        not_after: '2027-03-01T00:00:00Z',
      },
      {
        name_value: 'jobs.expired-startup.io',
        not_after: '2025-01-01T00:00:00Z',
      },
    ]);

    const cands = parseCrtShCertificatesJson(crtPayload, {
      nowMs: Date.parse('2026-11-01T00:00:00Z'),
    });
    expect(cands).toHaveLength(1);
    expect(cands[0]).toMatchObject({
      normalizedHost: 'careers.moniepoint.com',
      employerDomainHint: 'moniepoint.com',
      discoveryChannel: 'CT_SUBDOMAIN_LOG',
    });
  });

  it('discovers ATS board tokens from Common Crawl CDX JSONL and skips HTTP 404 entries', () => {
    const cdxLines = [
      JSON.stringify({ url: 'https://boards.greenhouse.io/paystack/jobs/9911', status: '200' }),
      JSON.stringify({ url: 'https://nordcloud.recruitee.com/o/go-engineer', status: '200' }),
      JSON.stringify({ url: 'https://boards.greenhouse.io/deadboard/jobs/1', status: '404' }),
    ].join('\n');

    const cands = parseCommonCrawlCdxJsonLines(cdxLines);
    expect(cands.map((c) => c.sourceRegistryId)).toEqual(['greenhouse:paystack', 'recruitee:nordcloud']);
  });

  it('parses Arbeitnow and Jobicy open feeds with mandatory PUBLIC_AGGREGATOR_FEED attribution', () => {
    const arb = parseArbeitnowPayload(
      JSON.stringify({
        data: [
          {
            slug: 'go-eng-berlin-1',
            company_name: 'FinWeber GmbH',
            title: 'Go Platform Engineer',
            description: '<p>Build regulated banking APIs in Go and Kafka across Europe.</p>',
            remote: true,
            url: 'https://www.arbeitnow.com/jobs/companies/finweber/go-eng-berlin-1',
            location: 'Berlin',
            created_at: 1761900000,
          },
        ],
      }),
    );
    expect(arb).toHaveLength(1);
    expect(arb[0].discoveryOrigin).toBe('PUBLIC_AGGREGATOR_FEED');
    expect(arb[0].attributionText).toContain('Arbeitnow');

    const jbc = parseJobicyPayload(
      JSON.stringify({
        jobs: [
          {
            id: 5511,
            url: 'https://jobicy.com/jobs/5511-remote-sre',
            jobTitle: 'Remote Site Reliability Engineer',
            companyName: 'CloudScale',
            jobGeo: 'Worldwide',
            jobDescription: '<p>Operate Kubernetes clusters and observability stacks globally.</p>',
            annualSalaryMin: 120000,
            annualSalaryMax: 155000,
            salaryCurrency: 'USD',
          },
        ],
      }),
    );
    expect(jbc).toHaveLength(1);
    expect(jbc[0].discoveryOrigin).toBe('PUBLIC_AGGREGATOR_FEED');
    expect(jbc[0].salaryMin).toBe(120000);
  });
});

describe('Phase 3: 384-d Semantic Matcher & Safety/Exclusivity Ranking', () => {
  it('produces 384-d pgvector embeddings, filters quarantined/expired jobs, and boosts First-Mover roles', () => {
    const directExclusive = sampleRadarJob({
      id: '11111111-1111-4111-8111-111111111111',
      exclusivity_tier: 'FIRST_PARTY_EXCLUSIVE',
    });
    const syndicatedCopy = sampleRadarJob({
      id: '33333333-3333-4333-8333-333333333333',
      exclusivity_tier: 'SYNDICATED',
      composite_confidence: 70,
    });
    const scamQuarantined = sampleRadarJob({
      id: '44444444-4444-4444-8444-444444444444',
      verification_status: 'SCAM_REJECTED',
    });
    const expiredRole = sampleRadarJob({
      id: '55555555-5555-4555-8555-555555555555',
      lifecycle_status: 'EXPIRED',
    });

    const vec = buildRadarJobEmbedding384(directExclusive);
    expect(vec).toHaveLength(384);
    expect(formatPgVectorLiteral(vec).startsWith('[')).toBe(true);

    const ranked = rankRadarOpportunitiesForCandidate({
      jobs: [syndicatedCopy, scamQuarantined, expiredRole, directExclusive],
      profile: {
        targetRoles: ['Backend Engineer'],
        skills: ['go', 'postgresql', 'kubernetes'],
        preferredLocations: ['Lagos'],
        countryCode: 'NG',
      },
    });

    expect(ranked).toHaveLength(2);
    expect(ranked[0].opportunity.id).toBe(directExclusive.id);
    expect(ranked[0].matchScore).toBeGreaterThan(ranked[1].matchScore);
    expect(ranked[0].opportunity).not.toHaveProperty('canonical_fingerprint');
  });
});

describe('Phase 3: Candidate & Admin Radar API Routes + Zero-Downtime Pre-Migration Guard', () => {
  it('enforces authentication on GET /api/radar/opportunities and degrades cleanly when migration is pending', async () => {
    const unauth = await getRadarOpportunities(new Request('https://jobiest.com/api/radar/opportunities'));
    expect(unauth.status).toBe(401);

    m.authedUser = { id: 'cand-1', email: 'cand@example.com' };
    m.simulateMissingSchema = true;

    const pendingRes = await getRadarOpportunities(
      new Request('https://jobiest.com/api/radar/opportunities?exclusivityOnly=1'),
    );
    expect(pendingRes.status).toBe(200);
    const pendingBody = (await pendingRes.json()) as { migrationPending: boolean; opportunities: unknown[] };
    expect(pendingBody.migrationPending).toBe(true);
    expect(pendingBody.opportunities).toEqual([]);

    m.simulateMissingSchema = false;
    m.radarJobRows = [sampleRadarJob()];
    const liveRes = await getRadarOpportunities(
      new Request('https://jobiest.com/api/radar/opportunities?workplace=REMOTE&country=NG'),
    );
    expect(liveRes.status).toBe(200);
    const liveBody = (await liveRes.json()) as {
      migrationPending: boolean;
      opportunities: Array<{ matchScore: number; opportunity: { title: string } }>;
    };
    expect(liveBody.migrationPending).toBe(false);
    expect(liveBody.opportunities).toHaveLength(1);
    expect(liveBody.opportunities[0].opportunity.title).toBe('Senior Backend Engineer');
  });

  it('enforces admin RBAC on /api/admin/radar and supports candidate promotion & opt-out exclusions', async () => {
    const forbidden = await getAdminRadar(new Request('https://jobiest.com/api/admin/radar'));
    expect(forbidden.status).toBe(403);

    m.adminUser = { id: 'admin-1', email: 'admin@jobiest.com' };
    const dashRes = await getAdminRadar(new Request('https://jobiest.com/api/admin/radar'));
    expect(dashRes.status).toBe(200);
    const dashJson = (await dashRes.json()) as { summary: { first_mover_exclusive_count: number } };
    expect(dashJson.summary.first_mover_exclusive_count).toBe(7);

    // Add exclusion
    const exclRes = await postAdminRadar(
      new Request('https://jobiest.com/api/admin/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_exclusion',
          patternType: 'DOMAIN',
          patternValue: 'OptOutCorp.com',
          reason: 'EMPLOYER_OPT_OUT',
        }),
      }),
    );
    expect(exclRes.status).toBe(200);
    expect(m.upsertedExclusions[0]).toMatchObject({
      pattern_type: 'DOMAIN',
      pattern_value: 'optoutcorp.com',
      reason: 'EMPLOYER_OPT_OUT',
    });

    // Promote candidate source
    m.candidateRow = {
      id: '77777777-7777-4777-8777-777777777777',
      detected_provider: 'ashby',
      detected_board_token: 'paygrid',
    };
    const promRes = await postAdminRadar(
      new Request('https://jobiest.com/api/admin/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_candidate',
          candidateId: '77777777-7777-4777-8777-777777777777',
          decision: 'PROMOTE',
        }),
      }),
    );
    expect(promRes.status).toBe(200);
    expect(m.upsertedSources[0]).toMatchObject({
      id: 'ashby:paygrid',
      adapter: 'ashby',
      board: 'paygrid',
      enabled: true,
    });
  });

  it('verifies migration 056 and one-paste bundle 053_to_056 enforce VERIFIED gating and search_path pinning', () => {
    const m056 = readFileSync(
      'supabase/migrations/056_radar_phase3_first_party_sync_and_intelligence.sql',
      'utf8',
    );
    const bundle = readFileSync(
      'supabase/release-bundles/053_to_056_radar_phase1_to_3.sql',
      'utf8',
    );
    expect(m056).toContain("if v_org.verification_status <> 'VERIFIED' then");
    expect(m056).toContain('revoke all on function public.sync_recruitment_vacancy_to_radar_by_id(uuid) from public, anon, authenticated;');
    expect(m056).toContain('revoke all on function public.get_radar_intelligence_summary() from public, anon, authenticated;');
    expect(bundle).toContain('BEGIN MIGRATION: 053_radar_core_employers_and_sources.sql');
    expect(bundle).toContain('BEGIN MIGRATION: 056_radar_phase3_first_party_sync_and_intelligence.sql');
  });
});
