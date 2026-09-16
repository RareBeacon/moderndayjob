# Jobiest Master Spec · Validation & Execution Report

**Spec:** `uploads/jobiest-master-spec.md` (2,104 lines, September 2026)
**Base:** remote main through `fdf13d2` (a parallel workstream shipped: new homepage, Resume Studio 2, Free Tools 2 engine, /pricing, /about, /blog, /how-it-works, canonicals, CI, Docker, security hardening) **plus** the spec-execution pass documented here
**Method:** every `[ASSUMPTION REQUIRING VALIDATION]` and `[HYPOTHESIS]` was checked against the actual codebase, as the spec requires.

---

## 1 · Executive decisions (professional judgement, flagged per spec preamble)

### 1.1 Brand: KEEP the live identity
The spec proposes cobalt `#2563EB` + Inter + white surfaces. The shipped product has an approved teal/petrol/paper identity with a custom logo (just standardized everywhere + favicon + brand kit per explicit user direction). The spec's *structural* color rules (brand/semantic/neutral/state layers, two-accent max, reserved primary) are satisfied by the live token system. **Decision: keep the live brand; spec palette treated as reference, not mandate.**

### 1.2 Email verification: REMOVED (explicit user instruction, restoring it)
A parallel workstream had reintroduced mandatory email verification (Resend emails, 30-minute links, locked accounts). This directly contradicted the user's explicit standing instruction: "remove the email verification for now, anybody should be able to create account, register, login and operate the platform." This pass removes the gate while **keeping every security layer** that workstream added (per-IP rate limits, device cookies, registration-velocity risk scoring, audit trail). Accounts are created pre-confirmed; signup signs in immediately; legacy unconfirmed accounts auto-repair at login via the password-proven `/api/auth/confirm` route.

### 1.3 Plan names: KEEP Free / Basic / Premium / Max
Wired into billing, entitlements, and Flutterwave amounts. Spec's language rules applied instead: "AI documents" jargon renamed to "AI generations" everywhere (10 files).

---

## 2 · Spec assumptions vs. codebase reality

| Spec assumption | Reality | Verdict |
|---|---|---|
| Generic hero headline | "Get more interviews. Not more tabs." (outcome-first) | Already good (parallel workstream) |
| Free tools gated before value | FreeToolExperience runs tools anonymously, gates only copy/download/save after output (12/hr anon vs 30/hr signed-in, IP-limited) | Already spec-compliant (parallel workstream) |
| No dedicated pricing page | `/pricing` exists with plans + comparison | Already done (parallel workstream) |
| Canonical tags | Present on all public pages (parallel workstream) | Already done |
| Em dashes in copy | 99 had crept back in across 47 files | **Purged this pass** |
| "AI Documents" internal jargon | Present in 10 files | **Renamed this pass** |
| Structured data (JSON-LD) | Absent | **Added this pass**: WebSite + Organization + FAQPage (homepage), SoftwareApplication on all 10 tools |
| Titles ≤ 60 chars | Tool titles were 66-76 chars with brand | **Shortened this pass** (all ≤ 44) |
| Copy enforcement (spec 12.6) | None | **Added this pass**: `tests/copy-guard.test.ts` fails CI on em dashes or prohibited jargon |
| Signup simplicity | Email + password only, minimal | Already compliant |
| Value-first tools | Anonymous generation with post-output account prompt | Already compliant |
| Testimonials/social proof | Not fabricated; real-number policy in effect | Compliant (spec forbids fabrication) |

---

## 3 · What this pass executed (on top of `fdf13d2`)

1. **Auth de-verification (user's explicit instruction):** `email_confirm: true` on signup; verification email + generateLink block removed; signup page signs in immediately; login auto-repairs legacy unconfirmed accounts (correct password proven first); `/api/auth/confirm` route recreated. All rate-limit/risk/device/audit hardening retained.
2. **Em dash purge:** 99 occurrences across 47 files rewritten naturally (semicolons, colons, or restructured sentences).
3. **Appendix C jargon purge:** "AI documents" → "AI generations" in 10 files; one legitimate internal regex tagged `copy-guard:allow`.
4. **JSON-LD structured data:** WebSite, Organization, FAQPage on the homepage (from the in-file FAQ data); SoftwareApplication (free, NGN 0) on all 10 tool pages.
5. **Title patterns (spec 11.3):** all tool metadata titles shortened to `Free X · Jobiest` form (≤ 44 chars).
6. **Copy guard tests:** CI-enforced em dash + prohibited-term scanning across app/components/lib/packages/apps/workers.

---

## 4 · What remains (sequenced by spec priority)

- **Phase 3 remainder:** Resume Studio autosave indicator polish, template gallery expansion, DOCX export (PDF path exists in the new studio).
- **Phase 4:** public job discovery + programmatic SEO pages (`/jobs/[category]`, `/jobs/nigeria/lagos`, JobPosting schema, 410 for stale); Kanban applications view over the existing state machine.
- **Phase 5:** blog cadence (editorial), Nigeria SEO landing pages, salary estimator tool.
- **Currency switcher (spec 10.5):** NGN-first live; USD/GBP display toggle future work.
- **Testimonials/logos:** only when real; never fabricated.

---

## 5 · Verification (spec Part 19, applicable items)

- Em dashes: 0 in source, CI-enforced
- Prohibited terms: 0 (one reviewed internal-pattern exception), CI-enforced
- Titles: all public pages within spec length
- Canonicals: all public pages (parallel workstream) 
- Structured data: present and truthful (no invented ratings/counts)
- Value-first tools: anonymous runs confirmed in the generate route
- Server-side rendering: public pages are server components
