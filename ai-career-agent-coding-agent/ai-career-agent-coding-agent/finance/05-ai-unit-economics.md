# 05 — AI Unit Economics — 2026-10-25

**Models inspected:** `lib/ai/server.ts` → Ollama qwen2.5:7b (local $0), fallback GPT-oss-120b via Cloudflare, disaster OpenRouter `openrouter/auto` (GPT-4o $2.50/$10, mini $0.15/$0.60). Prompt sizes estimated from `lib/generation/tasks.ts`.

| Action | Input tokens | Output tokens | Cost @ GPT-4o | Cost @ mini | Calls/workflow | Cost/success |
|--------|--------------|---------------|---------------|-------------|----------------|--------------|
| suggestSkills | 800 | 200 | $0.004 | $0.0002 | 1 | $0.004 |
| writeSummary | 2,500 | 400 | $0.010 | $0.0006 | 1 | $0.010 |
| generateExperience | 2,000 | 350 | $0.0085 | $0.0005 | 1+retry 20% | $0.010 |
| optimizeForJob (ATS) | 4,000 | 600 | $0.016 | $0.001 | 1 | $0.016 |
| cover letter (free-tool) | 3,500 | 700 | $0.015 | $0.0009 | 1 | $0.015 |
| **Typical CV build (5 actions)** | — | — | **$0.05** | **$0.003** | — | **$0.05** |

**Monthly AI cost:**
- 100 active users × 30% use AI × 1 CV/mo × $0.05 = **$1.50/mo** (mini $0.09)
- 500 users × 50% × $0.05 = **$12.50/mo**
- 1,000 users × 50% × $0.05 = **$25/mo** (or $1.50 on mini)

**Cost per active user:** $0.015 (mini $0.001) at base mix.
**Cost per paying user:** similar — AI quota tied to plan, not payment.

**Gap:** No token telemetry in `ai_usage` table — consumption logged as `docs_used` only. Need to instrument `lib/ai/usage.ts` to log input/output tokens per call.

