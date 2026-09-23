# 00 · Owner decisions required before implementation

Date: 2026-09-23 · Status: OPEN · Blocking: Milestones 2, 3, 6

The upgrade directive is explicit: the coding agent must not invent business
rules. These decisions change pricing, entitlements, and payment behavior, so
they require the owner's confirmation before the corresponding milestones
start. Each has a recommendation; confirm or change.

## D1 · Quota model: monthly credits vs current daily quotas

Today (migration 012): daily counters. FREE 3 AI/day, 0 applications;
BASIC 10 AI/day + 10 applications/day; PREMIUM 20/20; MAX 40/40. Plus
lifetime limits: FREE 3 documents ever, BASIC 2 auto-apply uses ever.

The directive proposes monthly credits: documents 5/10/15/fair-use;
auto-apply 5 (after free activation)/20/30/50; portfolios 1/5/10/26.

Recommendation: adopt the monthly matrix, with two honesty amendments:
- Pro = 15 document credits (the directive's own recommendation).
- Max documents = a disclosed fair-use cap (recommend 100/month), never the
  word "unlimited" without a number, per the claims-match-implementation rule.

## D2 · Free auto-apply activation: how the card is verified

Paystack officially supports zero-amount card authorization (Charge Card
API, purpose=ADD_CARD): the card is authenticated and validated with no
charge and no recurring billing. Research doc section 5 has the source.

Recommendation: zero-amount verification via Paystack's card-verification
flow, disclosed in plain language ("we verify your card, we never charge
it"), combined with email verification, the 85% onboarding gate, rate
limits, and application deduplication. No charge, no refund logistics, no
processor fees. Flutterwave parity is not verified; launch Paystack-only.

## D3 · When an auto-apply credit is consumed

Recommendation: reserve one credit when the application starts, consume it
only on confirmed submission, release it on failure or cancellation, and
never spend a second credit when retrying the same job (job+user
deduplication already exists and stays).

## D4 · Unused credits and downgrades

Recommendation: unused monthly credits expire at period end (no rollover;
rollover invites farming and complicates the ledger). On downgrade: keep
every existing document, application, and portfolio; restrict new creation
to the new plan's limits; never delete user data.

## D5 · Custom domains for portfolios

Recommendation: launch hosted portfolios on jobiest.com/portfolio/slug
first. Custom domains (DNS verification, TLS, abuse handling, support cost)
are a later, separately costed phase. The directive itself recommends this.

## D6 · Existing users and the 85% onboarding gate

Recommendation: the gate applies to accounts created after the feature
ships. Existing accounts see a completion prompt, never a lockout. This
avoids breaking working accounts (directive Phase 5 requirement).

## D7 · Submission mode default

Already settled by standing owner policy: review-before-submit by default;
automatic submission is an explicit opt-in on supported sites with email
after every automated submission. This decision is recorded, not reopened,
unless the owner says otherwise.

## Not blocked (no decision needed)

- Auto-Apply engine direction: keep the deterministic adapters + isolated
  Playwright worker; add AI-assisted fallback (Stagehand) only after
  instrumentation proves where adapters fail. See research doc.
- Resume Studio: keep the existing 20-template generation stack; make the
  flow profile-aware and verify no double-charging on re-download.
