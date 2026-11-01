import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getOptionalUser } from "@/lib/auth";
import { PLANS, PLAN_ORDER } from "@/lib/billing/pricing";
import { SITE_URL } from "@/lib/site";
import { marketingMetadata } from "@/components/marketing/metadata";
import { PricingCards } from "@/components/marketing/pricing-cards";
import styles from "../marketing.module.css";

export const metadata: Metadata = marketingMetadata({
  title: "Pricing: Free, Basic (₦5,000), Premium (₦10,000) & Ultra (₦20,000)",
  description:
    "Start free with all 30 ISO A4 resume templates and 10 daily career tool uses. Upgrade to Basic (30 successful applications/month), Premium (50/month), or Ultra (unlimited/month).",
  path: "/pricing",
});

function pricingJsonLd() {
  const offers = PLAN_ORDER.filter((code) => PLANS[code].monthlyNgn > 0).map((code) => {
    const plan = PLANS[code];
    return {
      "@type": "Offer",
      name: `${plan.name} plan`,
      description: plan.tagline,
      price: plan.monthlyNgn,
      priceCurrency: "NGN",
      url: `${SITE_URL}/pricing`,
      availability: "https://schema.org/InStock",
      category: "Subscription",
    };
  });
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Jobiest subscription",
    description:
      "AI career agent plans: verified-facts documents, 30 ISO A4 resume templates, and monthly successful application allowances.",
    brand: { "@type": "Brand", name: "Jobiest" },
    url: `${SITE_URL}/pricing`,
    offers,
  };
}

export default async function PricingPage() {
  const user = await getOptionalUser();

  return (
    <MarketingShell activePath="/pricing" authenticated={!!user}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd()) }} />
      <main className={styles.page}>
        <header className={styles.pageHero}>
          <div className={styles.container}>
            <p className={styles.eyebrow}>Pricing</p>
            <h1>Clear monthly pricing. Start free.</h1>
            <p className={styles.pageLead}>
              Start free with all 30 ISO A4 resume and CV templates, PDF and Word DOCX export, and 10 daily uses across all 10 career tools. Upgrade when you want higher tailoring volume and monthly application capacity.
            </p>
          </div>
        </header>

        <section data-animate className={styles.section} aria-labelledby="plan-title">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Plans</p>
              <h2 id="plan-title">Start free. Choose your currency.</h2>
              <p>Use the Naira or USD view that fits your location. Only confirmed, non-duplicate submitted applications count toward monthly plan allowances.</p>
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
                <summary>What does the Free plan include?</summary>
                <p>Free includes 3 lifetime AI CV or cover letter generations, full access to all 30 ISO A4 Resume Studio templates with PDF and DOCX export, 10 daily uses across all 10 career tools, the ATS scanner, and 1 public portfolio with no card required.</p>
              </details>
              <details>
                <summary>What are the paid plans priced at, and what are the monthly application limits?</summary>
                <p>Basic is ₦5,000 or $3.99/month (30 successful applications/month). Premium is ₦10,000 or $7.99/month (50 successful applications/month plus daily job discovery). Ultra is ₦20,000 or $14.99/month (Unlimited successful applications/month subject to fair-use rate limits, deduplication, and job-board Terms of Service).</p>
              </details>
              <details>
                <summary>Do failed or duplicate attempts reduce my monthly application allowance?</summary>
                <p>No. Only confirmed, non-duplicate applications that reach SUBMITTED status count toward your monthly quota. Failed, cancelled, or duplicate attempts never consume your allowance.</p>
              </details>
              <details>
                <summary>Will Jobiest send an application without my approval?</summary>
                <p>No. Approval mode is the default across every plan so you review tailored documents before anything goes to an employer. Auto mode requires your explicit opt-in.</p>
              </details>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
