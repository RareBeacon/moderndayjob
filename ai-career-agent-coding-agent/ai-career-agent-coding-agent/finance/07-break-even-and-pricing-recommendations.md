# 07 — Break-Even & Pricing Recommendations — 2026-10-25

## Formula
Contribution = Net revenue − variable service costs (₦738 GPT-4o or ₦50 mini)
Break-even paying = Fixed operating costs ÷ avg contribution per paying

Fixed = $45 (Vercel+Supabase) + domain ₦1,250 = **₦72,675** (expected $67.50 fixed+AI share → ₦108k with AI baseline)

Using expected mix avg net = ₦10,000 (weighted BASIC/PREMIUM/MAX), contribution GPT-4o = 10,000−2%−738= **₦9,062**, mini = **₦9,750**.

- Break-even GPT-4o: 72,675 / 9,062 = **8 paying** (lean) or 108k/9,062= **12 paying** (expected)
- Break-even mini: 72,675/9,750 = **7.5 paying**

Max affordable AI/user = contribution − fixed/paying. At 10 paying: 10k−7,267= **₦2,733** affordable — well above actual ₦738.

## Structurally Unprofitable?
None individually under Ollama/mini; under GPT-4o heavy usage (10 docs/day × $0.05= $0.50=₦793/user) + hosting ₦714 = ₦1,507 → BASIC 4,900 still +3,393; Premium 9,800 still +8,293. No plan structurally negative at base usage.

## Recommendations (trade-offs)

1. **Keep Ollama primary, OpenRouter only disaster** — saves ₦35k/mo. Trade: slightly lower quality for routine tasks, acceptable.
2. **Cache AI results** — 20% duplicate prompts; saves 20% tokens.
3. **Enforce Free 3 lifetime + 10 tools/day strictly** — already server-enforced; prevents Free from scaling unbounded.
4. **Add annual plans 15% discount** — improves cash flow, reduces churn.
5. **Do NOT raise Basic to ₦7k yet** — mix shows still profitable; raise only if AI costs spike >₦2k/user.
6. **Cap Auto-Apply daily strictly** — prevents automationSlots abuse.

