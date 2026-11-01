import { requireUserOrRedirect } from '@/lib/auth';
import { AppShell } from '@/components/site/AppShell';
import { getCandidateAlertSettings } from '@/lib/radar/alerts/dispatcher';
import { listRankedOpportunitiesForUser } from '@/lib/radar/sync/persistence';
import { OpportunitiesClient } from './OpportunitiesClient';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const user = await requireUserOrRedirect('/opportunities');

  const [oppsOut, alertsOut] = await Promise.all([
    listRankedOpportunitiesForUser({
      userId: user.id,
      limit: 30,
    }).catch(() => ({ migrationPending: false, opportunities: [] })),
    getCandidateAlertSettings(user.id).catch(() => ({
      migrationPending: false,
      settings: {
        userId: user.id,
        enabled: false,
        exclusivityOnly: true,
        minConfidence: 80,
        workplaceTypes: [],
        targetRoles: [],
        countryCodes: [],
        frequency: 'DAILY' as const,
        emailEnabled: false,
        lastNotifiedAt: null,
      },
    })),
  ]);

  return (
    <AppShell active="opportunities" title="Job Radar">
      <OpportunitiesClient
        initialOpportunities={oppsOut.opportunities}
        initialAlerts={alertsOut.settings}
        migrationPending={oppsOut.migrationPending}
      />
    </AppShell>
  );
}
