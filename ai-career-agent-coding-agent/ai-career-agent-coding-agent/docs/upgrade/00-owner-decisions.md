# 00 · Owner decisions required before implementation

Date: 2026-09-23 · Status: CONFIRMED by owner 2026-09-23 (D1-D4 answered directly; D5-D6 recommendations unopposed) · Blocking: none

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

OWNER ANSWER: adopt the monthly matrix (option 1).

Recommendation detail kept for the record, with two honesty amendments:
- Pro = 15 document credits (the directive's own recommendation).
- Max documents = a disclosed fair-use cap (recommend 100/month), never the
  word "unlimited" without a number, per the claims-match-implementation rule.

## D2 · Free auto-apply activation: how the card is verified

Paystack officially supports zero-amount card authorization (Charge Card
API, purpose=ADD_CARD): the card is authenticated and validated with no
charge and no recurring billing. Research doc section 5 has the source.

OWNER ANSWER: zero-amount verification (option 1).

Detail: Paystack card-verification flow (purpose=ADD_CARD), disclosed in
plain language ("we verify your card, we never charge it"), combined with
email verification, the 85% onboarding gate, rate limits, and application
deduplication. No charge, no refund logistics, no processor fees.
Flutterwave parity is not verified; launch Paystack-only.

## D3 · When an auto-apply credit is consumed

OWNER ANSWER: reserve-consume-release (option 1).

Detail: reserve one credit when the application starts, consume it only on
confirmed submission, release it on failure or cancellation, and never
spend a second credit when retrying the same job (job+user deduplication
already exists and stays).

## D4 · Unused credits and downgrades

OWNER ANSWER (custom): credits NEVER expire, and each period's new grant
ADDS to the running balance.

Implementation consequences, recorded honestly:
- The ledger keeps a running balance per resource type; grants accumulate,
  consumption decrements, and there are no EXPIRE operations.
- Plan changes never touch the balance: downgrades keep every credit,
  document, application, and portfolio, and future grants arrive at the new
  plan's rate. Nothing is ever deleted.
- Burst control: accumulated credits cannot be spent in a burst because
  per-day execution rate limits stay in force; free-tier grants also
  require an activated, email-verified account. This is the abuse
  mitigation that preserves the owner's accumulation rule.

## D5 · Custom domains for portfolios

OWNER: accepted by silence with the plan (recommendation unopposed).
Launch hosted portfolios on jobiest.com/portfolio/slug first. Custom domains (DNS verification, TLS, abuse handling, support cost)
are a later, separately costed phase. The directive itself recommends this.

## D6 · Existing users and the 85% onboarding gate

OWNER: accepted by silence with the plan (recommendation unopposed).
The gate applies to accounts created after the feature ships (epoch
constant). Existing accounts see a completion prompt, never a lockout. This
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
