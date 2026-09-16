# Security baseline findings register (Phase 0/1)

Date: 2026-09-16 · Spec: `JOBIEST_MASTER_IMPLEMENTATION_PACKAGE.md` · Baseline `7f54ddb` + this pass.
Companion docs: `discovery-phase0.md` (checklist), `api-inventory.md` (59 routes), `jobiest_security_checks.sql` (Book IV), `tests/security-baseline.test.ts` (CI guards), `supabase/migrations/022_security_baseline.sql`.

The package was authored from an external passive recon **without repository access**. This register
reconciles its findings, weaknesses, contradictions and assumptions against the actual code, in its own
finding format (§31.1), and records what this pass fixed vs. what remains.

## 1. Package findings F-001…F-010 vs reality

| ID | Package claim | Verified reality | Resolution |
|---|---|---|---|
| F-001 (P1) | RLS/PostgREST posture unknown | Browser Supabase client is **auth-only** (no `.from()` in client code) → PostgREST is not a public data surface. RLS enabled on 34/35 tables; migration 010 already locks down admin/payment tables. | **Mostly closed.** Residual: `subscription_plans` lacked RLS → fixed in migration 022. Owner runs `jobiest_security_checks.sql` in prod to confirm live state (B-002). |
| F-002 (P1) | CSP `unsafe-inline` + `unsafe-eval` | Confirmed at baseline. | **Partially fixed this pass:** `unsafe-eval` removed (verified no eval in app code; prod Next does not need it), `object-src 'none'`, `worker-src 'self'` added. `unsafe-inline` retained until nonce CSP (B-040) — larger change, deferred. Header guard test prevents regression. |
| F-003 (P2) | Auth pages cacheable (`public, max-age=0`) | Confirmed live (`/login` was `public, must-revalidate`). | **Fixed this pass:** `Cache-Control: no-store` on /login, /signup, /reset-password + all authenticated surfaces via `next.config.mjs`. Verified live after deploy. |
| F-004 (P2) | `ACAO: *` on 404 | Confirmed live on 404s, but **zero CORS code exists in the repo** — it is Vercel platform behaviour on its generated 404. | **No app-level action possible** (documented). No credentialed cross-origin API exists, so exposure is nil. |
| F-005 (P2) | No admin plane → no admin audit | **Wrong premise**: an admin plane exists (`/api/admin/*`, 11 routes, `admin_users`/`admin_actions` tables, deny-by-default gate in every handler). | Baseline is solid; remaining gaps are B-032 (MFA step-up), capability matrix (§5.1), admin-route rate limits (B-044). Deferred with reasons (§3). |
| F-006 (P2) | robots blocks /jobs; no JobPosting pages | Confirmed — but resolved differently by owner decision (Option A, product-evolution spec): `/jobs` stays private; no public links; legal review for republication unavailable. | **Superseded by C-04 decision: deferred** until a lawyer reviews listing republication (package itself says legal review first). |
| F-007 (P2) | Retention "immutable" without schedule | Privacy policy states retention without periods. | **Open (owner+legal, B-352).** Engineering part (retention job, deletion workflow) is Phase 12 backlog; policy text update is an owner action. |
| F-008 (P3) | Missing COOP/CORP/X-DNS-Prefetch; HSTS preload | Confirmed at baseline. | **Fixed this pass:** COOP `same-origin`, CORP `same-origin`, `X-DNS-Prefetch-Control: off` added. HSTS `preload` **not** added deliberately: preload-list submission is effectively irreversible and is an owner decision. |
| F-009 (Info) | Bundles clean (sampled) | Confirmed; now enforced | **Closed:** CI bundle-scan test (B-003) fails the suite on any secret pattern or non-anon JWT in `.next/static`. |
| F-010 (Info) | Strong baseline headers | Confirmed | Maintained + extended; header-guard test added. |

## 2. Weaknesses W-01…W-12 vs reality

| ID | Reality check | Status |
|---|---|---|
| W-01 RLS exposure | See F-001: browser client is auth-only; RLS 34/35→35/35 after 022 | Closed (pending owner's live SQL run) |
| W-02 distributed authorization | All 59 routes inventoried; every route carries a server auth marker or is on a reviewed allowlist; CI lint enforces it for new routes | Closed at baseline level; B-023's uniform wrapper remains optional refactor |
| W-03 middleware bypass | Next 15.5.25 (CVE-2025-29927 patched); middleware is UX-only by design; `getUser()` everywhere | Not applicable |
| W-04 agent observability | Agent is approval-gated and request-scoped; `agent_tasks` + `audit_logs` + `security_events` exist; step-level run ledger (B-062) not built | Partial; Phase 2 backlog |
| W-05 prompt injection | `lib/ai/injection.ts` + `sanitize.ts` exist (pattern neutralization, untrusted-wrapping); corpus + canary CI (B-221) not built | Partial; Phase 6 backlog |
| W-06 server-authoritative quotas | Fully implemented in SQL (013): lifetime + daily caps, `FOR UPDATE`, idempotency keys; verified race-safe by construction | Closed |
| W-07 CSP | See F-002 | Partial (nonce CSP deferred) |
| W-08 cacheable auth pages | See F-003 | Closed this pass |
| W-09 robots vs job SEO | See F-006 | Deferred by decision |
| W-10 retention | See F-007 | Open (owner/legal) |
| W-11 free-tier abuse | Lifetime caps server-enforced; rate limits on all free-tool routes; multi-signal abuse ladder (B-073) not built | Partial; Phase 2 backlog |
| W-12 no admin audit | See F-005 — admin plane exists; `admin_actions` table exists | Partial; B-032/B-063 backlog |

## 3. Contradiction register C-01…C-08 — resolutions in this repo

| ID | Resolution |
|---|---|
| C-01 "auto-apply" vs Terms | **Already resolved in `7f54ddb`**: user-facing copy says "agent-mode applications, each approved by you"; approval is server-gated (`approveApplication`); no external auto-submit path exists in code. |
| C-02 30-minute session | Supabase defaults (60-min access tokens, refresh rotation) approximate the consumer policy; the app-level inactivity layer and admin 8h policy are **deferred** (needs Supabase dashboard config + owner sign-off on UX impact). Documented, not silently dropped. |
| C-03 retention | Open — owner/legal (F-007). |
| C-04 public job pages | **Superseded**: Option A (private /jobs) chosen in the product-evolution spec for want of legal review; revisit after review. |
| C-05 dash policy | Already implemented repo-wide (copy-guard tests forbid em/en dashes in product copy; hyphens allowed in identifiers). |
| C-06 pronouns | No pronoun-forcing rule exists in the product; nothing to resolve. |
| C-07 score naming | ATS scanner describes itself as "parseability score… not your worth as a candidate"; no hire-probability claims anywhere. Document Fit Report rename (B-106) is cosmetic backlog. |
| C-08 admin plane | Exists (F-005); hardening backlog B-032. |
| **New** | The package's §24.6 assumes multi-currency display with labelled estimates; the product-evolution spec **removed** the currency picker for NGN-only honesty (shipped `7f54ddb`). NGN-only is stricter and retained; if USD billing is ever enabled at the processor, reintroduce display conversion single-sourced in `lib/billing/currency.ts`. |

## 4. Findings from THIS pass (package format §31.1, condensed)

### [F-011] `subscription_plans` created without RLS — P2 (D1)
- **CWE:** CWE-732 (incorrect authorization); the only table of 35 missing RLS.
- **Evidence:** `001_initial.sql` creates it; no later migration enables RLS (proven by `tests/security-baseline.test.ts` D1 before the fix).
- **Impact:** With the anon key, an unauthenticated caller could read the plan catalog (reference data; no PII). Low confidentiality impact; policy non-compliance with the zero-RLS-gaps rule.
- **Root cause:** 001's RLS batch (line 45) listed 7 tables and missed the catalog table created on line 11.
- **Fix:** migration `022_security_baseline.sql`: `enable` + `force row level security`, no policies (service-role only). Regression: D1 test now passes and stays in CI.
- **Re-test:** CI green; owner's live SQL run post-apply.

### [F-012] SECURITY DEFINER functions without pinned `search_path` — P2 (D6)
- **CWE:** CWE-908 / Supabase advisory (privilege-escalation primitive on shared instances).
- **Evidence:** `consume_ai_credit`, `reserve_application_slot`, `consume_tool_use`, `apply_verified_payment` defined `security definer as $$` without `set search_path` in 013 (current definitions), bodies referencing unqualified table names. (`handle_new_user` was already fixed by 009; 003/004 functions pin `public`.)
- **Fix:** migration 022 re-creates all four verbatim with `set search_path = public` and fully-qualified names. Regression: D6 test (last-definition-wins) in CI.
- **Adjacent check:** swept every migration for other `create function` statements — 003/004/009 are pinned; no others exist.

## 5. Blocked on the owner (no coding-agent access) — the honest list

1. **Run `jobiest_security_checks.sql` (Book IV) in the Supabase SQL editor against production** and store the output (B-002). The D1/D6 fixes in 022 land when the migration is applied.
2. **Apply migration 022** in the same console session (forward-only, idempotent, functionally identical).
3. **Set `TALLY_WEBHOOK_SECRET`** in Vercel (unsigned Tally webhooks are accepted when unset).
4. **Confirm Upstash rate-limit env vars** are set in production (limits silently allow-all when unset).
5. **Supabase dashboard hardening** (C-08 Layer 1): console MFA on, JWT expiry ≈60 min, refresh rotation on, leaked-password screening on, `pgaudit` consideration (B-351).
6. **Staging environment** (B-004) — separate Vercel + Supabase projects + provider test keys.
7. **PITR + restore test, access review, break-glass doc** (B-350/B-351).
8. **ROPA/DPIA/retention policy periods + NDPC assessment** (B-352, F-007) — legal work.
9. **HSTS preload submission** — owner decision (irreversible-ish).
10. **Admin TOTP enrollment**, after which MFA step-up enforcement (B-032) can ship without locking the owner out.

## 6. Deliberately deferred (engineering backlog, ordered)

B-032 admin MFA · B-040 nonce CSP · B-060..B-063 ledgers/admin workspace · B-061 ai_usage ledger · B-073 abuse ladder · B-045 SSRF fetcher module (no current URL-fetch surface) · B-046 page-count cap + malware scan · B-100..B-108 evidence-matrix pipeline · B-140..B-147 adapter registry/compliance matrix formalization · B-180..B-186 state-machine formalization · B-220..B-224 agent security · B-300+ public job pages (after legal review) · C-02 app-level inactivity timer.

## 7. What shipped in this pass (commit)

- `supabase/migrations/022_security_baseline.sql` — RLS on `subscription_plans` (F-011) + search_path pins for the four quota/payment functions (F-012).
- `next.config.mjs` — CSP without `unsafe-eval`, `object-src 'none'`, `worker-src 'self'`, COOP/CORP/X-DNS-Prefetch-Control, `no-store` on auth + authenticated surfaces.
- `tests/security-baseline.test.ts` — CI guards: D1/D2/D6 migration audit, endpoint deny-by-default registry, header assertions, bundle secret scan.
- `jobiest_security_checks.sql` — Book IV script, verbatim, with run instructions.
- `docs/discovery-phase0.md`, `docs/api-inventory.md`, this register — the Phase 0 deliverables (B-001, §9.2, §31.2).
