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

## D-004 — Build and verify before any push, deploy, or migration

Per `docs/CODING_AGENT.md` §16, production deployment requires `npm run build`, migrations,
and verification to pass first. Locally we run typecheck + unit tests + production build
before any code is pushed or any migration is applied to the hosted database.
