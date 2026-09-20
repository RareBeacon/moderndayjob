# Keyword Research: Tool Investigation & Database Protocol (Workstream A, Stage 2)

Date: 2026-09-20. Companion to SEO_RESEARCH_REPORT.md. Rule applied throughout: if a metric cannot be accessed it is recorded as Unknown; search volumes, competition scores, CPC, and traffic estimates are never fabricated.

## 1. Tool Investigation (A3)

Each tool evaluated against the required template. Accessibility status reflects what this project can actually use right now, without purchasing subscriptions or creating accounts that require user identity.

### Google Search Console
- Data Type: First-party performance data (clicks, impressions, CTR, position for jobiest.com queries)
- Direct Measurement or Estimate: Direct measurement
- Free Tier: Yes (fully free)
- API Available: Yes
- API Pricing: Free
- API Quota: Standard Google API quotas apply (not verified numerically here)
- Geographic Coverage: Per country filter, includes NG, GB, US, CA
- Data Freshness: Up to ~16 month retention; data lags ~1-3 days
- Access Requirements: Verified property ownership (already connected for sc-domain:jobiest.com)
- Legal/ToS: Google API ToS
- Accessibility Status: Accessible (connected via Mission Control)
- Alternative: None needed (first-party)

### Google Keyword Planner
- Data Type: Volume estimates, bid ranges (Google Ads data)
- Direct Measurement or Estimate: Estimate (ranges unless ad spend is active)
- Free Tier: Yes (with a Google Ads account)
- API Available: Via Google Ads API
- API Pricing: API free; Ads account required
- API Quota: Unknown
- Geographic Coverage: Global incl. NG, GB, US, CA
- Data Freshness: Rolling historical averages
- Access Requirements: Google Ads account (not available to this project)
- Legal/ToS: Google Ads ToS
- Accessibility Status: Blocked (no Google Ads account)
- Alternative: GSC observed queries + Google Trends + autocomplete; volumes recorded Unknown where Planner is the only numeric source

### Google Trends
- Data Type: Relative search interest, trend direction, seasonality, related queries
- Direct Measurement or Estimate: Relative measurement (not absolute volume)
- Free Tier: Yes (fully free)
- API Available: No official API (unofficial endpoints exist; only light manual use)
- API Pricing: N/A
- API Quota: N/A
- Geographic Coverage: Global with country/region filters
- Data Freshness: Near real-time
- Access Requirements: None
- Legal/ToS: Google ToS; manual observation only
- Accessibility Status: Accessible
- Alternative: None needed

### Google Autocomplete
- Data Type: Query expansion suggestions (real user-driven completions)
- Direct Measurement or Estimate: Direct observation of suggestions (not volume)
- Free Tier: Yes
- API Available: No official public API (public suggest endpoint is undocumented)
- API Pricing: N/A
- API Quota: N/A
- Geographic Coverage: Localizable by gl/hl parameters
- Data Freshness: Live
- Access Requirements: None
- Legal/ToS: Undocumented endpoint; light programmatic observation for research only, no bulk scraping
- Accessibility Status: Accessible
- Alternative: None needed; confidence tier for findings: Qualitative

### Google People Also Ask
- Data Type: Question keywords shown in live SERPs
- Direct Measurement or Estimate: Direct observation
- Free Tier: Yes (manual observation)
- API Available: No
- API Pricing: N/A
- API Quota: N/A
- Geographic Coverage: Localizable
- Data Freshness: Live
- Access Requirements: None
- Legal/ToS: Manual observation
- Accessibility Status: Accessible (manual/observational)
- Alternative: AnswerThePublic (also limited)

### Google Search Results (SERP observation)
- Data Type: Ranking domains, SERP features, content formats
- Direct Measurement or Estimate: Direct observation
- Free Tier: Yes
- API Available: No (SerpApi is the API alternative)
- API Pricing: N/A
- API Quota: N/A
- Geographic Coverage: Localizable
- Data Freshness: Live
- Access Requirements: None
- Legal/ToS: Manual observation
- Accessibility Status: Accessible (via search tooling used for research)
- Alternative: SerpApi (not subscribed)

### Ahrefs
- Data Type: Full-suite SEO data (volumes, difficulty, backlinks, SERP overview)
- Direct Measurement or Estimate: Estimate (third-party model)
- Free Tier: Webmaster Tools (own verified site only, limited keyword data)
- API Available: Yes (paid, higher tiers)
- API Pricing: From approx $129/mo tool entry; API access on higher plans (per 2026 pricing roundups)
- API Quota: Varies by plan
- Geographic Coverage: Broad, incl. NG/GB/US/CA
- Data Freshness: Database refresh cycles
- Access Requirements: Paid subscription
- Legal/ToS: Ahrefs ToS
- Accessibility Status: Blocked (no subscription; Webmaster Tools covers own-site only)
- Alternative: GSC + Trends + observation; difficulty recorded Unknown

### Semrush
- Data Type: Full-suite SEO data
- Direct Measurement or Estimate: Estimate
- Free Tier: Limited (approx 10 searches/day with a free account)
- API Available: Yes (paid add-on)
- API Pricing: From approx $139/mo (per 2026 pricing roundups)
- API Quota: Plan-dependent
- Geographic Coverage: Broad
- Data Freshness: Database refresh cycles
- Access Requirements: Account creation with user identity (not done under this project's constraints)
- Legal/ToS: Semrush ToS
- Accessibility Status: Blocked (no account; free tier exists but requires signup)
- Alternative: As Ahrefs

### Moz
- Data Type: Keyword metrics, Domain Authority
- Direct Measurement or Estimate: Estimate (DA is a Moz model, not a Google metric)
- Free Tier: Limited free searches with community account (~10 queries/mo)
- API Available: Yes (paid)
- API Pricing: From approx $49-99/mo (sources vary by plan tier)
- API Quota: Plan-dependent
- Geographic Coverage: Broad
- Data Freshness: Monthly-ish index updates
- Access Requirements: Account
- Legal/ToS: Moz ToS
- Accessibility Status: Blocked (no account)
- Alternative: As Ahrefs

### Ubersuggest
- Data Type: Volume/difficulty estimates
- Direct Measurement or Estimate: Estimate
- Free Tier: ~3 searches/day (with account)
- API Available: Limited (paid plans)
- API Pricing: From approx $12-29/mo depending on plan/billing (2026 roundups vary)
- API Quota: Plan-dependent
- Geographic Coverage: Broad
- Data Freshness: Periodic
- Access Requirements: Account for free tier
- Legal/ToS: Ubersuggest ToS
- Accessibility Status: Blocked (no account)
- Alternative: As Ahrefs

### AnswerThePublic
- Data Type: Question-based query visualization (from autocomplete data)
- Direct Measurement or Estimate: Repackaged observation
- Free Tier: Limited daily searches (with account)
- API Available: Yes (paid)
- API Pricing: From approx $10-11/mo
- API Quota: Plan-dependent
- Geographic Coverage: Broad
- Data Freshness: Near live (autocomplete based)
- Access Requirements: Account
- Legal/ToS: ATP ToS
- Accessibility Status: Blocked (no account)
- Alternative: Direct autocomplete + PAA observation (accessible)

### AlsoAsked
- Data Type: PAA mapping (question graphs)
- Direct Measurement or Estimate: Repackaged observation
- Free Tier: Limited free searches (with account)
- API Available: Yes (paid)
- API Pricing: Freemium, paid tiers
- API Quota: Unknown
- Geographic Coverage: Broad
- Data Freshness: Periodic crawls
- Access Requirements: Account
- Legal/ToS: AlsoAsked ToS
- Accessibility Status: Blocked (no account)
- Alternative: Manual PAA observation

### DataForSEO
- Data Type: API-based SEO data (volumes, SERPs, competitors)
- Direct Measurement or Estimate: Mixed estimates
- Free Tier: Trial credit only
- API Available: Yes (core product)
- API Pricing: Pay-as-you-go
- API Quota: Balance-based
- Geographic Coverage: Broad
- Data Freshness: Live SERP API + databases
- Access Requirements: Paid account with billing
- Legal/ToS: DataForSEO ToS
- Accessibility Status: Blocked (no account)
- Alternative: As Ahrefs

### SerpApi
- Data Type: Structured live SERP results via API
- Direct Measurement or Estimate: Direct observation via automation
- Free Tier: Small free monthly plan (exact current quota: Unknown)
- API Available: Yes (core product)
- API Pricing: Freemium, paid tiers from tens of dollars/mo
- API Quota: Plan-dependent
- Geographic Coverage: Broad
- Data Freshness: Live
- Access Requirements: API key (signup)
- Legal/ToS: SerpApi ToS
- Accessibility Status: Blocked (no key)
- Alternative: Manual SERP observation

### Keyword Surfer
- Data Type: Volume estimates inside Google SERPs (browser extension)
- Direct Measurement or Estimate: Estimate
- Free Tier: Yes (extension)
- API Available: No
- API Pricing: N/A
- API Quota: N/A
- Geographic Coverage: Skews to major English markets
- Data Freshness: Extension DB updates
- Access Requirements: Chrome extension install (no browser available in this environment)
- Legal/ToS: Surfer ToS
- Accessibility Status: Blocked (no browser environment)
- Alternative: As Ahrefs

### Keywords Everywhere
- Data Type: Volume/CPC estimates in browser
- Direct Measurement or Estimate: Estimate
- Free Tier: No (credit packs, approx from $15/yr)
- API Available: No (browser add-on)
- API Pricing: Credit-based
- API Quota: Credit balance
- Geographic Coverage: Broad
- Data Freshness: Periodic
- Access Requirements: Purchase + browser
- Legal/ToS: KE ToS
- Accessibility Status: Blocked (paid + no browser)
- Alternative: As Ahrefs

### Investigation conclusion

Accessible and used: Google Search Console (Observed), Google Trends (relative), Google Autocomplete (Qualitative), People Also Ask (Qualitative), manual SERP observation (Qualitative). Everything else requires an account, subscription, or browser environment not available to this project. Consequences, applied without exception:
- search_volume: numeric only from an Observed source; otherwise "Unknown"
- volume_source/difficulty_source: tool name or "Unknown"
- difficulty: always "Unknown" until a paid tool becomes accessible (no free accessible source provides a comparable score)
- No keyword is ever described as low/high competition without measurement.

## 2. Research Markets (A5.1)

Nigeria (primary), UK (secondary), USA (secondary), Canada (tertiary), other African markets (tertiary: Ghana, Kenya, South Africa as observation permits). Language: English (all). Markets are never combined into a single estimate; each keyword row carries its own country code.

## 3. Keyword Categories (A5.2)

Resume & CV | Job Discovery | Career Development | Jobiest Product-Specific. Seed lists from the brief are the starting corpus, expanded by autocomplete and PAA observation. Product-specific keywords are only targeted where Jobiest genuinely has the matching feature (e.g., resume analysis, AI resume builder, free career tools, job application agent: all real; no misleading pages).

## 4. Database Schema (A5.3)

Implemented as an extension of the existing `seo_keywords` table (migration 028) with the exact required fields: keyword, query_source, source_url, collection_date, country, language, search_intent, search_volume, volume_source, difficulty, difficulty_source, serp_observations, top_competitors, existing_jobiest_url, content_opportunity, conversion_relevance, confidence_level, recommended_action. Confidence levels: Observed / Estimated / Qualitative / Hypothesis as defined in the brief. Seeding uses only the accessible sources above; the seed script and dashboard panel follow in the Stage 2 build commit.
