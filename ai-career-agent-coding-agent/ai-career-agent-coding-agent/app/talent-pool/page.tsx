import { AppShell } from '@/components/site/AppShell';
import { requireUserOrRedirect } from '@/lib/auth';
import { getEntitlement } from '@packages/security/entitlements';
import { getCandidateTalentPoolOverview } from '@/lib/talent-pool/candidate-service';
import { TalentPoolHubClient } from '@/components/talent-pool/TalentPoolHubClient';

export const dynamic = 'force-dynamic';

export default async function TalentPoolPage() {
  const user = await requireUserOrRedirect('/talent-pool');

  const [overview, entitlement] = await Promise.all([
    getCandidateTalentPoolOverview(user.id, user.email),
    getEntitlement(user.id).catch(() => ({ plan: 'FREE' as const })),
  ]);

  return (
    <AppShell active="talent-pool" title="Talent Pool">
      <TalentPoolHubClient initialOverview={overview} planCode={entitlement.plan ?? 'FREE'} />
    </AppShell>
  );
}
