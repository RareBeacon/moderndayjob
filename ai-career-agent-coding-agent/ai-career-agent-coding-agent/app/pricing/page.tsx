import Link from 'next/link';
import { headers } from 'next/headers';
import { getUser } from '@/lib/auth';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';
import { CurrencyPicker } from '@/components/site/CurrencyPicker';
import { PLANS, PLAN_ORDER, type PlanCode } from '@/lib/billing/pricing';
import {
  SUPPORTED_CURRENCIES,
  getFxRates,
  localizePrice,
  resolveCurrency,
} from '@/lib/billing/currency';

export const metadata = {
  title: 'Pricing',
  description:
    'Jobiest pricing: free forever, then Basic ₦5,000, Premium ₦10,000 and Max ₦20,000 a month. Prices shown in your local currency.',
};

export const dynamic = 'force-dynamic';

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const params = await searchParams;
  const h = await headers();
  const ipCountry = h.get('x-vercel-ip-country');
  const locale = h.get('accept-language');
  const user = await getUser();
  const currency = resolveCurrency(ipCountry, locale, params.currency);
  const rates = await getFxRates();

  const rows: { label: string; values: Record<PlanCode, string> }[] = [
    {
      label: 'Monthly price (₦)',
      values: {
        FREE: '₦0',
        BASIC: '₦5,000',
        PREMIUM: '₦10,000',
        MAX: '₦20,000',
      },
    },
    {
      label: 'AI documents',
      values: { FREE: '3 total', BASIC: '3 / day', PREMIUM: '10 / day', MAX: '20 / day' },
    },
    {
      label: 'Auto-apply slots',
      values: { FREE: '—', BASIC: '2 total (trial)', PREMIUM: '10 / day', MAX: '20 / day' },
    },
    {
      label: 'Free career tools',
      values: { FREE: '10 / day', BASIC: '50 / day', PREMIUM: 'Unlimited', MAX: 'Unlimited' },
    },
    {
      label: 'ATS resume scanner',
      values: { FREE: '✓', BASIC: '✓', PREMIUM: '✓', MAX: '✓' },
    },
    {
      label: 'Approval-mode workflow',
      values: { FREE: 'Manual', BASIC: 'Trial', PREMIUM: '✓', MAX: '✓' },
    },
    {
      label: 'Support',
      values: { FREE: 'Community', BASIC: 'Priority email', PREMIUM: 'Priority + faster AI', MAX: 'Concierge' },
    },
    {
      label: 'Human review',
      values: { FREE: '—', BASIC: '—', PREMIUM: '—', MAX: '✓' },
    },
  ];

  return (
    <div className="jl-page">
      <JobletNavbar authenticated={!!user} />
      <main id="main">
        <section className="jl-sec">
          <div className="jl-shell">
            <div className="jl-sec-head center" style={{ paddingTop: 30 }}>
              <span className="jl-kicker">Pricing</span>
              <h1>Start free. Upgrade only when you need more momentum.</h1>
              <p>
                Free forever for job seekers. Paid plans add document volume, automation and support —
                cancel anytime.
              </p>
              <CurrencyPicker current={currency} currencies={[...SUPPORTED_CURRENCIES]} />
              <p className="jl-currency-note">
                {currency === 'NGN'
                  ? 'Prices shown in Naira (₦).'
                  : `Prices shown in ${currency} as an estimate — you are billed in Naira (₦).`}
              </p>
            </div>

            <div className="jl-plans four">
              {PLAN_ORDER.map((code) => {
                const p = PLANS[code];
                const price = localizePrice(p.monthlyNgn, currency, rates);
                return (
                  <div key={code} className={`jl-plan${p.featured ? ' featured' : ''}`}>
                    <h3>{p.name}</h3>
                    <div className="jl-price">
                      {p.monthlyNgn === 0 ? (
                        price.formatted
                      ) : (
                        <>
                          {price.formatted}
                          <small> /month</small>
                        </>
                      )}
                    </div>
                    {!price.isNgn && p.monthlyNgn > 0 && (
                      <div className="jl-price-alt">≈ {price.approximate} · billed as ₦{p.monthlyNgn.toLocaleString('en-NG')}</div>
                    )}
                    <p className="jl-plan-tag">{p.tagline}</p>
                    <ul>
                      {p.features.map((f) => (
                        <li key={f}>
                          <span className="jl-tick">
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                              <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link className={`jl-btn-${p.featured ? 'solid' : 'outline'} jl-plan-cta`} href={p.ctaHref} style={{ textAlign: 'center' }}>
                      {p.cta}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="jl-sec tint">
          <div className="jl-shell">
            <div className="jl-sec-head center">
              <span className="jl-kicker">Compare</span>
              <h2>What each plan includes</h2>
            </div>
            <div className="jl-compare-wrap">
              <table className="jl-compare">
                <thead>
                  <tr>
                    <th> </th>
                    {PLAN_ORDER.map((c) => (
                      <th key={c}>{PLANS[c].name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      {PLAN_ORDER.map((c) => (
                        <td key={c} className={c === 'PREMIUM' ? 'col-featured' : undefined}>
                          {row.values[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="jl-trial-note center">
              Free forever: 3 AI documents in total plus 10 tool uses a day. Basic adds 3 documents a day and 2 auto-apply trial uses — no card required to start.
            </p>
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
