import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';

const SITE_URL = 'https://modernjob.vercel.app';

/* Satoshi — self-hosted display face (free, commercial-use via Fontshare).
   The "differentiated choice" to escape the Inter-as-default AI tell.
   next/font/local hashes + preloads these woff2 files at build time. */
const satoshi = localFont({
  src: [
    { path: '../fonts/satoshi-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/satoshi-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/satoshi-700.woff2', weight: '700', style: 'normal' },
    { path: '../fonts/satoshi-900.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});

/* Inter — clean, legible body/UI face (well-supported, loads fast). */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'ModernJob — your AI career agent', template: '%s · ModernJob' },
  description:
    'Create your professional profile once. ModernJob discovers relevant roles, scores fit, prepares truthful personalized applications from your verified facts, and tracks everything in one dashboard.',
  applicationName: 'ModernJob',
  openGraph: {
    title: 'ModernJob — your AI career agent',
    description:
      'Find roles, prepare truthful applications, and track every application in one place. Free forever; you stay in control.',
    url: SITE_URL,
    siteName: 'ModernJob',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'ModernJob — your AI career agent', description: 'Your AI career agent. Truthful applications, full tracking, you in control.' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#faf8f3',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${satoshi.variable} ${inter.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
