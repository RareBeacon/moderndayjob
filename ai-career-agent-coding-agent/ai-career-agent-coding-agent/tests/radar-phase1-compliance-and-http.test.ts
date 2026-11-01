import { describe, expect, it } from 'vitest';
import type { LookupFn } from '@/lib/agent/ssrf';
import {
  evaluateParsedRobots,
  evaluateRobotsHttpResponse,
  isPageIndexingDisallowed,
  parseRobotsTxt,
  RADAR_USER_AGENT,
} from '@/lib/radar/compliance/robots';
import { evaluateSourceCompliance } from '@/lib/radar/compliance/policy';
import { conditionalSafeFetch, parseRetryAfterSeconds } from '@/lib/radar/http/fetcher';

const publicLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];

describe('Condition 1: Source Compliance Gate (Provider Terms + Exclusions + Robots)', () => {
  it('NEVER treats permissive robots.txt alone as authorization for unknown providers', () => {
    const res = evaluateSourceCompliance({
      sourceId: 'mystery_scraper:foo',
      providerKey: 'mystery_scraper',
      targetUrl: 'https://example.com/jobs.json',
      robotsSnapshot: { httpStatus: 200, bodyText: 'User-agent: *\nAllow: /\n' },
    });
    expect(res.allowed).toBe(false);
    expect(res.blockCode).toBe('UNKNOWN_PROVIDER_POLICY');
  });

  it('blocks prohibited platforms (LinkedIn, Indeed, Glassdoor, Wellfound, Remotive /api)', () => {
    for (const [providerKey, url] of [
      ['linkedin', 'https://www.linkedin.com/jobs/search/?keywords=engineer'],
      ['indeed', 'https://www.indeed.com/jobs?q=engineer'],
      ['remotive_api', 'https://remotive.com/api/remote-jobs'],
    ] as const) {
      const res = evaluateSourceCompliance({
        sourceId: `${providerKey}:global`,
        providerKey,
        targetUrl: url,
        robotsSnapshot: { httpStatus: 200, bodyText: 'User-agent: *\nAllow: /\n' },
      });
      expect(res.allowed).toBe(false);
    }
  });

  it('holds SmartRecruiters in RESTRICTED_PENDING_REVIEW by default until explicit clearance', () => {
    const res = evaluateSourceCompliance({
      sourceId: 'smartrecruiters:BoschGroup',
      providerKey: 'smartrecruiters',
      targetUrl: 'https://api.smartrecruiters.com/v1/companies/BoschGroup/postings',
    });
    expect(res.allowed).toBe(false);
    expect(res.blockCode).toBe('PROVIDER_RESTRICTED_PENDING_REVIEW');
  });

  it('enforces employer opt-out and domain takedown exclusions immediately', () => {
    const res = evaluateSourceCompliance({
      sourceId: 'greenhouse:opted-out-corp',
      providerKey: 'greenhouse',
      targetUrl: 'https://boards-api.greenhouse.io/v1/boards/opted-out-corp/jobs',
      employerSlug: 'opted-out-corp',
      exclusionRules: [
        {
          patternType: 'EMPLOYER_SLUG',
          patternValue: 'opted-out-corp',
          reason: 'EMPLOYER_OPT_OUT',
          active: true,
        },
      ],
    });
    expect(res.allowed).toBe(false);
    expect(res.blockCode).toBe('EXCLUDED_BY_TAKEDOWN_OR_OPT_OUT');
  });

  it('blocks an otherwise-approved provider when the host robots.txt disallows the path', () => {
    const res = evaluateSourceCompliance({
      sourceId: 'jsonld_career:acme.com',
      providerKey: 'jsonld_career',
      targetUrl: 'https://acme.com/careers/internal-preview',
      robotsSnapshot: {
        httpStatus: 200,
        bodyText: 'User-agent: *\nAllow: /careers/\nDisallow: /careers/internal-preview\nCrawl-delay: 10\n',
      },
    });
    expect(res.allowed).toBe(false);
    expect(res.blockCode).toBe('ROBOTS_DISALLOWED');
    expect(res.effectiveCrawlDelaySeconds).toBe(10);
  });
});

describe('RFC 9309 robots.txt Engine', () => {
  it('prefers specific JobiestRadarBot group over wildcard * and merges duplicate groups', () => {
    const txt = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: JobiestRadarBot',
      'Allow: /jobs/',
      'Crawl-delay: 4',
      '',
      'User-agent: jobiestradarbot',
      'Disallow: /jobs/drafts/',
      'Sitemap: https://acme.com/careers-sitemap.xml',
    ].join('\n');

    const parsed = parseRobotsTxt(txt);
    expect(parsed.matchedAgent).toBe('specific');
    expect(parsed.crawlDelaySeconds).toBe(4);
    expect(parsed.sitemaps).toEqual(['https://acme.com/careers-sitemap.xml']);

    expect(evaluateParsedRobots(parsed, 'https://acme.com/jobs/123').allowed).toBe(true);
    expect(evaluateParsedRobots(parsed, 'https://acme.com/jobs/drafts/123').allowed).toBe(false);
  });

  it('implements longest-match specificity and lets Allow win equal-length ties (RFC 9309 2.2.2)', () => {
    const parsed = parseRobotsTxt(
      ['User-agent: *', 'Disallow: /careers', 'Allow: /careers'].join('\n'),
    );
    const tie = evaluateParsedRobots(parsed, 'https://acme.com/careers/openings');
    expect(tie.allowed).toBe(true);
  });

  it('handles * and $ wildcards linearly without catastrophic regex backtracking', () => {
    const adversarial = `User-agent: *\nDisallow: /${'*'.repeat(400)}secret.json$\n`;
    const parsed = parseRobotsTxt(adversarial);
    expect(evaluateParsedRobots(parsed, 'https://acme.com/a/b/c/secret.json').allowed).toBe(false);
    expect(evaluateParsedRobots(parsed, 'https://acme.com/a/b/c/secret.json?public=1').allowed).toBe(true);
  });

  it('honors Content-Signal search=no, HTTP status semantics, X-Robots-Tag, and meta noindex', () => {
    const cs = evaluateRobotsHttpResponse(
      200,
      'User-agent: *\nContent-Signal: search=no, ai-train=no\nAllow: /\n',
      'https://acme.com/jobs',
    );
    expect(cs.allowed).toBe(false);
    expect(cs.disposition).toBe('DISALLOWED_BY_CONTENT_SIGNAL');

    expect(evaluateRobotsHttpResponse(403, '', 'https://acme.com/jobs').allowed).toBe(false);
    expect(evaluateRobotsHttpResponse(404, '', 'https://acme.com/jobs').allowed).toBe(true);
    expect(evaluateRobotsHttpResponse(503, '', 'https://acme.com/jobs').allowed).toBe(false);

    expect(isPageIndexingDisallowed({ xRobotsTagHeader: 'noindex, nofollow' })).toBe(true);
    expect(
      isPageIndexingDisallowed({
        htmlHeadSample: '<html><head><meta name="robots" content="index, follow"></head></html>',
      }),
    ).toBe(false);
    expect(
      isPageIndexingDisallowed({
        htmlHeadSample: '<html><head><meta name="JobiestRadarBot" content="noindex"></head></html>',
      }),
    ).toBe(true);
  });
});

describe('DNS-Resolved SSRF & Conditional HTTP Fetcher', () => {
  it('blocks private IP literals and DNS-rebinding to cloud metadata BEFORE fetch runs', async () => {
    let called = false;
    const fakeFetch: typeof fetch = async () => {
      called = true;
      return new Response('{}');
    };

    const literalBlock = await conditionalSafeFetch({
      url: 'https://169.254.169.254/latest/meta-data',
      fetchImpl: fakeFetch,
      lookup: publicLookup,
    });
    expect(literalBlock.outcome).toBe('SSRF_OR_POLICY_BLOCKED');
    expect(called).toBe(false);

    const rebindLookup: LookupFn = async () => [{ address: '10.0.1.25', family: 4 }];
    const rebindBlock = await conditionalSafeFetch({
      url: 'https://evil-rebind.example.com/jobs.json',
      fetchImpl: fakeFetch,
      lookup: rebindLookup,
    });
    expect(rebindBlock.outcome).toBe('SSRF_OR_POLICY_BLOCKED');
    expect(called).toBe(false);
  });

  it('re-validates redirect hops and blocks open-redirect SSRF to internal hosts', async () => {
    const hopLookup: LookupFn = async (host) => {
      if (host === 'public.example.com') return [{ address: '93.184.216.34', family: 4 }];
      return [{ address: '127.0.0.1', family: 4 }];
    };

    let fetchCount = 0;
    const fakeFetch: typeof fetch = async () => {
      fetchCount += 1;
      return new Response(null, {
        status: 302,
        headers: { location: 'https://internal.example.com/admin' },
      });
    };

    const out = await conditionalSafeFetch({
      url: 'https://public.example.com/careers',
      fetchImpl: fakeFetch,
      lookup: hopLookup,
    });
    expect(out.outcome).toBe('SSRF_OR_POLICY_BLOCKED');
    expect(fetchCount).toBe(1);
  });

  it('sends User-Agent + conditional headers and short-circuits 304 and unchanged SHA-256 hashes', async () => {
    let seenHeaders: Headers | null = null;
    const fakeFetch304: typeof fetch = async (_input, init) => {
      seenHeaders = new Headers(init?.headers);
      return new Response(null, { status: 304, headers: { etag: '"v1"' } });
    };

    const r304 = await conditionalSafeFetch({
      url: 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs',
      etag: '"v1"',
      lastModifiedHeader: 'Wed, 28 Oct 2026 10:00:00 GMT',
      previousPayloadHash: 'prev-hash',
      fetchImpl: fakeFetch304,
      lookup: publicLookup,
    });
    expect(r304.outcome).toBe('NOT_MODIFIED_304');
    expect(seenHeaders!.get('user-agent')).toBe(RADAR_USER_AGENT);
    expect(seenHeaders!.get('if-none-match')).toBe('"v1"');
    expect(seenHeaders!.get('if-modified-since')).toBe('Wed, 28 Oct 2026 10:00:00 GMT');

    const body = '{"jobs":[]}';
    const first = await conditionalSafeFetch({
      url: 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs',
      fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
      lookup: publicLookup,
    });
    expect(first.outcome).toBe('OK_MODIFIED');
    expect(first.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    const second = await conditionalSafeFetch({
      url: 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs',
      previousPayloadHash: first.payloadHash,
      fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
      lookup: publicLookup,
    });
    expect(second.outcome).toBe('UNCHANGED_HASH');
    expect(second.bodyText).toBeNull();
  });

  it('enforces maxBytes cap and parses 429 Retry-After headers', async () => {
    const oversized = await conditionalSafeFetch({
      url: 'https://boards-api.greenhouse.io/v1/boards/huge/jobs',
      maxBytes: 64,
      fetchImpl: async () =>
        new Response('x'.repeat(512), { status: 200, headers: { 'content-type': 'application/json' } }),
      lookup: publicLookup,
    });
    expect(oversized.outcome).toBe('BODY_TOO_LARGE');

    expect(parseRetryAfterSeconds('120')).toBe(120);
  });
});
