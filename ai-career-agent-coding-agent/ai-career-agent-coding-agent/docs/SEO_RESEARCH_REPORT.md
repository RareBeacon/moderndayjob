# SEO Research Report (Workstream A, Stage 2)

Date: 2026-09-20. Purpose: the structured research corpus required before keyword database construction, technical fixes, and article production. Primary sources prioritised per the brief. No fabricated metrics anywhere; inaccessible data is recorded as Unknown.

## 1. Google Search Fundamentals (A2.1)

Sources read: Google Search Essentials and Creating Helpful, Reliable, People-First Content were fetched in full; canonicalization documentation was fetched. Remaining topics below are summarised from their Google Search Central primary sources (URLs listed), to be re-verified at implementation time in Stage 3.

| Topic | Primary source | Key takeaway for Jobiest |
|---|---|---|
| Search Essentials | developers.google.com/search/docs/essentials | Three pillars: technical requirements (most sites pass), spam policies, key best practices. Appearing in Google is free; meeting requirements does not guarantee crawling or indexing. |
| Helpful, people-first content | developers.google.com/search/docs/fundamentals/creating-helpful-content | Ranking systems prioritise content created to benefit people, not to manipulate rankings. Self-assess questions: original information, substantial complete coverage, value beyond the obvious, descriptive non-exaggerated titles, bookmark-worthy quality. Ask Who created it, How, and Why. E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) informs quality evaluation. |
| SEO Starter Guide | developers.google.com/search/docs/fundamentals/seo-starter-guide | Words people use belong in prominent places: title, main heading, alt text, link text. Links must be crawlable (`<a href>`). |
| Canonical URLs | developers.google.com/search/docs/crawling-indexing/canonicalization | Google picks the canonical from duplicate/variant URLs; signals are redirects, sitemaps, and rel=canonical annotations; Google's choice can differ from preference. Jobiest must emit one canonical per article (DB field already exists and must be verified per article). |
| Robots directives | developers.google.com/search/docs/crawling-indexing/robots-meta-tag | robots.txt controls crawling; robots meta/X-Robots-Tag controls indexing. App routes already disallowed in robots.txt; article pages must not accidentally carry noindex. |
| Sitemaps | developers.google.com/search/docs/crawling-indexing/sitemaps/overview | XML format, one URL set per sitemap (50k URLs / 50MB uncompressed limits), lastmod used when consistently valid. Jobiest sitemap is dynamic and currently 45 URLs, well inside limits. |
| Structured data | developers.google.com/search/docs/appearance/structured-data/intro-structured-data | Use types the page genuinely qualifies for. For Jobiest articles: Article, BreadcrumbList, FAQPage (only where real FAQ content exists), WebSite. JobPosting must NOT be used (no job-posting surfaces on this site). |
| JavaScript SEO | developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics | SSR/SSG content is indexed reliably; heavy client rendering risks delayed indexing. Jobiest uses Next.js server rendering for marketing and blog: keep it that way for all new public pages. |
| Mobile-first indexing | developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing | Google predominantly uses the mobile crawler. All new pages verified at 375px first. |
| Core Web Vitals | developers.google.com/search/docs/appearance/core-web-vitals | Performance thresholds (LCP, INP, CLS) are a ranking input. Measure with field data where available; the spec's responsive and loading-state requirements align. |
| Recrawl requests | developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl | GSC URL inspection can request indexing for updated URLs; submission never guarantees crawling. This exact distinction is mandated in all Jobiest reporting language. |
| Developer getting started | developers.google.com/search/docs/fundamentals/get-started-developers | Verify with GSC, monitor coverage, fix what the reports show. Mission Control already connects GSC. |

Guiding principle (quoted from Google's documentation): useful, original, people-first content; there are no guaranteed shortcuts to top rankings. Any Jobiest implementation contradicting this is reconsidered.

## 2. Keyword Research Methodology (A2.2)

Intent classification applied to every keyword row:

| Intent | Description | Example |
|---|---|---|
| Informational | User wants to learn | how to write a CV |
| Commercial | User comparing options | best resume builder Nigeria |
| Transactional | User ready to act | create resume free |
| Navigational | User seeking a specific site | Jobiest login |

Methodology applied in the keyword database (Stage 2 build):
- Primary, secondary, long-tail identification per topic cluster.
- Question-based patterns harvested from autocomplete and People Also Ask observations.
- Clustering with explicit cannibalization checks against all 25 existing articles before any new article is commissioned.
- SERP feature notes recorded per keyword (featured snippets, PAA presence) during manual observation.
- Volume and difficulty: recorded only when a tool actually provides them; otherwise Unknown with the source named. Never described as "low competition" without measurement.
- Trends: seasonal/geographic patterns noted qualitatively from Google Trends where accessible.
- Competitor gap: observed ranking domains recorded in `top_competitors` during SERP review.
- Geographic separation: Nigeria, UK, USA, Canada, other African markets kept as separate rows; never combined into one estimate.

## 3. Content Strategy Research (A2.3)

- Topic clusters and pillar architecture: each of the four A5.2 categories becomes a cluster; the blog index and relevant free-tool pages act as cluster hubs; every article links 3-5 relevant pages.
- Briefs and editorial standards: the A6.4 brief template is completed before writing; every factual claim in articles must be verifiable.
- E-E-A-T: author attribution, first-hand experience framing where truthful (Jobiest builds career tools and observes real usage patterns), transparent How/Why for every guide.
- Freshness: publish dates and last_updated are already in the schema; update cycles planned per cluster (Stage 4).
- Differentiation: articles must add value beyond rewriting competitors: original checklists, worked examples with the product's actual free tools, Nigeria-specific guidance where the market differs.
- Conversion design: each article maps to a next step (a relevant free tool or the resume studio) without compromising the people-first standard.
- Pruning/consolidation: the 25 existing articles are audited in Stage 3; thin or overlapping pieces get merged or updated rather than duplicated.

## 4. Technical SEO Research (A2.4)

Implementation checklist distilled for Jobiest (applied in Stage 3 against the 45 live URLs):
- Crawlability/indexability: robots.txt verified correct; internal links crawlable; no accidental noindex.
- HTTP status hygiene: all sitemap URLs return 200 with correct canonicals; no redirect chains in public paths.
- Sitemap: XML valid, lastmod accurate, submitted through the existing GSC integration; submission reported as requested, never as guaranteed.
- Structured data: Article, BreadcrumbList, FAQPage (real FAQs only), WebSite; JSON-LD validated.
- Rendering: all public pages server-rendered (already the case; keep new gallery public page SSR).
- Internal links: 3-5 per article, descriptive anchor text, hub-and-spoke distribution.
- Images: modern formats, descriptive alt text, lazy loading below the fold.
- Core Web Vitals: LCP/INP/CLS budgets respected in new UI; measure after deploy.
- Mobile usability: 375px verification for every new surface.
- Duplicate content: canonical per URL; DB-vs-static article duplication managed by DB precedence (audited in Stage 1).

## 5. Off-Page SEO Research (A2.5)

Legitimate strategies only: digital PR and editorial backlinks (original research from Jobiest usage data, presented honestly), relevant career directories and communities, expert contributions, shareable free tools (already a strength: the free tools suite), and brand mention monitoring. Prohibited and excluded: purchased links, link farms, spam comments, PBNs, automated rank manipulation.

## 6. Application Summary

1. Stage 2 continues with the keyword tool investigation (KEYWORD_RESEARCH.md) and the A5.3 schema implementation on `seo_keywords`.
2. Stage 3 applies section 4 to all 45 live URLs.
3. Stage 4 articles follow sections 2 and 3 with the A6.4 brief and cannibalization checks against all 25 existing articles.
4. All reporting language keeps Google's own distinction: submission requests indexing; it never guarantees crawling or ranking.
