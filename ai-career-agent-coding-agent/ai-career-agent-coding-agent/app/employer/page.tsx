import { AppShell } from '@/components/site/AppShell';
import { requireUserOrRedirect } from '@/lib/auth';
import { getEmployerContextForUser } from '@/lib/talent-pool/recruiter-service';
import { EmployerPortalClient } from '@/components/talent-pool/EmployerPortalClient';

export const dynamic = 'force-dynamic';

export default async function EmployerPortalPage() {
  const user = await requireUserOrRedirect('/employer');
  const context = await getEmployerContextForUser(user.id);

  return (
    <AppShell active="employer" title="Hire Verified Talent">
      <EmployerPortalClient initialContext={context} />
    </AppShell>
  );
}
