# Master Upgrade Audit (Phase Zero)

Audit date: 2026-09-20. Method: repository inspection plus live application verification against https://jobiest.com and the production Supabase database. This document is the Stage 1 gate for the Master Upgrade execution. No credential values, secrets, or user data are included.

## 1. Executive Summary

The Jobiest platform is a single Next.js App Router application on Vercel with Supabase (Postgres) for data and auth, Resend for email, a Flutterwave payment integration, and a three-tier AI model chain (Ollama, Cloudflare Workers AI, OpenRouter).

The audit found significantly more existing infrastructure than the upgrade brief assumed, and several assumptions in the brief do not match production reality:

1. **Blog scale:** The brief assumes 10 existing blog posts. Production has 25 published articles in the `seo_articles` table (plus 5 of them also compiled statically in code). The live sitemap contains 45 URLs, all blog articles included.
2. **Google Search Console:** The brief treats GSC integration as likely missing. It is already implemented and connected: an admin SEO Mission Control page exists, OAuth tokens (encrypted at rest) are stored, and the selected property is `sc-domain:jobiest.com` with sitemap `https://jobiest.com/sitemap.xml`. The OAuth scope is exactly `webmasters` as the brief requires.
3. **Keyword database:** The brief requires building one. A `seo_keywords` table already exists with 28 rows, alongside `seo_metrics` (7 rows), URL audit and content calendar tables, and conversion event tracking.
4. **Resume Studio:** The brief assumes 20 templates are needed. The current Resume Studio 2 already ships 50 config-driven templates (5 categories x 10) with a shared renderer, a wizard gallery with miniature visual previews, and PDF/DOCX export. However, none of the 50 match the brief's required C3.1 catalog of 20 named templates (TPL-01 to TPL-20), there is no photo support anywhere, there is no public template gallery page, and there are no ATS/photo/columns badges.
5. **Customer support:** A `/support` contact form page exists (public, category-based, email delivery with reply-to preserved). There is no AI chat widget, no knowledge base, no ticket system, and no support analytics. Workstream B is therefore mostly greenfield, on top of an existing email delivery path.

Net effect on the plan: Workstream A is an expansion and completion of an existing SEO engine (not a build from scratch); Workstream C is an extension of an existing template system (add the 20 required catalog entries, photo support, badges, and a public gallery); Workstream B is the largest new build.

## 2. Repository Architecture

Monorepo root: `ai-career-agent-coding-agent/`. Key structure (annotated):

```
app/                          Next.js App Router (all routes)
  page.tsx                    Homepage (marketing, public)
  blog/                       Blog index + [slug] article pages (public, ISR)
  support/                    Contact support form (public)
  login/, signup/             Auth pages (AuthShell)
  generate/                   Resume Studio 2 wizard (authenticated)
  dashboard/, profile/, documents/, applications/, billing/   App pages (AppShell, authenticated)
  tools/                      Free tools (FreeToolShell, public)
  admin/                      Admin area incl. seo/ Mission Control (admin-gated)
  api/                        REST API routes (applications, documents, resume-studio, health, ...)
  sitemap.ts, robots.ts       Dynamic sitemap + robots (verified live)
components/                   UI components (site shells, home, support, shared)
lib/                          Server + shared libraries
  seo/                        blog.ts (static posts), google.ts (GSC OAuth + API), service.ts (dashboard data, token storage, sitemap ops), public-urls.ts (canonical URL allowlist)
  resume-studio/              templates.ts (50 template configs), draft.ts, ai.ts
  ai/                         Model chain (Ollama -> Cloudflare -> OpenRouter)
  supabase.ts, auth.ts        Supabase clients + session helpers
  env.ts                      Central env schema (26 variables)
  site.ts                     Site URL constant
packages/                     Shared workspace packages (incl. security crypto used for OAuth token encryption)
supabase/migrations/          27 sequential raw SQL migrations (001..027)
tests/                        Vitest suites (605 passing, 1 skipped at audit time)
docs/                         Project documentation (this file lives here)
```

## 3. Frontend Stack

- Next.js App Router (server components + client components), React, TypeScript.
- Styling: global CSS custom properties in `app/globals.css` (new navy/yellow design system: primary `#111c35`, accent `#f8d64d`, DM Sans body + Space Grotesk headings, deployed app-wide at commit 11d8008 and verified live) plus per-feature CSS modules (`home.module.css`) and utility class families (jl-*, mk-*, ft-*, resume2-*).
- Page shells: `SiteHeader` (homepage), `JobletNavbar`/`JobletFooter` (marketing incl. blog + support), `AppShell` (app pages), `AuthShell`, `FreeToolShell`, `AdminShell`, `LegalPage`.
- Rendering: marketing, blog, tools, and legal pages are server-rendered (blog articles use ISR with 300s revalidation); wizard and dashboard pages are client components.
- Responsive and accessibility posture: WCAG-conscious shared components; the upgrade must keep this at 2.1 AA across new surfaces.

## 4. Backend Stack

- API layer: Next.js Route Handlers under `app/api/**` (REST-style). No tRPC or GraphQL. Server actions are not the primary pattern; routes are.
- Runtime: Vercel serverless functions; health endpoint `/api/health` reports dependency status (verified green at audit time).
- Data access: Supabase JS client (`lib/supabase.ts`) with a service-role admin client for server-side work and an anon/client session for user context. No ORM; migrations are hand-written SQL.
- AI layer: `lib/ai` implements a provider chain Ollama -> Cloudflare Workers AI -> OpenRouter. Cloudflare is armed and was live-verified (gpt-oss-120b, ~1.7s first response). OpenRouter has no API key set (env name present, value absent). This chain is the designated model provider for the support agent.
- Email: Resend (env names `RESEND_API_KEY`, `RESEND_FROM`). Transactional flows include welcome email and support form delivery; support messages go to the Jobiest support inbox with reply-to preserved.
- Payments: Flutterwave (`FLW_*` env names) with pricing tiers and entitlement quotas (migrations 012, 013).
- Background work: scheduled runs table (migration 004) and observability ledgers (migration 023); no external worker service.

## 5. Database Schema Summary

27 migrations. Table groups relevant to the upgrade:

- Core app: users/auth (Supabase managed), profiles, job preferences, documents, generated documents (+content), applications, saved jobs (027), audit logs (011).
- Access control: `admin_users` gate for /admin, lockdown of private tables (010), security baseline (022).
- Monetization: pricing tiers (012), entitlement quotas v2 (013).
- SEO engine (Workstream A surface): `seo_projects` (GSC connection: property, sitemap URL, encrypted OAuth tokens), `seo_articles` (25 rows, all PUBLISHED; slug, title, URL, target/secondary keywords, meta title/description, canonical URL, markdown content, published/updated dates, search intent, FAQ, internal links, content cluster, featured image fields), `seo_keywords` (28 rows), `seo_metrics` (7 rows), plus URL audit (019), content calendar (020), and conversion event (021) tables.
- Resume Studio 2 (Workstream C surface): migration 015 (resume draft persistence; template selection is a draft field referencing template ids from `lib/resume-studio/templates.ts`).
- Support/email (Workstream B surface): welcome email + support (026), Google email verification (025).
- Free tools: free tool results with text compat defaults (016-018).

No tables exist for: support tickets, support conversations, knowledge base entries, support analytics, or keyword research metadata beyond the current `seo_keywords` shape. These are new migrations in the plan.

## 6. Authentication & Authorization

- Supabase Auth with cookie-based sessions (`lib/auth.ts` helpers; `getUser()` on server).
- Public routes: `/`, `/blog`, `/blog/[slug]`, `/support`, `/tools/**`, legal pages, auth pages.
- Authenticated routes: `/dashboard`, `/profile`, `/documents`, `/applications`, `/generate`, `/billing`, onboarding.
- Admin routes: `/admin/**` gated by an `admin_users` table lookup on top of the session; forbidden state renders an explicit `AdminForbidden` panel.
- robots.txt disallows `/api/`, app pages, `/generate`, `/admin` (verified live).
- Rate limiting and abuse controls exist per the security baseline migration; the support widget and public AI endpoints in Workstream B must extend these (rate limits on chat + ticket creation, injection defenses, admin-only surfaces).

## 7. Existing Features — Verified

Verified in repository and on the live application:

- Homepage with the navy/yellow design system, deployed and live-verified (commit 11d8008).
- Blog: index page listing articles; 25 published articles render at `/blog/[slug]`; hybrid content model (static fallback + DB-driven); ISR revalidation 300s; metadata generated from DB fields (title, meta description, canonical URL); FAQ fields exist in schema.
- Sitemap: `https://jobiest.com/sitemap.xml` returns 45 URLs, force-dynamic, includes all published DB articles plus core and free-tool paths, filtered by a canonical public URL allowlist. Well-formed.
- robots.txt: correct rules with sitemap reference (content reproduced in section 6).
- SEO Mission Control (`/admin/seo`): admin-gated dashboard reading `getSeoDashboardData()`; displays GSC connection state; controls for property selection and sitemap submission exist in the code path (`SeoControls`).
- GSC: OAuth flow with `webmasters` scope, encrypted token storage (`encryptSecret`/`decryptSecret` from the security package), token refresh logic (`getFreshGoogleTokens`), sites listing, search analytics, sitemap operations, and URL inspection types are implemented in `lib/seo/google.ts` + `service.ts`. Production `seo_projects` row confirms a connected project.
- Resume Studio 2 (`/generate`): 6-step wizard (profile -> career -> template library -> content -> final review -> generate), 50 templates in 5 categories with recommendation engine, `TemplateCard` with `MiniTemplate` visual miniature, full `ResumePreview` render, AI steps (draft help, final review, generation), draft persistence API, generation to documents, PDF and DOCX export via `/api/documents/[id]/export`.
- Support contact page (`/support`): public, 8 categories, message delivery to support inbox with reply-to preserved.
- Free tools suite under `/tools` (public, with SEO metadata paths).
- Health endpoint `/api/health`: green, all dependency checks passing.
- CI/CD: GitHub Actions (secret scan with gitleaks, typecheck, tests, build) and Vercel deployment from `main`; last deploy 11d8008 succeeded.
- Test suite: Vitest, 605 tests passing, 1 skipped at audit time.

## 8. Described Features — Not Found or Broken

Against the upgrade brief's assumptions:

- **"10 existing blog posts"**: incorrect. 25 published articles exist (see section 1). Not a defect; changes Workstream A scope from "create the blog" to "extend and complete" plus the 20 new articles requirement.
- **GSC "likely not connected"**: incorrect. Connected (section 7). Blocker protocol for GSC credentials is not needed.
- **AI support widget on all routes**: not found. No chat widget, no support agent, no knowledge base, no ticket system (`JBT-*` ids), no escalation logic, no admin ticket dashboard. To be built (Workstream B).
- **Template gallery (public, filters, badges, thumbnails, photo upload)**: not found in the required form. The existing gallery is inside the authenticated wizard, has category filtering and mini previews, but no photo badges, no ATS badges, no column badges, no photo upload, and no public page. The 20 C3.1 catalog templates do not exist.
- **Photo upload with server-side MIME/size validation**: not found anywhere.
- **Analytics (GA or equivalent)**: not found. No gtag/GTM integration. The SEO conversion panel must either be wired to first-party conversion events (table exists, migration 021) or show "Data not available" with a reason. Third-party analytics setup requires user-provided property credentials.
- No bugs were observed on the live application during this audit (health green, pages render, sitemap well-formed). Known local-only environment quirk: `app/api/applications/target/route.ts` has twice disappeared from the local workspace snapshot; it is restored from git when it happens and is not a production issue.

## 9. Integration Inventory

| Integration | Status | Notes |
|---|---|---|
| Supabase (DB + Auth) | Live | Service role for server, RLS lockdown migration 010 |
| Resend (email) | Live | Welcome, support delivery; support@jobiest.com mailbox verification still required by B1 |
| Flutterwave (payments) | Live | Entitlement tiers |
| Ollama (ai.jobiest.com) | Primary AI | Self-hosted on Oracle VM |
| Cloudflare Workers AI | Armed fallback | Live-verified model gpt-oss-120b |
| OpenRouter | Configured, no API key | Chain tail |
| Google Search Console (OAuth) | Connected | webmasters scope, property sc-domain:jobiest.com |
| Google OAuth (login) | Present | GOOGLE_CLIENT_* env names |
| Vercel | Hosting + CI/CD | Project modernjob |
| Google Analytics or similar | Absent | No property found |

## 10. Environment Variable Names (no values)

From the central schema in `lib/env.ts`:

AI_MAX_CONCURRENCY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_MODEL, ENCRYPTION_MASTER_KEY, FLW_CLIENT_ID, FLW_CLIENT_SECRET, FLW_SECRET_HASH, FLW_SECRET_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, HUGGINGFACE_BASE_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, OLLAMA_API_KEY, OLLAMA_BASE_URL, OLLAMA_FALLBACK_MODEL, OLLAMA_MODEL, OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_MODEL, RESEND_API_KEY, RESEND_FROM, SUPABASE_SERVICE_ROLE_KEY.

Locally `.env.local` holds only the four public/service Supabase + app URL names; the rest are provisioned in the Vercel project environment. OPENROUTER_API_KEY is set as a name but has no usable value (chain tail is dormant by design).

## 11. Observed Bugs and Issues

- No production bugs observed during this audit pass (live pages, sitemap, robots, health all verified).
- Local workspace only: intermittent snapshot loss of `app/api/applications/target/route.ts` (twice); recovery is `git restore`. Watch for TS2307 on that file before assuming a code error.
- Content duplication note (SEO): the 5 originally static posts also exist as DB rows; the DB row takes precedence at render time and the static array now serves as fallback plus `generateStaticParams`. This is intentional but must be respected when republishing (edit DB rows, not only code) and during cannibalization checks.

## 12. Technical Debt Notes

- Two parallel blog content sources (static array vs `seo_articles`) with DB precedence; new articles must go the DB route only.
- Template system is config-driven with a single shared renderer; adding photo-capable and column-variant templates requires extending the data model and renderer rather than adding 20 bespoke components.
- `seo_keywords` (28 rows) predates the brief's keyword database schema (source, confidence tiers, volume handling). The upgrade should extend this table rather than create a competing one.
- Legacy CSS token remaps coexist with the canonical token block in `globals.css`; new UI must use canonical tokens only.
- No ORM; all migrations are raw SQL, so schema changes need careful hand-written DDL with rollback notes.
- Marketing copy in the wizard says "50 templates"; adding the 20 required catalog templates will make the real count 70 and copy must be updated.

## 13. Security Observations

- Secrets: OAuth tokens encrypted at rest via the security package with `ENCRYPTION_MASTER_KEY`; service role key never exposed client-side; gitleaks in CI.
- Access: `admin_users` gate on `/admin/**`; RLS lockdown migration for private tables; security baseline migration 022.
- For Workstream B the audit flags these requirements: server-side model calls only (no provider keys in the browser), rate limiting on public chat and ticket endpoints, prompt injection defense tests (versioned system prompt), admin-only ticket dashboard, and email/ticket writes sequenced so the user is only told a ticket exists after the database write succeeds.
- For Workstream C: photo upload must validate MIME and size server-side; photos must only be offered on photo-capable templates.
- No credential values appear in this document, per the Phase Zero constraint.

## 14. Integration Points for Each Workstream

**Workstream A (SEO Growth Engine)**
- Publish into `seo_articles` (status PUBLISHED) so sitemap, blog index, and article pages pick content up automatically.
- Extend `seo_keywords` for the required per-entry source + confidence schema; volumes recorded as "Unknown" where not accessible, never fabricated.
- Use the existing GSC connection (`lib/seo/google.ts` + `service.ts`) for search analytics, sitemap submission, and URL inspection; never imply submission guarantees crawling.
- Extend `/admin/seo` panels: keyword research, content management, search performance, conversions ("Data not available" + reason where no analytics source exists).
- Internal linking: articles already support `internal_links`; build the 3-5 link map per article against the 25 existing URLs.

**Workstream B (AI Customer Support)**
- Model provider: the existing AI chain (Cloudflare armed) provides the server-side model.
- Email: existing Resend path; verify support@jobiest.com mailbox deliverability before relying on it (B1).
- New tables: support conversations, tickets (`JBT-YYYYMMDD-XXXX`), knowledge base entries (KB-xxx), support analytics events.
- UI: floating widget mounted across routes (public + app shells), admin ticket dashboard under `/admin`.
- Escalation triggers and "agent must never claim actions it did not perform" are new logic in the agent layer.

**Workstream C (Resume Studio 20 Templates)**
- `lib/resume-studio/templates.ts`: add the 20 C3.1 catalog entries with new metadata fields (photo required/optional/none, ATS flag, columns) and photo-capable layouts.
- Renderer: extend `ResumePreview`/export pipeline for photo placement, selectable PDF text (already the case for the existing export path), page-break behavior.
- New public gallery route with filter bar, cards (thumbnail preview, name, description, suitable-for, layout/photo/ATS badges), fictional sample data ("Alex Morgan").
- Photo upload endpoint with server-side MIME/size validation; storage via Supabase (bucket or documents path).
- Wizard copy update (50 -> 70 templates).

**Cross-workstream**
- All new UI uses the canonical navy/yellow tokens, WCAG 2.1 AA, responsive 375/768/1280/1440, loading/error/empty states, zero regressions (605-test suite plus new tests).

## 15. Risks and Constraints

- **Truthfulness:** keyword volumes inaccessible without paid tools are recorded "Unknown"; no fabricated data anywhere. Articles must contain verifiable, truthful claims only.
- **Blog duplication risk:** 25 existing articles overlap the brief's target topics (ATS, keywords, cover letters, LinkedIn). The 20 new articles require a cannibalization check against all 25, not 10.
- **Analytics gap:** no GA property; conversion panels may show "Data not available" with reasons. Setting up GA requires user-provided property details (blocker protocol, do not halt).
- **Photo templates:** adding photos changes the export pipeline (PDF embedding); risk of ATS regressions on existing templates is low because new templates are additive.
- **Widget on all routes:** must not break marketing page performance (no heavy client bundle on public pages) and must respect the deterministic-only Cloudflare constraint for the agent's tool use.
- **DB migrations are raw SQL:** every new table needs a numbered migration with rollback notes; no destructive operations without explicit confirmation.
- **Deployment:** Vercel + GitHub Actions; all changes ship via `main` with CI green; production smoke per Stage 8 protocol.
- **Email deliverability:** support@jobiest.com mailbox must be verified before ticket email delivery is trusted (B1); record email status per ticket either way.

---

Audit complete. Implementation sequencing, migrations, API and UI plans, and rollback notes follow in `MASTER_UPGRADE_IMPLEMENTATION_PLAN.md` (same directory).
