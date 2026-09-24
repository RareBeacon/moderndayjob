import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { JobletNavbar } from '@/components/site/joblet/Navbar';
import { JobletFooter } from '@/components/site/joblet/Footer';
import { PLANS, PLAN_ORDER, type PlanCode } from '@/lib/billing/pricing';
import { formatNaira, formatPlanPrice, resolveCurrency, countryFromHeader } from '@/lib/billing/currency';
import { jsonLdTag } from '@/lib/seo';
import { SITE_URL } from '@/lib/site';
import { headers } from 'next/headers';

export const metadata = {
  title: 'Pricing - Free Plan and Paid Plans in Naira',
  description: 'Free plan with 5 AI generations a month, then Basic at ₦5,000, Premium at ₦10,000 or Max at ₦20,000 a month for more monthly volume. Priced in Naira, no card required.',
  alternates: { canonical: `${SITE_URL}/pricing` },
};

export const dynamic = 'force-dynamic';

const PROBLEM_ROWS = [
  ['I do not know if my CV is passing ATS checks', 'ATS Resume Scanner', 'All plans'],
  ['I spend hours writing cover letters for each role', 'Cover Letter Writer', 'All plans, with more daily volume on paid plans'],
  ['I cannot apply to enough roles to get traction', 'Agent-mode applications, each approved by you', 'Premium and Max'],
  ['I lose track of where I have applied', 'Application tracker dashboard', 'All plans'],
  ['I need truthful documents, not AI hallucinations', 'Verified-facts generation and truthfulness checks', 'All plans'],
];

const FAQ = [
  {
    q: 'Is the free plan really free, or does it expire?',
    a: 'The free plan does not expire and needs no card. It includes 5 AI generations a month so you can try the AI writer, plus 10 career-tool uses a day and the full dashboard. You can also verify a card once (the check costs nothing, we never charge it) to unlock 5 auto-applies a month. Paid plans raise the monthly allowances.',
  },
  {
    q: 'Do I have to let Jobiest send applications without checking them?',
    a: 'No. Approval mode is the default. Nothing sends without you reviewing and confirming it first.',
  },
  {
    q: 'What currency am I billed in?',
    a: 'All plans are billed in Nigerian Naira (₦). The prices on this page are the prices you pay.',
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

/** Product + Offer structured data for the four plans (Google shopping-style rich results). */
function pricingJsonLd() {
  const offers = PLAN_ORDER.filter((code) => PLANS[code].monthlyNgn > 0).map((code) => {
    const plan = PLANS[code];
    return {
      '@type': 'Offer',
      name: `${plan.name} plan`,
      description: plan.tagline,
      price: plan.monthlyNgn,
      priceCurrency: 'NGN',
      url: `${SITE_URL}/pricing`,
      availability: 'https://schema.org/InStock',
      category: 'Subscription',
    };
  });
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Jobiest subscription',
    description:
      'AI career agent plans: verified-facts documents and agent-mode applications approved by you. Billed monthly in Naira.',
    brand: { '@type': 'Brand', name: 'Jobiest' },
    url: `${SITE_URL}/pricing`,
    offers,
  };
}

export default async function PricingPage() {
  const user = await getUser();
  // Nigeria sees Naira; visitors from anywhere else see (and are charged) USD.
  const country = countryFromHeader((await headers()).get('x-vercel-ip-country'));
  const currency = resolveCurrency(country);

  const rows: { label: string; values: Record<PlanCode, string> }[] = [
    {
      label: 'Monthly price',
      values: Object.fromEntries(
        PLAN_ORDER.map((code) => {
          const p = PLANS[code];
          return [code, p.monthlyNgn === 0 ? formatNaira(0) : `${formatPlanPrice(currency, p.monthlyNgn, p.monthlyUsd)} / month`];
        }),
      ) as Record<PlanCode, string>,
    },
    { label: 'AI generations', values: { FREE: '3 total', BASIC: '3 / day', PREMIUM: '10 / day', MAX: '20 / day' } },
    { label: 'Agent-mode applications (you approve each)', values: { FREE: '-', BASIC: '2 total trial runs', PREMIUM: '10 / day', MAX: '20 / day' } },
    { label: 'Free career tools', values: { FREE: '10 / day', BASIC: '50 / day', PREMIUM: 'Unlimited', MAX: 'Unlimited' } },
    { label: 'ATS resume scanner', values: { FREE: 'Included', BASIC: 'Included', PREMIUM: 'Included', MAX: 'Included' } },
    { label: 'Approval-mode workflow', values: { FREE: 'Manual', BASIC: 'Trial', PREMIUM: 'Included', MAX: 'Included' } },
    { label: 'Support', values: { FREE: 'Community', BASIC: 'Priority email', PREMIUM: 'Priority + faster queue', MAX: 'Concierge' } },
  ];

  return (
    <div className="jl-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdTag(pricingJsonLd())} />
      <JobletNavbar authenticated={!!user} />
      <main id="main">
        <section className="jl-sec blog-hero">
          <div className="jl-shell">
            <span className="jl-kicker">Pricing</span>
            <h1>Pay for what your search is actually worth.</h1>
            <p>The free plan is permanent, not a trick to get your card details. Upgrade when the automation proves its value.</p>
            <p className="jl-currency-note">All prices in Nigerian Naira (₦). You are billed in Naira.</p>
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
            <div className="jl-plans four">
              {PLAN_ORDER.map((code, index) => {
                const p = PLANS[code];
                return (
                  <div key={code} className={`jl-plan${p.featured ? ' featured' : ''}`} data-animate data-animate-delay={index * 70}>
                    <h3>{p.name}</h3>
                    <div className="jl-price">
                      {p.monthlyNgn === 0 ? formatNaira(0) : <>{formatPlanPrice(currency, p.monthlyNgn, p.monthlyUsd)}<small> /month</small></>}
                    </div>
                    <p className="jl-plan-tag">{p.tagline}</p>
                    <ul>{p.features.map((f) => <li key={f}><span className="jl-tick">✓</span>{f}</li>)}</ul>
                    <Link className={`jl-btn-${p.featured ? 'solid' : 'outline'} jl-plan-cta`} href={p.ctaHref} style={{ textAlign: 'center' }}>{p.cta}</Link>
                  </div>
                );
              })}
            </div>
            <p className="jl-trial-note center">Start free with no card. Upgrade only when you are ready for more volume and approved automation.</p>
            <p className="jl-trial-note center">{currency === 'USD' ? 'Prices in US dollars.' : 'Prices in Naira (US dollars apply outside Nigeria).'} Cancel anytime.</p>
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
