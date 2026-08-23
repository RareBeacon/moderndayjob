# Decisions Log

Records material implementation decisions and requirement conflicts, per `docs/CODING_AGENT.md` §2.

## D-001 — No Gmail / inbox access (resolves a spec conflict)

`docs/CODING_AGENT.md` §13 and §18 reference Gmail OAuth and "Gmail connection works".
`AGENTS.md` §6 and the product handoff explicitly prohibit Gmail inbox access, OAuth,
and stored email passwords; users provide an application email address only.

**Resolution:** The newer, explicit prohibition wins. There is no Gmail OAuth, no mailbox
monitoring, and no stored email credentials. An `application_email` field captures the
address a user wants used when applying (see D-002). The older Gmail references in
`CODING_AGENT.md` are treated as superseded.

## D-002 — application_email stored on profiles

The application email is stored as a plain `application_email text` column on
`public.profiles` (migration `005_profile_application_email.sql`). It is a contact address
the user supplies, not a credential, so cleartext is acceptable and no encryption is
required. Writes use the service role server-side; the existing `profile_self` SELECT
policy covers the new column.

## D-003 — Profile "delete" clears the career profile only

`DELETE /api/profile` removes the user's `career_profiles` row (headline, summary, skills,
experience, education, projects, links). It does **not** delete the auth account or the
`profiles` row. This keeps the action safe and re-enterable, and is clearly labelled in the UI.

## D-005 — UI styling: hand-written CSS, not Tailwind (deviation from TECHNICAL_REQUIREMENTS)
`docs/TECHNICAL_REQUIREMENTS.md` §1 specifies "UI: Tailwind CSS + accessible component system".
The implemented codebase uses a hand-written, design-token CSS system (`app/globals.css`) instead.
**Decision:** Keep the token CSS. It is accessible (WCAG AA focus/contrast), responsive, tokenized,
and already drives the whole app. Migrating to Tailwind now would be a large, risky refactor with little
functional benefit. The accessible-component-system intent is honored via reusable classes plus shared
React components (`components/site/*`). Revisit if the team standardizes on Tailwind.

## D-006 — AI gateway: unified OpenAI-compatible transport, prompt-versioned tasks, consume-before metering

`packages/ai/gateway.ts` is the central AIService (ARCHITECTURE §7/§13). Design choices:

- **One transport, many providers.** OpenRouter and Hugging Face both expose the OpenAI
  `/chat/completions` contract, so a single `OpenAICompatProvider` (bound to a credential:
  name/model/baseUrl/decrypted-key/priority) serves both. The fallback chain is just the ordered
  provider list; on provider failure *or* malformed/schema-invalid output the gateway falls through to
  the next provider (§13), throwing `AI_ALL_PROVIDERS_FAILED` only when all fail.
- **Prompt versioning + schema validation.** Each `AITask` carries an `id`, integer `version`, a Zod
  `schema`, and a `buildMessages` builder. The gateway parses model output (handling raw/fenced/prose-
  wrapped JSON via `parseJsonContent`) and `safeParse`s it; malformed output is rejected (Phase 5
  acceptance). `JOB_MATCH_TASK` (v1) is the first task (Phase 6).
- **Quota: consume-before, refund-on-total-failure.** A `UsageMeter` (`reserve`/`refund`) wraps a run.
  `reserve` calls the atomic `consume_ai_credit` RPC (FOR UPDATE locking) so the daily limit can never
  be exceeded even under concurrency; `refund` is a best-effort decrement used only when every provider
  fails, so users are not charged for outages. Matching meters at the **session** level (one credit per
  match run regardless of jobs scored); single-call tasks meter per call via `run(task,input,{meter})`.
- **Purity/testability.** The gateway + providers + tasks import no env/crypto/supabase, so they are
  fully unit-tested with mock providers/gateway. Server wiring (load+decrypt `ai_credentials`, the RPC
  meter, DB loaders) lives in `lib/ai/*` and is the only place that touches secrets/DB.
- **Existing `resume` route left as-is.** It works and predates the gateway; rewriting it is out of
  scope and risks a working surface. New AI surfaces (matching) use the gateway; `resume` should migrate
  in a later cleanup.
- **No migration.** Reuses `ai_credentials`, `consume_ai_credit`, `usage_daily`, `jobs`, `applications`.

