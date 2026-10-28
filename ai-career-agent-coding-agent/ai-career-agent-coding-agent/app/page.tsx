import type { Metadata } from "next";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo";
import { marketingMetadata } from "@/components/marketing/metadata";
import { getUser } from "@/lib/auth";
import "./jobiest-exact.css";
import HomeClient from "./HomeClient";

export const metadata: Metadata = marketingMetadata({
  title: "Jobiest — More interviews. Less job hunting.",
  description: "Your AI career agent. Paste a job link and get a truthful CV and cover letter tailored to your experience.",
  path: "/",
});

export default async function Page() {
  const user = await getUser();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
      <HomeClient />
    </>
  );
}
