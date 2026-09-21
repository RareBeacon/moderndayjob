# SEO Technical Audit (Workstream A, Stage 3)

Audit dates: 2026-09-20 to 2026-09-21. Method: automated crawl of every URL in the live sitemap (45 URLs) via `scripts/seo/audit-technical.py`, checking the A9.1 technical checklist: HTTP status, title presence and length (max 60 chars), meta description presence and length (max 160 chars), canonical correctness, robots meta, H1 uniqueness, and JSON-LD structured data. Fixes were deployed (commit a78cc60) and the audit re-run on the live site.

## 1. Results after fixes (live verification)

| Check | Result |
|---|---|
| URLs audited | 45 (all sitemap URLs) |
| HTTP 200 | 45 / 45 PASS |
| Title present | 45 / 45 PASS |
| Title length <= 60 chars | 45 / 45 PASS |
| Meta description present | 45 / 45 PASS |
| Meta description <= 160 chars | 45 / 45 PASS |
| Canonical correct (self-referencing, exact match) | 45 / 45 PASS |
| No noindex on public pages | 45 / 45 PASS |
| Exactly one H1 per page | 45 / 45 PASS |
| Structured data present | 42 / 45 (3 legal pages intentionally without, see section 4) |
| Sitemap well-formed, includes all published articles | PASS (45 URLs) |
| robots.txt correct (public allowed, /api/, app and admin routes disallowed) | PASS |

## 2. Issues found and fixed

### 2.1 Eleven titles over 60 characters
- Seven were caused by a double-suffix bug: stored article meta titles already ended with " | Jobiest" while the layout template appended " - Jobiest" (rendered as "... | Jobiest - Jobiest"). Fixed twice over: the database meta titles were cleaned (suffix stripped) and the article metadata code now uses an absolute title whenever the stored title already contains the brand, so a suffix can never double again.
- Four were the static launch articles with headlines of 72 to 96 characters. Titles shortened to factual versions that keep the promise and fit the limit with the template suffix (for example "The ATS Problem No One Told You About (And How to Fix It Before Your Next Application)" is now "The ATS Problem No One Told You About").

### 2.2 Seven meta descriptions over 160 characters
Pricing, tools index, and five free-tool pages had metas of 165 to 195 characters. Each rewritten to 136 to 157 characters with no loss of factual content (prices, tool capabilities, and honesty claims retained).

### 2.3 Seven pages with no structured data
- /blog now emits BreadcrumbList and an ItemList of all published articles.
- /about, /how-it-works, /help now emit BreadcrumbList.
- /terms, /privacy, /refund intentionally have no structured data: they do not qualify for Article, FAQPage, ItemList, SoftwareApplication, or any special search result type, and Google's guidance is to mark up only what genuinely qualifies. This is documented as N/A, not a defect.

## 3. Structured data inventory (live, after fixes)

| Type | Count | Where |
|---|---|---|
| Article | 25 | All blog articles |
| FAQPage | 21 | Articles and pages with real FAQ sections |
| SoftwareApplication | 10 | Free tool pages |
| BreadcrumbList | 4 | Blog, About, How it works, Help |
| ItemList | 2 | Blog index, tools index |
| Organization, WebSite, Product | 1 each | Homepage / pricing |

JobPosting structured data is deliberately not used anywhere: Jobiest has no job-posting surfaces, and using the type without real postings would violate Google's guidelines.

## 4. Canonicals, indexing controls, rendering

- Every public page emits a self-referencing canonical that exactly matches the sitemap URL (verified all 45).
- robots.txt disallows /api/, dashboard, onboarding, profile, documents, applications, billing, /generate, /admin; sitemap referenced. No public page carries noindex.
- All public pages are server-rendered (blog uses ISR with 300s revalidation); no client-only rendering on public routes.
- Internal links are crawlable anchor tags throughout.

## 5. Notes and follow-ups

- Titles changed on nine articles and several landing pages. The sitemap itself is unchanged (no URL additions or removals), so no sitemap resubmission is required; Google will recrawl on its own schedule. Recrawl requests per URL can be issued from SEO Mission Control when wanted, and any such request is a request only: it never guarantees crawling or indexing.
- The audit script is committed (`scripts/seo/audit-technical.py`) so the full checklist can be re-run after every deploy.
- Core Web Vitals field data will be evaluated from GSC once enough real-user data exists; no lab simulation is claimed here.
- Volume/difficulty keyword metrics remain Unknown per the tool investigation (docs/KEYWORD_RESEARCH.md); nothing in this audit fabricates them.

Stage 3 verdict: complete. All checklist items pass live; the three documented N/A pages are intentional and explained.
