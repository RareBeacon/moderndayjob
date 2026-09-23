# 02 · Research and tool evaluation (Phase 1)

Date: 2026-09-23 · Sources checked on this date; versions move fast, recheck
at implementation time.

Scope note (honesty): this research covers the four engine candidates named
in the directive plus the payment-verification question. It does not claim
to survey every browser-automation project on GitHub. The strongest
constraint on any candidate is our own verified architecture: we already
run an isolated, SSRF-guarded, self-hosted Playwright worker with
deterministic adapters, so the bar for replacing any of it is high.

## 1. Candidates

### Playwright (microsoft/playwright) · KEEP (already adopted)

Apache-2.0, Microsoft-maintained, the industry standard; already the engine
inside workers/browser (1.62.1) and our e2e suite. Deterministic, fast,
zero LLM cost per action. Weakness: selectors need maintenance when sites
change, and coverage is limited to what adapters implement. Verdict: no
change; this remains the deterministic foundation.

### Stagehand (browserbase/stagehand) · ADOPT SELECTIVELY, LATER

MIT license. TypeScript, Python, Go SDKs; npm @browserbasehq/stagehand at
v4.1.0, actively maintained (last publish within days of this research),
about 24.8k stars. Built on top of Playwright; adds act() / extract() /
observe() AI primitives, self-healing actions, deep locators for nested
iframes and shadow DOM, OTel traces. Can run self-hosted with our own
browser and our own model (we already have the Oracle AI gateway), with
Browserbase cloud entirely optional.

Why it fits if adopted: it is the same runtime model we already have (a
Playwright worker we control) plus an AI fallback for unknown fields and
changed pages. It does not force a vendor.

Why later: every AI action costs tokens (benchmarks put AI-assisted
browser tasks around $0.01 to $0.30+ per task versus $0 for a
deterministic adapter run), and success rates on novel pages are 70 to 85
percent versus near-100 percent for maintained adapters. Until Milestone 4
instruments where our adapters actually fail, adding it is guesswork.

Verdict: PoC inside workers/browser behind a feature flag AFTER
instrumentation exists; use for unknown-field assistance and structured
extraction only, never for final submit clicks.

### Browser Use (browser-use) · REJECT FOR NOW

MIT, but Python-first while our worker is TypeScript; full-agent loop with
an LLM call per navigation step (users report roughly 50k tokens per step
on DOM-heavy pages), benchmark completion around 77 percent, reported CDP
instability with real Chrome. Cost and reliability both move the wrong way
for a per-application production pipeline. Revisit only if a Python worker
ever exists and instrumentation shows a need the Stagehand PoC cannot meet.

### Browserbase + Exa job-application template · REFERENCE ONLY

A documented template combining Exa job search, Stagehand, and Playwright
on Browserbase's managed browser cloud. Useful as a workflow reference
(discovery, extraction, role-specific answers, upload, submit). Not
adopted: Browserbase is a paid managed service we do not need (we have a
self-hosted worker), and Exa-based job discovery adds per-search cost and
conflicts with our no-scraping stance (users bring job links; boards are
browsed by the user, never by us).

## 2. Comparison matrix

| Candidate | License | Fits TS stack | LLM cost per app | Reliability model | Hosting | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Playwright (current) | Apache-2.0 | yes | $0 | deterministic, near-100% on known sites | self (Oracle + Render) | keep |
| Stagehand | MIT | yes | ~$0.01-0.30+ per AI task | hybrid, self-healing | self or Browserbase | selective, post-instrumentation |
| Browser Use | MIT | no (Python) | ~50k tokens/step reported | full agent, ~77% benchmark | self or cloud | reject for now |
| Browserbase/Exa template | commercial deps | n/a | per-session + per-search | managed | Browserbase cloud | reference only |

## 3. Engine direction (recommendation)

Hybrid, exactly as the directive sketches, but sequenced honestly:

1. Keep deterministic adapters as the primary path (they are cheap, fast,
   and safe).
2. Instrument them (Milestone 4): success, failure, uncertainty, per
   adapter, per failure reason.
3. Only then PoC Stagehand as the AI-assisted fallback for unknown fields
   and changed pages, inside our own worker, behind a flag, with a cost
   ceiling per application.
4. Never use AI to click final submit; submission verification stays
   deterministic per adapter.

## 4. Hosting economics

Oracle VM is the primary worker host and its trial ends 2026-10-07
(retention decision pending; A1 free-tier retry armed; Render free
standby live with automatic failover). Any managed-browser dependency
(Browserbase) would add recurring cost and is not needed while
self-hosting works. The worker hosting decision is an input to, not a
blocker for, the credit/onboarding milestones.

## 5. Payment research: free activation without a charge

Paystack officially supports card verification with zero-amount
authorization: the Charge Card flow with purpose=ADD_CARD authenticates and
validates the card without charging it, and an explicit recurring_consent
flag controls future reusability (source: Paystack docs, Charge Card /
Card verification, checked 2026-09-23). This means free auto-apply
activation can be truly no-charge: provider-hosted collection, zero
authorization, webhook-verified, no stored card data, no refund logistics,
no processor fees. Card details never touch our servers (Paystack
tokenizes). Flutterwave parity is NOT verified; launch Paystack-only.

## 6. Adoption summary

Adopt: monthly-credit ledger design (in-house), Paystack ADD_CARD
activation flow, portfolio slugs (in-house), instrumentation first.
Adapt: Stagehand (PoC, later, flagged). Reject (for now): Browser Use,
Browserbase/Exa managed dependencies. Keep: Playwright worker, adapters,
failover pair, existing Resume Studio export stack.
