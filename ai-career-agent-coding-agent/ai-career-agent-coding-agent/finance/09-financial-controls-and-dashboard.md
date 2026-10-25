# 09 — Financial Controls & Dashboard — 2026-10-25

## Monthly Tracking (founder)
- Expenses by provider (Vercel, Supabase, Resend, OpenRouter invoices)
- AI cost per action (instrument `lib/ai/usage.ts` to log input/output tokens per call, not just docs_used)
- Cost per active user / per paying user
- Revenue by plan, payment success rate, refund rate
- Free→paid conversion, churn (when history exists)
- Infra usage alerts (Supabase 80% storage/egress, Resend 80% daily cap, OCI idle)
- Credit/renewal alerts (domain 30d before, Vercel credit 80%)

## Existing events
- `audit_logs` captures admin actions; `ai_usage`, `usage_daily/lifetime`, `credit_*` RPCs capture docs; missing token telemetry — **gap.**

## Minimal implementation
1. Add `ai_usage` columns `input_tokens, output_tokens, model, provider`.
2. Update `lib/ai/server.ts` to log after each OpenRouter/Ollama call.
3. Create view `finance_monthly` summing revenue, AI cost, hosting.
4. Protect `/admin` finance tab to admin only; do not expose to users.
5. Monthly invoice reconciliation manual (founder checks Stripe/Flutterwave dashboard vs DB).

No paid analytics required — use Supabase cron + email.

