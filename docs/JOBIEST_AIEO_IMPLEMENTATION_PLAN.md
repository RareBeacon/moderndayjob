# Jobiest AIEO Implementation Plan

**Plan date:** 3 November 2026
**Scope:** Jobiest.com only
**Status:** Implementation in progress. Phase 0 source-level audit identified private account surfaces missing from crawler exclusions; `/opportunities` and `/portfolios` are now excluded in `robots.txt` and the public SEO URL filter with regression tests. The owner selected access for compliant AI answer/search and model-training crawlers on public pages. A curated public-only `/llms.txt` pilot and a 24-question directional benchmark set are in place (no responses have been collected). Live production crawl and broader editorial/schema work remain pending.

## 1. Executive summary

AIEO here means **Answer Engine and AI Search Optimization**: making Jobiest's legitimate public information easy for search and answer systems to discover, understand, attribute, and cite accurately. It is not a separate ranking trick, a promise of AI citations, or a reason to publish more pages regardless of quality.

Jobiest already has a useful technical base: public job, template, CV example, tool, topic-hub, and blog routes; an XML sitemap; a `robots.txt`; canonical URL and public-URL filters; and Schema.org output on several public page types. The next stage should build on these systems rather than replace them. Priorities are to verify what is live and crawlable, make public answers more source-led and attributable, protect private and unlisted material, and establish a repeatable measurement baseline.

### Current execution status

- **Done in this initial implementation:** owner-selected crawler policy recorded; private `/opportunities` and `/portfolios` excluded from robots guidance and public SEO URL filtering; curated public-only `/llms.txt` created; stable Organization/WebSite JSON-LD identifiers linked across homepage, article, CV example, template, and role-tool entities; 24 benchmark prompts prepared.
- **Validation:** typecheck, targeted AIEO/privacy tests, full 1,211-test suite, dependency audit, and production build have passed locally with CI placeholder credentials. The build renders 273 pages.
- **Still pending:** live production crawl after deployment; collecting the benchmark responses; editorial refreshes that need verified sources or owner-confirmed bylines; restored Search Console access for baseline metrics. These are measurement/editorial follow-ups, not results we can claim in advance.

## 2. Desired outcomes

1. People and answer engines can find clear, accurate explanations of Jobiest's public career resources.
2. Important product and editorial claims have an identifiable owner, date, and source or methodology where appropriate.
3. Public pages are available as useful, server-rendered HTML, with consistent canonical URLs and accurate structured data.
4. Public job pages describe only verified, active opportunities and send candidates to the employer/source. Private `/opportunities` and user data remain private.
5. Jobiest measures discovery and citation quality without promising traffic, rankings, or citations and without adding unnecessary recurring services.

## 3. Scope and non-goals

### In scope

- Public Jobiest site and editorial content, including existing `/jobs`, `/templates`, `/cv-examples`, `/tools`, `/blog`, and topic pages.
- Crawler access policy for public pages, discoverability, entity clarity, structured data, source attribution, and answer-ready content.
- A lightweight, documented measurement process using existing analytics and Search Console access where available.

### Out of scope

- Any work for TIMELESS TRUTH, BEYOND AI, Phoslab, or another product.
- Publishing the LinkedIn founder article or any other content on the user's behalf.
- Exposing `/opportunities`, authenticated product surfaces, user resumes, application history, private portfolios, or admin/API data.
- Invented job listings, user/customer metrics, reviews, credentials, guarantees, or unsupported claims.
- Bulk-generated doorway pages, keyword stuffing, fake FAQs, deceptive citations, automated third-party applications, or attempts to evade crawler controls.
- Paid AIEO platforms or new recurring infrastructure in the initial phases.

## 4. Existing foundation to reuse

The repository already contains:

- `app/robots.ts` with a general public allow rule and exclusions for API, dashboard, account, billing, admin, and other private surfaces. The initial source audit found that `/opportunities` and the private portfolio manager `/portfolios` were missing; both have now been added to the exclusions.
- `app/sitemap.ts`, which includes core public routes, free-tool pages, published SEO articles, public portfolios, templates, CV examples, topic hubs, role-tool pages, and guarded job pages.
- `lib/seo/public-urls.ts` with canonical URL handling and an allowlist-style filter that excludes sensitive route prefixes and noncanonical URL parameters.
- `lib/seo/public-jobs.ts` and route-level logic that gate public job pages on active/verified status and minimum inventory for hubs.
- `lib/seo/topic-clusters.ts` for eight current career-topic hubs.
- JSON-LD builders or page-level structured data for several page families.
- A human-review SEO suggestion queue, which should remain human-reviewed.

These are repository observations, not a claim that every URL, crawler, structured-data object, or current production response has been re-audited for this plan. Phase 0 performs that verification. In particular, confirm that unlisted portfolios return a suitable `noindex` signal as well as being omitted from the sitemap; sitemap omission alone does not prevent indexing.

## 5. Principles and guardrails

- **People first:** answer the candidate's question before optimizing for extraction. Use plain language, helpful examples, and necessary caveats.
- **Evidence and attribution:** cite primary sources for external facts; label Jobiest observations and explain methods, dates, geography, and limitations for any first-party data.
- **Truthful entities:** use a consistent Jobiest name, canonical domain, product description, and official links. Add only verified social profiles and contact details.
- **Useful structured data only:** markup must match content visible on the page and the relevant schema/search guidance. FAQ markup is only for real, visible FAQs. `JobPosting` is only for a genuinely active, eligible listing with accurate required fields.
- **Public means public:** keep private routes, personal data, account content, unlisted portfolios, and internal operational data out of crawler-facing endpoints and generated files. `robots.txt` is not access control.
- **Crawler policy is deliberate:** distinguish search/answer crawlers from model-training crawlers. Confirm current provider documentation and make an explicit owner decision before changing access rules. Do not block all AI crawlers by default or allow all of them by default.
- **No guarantees:** citations, referrals, rankings, and impressions are not guaranteed. Search and answer outputs vary by user, region, query, model, and time.
- **Preserve the product:** no changes to pricing, paid entitlements, Free plan benefits, the 10 free tools, 30 A4 templates, existing customer data, or application automation rules as part of AIEO.
- **Low recurring cost:** use existing site rendering, sitemap, analytics, and Search Console first. Do not introduce paid APIs or continuous polling without a separately approved case.

## 6. Implementation workstreams

### A. Technical discoverability and crawler policy

1. Crawl the live public sitemap and representative route families. Record status, canonical, title/description, indexability, rendered text, structured data, and internal-link reachability.
2. Verify HTML contains the main answer and page content without requiring client-side interaction. Test representative public routes with a browser and with a simple HTML fetch.
3. Review `robots.txt` against current official documentation for Googlebot/Bingbot and AI-related agents (for example, answer/search agents versus training agents). Produce a short decision table for each agent: purpose, current rule, proposed rule, owner approval, and date checked. Robots directives are preferences, not security boundaries.
4. Keep XML sitemap inclusion restricted to canonical, indexable, genuinely public URLs. Confirm inactive/expired jobs, thin role/location hubs, private/unlisted portfolios, query-string variants, and private product routes are excluded or `noindex` as appropriate.
5. Check internal links from relevant public hubs to useful details and tools. Do not add global links to `/opportunities` or private pages.
6. Assess a small `/llms.txt` pilot only after the public-content inventory and crawler policy are approved. If adopted, keep it a concise, maintained map of canonical public pages. It must not contain private content, copied corpus text, stale URLs, unsupported claims, or imply that AI systems must follow it. It complements, and does not replace, `robots.txt`, HTML, or the XML sitemap.

### B. Answer-ready editorial content

1. Select a small initial set of high-intent questions from existing Search Console queries, support questions, and product research. Cover CV/resume writing, ATS limitations, interview preparation, job-search safety, and Nigeria/remote-work context where Jobiest has genuine expertise.
2. For each selected page, add a concise direct answer near the top, followed by context, steps, a relevant example, limitations, and useful next actions. Do not force a fixed word count or repeat the same answer across many role pages.
3. Add a clearly visible author or editorial owner only when verified; add `Reviewed` dates only when a real review took place. Define a correction route and editorial review cadence.
4. Cite primary sources for policy, employment, salary, and technical claims. For salary or market statements, state country, currency, date range, sample/method, and limitations. Do not fabricate salary averages or claim a dataset is representative when it is not.
5. Distinguish informational guidance from legal, financial, immigration, and employer-specific advice. Clearly note when candidates must check the employer's own eligibility and application requirements.
6. Review content for uniqueness and cannibalization before publishing. Improve or consolidate weak pages rather than adding near-identical pages for every job title or location.
7. Keep product explanations exact: describe tools as assistance, disclose relevant limitations, and never promise interviews, employment, ATS passage, or automatic application outcomes.

### C. Entity and structured-data consistency

1. Establish a verified Jobiest entity record for internal editorial use: official name, canonical URL, product category, actual service regions, official contact route, and verified official profiles. Do not expose a founder biography, company address, or credentials unless confirmed by the owner.
2. Review the existing Organization, WebSite, Article, BreadcrumbList, SoftwareApplication, and job-related JSON-LD across page families. Make a type-by-template inventory and validate that every property is supported by visible page content.
3. Prefer stable identifiers and canonical absolute URLs. Remove duplicated/conflicting entity records and stale metadata where found.
4. Use FAQs only when the questions and answers are genuinely visible and useful. Do not add FAQ schema solely to seek a rich result or AI extraction.
5. For public job pages, re-check active/verified status, dates, location/remote eligibility, employer/source URL, and expiration behavior. Never emit structured data for unverified, expired, or private opportunities.
6. Validate schema with tests and Google's current validator/rich-result tooling where applicable. Structured data can clarify a page; it does not guarantee a search feature or citation.

### D. Measurement and learning loop

1. Capture a baseline before changes: sitemap crawl health, index coverage and query data available in Search Console, organic/AI referral sessions where analytics exposes them, and current branded search visibility.
2. Create a versioned prompt set of approximately 20 to 30 real questions across the focus topics, split by relevant geography (at minimum Nigeria and international/remote intent). Save prompts, date, platform/model, region/settings if known, response, cited URLs, Jobiest mention, and factual issues.
3. Repeat the same sample monthly. Treat it as directional research, not a ranking guarantee or statistically representative measurement. Do not submit personal or sensitive data to answer systems.
4. Track: technical indexability; canonical and crawl errors; coverage of priority questions with reviewed source-backed pages; sampled answer accuracy; citations/mentions and source URLs; AI referral visits when attributable; and user engagement on the cited landing pages.
5. Segment facts from proxies. A model naming Jobiest without linking it is a mention, not a referral. A referral visit is not proof that the page was cited accurately. Do not claim specific impression or click outcomes before data supports them.
6. Preserve Search Console credential resolution as a separate operational dependency. The current Google OAuth/refresh issue must be resolved by the account owner; do not store credentials in source code, this plan, or logs. Work not requiring Search Console can proceed with a documented baseline limitation.

## 7. Phased delivery and gates

| Phase | Timing from approval | Work and deliverable | Exit gate |
|---|---:|---|---|
| 0. Baseline and safety audit | Weeks 1-2 | Live crawl of sitemap and representative routes; bot-policy matrix; review public/private boundary, portfolio visibility, job expiry, current JSON-LD, internal links, and available Search Console/analytics data. Save baseline and prioritized issues. | No critical private-data exposure; public inventory reconciles with sitemap and route policy; unresolved production findings are clearly assigned. |
| 1. Technical foundation | Weeks 2-3 | Fix only verified technical issues; tighten route-level index/noindex behavior; stabilize canonical/internal-link/structured-data output; add regression tests. Decide whether a maintained `/llms.txt` pilot is worthwhile. | Build, typecheck, relevant tests, sitemap/robots checks, route E2E and privacy regression all pass. No crawler-policy change without documented owner approval. |
| 2. Editorial pilot | Weeks 3-6 | Refresh 6-10 priority pages across at least three topic areas using answer-first, source-led format; add accurate author/review/source details; consolidate overlap; connect to relevant existing tools/templates. | Editorial owner approves every factual claim; sources resolve; no unsupported statistics, invented credentials, or thin doorway copy; pages are useful without structured data. |
| 3. Entity and markup QA | Weeks 4-6, parallel | Complete entity record; audit JSON-LD by page template; correct only substantiated inconsistencies; run automated schema and rendering tests. | Markup matches visible content and valid page state; inactive jobs and nonpublic data produce no public job markup. |
| 4. Measure and iterate | Weeks 6-12, then monthly | Repeat prompt benchmark and technical checks; review Search Console/analytics after access is restored; update, merge, or retire content based on quality and evidence. | First monthly report records citations, mentions, referrals, accuracy issues, and data gaps without extrapolating results. |

Timing is an estimate. Phase 1 release remains subject to the repository's existing CI, security, preview, and production verification requirements.

## 8. Initial implementation backlog (proposed)

### P0: audit before editing

- Export the current production sitemap URL list and crawl it for status, canonical, robots/indexability, rendered text, and schema.
- Inspect representative routes from every public page family plus inactive-job and nonpublic-portfolio cases.
- Confirm that private `/opportunities`, account data, and APIs cannot be reached via sitemap, internal SEO links, `llms.txt`, or structured data.
- Record official AI/search crawler documentation and propose an allow/disallow policy for owner review.

### P1: safe engineering changes after audit

- Add automated tests for robots rules, sitemap public-only rules, canonical host/query filtering, `noindex` for unlisted portfolios, and no `JobPosting` schema for inactive/unverified listings.
- Add a reusable reviewed-content metadata convention only if the existing content model can support it without destructive schema changes. Prefer additive, backward-compatible fields or static metadata before proposing a migration.
- Add no new crawler endpoint until its content source, update process, and privacy review are defined.

### P2: editorial pilot

- Choose 6-10 pages based on actual user questions and evidence, not volume targets.
- Add concise answer summaries, primary-source links, truthful limitations, and review ownership.
- Refresh one Nigeria-specific guide, one CV/ATS guide, one tool guide, and one job-search safety guide as representative pilots, subject to content audit and owner approval.

### P3: evaluation

- Publish a monthly AIEO observation report with baseline comparisons and examples of correct/incorrect answers.
- Maintain a correction log for hallucinated or outdated claims about Jobiest, its tools, active jobs, eligibility, or pricing.
- Expand only page families that demonstrate accuracy and usefulness; do not scale by generating near-duplicate pages.

## 9. Acceptance criteria

- Every route included in an AIEO deliverable is canonical, returns the expected status, and is intentionally indexable or noindexed.
- `/opportunities`, authenticated pages, APIs, private portfolios, and personal resume/application data remain excluded from public discovery and responses.
- Public job pages and `JobPosting` markup are shown only for verified, active, eligible listings and direct people to the original source.
- Important statements on pilot pages have primary-source citations or are clearly labeled as Jobiest's own guidance; personal credentials and company claims are verified before inclusion.
- Main answers are present in server-rendered text and are understandable without JSON-LD or JavaScript interaction.
- Structured data matches visible content and passes automated checks; no fabricated reviews, FAQ answers, ratings, prices, jobs, or outcome statistics.
- New or updated content is reviewed by a named human owner before publication; no automated publishing to the public site.
- Reports separate observations, estimates, and claims; no guaranteed AI citations, ranking, impression, click, or hiring outcomes.
- Existing product routes, all 10 free tools, all 30 A4 templates, customer data, Free plan, and subscription entitlements remain unchanged.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| AI crawler directives are misunderstood or change over time | Check official provider documentation at implementation time, distinguish search from training agents, and retain a dated owner-approved policy record. |
| Private or weakly protected content is exposed to crawlers | Treat robots as advisory only; enforce authorization server-side; add noindex and sitemap tests; use only explicitly public sources. |
| AIEO work creates thin, repetitive pages | Start with a small question-led pilot; audit overlap; improve or consolidate rather than mass-generate. |
| Structured data overstates facts or triggers misleading results | Generate from validated page data; test active state; make markup mirror visible copy; omit unsupported fields. |
| Search Console access prevents measurement | Track the credential fix separately; establish a transparent limited baseline from available sources; never invent missing metrics. |
| Results vary by answer engine, region, and time | Use a stable, dated prompt sample and report observations as directional, not guaranteed or universal. |
| New tools add recurring cost or operational burden | Begin with code already in the repository and manual review; require separate approval for paid services or new recurring jobs. |

## 11. Owner decisions and remaining approvals

The owner selected **allow both AI answer/search and model-training crawlers on public pages** on 3 November 2026. The existing wildcard `robots.txt` rule already allows compliant crawlers on public URLs; no provider-specific groups or training-only blocks have been added. Private route disallows remain in force. `robots.txt` is crawler guidance, not authorization.

Before adding provider-specific directives, re-check current official crawler documentation and record the affected user agents and rule interactions. Editorial owners must still confirm founder/company facts and any proposed bylines or review credentials before those are published.
