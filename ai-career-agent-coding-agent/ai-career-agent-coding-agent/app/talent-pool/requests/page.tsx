import { AppShell } from '@/components/site/AppShell';
import { requireUserOrRedirect } from '@/lib/auth';
import { CandidateRequestsClient } from '@/components/talent-pool/CandidateRequestsClient';

export const dynamic = 'force-dynamic';

export default async function CandidateRequestsPage() {
  await requireUserOrRedirect('/talent-pool/requests');

  return (
    <AppShell active="talent-pool" title="Opportunity Invitations">
      <CandidateRequestsClient />
    </AppShell>
  );
}
