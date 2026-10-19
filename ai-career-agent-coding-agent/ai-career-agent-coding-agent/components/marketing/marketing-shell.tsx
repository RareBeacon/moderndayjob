import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons/icons";
import styles from "./marketing-shell.module.css";

const navItems = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/tools", label: "Free tools" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

/**
 * Marketing shell (header + footer) from the approved redesign.
 * `authenticated` is set server-side, same contract as the previous navbar:
 * signed-in visitors get one clear home, the dashboard.
 */
export function MarketingShell({
  children,
  activePath = "/",
  authenticated = false,
}: {
  children: ReactNode;
  activePath?: string;
  authenticated?: boolean;
}) {
  return (
    <div className={styles.site}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.logo} href={authenticated ? "/dashboard" : "/"} aria-label="Jobiest home" aria-current={activePath === "/" ? "page" : undefined}>
            <Image src="/images/logo-wordmark-light.png" alt="Jobiest" width={544} height={262} priority sizes="156px" />
          </Link>

          <nav className={styles.desktopNav} aria-label="Main navigation">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} aria-current={activePath === item.href ? "page" : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.accountLinks}>
            {authenticated ? (
              <a className={styles.headerCta} href="/dashboard">
                Go to Dashboard
              </a>
            ) : (
              <>
                <a href="/login">Sign in</a>
                <a className={styles.headerCta} href="/signup">
                  Create free account
                </a>
              </>
            )}
          </div>

          <details className={styles.mobileMenu}>
            <summary><span>Menu</span><Icon name="chevron-down" width={18} height={18} /></summary>
            <nav aria-label="Mobile navigation">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} aria-current={activePath === item.href ? "page" : undefined}>
                  {item.label}
                </Link>
              ))}
              {authenticated ? (
                <a href="/dashboard">Go to Dashboard</a>
              ) : (
                <>
                  <a href="/login">Sign in</a>
                  <a className={styles.mobileCta} href="/signup">
                    Create free account
                  </a>
                </>
              )}
            </nav>
          </details>
        </div>
      </header>

      {children}

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Link href="/" aria-label="Jobiest home">
              <Image src="/images/logo-wordmark-dark.png" alt="Jobiest" width={550} height={265} loading="lazy" sizes="144px" />
            </Link>
            <p>Truthful job applications, prepared from your experience. Approval is the default; Auto requires your opt-in.</p>
          </div>

          <div className={styles.footerLinks}>
            <div>
              <h2>Explore</h2>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/tools">Free tools</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/about">About</Link>
            </div>
            <div>
              <h2>Help</h2>
              <Link href="/support">Support</Link>
              <a href="mailto:support@jobiest.com">Email support</a>
              <Link href="/templates">Templates</Link>
            </div>
          </div>
        </div>
        <div className={styles.footerInner}>
          <p className={styles.copyright}>
            © 2026 Jobiest. Approval is the default; Auto requires your opt-in.{" "}
            <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/refund">Refunds</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
