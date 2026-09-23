import './globals.css';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { SITE_URL } from '@/lib/site';
import { ScrollReveal } from '@/components/site/ScrollReveal';
import { ServiceWorkerRegistrar } from '@/components/site/ServiceWorkerRegistrar';
import { ChatWidget } from '@/components/support/ChatWidget';

/* Self-hosted (next/font/local, latin variable files): the build no longer
 * fetches Google Fonts, which made CI builds fail intermittently when
 * GitHub runners could not reach fonts.googleapis.com ("An error occurred
 * in next/font"). Files are the official Google Fonts woff2 builds
 * (DM Sans and Space Grotesk, SIL Open Font License). */
const dmSans = localFont({
  src: './fonts/dm-sans.woff2',
  weight: '100 1000',
  style: 'normal',
  variable: '--font-dm-sans',
  display: 'swap',
});

const spaceGrotesk = localFont({
  src: './fonts/space-grotesk.woff2',
  weight: '300 700',
  style: 'normal',
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Jobiest - your AI career agent', template: '%s - Jobiest' },
  description:
    'Create your professional profile once. Jobiest prepares truthful personalized applications for the roles you bring, applies with your agent on your approval, and tracks everything in one dashboard.',
  applicationName: 'Jobiest',
  openGraph: {
    images: ['/images/og-card.jpg'],
    title: 'Jobiest - your AI career agent',
    description:
      'Find roles, prepare truthful applications, and track every application in one place. Start free; you stay in control.',
    url: SITE_URL,
    siteName: 'Jobiest',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Jobiest - your AI career agent', description: 'Your AI career agent. Truthful applications, full tracking, you in control.' },
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
  themeColor: '#111C35',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmSans.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {/* Without JS the scroll-reveal driver can't run - never hide content. */}
        <noscript>
          <style>{'[data-animate]{opacity:1!important;transform:none!important;transition:none!important}'}</style>
        </noscript>
        {children}
        <ChatWidget />
        <ScrollReveal />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
