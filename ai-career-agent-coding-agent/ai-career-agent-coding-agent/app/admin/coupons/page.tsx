import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import CouponsManager from './CouponsManager';

export const dynamic = 'force-dynamic';

/** Admin • Coupons & Discounts (spec Part 10/13/19). All data flows through
 *  the audited, admin-gated API routes; this page only renders the manager. */
export default async function AdminCouponsPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/coupons');
  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  return (
    <AdminShell active="coupons">
      <h1 className="ad-h1">Coupons &amp; Discounts</h1>
      <p className="ad-lede">
        Create promotion codes, follow usage, and deactivate them. Discounts are always validated and priced
        server-side; a coupon is only redeemed after a payment is verified.
      </p>
      <CouponsManager />
    </AdminShell>
  );
}
