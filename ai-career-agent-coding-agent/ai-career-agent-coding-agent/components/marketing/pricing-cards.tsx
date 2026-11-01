"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/icons";
import { PLANS, PLAN_ORDER } from "@/lib/billing/pricing";
import { formatNaira, formatUsd, type SupportedCurrency } from "@/lib/billing/currency";
import styles from "./pricing-cards.module.css";

const signupHref = "/signup";

export function PricingCards() {
  const [currency, setCurrency] = useState<SupportedCurrency>("NGN");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("jobiest-currency");
      if (saved === "USD" || saved === "NGN") setCurrency(saved);
    } catch {
      // Keep the server-rendered Naira default if storage is unavailable.
    }
  }, []);

  function chooseCurrency(nextCurrency: SupportedCurrency) {
    setCurrency(nextCurrency);
    try {
      window.localStorage.setItem("jobiest-currency", nextCurrency);
    } catch {
      // The switch still works for this visit if storage is unavailable.
    }
  }

  return (
    <div className={styles.pricing}>
      <div className={styles.controls}>
        <div className={styles.currencyGroup} role="group" aria-label="Choose a display currency">
          <button type="button" aria-pressed={currency === "NGN"} onClick={() => chooseCurrency("NGN")}>
            Nigeria, Naira
          </button>
          <button type="button" aria-pressed={currency === "USD"} onClick={() => chooseCurrency("USD")}>
            Global, USD
          </button>
        </div>
        <span className={styles.currencyNote}>Monthly billing. Only confirmed submitted applications count toward monthly limits.</span>
      </div>

      <div className={styles.cards}>
        {PLAN_ORDER.map((code) => {
          const plan = PLANS[code];
          const featured = Boolean(plan.highlight);
          const priceStr =
            plan.monthlyNgn === 0
              ? currency === "NGN"
                ? "₦0"
                : "$0"
              : currency === "NGN"
                ? formatNaira(plan.monthlyNgn)
                : formatUsd(plan.monthlyUsd);

          return (
            <article key={code} className={`${styles.card} ${featured ? styles.featured : ""}`}>
              <div className={styles.cardTop}>
                <h3>{plan.name}</h3>
                {featured ? (
                  <span className={styles.featuredTag}>
                    <Icon name="spark" width={15} height={15} />
                    Most popular
                  </span>
                ) : null}
              </div>
              <p className={styles.price}>
                <strong>{priceStr}</strong>
                <span>/ month</span>
              </p>
              <p className={styles.summary}>{plan.tagline}</p>
              <ul className={styles.planFeatures}>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Icon name="check" width={17} height={17} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <a className={featured ? styles.primaryAction : styles.secondaryAction} href={signupHref}>
                {code === "FREE" ? "Create a free account" : `Choose ${plan.name}`}
                <Icon name="arrow-right" width={17} height={17} />
              </a>
            </article>
          );
        })}
      </div>
      <p className={styles.disclosure}>
        Ultra unlimited applications remain governed by your approval settings, job-board Terms of Service, duplicate-application prevention, and anti-abuse velocity safeguards.
      </p>
    </div>
  );
}
