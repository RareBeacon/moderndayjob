/**
 * RFC 9309 Robots Exclusion Protocol + Content-Signal + Meta Noindex Engine
 *
 * Important compliance boundary (Condition 1):
 * Passing robots.txt is a technical requirement, NEVER standalone legal
 * permission for automated commercial collection. Always run
 * `evaluateSourceCompliance()` (lib/radar/compliance/policy.ts) BEFORE or
 * alongside `evaluateRobotsForUrl()`.
 *
 * Implementation highlights:
 * - Zero dynamic RegExp construction (immune to ReDoS on adversarial rules).
 * - Enforces RFC 9309 500 KiB parsing ceiling, UTF-8 BOM stripping, group
 *   merging for identical user-agent tokens, and longest-path match precedence
 *   (with Allow winning equal-length ties per RFC 9309 section 2.2.2).
 * - Parses Crawl-delay, Sitemap directives, Content-Signal (search=no),
 *   X-Robots-Tag HTTP headers, and HTML <meta name="robots"> directives.
 */

export const RADAR_BOT_TOKEN = 'jobiestradarbot';
export const RADAR_USER_AGENT =
  'JobiestRadarBot/1.0 (+https://jobiest.com/bot; abuse@jobiest.com)';

/** RFC 9309 section 2.5: crawlers must process at least 500 KiB; cap above that. */
export const MAX_ROBOTS_TXT_BYTES = 512 * 1024;
export const MAX_CRAWL_DELAY_SECONDS = 120;

export interface RobotsRule {
  directive: 'allow' | 'disallow';
  pattern: string;
  specificity: number;
}

export interface ParsedRobotsPolicy {
  matchedAgent: 'specific' | 'wildcard' | 'none';
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
  sitemaps: string[];
  contentSignalSearchDisallowed: boolean;
}

export type RobotsFetchDisposition =
  | 'ALLOWED'
  | 'ALLOWED_NO_ROBOTS_FILE'
  | 'DISALLOWED_BY_RULE'
  | 'DISALLOWED_BY_AUTH_STATUS'
  | 'DISALLOWED_BY_CONTENT_SIGNAL'
  | 'TEMPORARY_UNREACHABLE';

export interface RobotsDecision {
  allowed: boolean;
  disposition: RobotsFetchDisposition;
  matchedRule: RobotsRule | null;
  crawlDelaySeconds: number | null;
  sitemaps: string[];
}

function percentNormalizeForMatch(input: string): string {
  // Normalize unreserved percent-encoded octets so %61 and 'a' match identically per RFC 9309.
  return input.replace(/%[0-9a-fA-F]{2}/g, (seq) => {
    const code = parseInt(seq.slice(1), 16);
    const isUnreserved =
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) ||
      code === 0x2d ||
      code === 0x2e ||
      code === 0x5f ||
      code === 0x7e;
    return isUnreserved ? String.fromCharCode(code) : seq.toUpperCase();
  });
}

/**
 * Deterministic linear-time wildcard matcher supporting RFC 9309 `*` and trailing `$`
 * without `new RegExp(...)` (zero catastrophic backtracking risk).
 */
export function robotsPatternMatches(rawPattern: string, rawPathWithQuery: string): boolean {
  if (!rawPattern) return false;
  const anchoredEnd = rawPattern.endsWith('$');
  const corePattern = percentNormalizeForMatch(anchoredEnd ? rawPattern.slice(0, -1) : rawPattern);
  const target = percentNormalizeForMatch(rawPathWithQuery || '/');

  let p = 0;
  let t = 0;
  let starIdx = -1;
  let matchIdx = 0;

  while (t < target.length) {
    if (p < corePattern.length && corePattern[p] === target[t]) {
      p += 1;
      t += 1;
    } else if (p < corePattern.length && corePattern[p] === '*') {
      starIdx = p;
      matchIdx = t;
      p += 1;
    } else if (starIdx !== -1) {
      p = starIdx + 1;
      matchIdx += 1;
      t = matchIdx;
    } else {
      return false;
    }
  }

  // If NOT anchored with '$', RFC 9309 rules are prefix matches: once all pattern
  // characters are consumed, any trailing characters in target still match.
  // Look back: the loop above runs until `t < target.length`; handle prefix completion early!
  while (p < corePattern.length && corePattern[p] === '*') {
    p += 1;
  }
  return anchoredEnd ? p === corePattern.length : p === corePattern.length;
}

/** Prefix-aware RFC 9309 matcher (unanchored patterns match any path starting with the pattern). */
export function matchRobotsRulePattern(rawPattern: string, rawPathWithQuery: string): boolean {
  if (!rawPattern) return false;
  if (rawPattern.endsWith('$')) {
    return robotsPatternMatches(rawPattern, rawPathWithQuery);
  }
  // An unanchored RFC 9309 pattern P is equivalent to P* against the full path+query.
  return robotsPatternMatches(`${rawPattern}*`, rawPathWithQuery);
}

function computeSpecificity(pattern: string): number {
  return percentNormalizeForMatch(pattern).length;
}

/** Parse a robots.txt document for a given bot token (defaults to `jobiestradarbot`). */
export function parseRobotsTxt(rawBody: string, botToken: string = RADAR_BOT_TOKEN): ParsedRobotsPolicy {
  const capped = rawBody.slice(0, MAX_ROBOTS_TXT_BYTES).replace(/^\uFEFF/, '');
  const lines = capped.split(/\r?\n/);

  const targetAgent = botToken.trim().toLowerCase();
  const specificRules: RobotsRule[] = [];
  const wildcardRules: RobotsRule[] = [];
  let specificDelay: number | null = null;
  let wildcardDelay: number | null = null;
  let specificContentSignalBlocked = false;
  let wildcardContentSignalBlocked = false;
  let sawSpecificGroup = false;
  let sawWildcardGroup = false;
  const sitemaps: string[] = [];

  let currentAgents: string[] = [];
  let seenNonAgentRuleInGroup = false;

  for (const rawLine of lines) {
    const hashIdx = rawLine.indexOf('#');
    const clean = (hashIdx === -1 ? rawLine : rawLine.slice(0, hashIdx)).trim();
    if (!clean) continue;

    const colonIdx = clean.indexOf(':');
    if (colonIdx === -1) continue;

    const field = clean.slice(0, colonIdx).trim().toLowerCase();
    const value = clean.slice(colonIdx + 1).trim();

    if (field === 'sitemap') {
      if (value.startsWith('http://') || value.startsWith('https://')) {
        sitemaps.push(value);
      }
      continue;
    }

    if (field === 'user-agent') {
      if (seenNonAgentRuleInGroup) {
        currentAgents = [];
        seenNonAgentRuleInGroup = false;
      }
      const agent = value.toLowerCase();
      currentAgents.push(agent);
      if (agent === targetAgent || targetAgent.startsWith(agent) && agent !== '*') {
        if (agent === targetAgent) sawSpecificGroup = true;
      }
      if (agent === '*') sawWildcardGroup = true;
      continue;
    }

    seenNonAgentRuleInGroup = true;
    const appliesToSpecific = currentAgents.some((a) => a === targetAgent);
    const appliesToWildcard = currentAgents.some((a) => a === '*');
    if (!appliesToSpecific && !appliesToWildcard) continue;

    if (field === 'allow' || field === 'disallow') {
      // RFC 9309: an empty Disallow value means allow everything (no-op rule).
      if (!value) continue;
      const rule: RobotsRule = {
        directive: field,
        pattern: value,
        specificity: computeSpecificity(value),
      };
      if (appliesToSpecific) specificRules.push(rule);
      if (appliesToWildcard) wildcardRules.push(rule);
    } else if (field === 'crawl-delay') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        const clamped = Math.min(MAX_CRAWL_DELAY_SECONDS, Math.ceil(parsed));
        if (appliesToSpecific) specificDelay = specificDelay === null ? clamped : Math.max(specificDelay, clamped);
        if (appliesToWildcard) wildcardDelay = wildcardDelay === null ? clamped : Math.max(wildcardDelay, clamped);
      }
    } else if (field === 'content-signal') {
      // Emerging 2025-2026 Content-Signal directive (e.g. "search=no, ai-train=no")
      const lowerVal = value.toLowerCase();
      if (/\bsearch\s*=\s*no\b/.test(lowerVal)) {
        if (appliesToSpecific) specificContentSignalBlocked = true;
        if (appliesToWildcard) wildcardContentSignalBlocked = true;
      }
    }
  }

  if (sawSpecificGroup) {
    return {
      matchedAgent: 'specific',
      rules: specificRules,
      crawlDelaySeconds: specificDelay,
      sitemaps,
      contentSignalSearchDisallowed: specificContentSignalBlocked,
    };
  }
  if (sawWildcardGroup) {
    return {
      matchedAgent: 'wildcard',
      rules: wildcardRules,
      crawlDelaySeconds: wildcardDelay,
      sitemaps,
      contentSignalSearchDisallowed: wildcardContentSignalBlocked,
    };
  }
  return {
    matchedAgent: 'none',
    rules: [],
    crawlDelaySeconds: null,
    sitemaps,
    contentSignalSearchDisallowed: false,
  };
}

/** Evaluate a parsed robots.txt policy against a target URL. */
export function evaluateParsedRobots(policy: ParsedRobotsPolicy, targetUrl: string | URL): RobotsDecision {
  const url = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
  const pathWithQuery = `${url.pathname || '/'}${url.search || ''}`;

  if (policy.contentSignalSearchDisallowed) {
    return {
      allowed: false,
      disposition: 'DISALLOWED_BY_CONTENT_SIGNAL',
      matchedRule: null,
      crawlDelaySeconds: policy.crawlDelaySeconds,
      sitemaps: policy.sitemaps,
    };
  }

  let winner: RobotsRule | null = null;
  for (const rule of policy.rules) {
    if (!matchRobotsRulePattern(rule.pattern, pathWithQuery)) continue;
    if (!winner) {
      winner = rule;
      continue;
    }
    if (rule.specificity > winner.specificity) {
      winner = rule;
    } else if (rule.specificity === winner.specificity && rule.directive === 'allow') {
      // RFC 9309 section 2.2.2: least restrictive directive wins on equal length.
      winner = rule;
    }
  }

  const allowed = !winner || winner.directive === 'allow';
  return {
    allowed,
    disposition: allowed ? 'ALLOWED' : 'DISALLOWED_BY_RULE',
    matchedRule: winner,
    crawlDelaySeconds: policy.crawlDelaySeconds,
    sitemaps: policy.sitemaps,
  };
}

/**
 * Evaluate an HTTP response from `<origin>/robots.txt` per RFC 9309 section 2.3:
 * - 2xx: parse body and evaluate rules.
 * - 401 / 403: treat entire origin as DISALLOWED (fail closed).
 * - 404 / 410 (and other 4xx except 429): no robots.txt exists -> ALLOWED_NO_ROBOTS_FILE.
 * - 429 / 5xx / transport error: TEMPORARY_UNREACHABLE -> fail closed for crawling until retry.
 */
export function evaluateRobotsHttpResponse(
  httpStatus: number | null,
  bodyText: string,
  targetUrl: string | URL,
  botToken: string = RADAR_BOT_TOKEN,
): RobotsDecision {
  if (httpStatus === null || httpStatus === 429 || httpStatus >= 500) {
    return {
      allowed: false,
      disposition: 'TEMPORARY_UNREACHABLE',
      matchedRule: null,
      crawlDelaySeconds: null,
      sitemaps: [],
    };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      allowed: false,
      disposition: 'DISALLOWED_BY_AUTH_STATUS',
      matchedRule: null,
      crawlDelaySeconds: null,
      sitemaps: [],
    };
  }
  if (httpStatus >= 400 && httpStatus < 500) {
    return {
      allowed: true,
      disposition: 'ALLOWED_NO_ROBOTS_FILE',
      matchedRule: null,
      crawlDelaySeconds: null,
      sitemaps: [],
    };
  }
  const parsed = parseRobotsTxt(bodyText, botToken);
  return evaluateParsedRobots(parsed, targetUrl);
}

/** Check page-level X-Robots-Tag header and HTML <meta name="robots"> for noindex/none directives. */
export function isPageIndexingDisallowed(opts: {
  xRobotsTagHeader?: string | null;
  htmlHeadSample?: string | null;
}): boolean {
  if (opts.xRobotsTagHeader) {
    const headerLower = opts.xRobotsTagHeader.toLowerCase();
    if (/\b(noindex|none)\b/.test(headerLower)) return true;
  }
  if (opts.htmlHeadSample) {
    const head = opts.htmlHeadSample.slice(0, 32_768);
    const metaTags = head.match(/<meta\b[^>]*>/gi) ?? [];
    for (const tag of metaTags) {
      const nameMatch = /\bname\s*=\s*["']?(robots|jobiestradarbot)["']?/i.exec(tag);
      if (!nameMatch) continue;
      const contentMatch = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag);
      if (contentMatch && /\b(noindex|none)\b/i.test(contentMatch[1])) {
        return true;
      }
    }
  }
  return false;
}
