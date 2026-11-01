import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/site/AppShell';
import { requireUserOrRedirect } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getAuthorizedCandidateDetailForEmployer,
  getEmployerContextForUser,
} from '@/lib/talent-pool/recruiter-service';
import { EmployerCandidateDetailClient } from '@/components/talent-pool/EmployerCandidateDetailClient';

export const dynamic = 'force-dynamic';

export default async function EmployerCandidateDetailPage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const user = await requireUserOrRedirect('/employer');
  const { candidateId } = await params;

  const context = await getEmployerContextForUser(user.id);
  if (!context || context.organization.verification_status !== 'VERIFIED') {
    redirect('/employer');
  }

  let candidate;
  try {
    candidate = await getAuthorizedCandidateDetailForEmployer(user.id, candidateId);
  } catch {
    notFound();
  }

  const [shortlistsRes, vacanciesRes] = await Promise.all([
    supabaseAdmin
      .from('employer_shortlists')
      .select('id,name')
      .eq('organization_id', context.organization.id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('recruitment_vacancies')
      .select('id,title')
      .eq('organization_id', context.organization.id)
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false }),
  ]);

  return (
    <AppShell active="employer" title={candidate.display_name}>
      <EmployerCandidateDetailClient
        candidate={candidate}
        shortlists={(shortlistsRes.data ?? []) as Array<{ id: string; name: string }>}
        vacancies={(vacanciesRes.data ?? []) as Array<{ id: string; title: string }>}
      />
    </AppShell>
  );
}
