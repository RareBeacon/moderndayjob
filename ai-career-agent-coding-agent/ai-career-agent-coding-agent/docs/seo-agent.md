# Jobiest SEO Mission Control

## What is implemented

The SEO agent foundation is modular and server-only:

- `lib/seo/google.ts` - official Google OAuth + Search Console API client.
- `lib/seo/service.ts` - project setup, sitemap checks, Search Console metrics import, URL inspection, audit logs, daily loop.
- `lib/seo/content-agent.ts` - conservative deterministic article generator that never fabricates search volume, keyword difficulty, CPC, rankings, backlinks, quotes, case studies or traffic.
- `app/admin/seo` - SEO Mission Control dashboard.
- `app/api/admin/seo/*` - admin-only setup, OAuth, action runner, and article generation endpoints.
- `app/api/cron/seo` - daily safe SEO loop, protected by `CRON_SECRET`.
- `supabase/migrations/014_seo_agent.sql` - SEO tables. All are RLS-enabled and service-role-only.
- `app/blog` and `app/blog/[slug]` - public blog index and article pages.
- `app/sitemap.ts` - includes public marketing pages, free tools, seeded PASTOR posts, and published SEO database articles when the SEO migration is present.

## Google API boundaries

The implementation uses official APIs only:

- Search Console Sites API: list/select verified properties.
- Search Analytics API: clicks, impressions, CTR, average position, queries/pages/date dimensions.
- Sitemaps API: list/get/submit sitemap.
- URL Inspection API: inspect individual URL indexing/crawl state.

The Google Indexing API is intentionally not used for normal articles or marketing pages. Google's documentation restricts it to `JobPosting` and `BroadcastEvent` embedded in `VideoObject`. For blog posts, the agent records discovery through sitemap/internal links, submits the sitemap where connected, and monitors indexing through URL Inspection. It never claims a URL is indexed because it was submitted or discovered.

## Required environment variables for Google connection

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://jobiest.com/api/admin/seo/oauth/callback
```

Do not commit real values. Configure them in Vercel/Supabase secret management only.

## First setup path

1. Apply `supabase/migrations/014_seo_agent.sql`.
2. Set the Google OAuth environment variables in production.
3. Open `/admin/seo` as an admin.
4. Click `Connect Google Search Console`.
5. Save the Search Console property, for example `https://jobiest.com/` or `sc-domain:jobiest.com`.
6. Run `Initial SEO Audit`.
7. Run `Submit Sitemap to GSC` if connected.
8. Leave the agent paused for draft mode, or resume it for the daily loop.

## Safety controls

- Global pause/resume button.
- Draft vs published article status.
- No destructive merge/delete/redirect automation.
- Existing article updates, canonical changes, and redirects are represented as approval-required settings in `seo_projects.settings`.
- Metrics with no reliable source are marked unavailable instead of invented.
- All actions are recorded in `seo_audit_logs`.
