import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo";
import { marketingMetadata } from "@/components/marketing/metadata";
import { getUser } from "@/lib/auth";
import "./jobiest-exact.css";
import HomeClient from "./HomeClient";

export const metadata: Metadata = marketingMetadata({
  title: "Jobiest - More interviews. Less job hunting.",
  description: "Your AI career agent. Paste a job link and get a truthful CV and cover letter tailored to your experience.",
  path: "/",
});

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const code = typeof sp?.code === "string" ? sp.code : undefined;
  const oauthErr = typeof sp?.error === "string" ? sp.error : undefined;
  const oauthErrCode = typeof sp?.error_code === "string" ? sp.error_code : undefined;
  if (code || oauthErr || oauthErrCode) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp ?? {})) {
      if (typeof v === "string") qs.set(k, v);
    }
    redirect(`/auth/callback?${qs.toString()}`);
  }

  await getUser();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }} />
      <HomeClient />
    </>
  );
}
