import type { Metadata } from "next";
import { marketingMetadata } from "@/components/marketing/metadata";

export const metadata: Metadata = marketingMetadata({
  title: "Jobiest — Homepage update in progress",
  description: "New homepage coming soon.",
  path: "/",
});

export default function Page() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fbfbf5", color: "#17223b", fontFamily: "var(--font-dm-sans), sans-serif", padding: "40px" }}>
      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <img src="/logo-wordmark-dark.svg" alt="Jobiest" width={148} height={48} style={{ margin: "0 auto 20px", display: "block" }} />
        <h1 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: "28px", letterSpacing: "-0.05em", margin: "0 0 12px" }}>Homepage update in progress</h1>
        <p style={{ color: "#5d6b85", lineHeight: 1.6, margin: 0 }}>The current homepage has been cleared as requested. Your new design will appear here as soon as you send it.</p>
        <p style={{ marginTop: 18, fontSize: 13 }}>
          <a href="/login" style={{ color: "#3b72bc", textDecoration: "underline" }}>Log in</a>
          <span style={{ margin: "0 10px", color: "#cbd5e1" }}>·</span>
          <a href="/signup" style={{ color: "#3b72bc", textDecoration: "underline" }}>Create account</a>
        </p>
        <p style={{ marginTop: 22, fontSize: 11, color: "#8a9bb1" }}>Previous homepage backed up — ready to restore if needed.</p>
      </div>
    </div>
  );
}
