# 02 — Historical Development Cost — 2026-10-25

## A. Actual Cash Expenditure (Verified)

| Date | Category | Provider | Description | Amount | CCY | NGN equiv | Evidence | Recurring | Confidence |
|------|----------|----------|-------------|--------|-----|-----------|----------|-----------|------------|
| 2026-10-?? | Domain | Unknown registrar | jobiest.com 1yr | ₦10,000 | NGN | ₦10,000 | Founder statement | one-time | Verified |
| — | Other | — | No invoices/receipts provided | ₦0 | — | ₦0 | None | — | Unknown |

**Verified subtotal:** **₦10,000** (USD ~$6.30 at ₦1,587/$ Oct 2026 CBN).
**Unverified:** Hosting (assumed Hobby $0), Supabase Pro $25/mo if paid (unknown who pays), email (Free $0), AI credits (unknown), design assets ($0), testing ($0). Report subtotal and request receipts.

## B. Economic Replacement Cost (Calculated Estimate)

Using modules discovered (frontend 15 routes, backend 60 API routes, DB 44 migrations, auth, AI gateway, ingestion, CV 30 templates, admin, tests 103 suites). Rates: NG senior ₦4,000/hr ($2.50), mid ₦2,000/hr ($1.25), Intl $40-80/hr. Source: Andela/Glassdoor NG 2025 + Upwork 2026 benchmarks (cited).

| Module | Hours (base) | Intl $60/hr | NG $2.50/hr blended |
|--------|--------------|-------------|---------------------|
| Discovery/requirements | 40 | $2,400 | ₦160k |
| UI/UX design system | 120 | $7,200 | ₦480k |
| Frontend (Next.js 15.5) | 280 | $16,800 | ₦1,120k |
| Backend/APIs (60 routes) | 300 | $18,000 | ₦1,200k |
| DB design + 44 migrations | 100 | $6,000 | ₦400k |
| Auth + verification | 60 | $3,600 | ₦240k |
| AI integrations (Ollama/CF/OpenRouter + truthfulness) | 120 | $7,200 | ₦480k |
| Job ingestion | 80 | $4,800 | ₦320k |
| CV generation/templates (30 Dribbble) | 160 | $9,600 | ₦640k |
| Payments (3 gateways + webhooks) | 100 | $6,000 | ₦400k |
| Admin dashboard | 80 | $4,800 | ₦320k |
| QA/tests (1044 tests) | 80 | $4,800 | ₦320k |
| Security review | 40 | $2,400 | ₦160k |
| DevOps/deploy | 60 | $3,600 | ₦240k |
| Docs (beta handbook) | 30 | $1,800 | ₦120k |
| **Completed total** | **1,570h** | **$98,000** | **₦6,600k (~$4,160)** |

Low -20% $78k / ₦5.3M, High +30% $127k / ₦8.6M.
**Incomplete:** Mobile app (0), advanced analytics (20h), PITR backups (10h).
**Production readiness remaining:** AI observability (30h), staging env (20h), load tests (20h).

## C. Founder Unpaid Labor

Git history: 8786167→a529d99 ~30 commits over ~4 weeks (Sep-Oct 2026). Assuming 20-30h/week = 80-120h at replacement rate ₦2,500/hr = ₦200-300k ($125-190) — **planning assumption, not paid**. Not added to cash total.

**Summary:** Cash verified ₦10k << Economic value ~$78-127k Intl or ₦5.3-8.6M NG blend. Do not combine.

