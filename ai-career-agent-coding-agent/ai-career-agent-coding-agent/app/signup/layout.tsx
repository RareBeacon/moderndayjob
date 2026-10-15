import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';

/** Signup page metadata. The page itself is a client component, so the
 *  title, description and canonical live in this server layout. */
export const metadata: Metadata = {
  title: 'Create Your Free Account',
  description:
    'Create your Jobiest account in one step and start your AI job agent free. Google and LinkedIn signup supported.',
  alternates: { canonical: `${SITE_URL}/signup` },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
