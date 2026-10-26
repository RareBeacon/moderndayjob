import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo";
import { marketingMetadata } from "@/components/marketing/metadata";
import { PLANS } from "@/lib/billing/pricing";
import "./home-prototype.css";
import HomeClient from "./HomeClient";

export const metadata: Metadata = marketingMetadata({
  title: "Jobiest — Stop chasing jobs. Let jobs come to you.",
  description: "Your personal AI job-search agent. Find opportunities, tailor your CV, write cover letters, and handle repetitive application tasks — so you can spend less time applying.",
  path: "/",
});

export default async function HomePage() {
  const user = await getUser();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
      <HomeClient authenticated={!!user} plans={PLANS} />
    </>
  );
}
