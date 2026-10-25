# 03 — Free Tier & Credit Exposure — 2026-10-25

## Credits Inventory

| Service | Plan | Quota | Usage (est. beta) | Overage | Expiry | Paid After | At 100/500/1000 users | Risk |
|---------|------|-------|-------------------|---------|--------|------------|-----------------------|------|
| Vercel Hobby | Free non-commercial | 100GB transfer 1M req | 5GB | Hard cap (503) | N/A | Pro $20 + $20/seat + usage | 100→ within, 500→ ~20GB, 1k→ ~50GB → Pro $20-40, Hobby breach → forced upgrade | **Commercial use violation** |
| Supabase Free vs Pro | Free pause 1wk vs Pro $25 8GB/250GB/100k MAU | Free 500MB vs Pro 8GB | <2GB DB <1k MAU | $0.125/GB, $0.00325/MAU | No credit — ongoing | Pro $25 + compute $10 | 1k users well within Pro 100k MAU (no overage) | Pause risk if on Free |
| Resend Free | Permanent 3k/mo 100/day | 3k/mo | 200/mo (beta 50 users) | No overage — stops sending | No expiry | Pro $20/50k, $0.90/1k | 100 users ~400 emails/mo within Free; 500 users ~2k within Free; 1k users ~4k → exceed Free, need Pro $20 | **100/day launch spike** → welcomes fail |
| Oracle OCI Always Free Ampere A1 | Forever (if active) | 4 vCPU 24GB | AI worker low | — | Reclaim if idle | Paid VM ~$30/mo | Same | Reclaim → AI falls to OpenRouter $10-30/mo |
| OpenRouter Free | 26 models 50 req/day | 50/d | low | — | — | PAYG 5.5% fee | 100 users heavy → exceed free, PAYG $5-15/mo | No expiry but rate limited |
| Domain | 1yr paid ₦10k | 1yr | 1 domain | — | 2027-10 | ~₦15k renewal | same | Lapse → site down |

## Calculation

- **Current cash:** ₦10k domain one-time + $0 hosting/email/AI = ₦10k total verified.
- **Covered by credits:** Vercel ~$20, Supabase $25, Resend $20, OCI ~$30 = $95/mo economic value not paid (if all free).
- **Commercial after credits:** Vercel Pro $20, Supabase Pro $25, Resend Free→Pro at 3k/mo $20, OCI $0-30 → **$65-95/mo** ($780-1,140/yr) before AI usage.
- **Date credits run out:** Domain 2027-10; others permanent but quota-enforced; OCI reclaim if idle >7d.
- **Consequence if expire:** Vercel cap → 503; Resend 100/day → no verify emails; Supabase pause → DB unreachable; AI fallback to PAYG $0.15-0.60 per 1M tokens.

**Input needed:** Confirm Supabase plan (Free or Pro?), OCI VM active?, Resend current usage dashboard, OpenRouter balance.

