import { AppShell } from '@/components/site/AppShell';
import { requireUserOrRedirect } from '@/lib/auth';
import { getEntitlement } from '@packages/security/entitlements';
import { getCandidateTalentPoolOverview } from '@/lib/talent-pool/candidate-service';
import { TalentPoolHubClient } from '@/components/talent-pool/TalentPoolHubClient';

export const dynamic = 'force-dynamic';

export default async function TalentPoolPage() {
  const user = await requireUserOrRedirect('/talent-pool');

  const [overview, entitlement] = await Promise.all([
    getCandidateTalentPoolOverview(user.id, user.email).catch(() => null),
    getEntitlement(user.id).catch(() => ({ plan: 'FREE' as const })),
  ]);

  if (!overview) {
    return (
      <AppShell active="talent-pool" title="Talent Pool">
        <section className="workspace-hero">
          <p className="eyebrow">TALENT POOL</p>
          <h1>Jobiest Talent Pool is activating</h1>
          <p>
            Database migration setup is in progress. Your existing CV, Job Match, and Application tools remain active.
          </p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell active="talent-pool" title="Talent Pool">
      <TalentPoolHubClient initialOverview={overview} planCode={entitlement.plan ?? 'FREE'} />
    </AppShell>
  );
}
