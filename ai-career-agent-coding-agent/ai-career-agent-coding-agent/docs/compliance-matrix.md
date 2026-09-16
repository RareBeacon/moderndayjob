# Job Source Compliance Matrix

Per-source record for every job board Jobiest ingests from (Master
Implementation Package B-141). Each source uses ONLY its public job board API
endpoint (no scraping of authenticated pages, no resume mass-apply), is
reviewed before activation, and carries attribution in the product UI.
The machine-readable copy of this table lives in the `job_sources` table
(migration 024); this document is the human review record.

## Data handling rules (all sources)

| Rule | Status |
| --- | --- |
| Public board API only, no authenticated scraping | Active |
| Rate-limit friendly: one fetch per board per pipeline run, 250ms pause between boards, 10s timeout, no retries | Active |
| Per-source error isolation: a failing board never breaks ingestion | Active (ingest.ts) |
| Circuit breaker: 3 consecutive failures pause a source for 1 hour | Active (registry.ts, migration 024) |
| Per-source kill switch: `job_sources.enabled = false` stops all fetches | Active |
| Listings stored as UNTRUSTED data; defanged before entering any AI prompt | Active (lib/ai/injection.ts) |
| Attribution shown with listings ("via Greenhouse/Lever/Ashby public board") | Active (job browser metadata) |
| Dedup never deletes rows: duplicates are hidden, earliest kept (B-144) | Active (lib/jobsources/dedup.ts) |
| Freshness: rows unseen for 30 days leave search and matching (B-145) | Active |

## Sources

| id | Transport | Terms | Reviewed | Attribution | Notes |
| --- | --- | --- | --- | --- | --- |
| greenhouse:gitlab | Greenhouse public board API (`boards-api.greenhouse.io/v1/boards/gitlab/jobs`) | greenhouse.io/legal | 2026-09-16 | Listing data from the employer public Greenhouse board | Public, unauthenticated JSON endpoint |
| greenhouse:anthropic | Greenhouse public board API | greenhouse.io/legal | 2026-09-16 | Listing data from the employer public Greenhouse board | Same |
| greenhouse:coinbase | Greenhouse public board API | greenhouse.io/legal | 2026-09-16 | Listing data from the employer public Greenhouse board | Same |
| lever:spotify | Lever public postings API (`api.lever.co/v0/postings/spotify`) | lever.co/legal | 2026-09-16 | Listing data from the employer public Lever board | Public, unauthenticated JSON endpoint |
| ashby:openai | Ashby public job board API (`api.ashbyhq.com/posting-api/job-board/openai`) | ashbyhq.com/legal | 2026-09-16 | Listing data from the employer public Ashby board | Public, unauthenticated JSON endpoint |
| ashby:linear | Ashby public job board API | ashbyhq.com/legal | 2026-09-16 | Listing data from the employer public Ashby board | Same |

## Adding a source (checklist)

1. Confirm a public, unauthenticated board API exists (no login-walled scraping).
2. Read the board platform terms; record termsUrl + review date in `job_sources.compliance`.
3. Insert the row with `enabled = false`, verify a manual ingestion run, then enable.
4. Update this document.

## Removal

Set `enabled = false` (immediate, no fetches on the next run) and optionally
delete the registry row. Ingested listings stay in place; the 30-day freshness
window ages them out of search and matching naturally.

Review cadence: re-check terms quarterly; `last_ok_at` and
`consecutive_failures` in `job_sources` are the operational health signals.
