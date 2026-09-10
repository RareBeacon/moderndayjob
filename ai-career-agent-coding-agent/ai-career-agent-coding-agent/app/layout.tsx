import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import { SITE_URL } from '@/lib/site';
import { ScrollReveal } from '@/components/site/ScrollReveal';

/* Newsreader, self-hosted variable display face (Google Fonts, OFL).
   "The Broadstreet Journal" direction (v3): high-legibility editorial serif
   with true italics (the signature emphasis move) and an optical-size axis.
   Variable weight 200-800; next/font/local hashes + preloads at build time. */
const newsreader = localFont({
  src: [
    { path: '../fonts/newsreader-var.woff2', weight: '200 800', style: 'normal' },
    { path: '../fonts/newsreader-italic-var.woff2', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-display',
  display: 'swap',
});

/* Inter, clean, legible body/UI face (well-supported, loads fast). */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Jobiest · your AI career agent', template: '%s · Jobiest' },
  description:
    'Create your professional profile once. Jobiest discovers relevant roles, scores fit, prepares truthful personalized applications from your verified facts, and tracks everything in one dashboard.',
  applicationName: 'Jobiest',
  openGraph: {
    images: ['/images/og-card.jpg'],
    title: 'Jobiest · your AI career agent',
    description:
      'Find roles, prepare truthful applications, and track every application in one place. Free forever; you stay in control.',
    url: SITE_URL,
    siteName: 'Jobiest',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Jobiest · your AI career agent', description: 'Your AI career agent. Truthful applications, full tracking, you in control.' },
  robots: { index: true, follow: true },
  verification: { google: 'IFlK-iarS16eAascWNcpjO_H98qhdlIkN_3GfxyBiyk' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#062B68',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${inter.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {/* Without JS the scroll-reveal driver can't run — never hide content. */}
        <noscript>
          <style>{'[data-animate]{opacity:1!important;transform:none!important;transition:none!important}'}</style>
        </noscript>
        {children}
        <ScrollReveal />
      </body>
    </html>
  );
}
