# Remediation Log — 2026-10-21

**Branch:** fix/signup-verification-cv-previews-20261019 → origin/main 5339c46
**Author:** Philip <tobi@jobiest.ai>

| ID | Issue | Files Changed | Migration | Tests | Rollback |
|----|-------|---------------|-----------|-------|----------|
| R-001 | TD-001 Gallery sparse | `components/resume/TemplateGallery.module.css` (auto-fit 280px, 3col 1100, 4col 1400, A4 210/297, card 420px), `TemplateGallery.tsx` (pageSize 8/6 + resize listener), `app/templates/page.tsx` (hierarchy breadcrumb/h1/CTA), `app/globals.css` (responsive 320-1440), `DribbbleResume.module.css` (A4 wrapper 794px) | none | tsc 0 vitest 103/1044 build 103kB | revert 36363dc |
| R-002 | TD-002 Density | same as R-001 plus `app/generate/page.tsx` breadcrumb/lead padding | none | same | revert 36363dc |
| R-003 | TD-003 Generate scatter | `app/generate/page.tsx` TemplateCard wrap `resume2-template-preview`, `app/globals.css` card flex min-height preview aspect | none | build 14.9kB generate | revert 5339c46 |
| R-004 | Verify truthfulness | No code change needed — `app/api/auth/verify` already returns 503 on missing RESEND_API_KEY; behavior re-verified via fetch | none | manual fetch 503 path | — |
| R-005 | Baseline docs | `reports/pre-beta-baseline.md` created | none | — | delete |
| R-006 | Audit debt register | `reports/technical-debt-register.md` created | none | — | delete |

**Deployments:**
- 857233a..36363dc pushed via PAT, health flip 17:18:30 to 36363dc
- 36363dc..5339c46 pushed, health flip ~18:12 to 5339c46, verified via curl no-cache

**Remaining:** TD-005/006/008/011/012/014 as accepted P2/P3 — require founder decision or test keys.

