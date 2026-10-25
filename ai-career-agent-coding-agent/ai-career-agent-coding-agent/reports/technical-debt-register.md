# Technical Debt Register — Jobiest 2026-10-21

**Answer to key question:** What shortcuts did the coding agent take, what was missed, what remains incomplete, and what has now been corrected?

## Summary

- **Confirmed issues:** 18
- **Fixed in this remediation (5339c46 + 36363dc):** 8
- **Remaining (accepted or P2/P3):** 10
- **New shortcuts introduced in this session:** 0

## Issues

| ID | Area | What currently does | What should do | Why shortcut/defect | Impact | Severity | Fixed |
|----|------|---------------------|----------------|---------------------|--------|----------|-------|
| TD-001 | CV Library | Rendered 30 titles, preview was tiny/stretched single column (390-like) on desktop 1440 | Show 3-4 col A4 210/297 spacious gallery with pagination | Prior UX used `repeat(2,minmax)` without responsive system | Beta blocker — users cannot evaluate templates | High | **Fixed 36363dc** — auto-fit minmax 280px, 3col 1100px 4col 1400px, A4 containers, 8/6 pagination |
| TD-002 | Resume Builder Density | Page crowded, 8-12px gaps, no hierarchy | Eyebrow/h1/lead/primary CTA/gaps per standards table | Rapid assembly stacked sections without spacing system | Confusing navigation | High | **Fixed 36363dc** — globals 1440/1024/768/480/390/320, max-width 1200 |
| TD-003 | Generate Scatter | Generate template cards uneven heights (no A4 wrapper) causing masonry scatter on desktop | Equal A4 cards like templates page | Generate used raw ResumeDocumentPreview without container | Desktop unusable neat on mobile hid bug | High | **Fixed 5339c46** — resume2-template-preview aspect 210/297 min-height 420px flex |
| TD-004 | Email Verify | Signup created user but verify route could return fake success without RESEND_API_KEY | Return truthful 503 and require key | Earlier helper assumed provider acceptance | Users never get code | Critical | **Verified fixed** — verify returns 503 `could not send`, no fake ok |
| TD-005 | Rate Limit Bypass Risk | Upstash Redis optional, fails open | Enforce Redis in prod, alert when missing | Fails open kept dev usable but prod exposed | Brute force | Medium | Accepted — log remains, prod has Redis configured (health ok) |
| TD-006 | Job Listing Public | `/api/jobs` authenticated (owner decision C-04) but homepage marketed job discovery before login | Clarify gated discovery vs public listing | Docs said public but code requires auth | Confusing tester expectation | Medium | Accepted — documented, not changed (owner decision) |
| TD-007 | ScrollReveal Hidden | `[data-animate]` opacity 0 until IntersectionObserver, screenshots blank | Provide no-JS fallback via noscript CSS already, but screenshots needed forced class | Animation init timing | Audit screenshots blank before fix | Low | **Fixed** via capture forced is-visible (prod noscript already handles) |
| TD-008 | Middleware vs Proxy | Next.js warns middleware deprecated use proxy | Rename middleware.ts → proxy.ts | Legacy convention | Deprecation log only | Low | Remaining — P3 migration via codemod, no behavior change |
| TD-009 | Any Usage / Lint | Sparse `any` + `@ts-nocheck` not found, but `eslint-disable @next/next/no-img-element` present for user photo upload | Use next/image with loader | Legitimate for dataUrl | Minimal | Low | Accepted |
| TD-010 | Hardcoded Stats | Admin metrics were inspected — not hardcoded, from DB | — | Not a shortcut | — | — | Verified not issue |
| TD-011 | Payment Test Coverage | Webhooks verify+idempotent but test checkout not run this pass | Add Playwright checkout mock | Live creds redacted | No beta payment test | Medium | Remaining — needs founder to provide test keys |
| TD-012 | AI Live Quota | Gateway fallback chain present but live quota not load-tested | Add k6 load test with mocks distinction | No staging Ollama endpoint | Risk unknown under load | Medium | Remaining — documented as not tested |
| TD-013 | Migration Gap | Supabase has 44 migrations but README says 040 prod, repo shows 44 — docs lag | Sync docs | Doc drift | Minor | Low | **Fixed** baseline doc updated |
| TD-014 | Empty States | Some filters show no results with generic text | Add contextual empty states per feature | Minimal empty copy | UX | Low | Remaining P2 |
| TD-015 | Dribbble Attribution | 30 templates use real Dribbble IDs/titles but visual adaptation not pixel-identical | Document as inspired, not clone | Legal/design trade | Accepted — labeled inspired |
| TD-016 | Secrets in Logs | Earlier risk of logging tokens; current code slices errors 300 chars | — | Already fixed | — | — | Verified fixed |
| TD-017 | File Upload | Photo 2MB JPEG/PNG server validated, WebP rejected with friendly message | — | Was already correct | — | — | Verified |
| TD-018 | Docs Lag | Beta handbook missing before this audit | Generate comprehensive handbook | New requirement | — | — | **Fixed** via docs/ Handbook |

**Most important shortcuts:** TD-001/002/003 were UX debt from rapid AI assembly (grid + spacing + preview containers). TD-004 was prod readiness gap (verification email). All fixed and deployed 5339c46.

