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
import { SITE_URL } from '@/lib/site';

export const metadata = {
  title: 'Pricing',
  description:
    'Jobiest pricing: free forever, then paid plans for more CVs, cover letters, approved automation and support. No card required to start.',
  alternates: { canonical: `${SITE_URL}/pricing` },
};

export const dynamic = 'force-dynamic';

const PROBLEM_ROWS = [
  ['I do not know if my CV is passing ATS checks', 'ATS Resume Scanner', 'All plans'],
  ['I spend hours writing cover letters for each role', 'Cover Letter Writer', 'All plans, with more daily volume on paid plans'],
  ['I cannot apply to enough roles to get traction', 'Approved application automation', 'Premium and Max'],
  ['I lose track of where I have applied', 'Application tracker dashboard', 'All plans'],
  ['I need truthful documents, not AI hallucinations', 'Verified-facts generation and truthfulness checks', 'All plans'],
];

const FAQ = [
  {
    q: 'Is the free tier really free, or does it expire?',
    a: 'It is free forever. You can keep using the free tools and your dashboard. Paid plans add more daily document volume, approved automation, priority processing and support.',
  },
  {
    q: 'Do I have to let Jobiest send applications without checking them?',
    a: 'No. Approval mode is the default. Nothing sends without you reviewing and confirming it first.',
  },
  {
    q: 'What if I am in a field Jobiest does not specialize in?',
    a: 'Jobiest works best where roles are posted on verified ATS sources such as Greenhouse, Ashby and Lever. That includes technology, finance, marketing, operations, design, HR, sales and more.',
  },
  {
    q: 'What does verified facts only mean?',
    a: 'It means Jobiest will not invent experience, inflate job titles, or fabricate skills to make an application look stronger. If a field is blank, the platform omits it or asks you for the fact instead of guessing.',
  },
];

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
      label: 'Monthly price',
      values: Object.fromEntries(PLAN_ORDER.map((code) => {
        const p = PLANS[code];
        const price = localizePrice(p.monthlyNgn, currency, rates);
        return [code, p.monthlyNgn === 0 ? price.formatted : `${price.formatted} / month`];
      })) as Record<PlanCode, string>,
    },
    { label: 'AI documents', values: { FREE: '3 total', BASIC: '3 / day', PREMIUM: '10 / day', MAX: '20 / day' } },
    { label: 'Auto-apply slots', values: { FREE: '-', BASIC: '2 total trial uses', PREMIUM: '10 / day', MAX: '20 / day' } },
    { label: 'Free career tools', values: { FREE: '10 / day', BASIC: '50 / day', PREMIUM: 'Unlimited', MAX: 'Unlimited' } },
    { label: 'ATS resume scanner', values: { FREE: 'Included', BASIC: 'Included', PREMIUM: 'Included', MAX: 'Included' } },
    { label: 'Approval-mode workflow', values: { FREE: 'Manual', BASIC: 'Trial', PREMIUM: 'Included', MAX: 'Included' } },
    { label: 'Support', values: { FREE: 'Community', BASIC: 'Priority email', PREMIUM: 'Priority + faster queue', MAX: 'Concierge' } },
  ];

  return (
    <div className="jl-page">
      <JobletNavbar authenticated={!!user} />
      <main id="main">
        <section className="jl-sec blog-hero">
          <div className="jl-shell">
            <span className="jl-kicker">Pricing</span>
            <h1>Pay for what your search is actually worth.</h1>
            <p>The free tier is permanent, not a trick to get your card details. Upgrade when the automation proves its value.</p>
            <CurrencyPicker current={currency} currencies={[...SUPPORTED_CURRENCIES]} />
            <p className="jl-currency-note">
              {currency === 'NGN'
                ? 'Prices shown in Naira (₦).'
                : `Prices shown in ${currency} as an estimate. Billing is based on Naira pricing.`}
            </p>
          </div>
        </section>

        <section className="jl-sec tint">
          <div className="jl-shell">
            <div className="jl-plans four">
              {PLAN_ORDER.map((code, index) => {
                const p = PLANS[code];
                const price = localizePrice(p.monthlyNgn, currency, rates);
                return (
                  <div key={code} className={`jl-plan${p.featured ? ' featured' : ''}`} data-animate data-animate-delay={index * 70}>
                    <h3>{p.name}</h3>
                    <div className="jl-price">
                      {p.monthlyNgn === 0 ? price.formatted : <>{price.formatted}<small> /month</small></>}
                    </div>
                    {!price.isNgn && p.monthlyNgn > 0 && <div className="jl-price-alt">Estimate: {price.approximate}</div>}
                    <p className="jl-plan-tag">{p.tagline}</p>
                    <ul>{p.features.map((f) => <li key={f}><span className="jl-tick">✓</span>{f}</li>)}</ul>
                    <Link className={`jl-btn-${p.featured ? 'solid' : 'outline'} jl-plan-cta`} href={p.ctaHref} style={{ textAlign: 'center' }}>{p.cta}</Link>
                  </div>
                );
              })}
            </div>
            <p className="jl-trial-note center">Start free with no card. Upgrade only when you are ready for more volume and approved automation.</p>
          </div>
        </section>

        <section className="jl-sec">
          <div className="jl-shell">
            <div className="jl-sec-head center">
              <span className="jl-kicker">Problems solved</span>
              <h2>Choose based on the bottleneck in your search.</h2>
            </div>
            <div className="jl-compare-wrap">
              <table className="jl-compare">
                <thead><tr><th>Problem it solves</th><th>Feature</th><th>Available on</th></tr></thead>
                <tbody>{PROBLEM_ROWS.map(([problem, feature, plan]) => <tr key={problem}><td>{problem}</td><td>{feature}</td><td>{plan}</td></tr>)}</tbody>
              </table>
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
                  <tr><th> </th>{PLAN_ORDER.map((c) => <th key={c}>{PLANS[c].name}</th>)}</tr>
                </thead>
                <tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td>{PLAN_ORDER.map((c) => <td key={c} className={c === 'PREMIUM' ? 'col-featured' : undefined}>{row.values[c]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="jl-sec">
          <div className="jl-shell jl-faq-wrap">
            <div className="jl-sec-head center"><span className="jl-kicker">FAQ</span><h2>Pricing questions, answered.</h2></div>
            <div className="faq">{FAQ.map((item) => <details className="faq-item" key={item.q}><summary className="faq-q">{item.q}</summary><div className="faq-a open"><div><p>{item.a}</p></div></div></details>)}</div>
            <div className="pastor-response" style={{ marginTop: 34 }}>
              <h2>Start with Free. Upgrade when you are ready.</h2>
              <Link className="jl-btn-solid" href="/signup">Start Free</Link>
            </div>
          </div>
        </section>
      </main>
      <JobletFooter />
    </div>
  );
}
