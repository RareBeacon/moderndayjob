# 06 — Pricing & Profitability — 2026-10-25

**Source truth:** `lib/billing/pricing.ts` Plans FREE/BASIC/PREMIUM/MAX; server-enforced via `credit_*` RPC + `ENTITLEMENTS_LEDGER`.

| Plan | Monthly NGN | Monthly USD | Docs/day | Auto/day | Tools/day | Fee 2% | Net NGN |
|------|-------------|-------------|----------|----------|-----------|--------|---------|
| FREE | 0 | 0 | 3 lifetime total | 0 | 10 | 0 | 0 |
| BASIC | 5,000 | 3.99 | 3 | 0 (2 lifetime trial) | 50 | 100 (2% + VAT) | 4,900 |
| PREMIUM | 10,000 | 7.99 | 10 | 10 | ∞ | 200 | 9,800 |
| MAX | 20,000 | 14.99 | 20 | 20 | ∞ | 400 | 19,600 |

Direct cost per active user (100 users, Ollama primary): ~$0.015/user → **₦24/user** + hosting share $0.45/user (₦714) + email near zero → **~₦738/user var**.
Free user cost: ₦738 × free users.
Paying subsidization: 1 BASIC (net 4,900) can subsidize ~6 free users (6×738=4,428) before loss.

## Scenarios (50/100/500/1000 active users)

Assumptions: mix 50% BASIC 30% PREMIUM 20% MAX for paying slice.

| Users | Paying 2% | Paying 5% | Paying 10% | Revenue (NGN) @5% mix | Var cost | Fixed $45+domain | Gross | Op Profit |
|-------|-----------|-----------|------------|-----------------------|----------|-----------------|-------|-----------|
| 50 | 1 | 2.5 | 5 | ~₦25k | ₦36k | ₦72k | -₦11k | -₦83k |
| 100 | 2 | 5 | 10 | ~₦50k | ₦74k | ₦72k | -₦24k | -₦96k |
| 500 | 10 | 25 | 50 | ~₦250k | ₦369k | ₦72k | -₦119k | -₦191k |
| 1,000 | 20 | 50 | 100 | ~₦500k | ₦738k | ₦72k | -₦238k | -₦310k |

**With mini model ($0.003 AI):** Var cost drops to ~₦50/user → 500 users 5% paying → var ₦25k + fixed ₦72k = ₦97k cost vs ₦250k revenue → **+₦153k profit**. Model choice decides viability.

**Conclusion:** Free plan cost dominates; pricing only sustainable if AI stays on Ollama/mini and fixed hosting <$100/mo. Premium/Max are profitable individually (contribution 9,800-24-714=9k, 19,600-...=18.8k), Basic marginal (4,900-738=4,162).

Payment fees: Flutterwave 2% (1.4+0.6) +7.5% VAT = effective ~2.15%; already deducted.

