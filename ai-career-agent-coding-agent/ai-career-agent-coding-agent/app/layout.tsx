import './globals.css';
import type { Metadata, Viewport } from 'next';

const SITE_URL = 'https://modernjob.vercel.app';

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
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
