import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getUser } from "@/lib/auth";
import { PLANS, PLAN_ORDER } from "@/lib/billing/pricing";
import { SITE_URL } from "@/lib/site";
import { marketingMetadata } from "@/components/marketing/metadata";
import { PricingCards } from "@/components/marketing/pricing-cards";
import styles from "../marketing.module.css";

export const metadata: Metadata = marketingMetadata({
  title: "Pricing - Free Plan and Paid Plans in Naira",
  description:
    "Free plan: 3 CV or cover letter generations and 10 tool uses a day. Paid plans start at ₦5,000 a month in Nigeria or $3.99 a month globally.",
  path: "/pricing",
});

export default async function PricingPage() {
  const user = await getUser();

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
  return (
    <MarketingShell activePath="/pricing" authenticated={!!user}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd()) }} />
      <main className={styles.page}>
        <header className={styles.pageHero}>
          <div className={styles.container}>
            <p className={styles.eyebrow}>Pricing</p>
            <h1>Clear monthly pricing. Start free.</h1>
            <p className={styles.pageLead}>
              The free plan is clear and useful. Upgrade when more volume makes sense for your search. Prices below are monthly, with no fake discounts or checkout in this preview.
            </p>
          </div>
        </header>

        <section data-animate className={styles.section} aria-labelledby="plan-title">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Plans</p>
              <h2 id="plan-title">Start free. Choose your currency.</h2>
              <p>Use the Naira or USD view that fits your location. Each plan lists its monthly price and included features.</p>
            </div>
            <PricingCards />
          </div>
        </section>

        <section data-animate className={`${styles.section} ${styles.sectionSoft}`} aria-labelledby="pricing-faq-title">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Pricing questions</p>
              <h2 id="pricing-faq-title">Clear limits matter.</h2>
            </div>
            <div className={styles.faqList}>
              <details open>
                <summary>What does the free plan include?</summary>
                <p>The approved free limits are 3 CV or cover letter generations and 10 tool uses a day. The public pricing page describes the plan as permanent and requires no card for the public tools.</p>
              </details>
              <details>
                <summary>What are the paid plans priced at?</summary>
                <p>Basic is ₦5,000 or $3.99 a month, Premium is ₦10,000 or $7.99 a month, and Max is ₦20,000 or $14.99 a month.</p>
              </details>
              <details>
                <summary>Does the preview take payment?</summary>
                <p>No. This redesign preview does not process payment or create a subscription.</p>
              </details>
              <details>
                <summary>Will Jobiest send an application without my approval?</summary>
                <p>No. The redesign keeps approval mode as the product rule. You review the documents before anything goes to an employer.</p>
              </details>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
