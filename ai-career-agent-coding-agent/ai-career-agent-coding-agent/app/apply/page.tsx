import type { Metadata } from 'next';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { getOptionalUser } from '@/lib/auth';
import { SITE_URL } from '@/lib/site';
import { ApplyPortalClient } from './ApplyPortalClient';
import type { ProgrammeTrack } from '@/lib/programme/catalog';

export const metadata: Metadata = {
  title: 'Join the Founding Team & Strategic Partnerships | Jobiest',
  description:
    'Apply to join the Jobiest Founding Team, collaborate as an independent specialist, or establish a US, UK, university, or recruitment agency partnership at jobiest.com/apply.',
  alternates: { canonical: `${SITE_URL}/apply` },
  openGraph: {
    title: 'Build With Jobiest: Founding Team, Internships & Strategic Partnerships',
    description:
      'Open applications across Content, Sales & B2B Outreach, Strategy, Engineering, Community, and US/UK Employer & Institutional Partnerships.',
    url: `${SITE_URL}/apply`,
    type: 'website',
  },
};

function resolveInitialTrack(raw?: string): ProgrammeTrack {
  const clean = (raw ?? '').trim().toLowerCase();
  if (clean === 'partner' || clean === 'partners') return 'PARTNER';
  if (clean === 'collaborator' || clean === 'freelance') return 'COLLABORATOR';
  return 'JOIN_TEAM';
}

export default async function PublicApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string }>;
}) {
  const [user, sp] = await Promise.all([getOptionalUser(), searchParams]);
  const initialTrack = resolveInitialTrack(sp?.track);

  return (
    <MarketingShell activePath="/apply" authenticated={!!user}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Jobiest Founding Team & Strategic Partnerships Programme',
            url: `${SITE_URL}/apply`,
          }),
        }}
      />
      <main id="main">
        <ApplyPortalClient initialTrack={initialTrack} />
      </main>
    </MarketingShell>
  );
}
