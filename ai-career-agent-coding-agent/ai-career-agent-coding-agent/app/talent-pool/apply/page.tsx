import { AppShell } from '@/components/site/AppShell';
import { requireUserOrRedirect } from '@/lib/auth';
import { getCandidateTalentPoolOverview } from '@/lib/talent-pool/candidate-service';
import { TalentPoolApplyClient } from '@/components/talent-pool/TalentPoolApplyClient';

export const dynamic = 'force-dynamic';

export default async function TalentPoolApplyPage() {
  const user = await requireUserOrRedirect('/talent-pool/apply');
  const overview = await getCandidateTalentPoolOverview(user.id, user.email);

  return (
    <AppShell active="talent-pool" title="Apply to Talent Pool">
      <TalentPoolApplyClient
        initialOnboarding={overview.onboarding}
        initialPreferences={{
          allow_cv_access: overview.preferences.allow_cv_access,
          allow_contact_requests: overview.preferences.allow_contact_requests,
          blocked_employer_domains: overview.preferences.blocked_employer_domains,
        }}
      />
    </AppShell>
  );
}
