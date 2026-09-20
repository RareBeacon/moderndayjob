# Master Upgrade Implementation Plan

Companion to `MASTER_UPGRADE_AUDIT.md` (Phase Zero, Stage 1 gate). This plan reflects audited reality: the SEO engine and Resume Studio exist and will be extended; customer support AI is the main new build. All stages follow the spec's execution order and blocker protocol (never halt on missing credentials; document the exact requirement and continue).

## 1. Dependency Map

What must exist before what can be built:

```
Stage 1 audit (this document pair)
  -> Stage 2 keyword database (extends seo_keywords; feeds article selection)
       -> Stage 3 technical SEO fixes (independent of keywords, runs parallel where safe)
            -> Stage 4 article production (needs keyword DB + cannibalization check + link map)
                 -> sitemap updates + GSC submission after each publish batch
       -> Stage 5 support workstream (independent of A; needs AI chain only, already live)
            -> KB verified against live app BEFORE agent prompt finalization
            -> mailbox verification before ticket email reliance
  -> Stage 6 resume templates (independent of A and B; needs templates.ts extension + renderer)
Stage 4/5/6 (any completed) -> Stage 7 integration tests + security review
  -> Stage 8 deploy + production smoke
    -> Stage 9 final report
```

Hard dependencies inside workstreams:

- Keyword DB schema extension must land before bulk article briefs (briefs cite keyword entries with source + confidence).
- Technical SEO checklist must pass before articles are submitted in sitemaps (avoid submitting broken URLs).
- Knowledge base entries must be verified against the live app before the agent system prompt is versioned and frozen (B3/B4 order).
- support@jobiest.com mailbox verification must precede the first ticket email send (B1), but ticket DB writes can be built and tested first.
- The 20 C3.1 templates need metadata + renderer support (photo, columns, badges) before the public gallery page renders real previews.
- Photo upload endpoint must exist before photo-required template can be selected end to end.

## 2. Implementation Sequence by Stage

- **Stage 1 (complete):** audit + this plan. Commit, push, deploy.
- **Stage 2:** keyword research corpus + `seo_keywords` schema extension (source, confidence tier Observed/Estimated/Qualitative/Hypothesis, volume "Unknown" handling) + dashboard keyword panel. Deliverable: SEO_RESEARCH_REPORT + KEYWORD_RESEARCH docs.
- **Stage 3:** technical SEO audit of all 45 sitemap URLs against the A9.1 checklist (titles <= 60 chars, metas <= 160, canonicals, structured data, indexability); fix findings; SEO_TECHNICAL_AUDIT doc.
- **Stage 4:** 20 articles. For each: brief (A6.4 template), cannibalization check against all 25 existing, production, internal link map (3-5 links), publish to `seo_articles`, verify public 200 URL, sitemap refresh + GSC submission. SEO_CONTENT_STRATEGY + SEO_PUBLISHING_REPORT docs.
- **Stage 5:** support workstream. Order: KB schema + entries (live-app verified), versioned system prompt, agent endpoint on the existing AI chain, widget UI across shells, ticket system + escalation triggers + email, admin ticket dashboard + analytics, prompt injection defense tests. Deliverables: CUSTOMER_SUPPORT_ARCHITECTURE, PROMPT, KNOWLEDGE_BASE, TEST_REPORT docs.
- **Stage 6 (parallel with 4-5 after Stage 3):** templates. Order: metadata extension in templates.ts, 20 C3.1 entries, renderer extensions (photo, two-column variants), photo upload API, public gallery page, per-template export checklists, wizard copy update. Deliverables: RESUME_TEMPLATE_ARCHITECTURE, CATALOG, TEST_REPORT docs.
- **Stage 7:** integration tests (widget on every route, gallery + export, article flow end to end), security review (injection, rate limits, admin gates, upload validation), full suite green.
- **Stage 8:** deploy main, production smoke (health, sitemap, blog, widget presence, gallery, export, ticket flow with authorisation).
- **Stage 9:** FINAL_REPORT with per-requirement acceptance mapping.

## 3. Estimated Scope per Workstream

**Workstream A (SEO):** 1 migration (extend seo_keywords), ~4 admin panel components, keyword research documentation across the 5 required markets/categories, 20 articles (each with brief + checks), technical fixes across existing 25 articles where audit findings require, GSC operations via existing integration. Largest effort: article production (20 x full standards).

**Workstream B (Support):** 1-2 migrations (conversations/tickets/KB/analytics), 3-4 API routes (chat, ticket create, KB admin, analytics), agent module with versioned prompt + escalation state machine, 1 widget component family + mounting across 5 shells, admin dashboard page + analytics, test suite incl. injection defenses. Largest new surface.

**Workstream C (Templates):** 0-1 migration (photo storage reference), templates.ts extension (20 entries + metadata types), renderer + export extensions for photo/columns, 1 upload API route, 1 public gallery page + cards/filters/badges, sample data model ("Alex Morgan"), wizard copy changes, per-template export checklists (20).

**Cross:** integration tests, security review, responsive/a11y passes, final report.

## 4. Database Migration Plan

Numbered sequentially after 027. All raw SQL with rollback notes in-file. No destructive operations; extensions are additive.

- `028_seo_keywords_upgrade.sql`: add columns to `seo_keywords` (or companion table if incompatible): `source` (text, where the entry came from), `confidence` (enum-like text check constraint: Observed, Estimated, Qualitative, Hypothesis), `volume` (text, "Unknown" allowed), `intent`, `cluster`, `current_ranking_url`. Rollback: drop added columns.
- `029_support_core.sql`: `support_conversations` (id, user id nullable, started_at, route, status), `support_tickets` (id text primary key JBT-YYYYMMDD-XXXX, conversation fk, category, priority, status, created_at, email_status, resolution summary), `support_kb_entries` (id KB-xxx, question, answer_md, verified_at, live_url_verified, topics[]), `support_analytics_events` (type, conversation id, created_at, metadata jsonb). Rollback: drop tables.
- `030_resume_photos.sql` (if needed beyond documents storage): photo asset reference for drafts (mime, size, storage path, template id). Rollback: drop table/columns.

RLS: support tables locked to service role + admin reads; KB entries readable by the agent runtime via service role only. Analytics events insert-only.

## 5. API Extension Plan

- `POST /api/support/chat`: rate limited, creates/reuses conversation, calls the AI chain server-side with the versioned system prompt + retrieved KB entries, returns answer + escalation flag. Never performs account actions; never claims actions not performed.
- `POST /api/support/tickets`: creates `JBT-YYYYMMDD-XXXX` (date + sequence, unique), writes DB first, then attempts email to support@jobiest.com, records email status on the ticket, only then reports ticket id to the user.
- `GET /api/admin/support/*`: admin-gated ticket list, conversation transcripts, analytics aggregates.
- `POST /api/resume-studio/photo`: MIME allowlist (image/jpeg, image/png, image/webp), size cap, server-side validation, storage via Supabase, returns photo reference for the draft.
- `seo_keywords` write path stays admin-gated through existing admin patterns.

## 6. UI Component Plan

All new UI: canonical navy/yellow tokens, WCAG 2.1 AA, 375/768/1280/1440, loading/error/empty states, no placeholders (show "Data not available" + reason where data is absent).

- Support widget (`components/support/ChatWidget` family): floating launcher on all routes, draggable with >5px threshold, localStorage position, role=dialog, aria-live announcements, 44px targets, 4.5:1 contrast, escalation UI to ticket creation.
- Admin support dashboard (`app/admin/support`): ticket table, filters, conversation viewer, analytics panels.
- SEO dashboard panels (extend `/admin/seo`): keyword research table (source + confidence columns), content management (25 existing + 20 new), search performance (GSC data), conversions (events or "Data not available").
- Public template gallery (`app/templates` or equivalent public route): grid 3-4 cols desktop / 1-2 mobile, filter bar (All, ATS-Friendly, With Photo, One-Page, Two-Column, Category), cards with real preview thumbnails rendered from sample data, badges (layout, photo, ATS), sticky select on mobile.
- Template selection inside wizard: extended cards with new badges; copy update 50 -> 70.
- Blog: no new components; new articles ride existing rendering.

## 7. Rollback Considerations

- Every migration additive with in-file rollback notes; no renames or drops of existing columns.
- Articles: publishing is data (rows in `seo_articles`); rollback is unpublish (status change), no code rollback needed.
- Templates: new entries are additive to the template registry; a bad template is removed from the registry, existing 50 untouched. Renderer changes ship behind additive layout types so old templates render identically.
- Widget: feature is additive; can be disabled by unmounting the launcher without touching other pages. Agent endpoint can be rate-limit-disabled while widget shows the ticket fallback.
- SEO panels: additive dashboard sections; GSC operations already exist.
- Deploy: Vercel instant rollback to the previous deployment if production smoke fails; DB rollbacks per migration notes.

## 8. Known Blockers and Resolution Requirements

Per the blocker protocol, none of these halt execution; work continues in parallel and the exact requirement is documented:

1. **Paid keyword tools (Ahrefs/Semrush/etc.):** no credentials. Resolution: free and qualitative sources only (Google autocomplete, People Also Ask, GSC observed queries where the API returns them, competitor page inspection); every keyword entry records its source + confidence tier; volumes recorded "Unknown" when not accessible. Never fabricated.
2. **Analytics property (GA4 or similar):** none exists. Resolution: SEO conversion panel uses first-party `seo_conversion_events` where available and otherwise shows "Data not available" with the reason "No analytics property connected". If the user later provides a GA property, the panel can be wired to it.
3. **support@jobiest.com mailbox:** deliverability not yet verified. Resolution: verify via test send + user confirmation before relying on email delivery; until then tickets still persist to the DB and email status is recorded per ticket (B1 order preserved).
4. **OpenRouter API key:** absent by design; the AI chain tail is dormant. The support agent uses the armed Cloudflare tier; no action required unless both primary tiers degrade.
5. **No other credential blockers identified.** GSC is connected; Supabase, Resend, Flutterwave, Vercel, and the AI chain are operational.

## Stage 1 completion statement

The audit is substantially complete across all checklist areas in section 2.1 of the brief. Implementation proceeds to Stage 2 (keyword database) with Stages 3-6 sequenced per section 2 above.
