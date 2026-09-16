# Spec evolution: Phase 0 findings and decisions

Date: 2026-09-16
Spec: `/home/user/uploads/JOBIEST_PRODUCT_EVOLUTION_MASTER_SPEC.md` (product-evolution audit + spec, 2,688 lines)
Repo state at start: `a797524` (clean, deployed, live-verified)

This document is the Phase 0 deliverable: what the spec claimed, what we verified in the repo, where the spec was wrong or stale, every decision taken, and what is deferred or blocked. P0 implementation notes are at the end.

## 1. Spec claims verified TRUE (evidence in repo at `a797524`)

| Spec finding | Verified |
|---|---|
| V1/V2 Homepage has zero tool links; no `#tools` anchor target | `app/page.tsx` had 0 tool links; ids only `agent,faq,how,main,pricing`. A complete tools section (`JobletTools` in `components/site/joblet/Sections.tsx`) existed as dead code, imported by nothing. |
| V4 `robots.ts` disallows `/jobs` while marketing links to it | `app/robots.ts` disallows `/jobs`; `Footer.tsx:28` linked "Browse jobs" → `/jobs`. |
| V5 Subpage Navbar icon-only `/jobs` link | `components/site/joblet/Navbar.tsx:53` search icon → `/jobs`. Also: `Resources` → `/#tools` broken anchor. Also found (not in spec): `Home` link hard-coded `active: true` on every page. |
| V7/V8 Homepage shows 2 plans with no prices | `app/page.tsx` plans array: Free "Start free" + Premium "Upgrade when ready", no ₦ figures; Basic/Max missing while `lib/billing/pricing.ts` defines all four. |
| V10 "3 AI generations in total, free forever" | `lib/billing/pricing.ts:49` FREE feature line attached "free forever" to a lifetime-capped resource. |
| V11/V12 Currency picker + estimate lines | `app/pricing/page.tsx` + `lib/billing/currency.ts`: 12-currency picker, live FX fetch, "Estimate:" lines. |
| V14 "SEO public pages ready" fake stat | `app/page.tsx` ja-social strip. |
| V15-ish fake stats strip | Strip removed; but see §2 nuance: the "189" figure was live data, not a fabrication. |
| V16/V18 title double-branding + `·` separator | Template was `%s · Jobiest`; `About Jobiest` and `How Jobiest Works` rendered "… · Jobiest" twice; homepage title "Jobiest - …" also doubled. |
| V21 og:image missing on tool pages | Tool pages define `openGraph` without `images`, which overrides the root layout default and drops the og image. |
| V25 7-stage ceremony ("Discover…Unlock") | `FreeToolExperience.tsx` `ft2-lifecycle` strip + stage kickers. |
| V35 App-shell labels unclear | `AppShell.tsx`: desktop `Generate`, `Matches`, `Documents`; mobile `Make`, `Apps`. |
| /terms §1 punctuation damage | `app/terms/page.tsx:24-25`: stray "; " mid-sentence. Same class of damage in `lib/billing/currency.ts:4` (now rewritten) and `/signup` subtitle semicolon. |

## 2. Where the spec was wrong or stale (corrections)

1. **V15 "role scan number is hardcoded" — FALSE.** `app/page.tsx` queried the live `jobs` table (`getLiveMarket()`); the crawl's "189" was the real count that day. The number was live, but the *label* ("role scan") and its neighbors ("SEO public pages ready") were jargon/fake. Action taken: removed the strip and the unverifiable stats; kept the live count in the hero-bottom row with a plain-language label ("roles reviewed from verified sources").
2. **"Homepage pricing shows 'Upgrade when ready'"** — true, but the spec implied four price cards were missing entirely; the real issue was presentation (2 of 4 plans, no figures). Fixed by rendering all four plans from `lib/billing/pricing.ts` (single source of truth) with ₦ figures.
3. Spec's P1 "ungate tool output" implied all tools gate the result. In reality anonymous visitors already see the full result ("preview"); only copy/download/save are gated, and the ATS scanner is deterministic. We ungated copy for the deterministic scanner only (see §3.4).

## 3. Decisions taken (and why)

1. **`/jobs` = Option A: keep private, remove public links.** No legal review is available for redistributing Greenhouse/Ashby/Lever listings publicly (Option B). Kept `robots.ts` disallow; removed footer "Browse jobs" and the Navbar search icon. Logged-in product access unchanged.
2. **Keep `/free-*` URLs, add `/tools` hub.** Spec's zero-risk recommendation (no Search Console data to prove which URLs carry equity, so no redirects). New `app/tools/page.tsx` groups all 10 tools by job-to-be-done; homepage nav/footer/section and joblet Navbar/Footer link to it; added to sitemap (0.9, weekly) and SEO allowlist.
3. **Pricing = single currency, NGN, exact.** Removed the 12-currency picker, live FX fetch, and "Estimate" lines. `lib/billing/currency.ts` rewritten NGN-only (`formatNaira`; `resolveCurrency` always returns NGN for compatibility). Checkout bills in Naira; displaying any other number was the confusion. USD display deferred until Paystack/Flutterwave USD billing is verified enabled.
4. **Free tier copy, honest; quota unchanged.** "Free forever" no longer attached to the 3 lifetime generations ("3 AI generations in total to try the AI writer"). The *plan* remains ₦0 forever, tools stay free on every plan. Actual quota semantics (lifetimeDocs: 3, toolUses/day) untouched — changing limits is a founder decision, noted here, not taken.
5. **"Auto-apply" language retired in user-facing copy.** The mechanism is agent-prepared applications with explicit approval at every step (per /terms §1). Now "agent-mode applications, each approved by you" / "2 agent-mode trial runs (you approve each send)". Field names in code (`automationSlots`) unchanged.
6. **Title template `%s - Jobiest`** (hyphen per spec 29.3). Removed brand from page titles that duplicated it (homepage, /about, /how-it-works).
7. **De-ceremony the tool flow (scoped V25).** Removed the "Discover/Start/Ask/…/Unlock" lifecycle strip; kickers now say "Free tool", "Question n of N", "Check your answers", "Your result". Progress messages (honest, per-tool) kept.
8. **Ungate deterministic copy (scoped V24/P1-16).** New `deterministic` flag in `lib/free-tools/config.ts` (ATS scanner only — verified pure rule-based in `generator.ts:atsScan`). Anonymous visitors can copy the scan; manual-selection copy-block skipped for it; download/save still need a free account. AI tools keep the existing gate.

## 4. P0 + quick-P1 items implemented in this pass

- `/tools` hub page (all 10 tools, 3 rules, ItemList JSON-LD).
- `/help` page (WCAG 3.2.6): getting started, documents/truthfulness, billing, support contact (support@jobiest.com — same address as /refund and /terms; no invented SLA).
- Homepage: real-route nav; hero `<br/>` removed; secondary CTA → /tools; fake-stat strip replaced by a 6-tool section + "See all 10 free tools"; 4 plans at real ₦ prices; "updated now" → "example" preview labels; honest FAQ free-tier answer; "Live systems operational" replaced by live "N verified job sources" (fallback: "10 free career tools, no card needed").
- Joblet Navbar: real routes, per-page active state via `usePathname`, `Resources/#tools` and icon-only `/jobs` removed.
- Footer: Free tools → `/tools`, Help → `/help`, "Browse jobs" removed.
- Pricing page: NGN-only, problems-solved table above plans, Product+Offer JSON-LD, descriptive title, "What currency am I billed in?" FAQ, honest free-tier FAQ.
- Copy: /terms §1, /signup subtitle, /refund ("5 to 10 business days", agent-mode wording), pricing.ts + billing page blurbs.
- App shell renames: Today, Jobs, Recommended, Create, Applications, My documents, Billing, Career profile; mobile: Today/Jobs/Applications/Create.
- Titles: template hyphen + double-brand fixes; og:image added to all 10 tool pages' openGraph.
- Sitemap: `/tools` (0.9 weekly), `/help` (0.6 monthly).

## 5. Security verification (spec P0 items 11-12) — PASS

- **RLS:** enabled on every user-facing table (`profiles`, `career_profiles`, `jobs`, `applications`, `documents`, `generated_documents`, `free_tool_events`, `free_tool_results`, …) in migrations 001/002/007/016; migration `010_lockdown_private_tables.sql` default-denies the rest, adds owner-read policies, sets `security_invoker` on views, and revokes anon/authenticated from admin/payment/security tables. App accesses via service role.
- **Webhooks:** Flutterwave webhook (`app/api/billing/flutterwave/webhook/route.ts`) verifies `verif-hash` timing-safe against `FLW_SECRET_HASH`, caps body size, short-circuits replays. Tally webhook verifies HMAC-SHA256 when `TALLY_WEBHOOK_SECRET` is set — note: if that env var is unset the route accepts unsigned payloads (logged to security_events only). Recommendation: set `TALLY_WEBHOOK_SECRET` in all environments (env change, not code).

## 6. Blocked or deferred (with reasons)

| Item | Status | Blocker |
|---|---|---|
| Analytics (PostHog or similar) | Blocked | Needs an account/credentials; no new paid accounts per standing constraint. Wiring plan documented in spec §; revisit when an account exists. |
| Google OAuth | Blocked | Needs Google Cloud credentials (client ID/secret). |
| USD/foreign display | Deferred | Only after USD billing is verified enabled at the processor. |
| Free-tier quota change | Deferred | Founder decision; copy made honest instead. |
| /jobs public (Option B) | Rejected for now | Legal review unavailable for ATS-listing redistribution. |
| P1 breadcrumb JSON-LD sitewide | Deferred (next pass) | Product/Offer + ItemList schemas shipped in this pass. |
| P3+ Studio rebuild behind feature flag | Not started (later phase per spec) | — |
| Dynamic per-tool og images | Deferred | Static og-card.jpg now on all tool pages (was missing entirely). |

## 7. Merge gate for this pass

tsc 0 errors; vitest 412/412 (47 files; count dropped from 418 because the old 11-assertion multi-currency test was replaced by a 5-assertion NGN-only test); next build clean. See commit message for the final numbers.
