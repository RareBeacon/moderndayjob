# Consolidated Security Review (Master Upgrade, Stage 7)

Date: 2026-09-21
Scope: every surface added or changed by the Master Upgrade (Stages 1-6 plus the photo pipeline), reviewed as one pass after commit a5c98e7.
Method: source review of each boundary, backed by the automated suite (70 test files, 642 tests) and a live production smoke test. No destructive actions were performed.

## 1. Authentication and session

| Surface | Control | Evidence |
| --- | --- | --- |
| All /api routes except public reads | `requireUser` gate | `lib/auth` used across route files; unauthenticated export returns 401 (live smoke) |
| Admin pages and admin APIs | role check on top of auth | `tests/admin-security.test.ts`, `/admin` redirects anonymous users (live smoke) |
| Chat widget | anonymous platform chain with a fixed zero-UUID user; no session forging | `tests/customer-support` suite |
| Sign-out | server-side session invalidation | `tests/auth-signout-route.test.ts` |

## 2. Authorization (IDOR)

- Document export and download filter by `user_id` before any row is read; ownership is checked in the query, not after (route code, `tests/route-auth.test.ts`).
- Support tickets and admin panels scope reads to the requesting user or require admin role.
- Resume Studio drafts are keyed to the authenticated user; the photo endpoint requires auth before reading the multipart body.

## 3. Input validation

- Draft normalization (`lib/resume-studio/draft.ts`): every text field passes `cleanText` with per-field caps; arrays are sliced; unknown fields are dropped. `personal.photoDataUrl` is accepted only when it matches the `data:image/(jpeg|png);base64,` prefix and is capped at 3,000,000 characters.
- Photo pipeline (`lib/resume-studio/photo.ts`), validated at BOTH boundaries:
  1. Upload: `POST /api/resume-studio/photo` requires auth, is rate limited (20/min/IP), reads raw bytes, checks magic bytes (JPEG `FFD8FF`, PNG `89504E47`), rejects anything else including WebP, and enforces the 2 MB cap. It returns a data URL only; nothing is written to disk or object storage.
  2. Export: `parseDocumentContent` re-runs `parsePhotoDataUrl` on the stored value. Draft content is client-controlled JSON, so the export path never trusts it: declared MIME must match magic bytes, size cap re-checked, malformed values are dropped (document exports without a photo rather than failing).
- Covered by `tests/resume-photo-export.test.ts` (11 tests): magic bytes, size cap, MIME-mismatch rejection, tampered data URLs never reaching renderers, per-template export integrity.

## 4. Injection defenses

- Prompt injection: `lib/ai/injection.ts` plus a corpus suite (`tests/apply-injection-corpus.test.ts`); AI output is rendered as data, never executed.
- SQL: no string-built SQL in app code; database changes go through the Supabase Management API with parameterized queries (migrations 001-029).
- XSS: React escaping throughout; no `dangerouslySetInnerHTML` on any new surface; blog and KB content render through typed components.
- PDF/DOCX: user text flows through `drawText`/`TextRun` (escaped by the libraries); image bytes are embedded only after magic-byte validation.

## 5. Rate limiting and abuse controls

| Route | Limit |
| --- | --- |
| Document export | 60/min/IP |
| Resume photo upload | 20/min/IP |
| Support chat | per-user window (documented in Stage 5 report) |
| Auth and signup | existing Stage 1 limits |

Abuse ladder, automation killswitch, and bearer-auth tests remain green (`tests/abuse-ladder.test.ts`, `tests/automation-killswitch.test.ts`, `tests/bearer-auth.test.ts`).

## 6. Secrets and egress

- All provider keys are server-only; the client bundle audit from Stage 1 still holds (no secrets in `NEXT_PUBLIC_*`).
- AI egress goes through the gateway allowlist (`tests/agent-egress.test.ts`).
- CI uses dummy env vars only (`vitest.config.ts` env block); real keys live in Vercel/Supabase, never in the repo.

## 7. Content integrity (truthful-content rule)

- No JobPosting schema anywhere (verified by the Stage 3 schema census); Article/FAQ/SoftwareApplication schemas match what the pages actually are.
- Template catalog badges state real behavior; ATS-friendliness is marked Partial where layout is graphics-light but not fully plain-text (documented in docs/RESUME_TEMPLATE_CATALOG.md).
- Blog and KB articles contain no fabricated claims; free-tool pages state real limits.

## 8. Findings and accepted risks

| # | Finding | Status |
| --- | --- | --- |
| 1 | Photo re-validation drops invalid photos silently instead of erroring the export | Accepted, documented: a failed export would strand users who stored a bad draft; the export still succeeds with text only |
| 2 | Support chat first response 85-106 s | Known capacity item, tracked in Stage 5 report |
| 3 | Admin panels A11.2-A11.4 still pending | Out of scope for this pass; A11.3 GSC-only, A11.4 shows "Data not available" |
| 4 | GitHub PAT failed an authenticated API status call while git push still worked | Worked around via the public status API; token rotation recommended at next user check-in |
| 5 | Data-URL photos inflate draft row size (about 2.7 MB per 2 MB photo) | Accepted for the 1000-user scale; a future object-storage path is noted in the architecture doc |

## 9. Verdict

No high-severity findings. Every new boundary added by the Master Upgrade has auth, ownership scoping, input validation, and rate limiting in place, with tests as evidence. The photo pipeline validates at both the upload and export boundaries and stores nothing on disk.
