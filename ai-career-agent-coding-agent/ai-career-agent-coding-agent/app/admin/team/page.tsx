import { AdminForbidden, AdminShell } from '@/components/site/AdminShell';
import { requireUserOrRedirect } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { TeamRbacClient } from './TeamRbacClient';

export const dynamic = 'force-dynamic';

export default async function AdminTeamPage() {
  const user = await requireUserOrRedirect('/admin/team');
  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!admin || (admin as { is_active?: boolean }).is_active === false) {
    return <AdminForbidden />;
  }

  return (
    <AdminShell active="team">
      <TeamRbacClient />
    </AdminShell>
  );
}
