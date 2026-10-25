# 01 — Infrastructure Inventory — Jobiest 2026-10-25

**Commit:** a529d99 | **Date:** 2026-10-25 | **Source:** repo + deployed health + vendor pricing 2026

## Method
Actual provider identified from `package.json`, `lib/env.ts`, `lib/supabase.ts`, `vercel.json`, `deploy/oci`, `lib/ai/server.ts`, `lib/email/resend.ts`, `app/api/jobs`, `lib/jobsources`. Costs are **published vendor price** (Oct 2026) not invoices; usage is **calculated estimate** where logs unavailable.

## Inventory

| Component | Provider | Env | Evidence | Current Plan | Cash Cost | Quota | Usage (est.) | Overage | Free Expiry | Paid Replacement | Alt | Risk |
|-----------|----------|-----|----------|--------------|-----------|-------|--------------|---------|-------------|----------------|-----|------|
| Frontend + Functions | Vercel | prod | `vercel.json` crons, Next 15.5.25, `NEXT_PUBLIC_APP_URL` | Hobby free (assumed) | $0 verified? Unknown | Hobby 100GB transfer 1M req | ~5GB, low | $20 Pro $20 credit + $0.15/GB after 1TB | No known expiry, but commercial use requires Pro | Vercel Pro $20/mo (+$20 seat) | Oracle OCI docker compose (already configured) | If Hobby enforced, commercial use blocked; upgrade forced |
| Database | Supabase | prod | `lib/supabase.ts`, migrations 44, `cbxloutahmalorumaihc` | Pro (inferred, 100k MAU) | $25 published | 8GB DB 250GB egress 100GB storage 100k MAU | DB <2GB, egress low | $0.125/GB storage, $0.09/GB egress, $0.00325/MAU | No free credit known; already paid | Supabase Pro $25 + $10 compute | Self-host Postgres on OCI | If Free, paused after 1wk idle |
| Auth | Supabase Auth | prod | `lib/auth.ts`, Google/LinkedIn verify | included in Pro | $0 | 100k MAU | <1k users | see above | — | — | — | |
| Email Verification + Transactional | Resend | prod | `lib/email/resend.ts`, `RESEND_API_KEY` verified healthy | Free $0 (3k/mo 100/day) | $0 current, Pro $20 published | 3k/mo 100/day 30d retention | ~200/mo at beta | $0.90/1k after 50k on Pro (Pro $20 for 50k) | No expiry, permanent free | Resend Pro $20/50k or $35/100k | AWS SES | Free hits 100/day cap → welcomes fail; must upgrade at 3k/mo |
| AI Gateway | Ollama self-hosted | Oracle VM | `lib/env OLLAMA_BASE_URL`, `lib/ai/server.ts` | Always Free Ampere A1 (inferred from deploy/oci) | $0 economic value $~0 | OCI Always Free | low | — | Oracle may reclaim idle | OpenRouter fallback | OpenRouter | If VM reclaimed, fallback costs spike |
| AI Fallback 1 | Cloudflare Workers AI | prod | `CLOUDFLARE_ACCOUNT_ID/TOKEN` gpt-oss-120b | Unknown (likely free tier) | $0 or unknown | Unknown | low | Unknown | Unknown | Cloudflare AI $5/1M tokens est. | OpenRouter | If not configured, skipped |
| AI Fallback 2 | OpenRouter | prod | `OPENROUTER_API_KEY/MODEL` auto | Pay-as-you-go | Unknown — passthrough +5.5% fee | per-model (GPT-4o $2.50/$10 per 1M, GPT-4o-mini $0.15/$0.60) | Unknown | 5.5% card fee min $0.80 | None | Same | Direct OpenAI | Cost scales with tokens |
| Job Data | Greenhouse/Lever/Ashby boards | prod | `lib/jobsources/boards.ts` | Free public boards | $0 | rate-limited | Unknown | — | — | Paid aggregator $100-500/mo | Same | Boards may block scraping |
| Storage (PDFs, photos) | Supabase Storage | prod | photo upload 2MB JPEG/PNG | included in Supabase Pro | $0 within 100GB | 100GB | <1GB | $0.021/GB | — | Same | — | |
| Payments | Flutterwave + Paystack + Dodo | prod | `api/billing/*` verify/webhook | Flutterwave live (fees ~1.4% NG) | per-txn only | — | 0 tx | 1.4% + ₦? | — | — | — | Webhook must be verified (it is) |
| Domain/DNS/SSL | Unknown registrar (pay ₦10k verified) + Cloudflare/Vercel SSL | prod | jobiest.com | 1yr | ₦10k one-time | 1yr | 1 domain | renewal ~₦15k/yr | renewal 2027-10 | Namecheap ~$12/yr | — | Expiry risk |
| Analytics | None dedicated (admin analytics from DB) | prod | `api/admin/analytics` | — | $0 | — | — | — | — | PostHog free | — | No monitoring |
| Monitoring/Logs | Vercel logs + audit_logs table | prod | `lib/audit.ts` 7d retention Pro | included | $0 | 7d logs | low | — | — | Logtail $25 | — | |
| Backups | Supabase Pro daily 7d | prod | Pro plan | included | $0 within | 7d | — | PITR $100/7d | — | Self backup | — | |
| CI/CD | Vercel + OCI docker compose | prod | deploy | Hobby/free | $0 | — | — | — | — | GitHub Actions free | — | |

**Financial risk summary:** Largest risk is AI fallback costs after OCI free VM reclaimed and Free email 100/day cap during launch spike. Hosting on Hobby for commercial use violates Vercel ToS — must budget Pro $20-40.

