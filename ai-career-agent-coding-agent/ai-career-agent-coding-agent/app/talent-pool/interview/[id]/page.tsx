import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AppShell } from '@/components/site/AppShell';
import { requireUserOrRedirect } from '@/lib/auth';
import { getInterviewSessionDetail } from '@/lib/talent-pool/interview-engine';
import { InterviewRoomClient } from '@/components/talent-pool/InterviewRoomClient';

export const dynamic = 'force-dynamic';

export default async function TalentInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const user = await requireUserOrRedirect(`/talent-pool/interview/${id}`);

  let detail;
  try {
    detail = await getInterviewSessionDetail(user.id, id);
  } catch {
    notFound();
  }

  return (
    <AppShell active="talent-pool" title="Talent Pool Assessment">
      <InterviewRoomClient initialDetail={detail as never} />
    </AppShell>
  );
}
