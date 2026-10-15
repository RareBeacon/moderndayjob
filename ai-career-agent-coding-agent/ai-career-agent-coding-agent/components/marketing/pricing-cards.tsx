"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/icons";
import styles from "./pricing-cards.module.css";

type Currency = "NGN" | "USD";

type Plan = {
  name: "Free" | "Basic" | "Premium" | "Max";
  price: Record<Currency, string>;
  summary: string;
  features: string[];
  featured?: boolean;
};

const plans: Plan[] = [
  {
    name: "Free",
    price: { NGN: "₦0", USD: "$0" },
    summary: "3 CV or cover letter generations, plus 10 tool uses a day.",
    features: [
      "3 CV or cover letter generations",
      "10 tool uses a day",
      "All 10 public tools are free to use",
    ],
  },
  {
    name: "Basic",
    price: { NGN: "₦5,000", USD: "$3.99" },
    summary: "Everything in Free, plus:",
    features: [
      "3 AI generations a day",
      "2 agent-mode trial runs",
      "50 career-tool uses a day",
      "Follow-up email writer",
      "Priority email support",
    ],
  },
  {
    name: "Premium",
    price: { NGN: "₦10,000", USD: "$7.99" },
    summary: "Everything in Basic, plus:",
    features: [
      "10 AI generations a day",
      "The agent finds matching jobs daily",
      "10 agent-mode applications a day, each approved by you",
      "Unlimited career-tool uses",
      "Priority AI processing",
      "Unlimited Salary Insights and interview prep",
    ],
    featured: true,
  },
  {
    name: "Max",
    price: { NGN: "₦20,000", USD: "$14.99" },
    summary: "Everything in Premium, plus:",
    features: [
      "20 AI generations a day",
      "20 agent-mode applications a day",
      "Highest daily volume for heavy runs",
      "Concierge support",
      "Early access",
    ],
  },
];

const signupHref = "/signup";

export function PricingCards() {
  const [currency, setCurrency] = useState<Currency>("NGN");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("jobiest-currency");
      if (saved === "USD" || saved === "NGN") setCurrency(saved);
    } catch {
      // Keep the server-rendered Naira default if storage is unavailable.
    }
  }, []);

  function chooseCurrency(nextCurrency: Currency) {
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
        <span className={styles.currencyNote}>Monthly prices only.</span>
      </div>

      <div className={styles.cards}>
        {plans.map((plan) => (
          <article key={plan.name} className={`${styles.card} ${plan.featured ? styles.featured : ""}`}>
            <div className={styles.cardTop}>
              <h3>{plan.name}</h3>
              {plan.featured ? <span className={styles.featuredTag}><Icon name="spark" width={15} height={15} />Higher tier</span> : null}
            </div>
            <p className={styles.price}>
              <strong>{plan.price[currency]}</strong>
              <span>/ month</span>
            </p>
            <p className={styles.summary}>{plan.summary}</p>
            <ul className={styles.planFeatures}>
              {plan.features.map((feature) => (
                <li key={feature}><Icon name="check" width={17} height={17} /><span>{feature}</span></li>
              ))}
            </ul>
            <a className={plan.featured ? styles.primaryAction : styles.secondaryAction} href={signupHref}>
              {plan.name === "Free" ? "Create a free account" : `Choose ${plan.name}`}
              <Icon name="arrow-right" width={17} height={17} />
            </a>
          </article>
        ))}
      </div>
      <p className={styles.disclosure}>
        No payment is collected in this preview. Plan actions open the live Jobiest signup page in a new tab.
      </p>
    </div>
  );
}
