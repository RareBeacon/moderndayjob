import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminForbidden, AdminShell } from '@/components/site/AdminShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Support',
  robots: { index: false, follow: false },
};

export default async function AdminSupportPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin/support');
  const { data: admin } = await supabaseAdmin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!admin) return <AdminForbidden />;

  const [tickets, conversations, events, kb] = await Promise.all([
    supabaseAdmin.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(60),
    supabaseAdmin.from('support_conversations').select('id, status, route, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('support_analytics_events').select('event_type').limit(2000),
    supabaseAdmin.from('support_kb_entries').select('id', { count: 'exact' }),
  ]);

  const eventCounts = (events.data ?? []).reduce<Record<string, number>>((acc, row) => {
    const type = String(row.event_type ?? 'UNKNOWN');
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AdminShell active="support">
      <h1 className="ad-h1">Support</h1>
      <p className="ad-lede">
        AI support operations: tickets from chat escalations and the contact form, conversation volume, and deflection analytics.
        Email delivery status is recorded per ticket; the assistant never claims actions it did not perform.
      </p>

      <section className="seo-grid-stats">
        <div className="seo-stat"><span>Tickets</span><strong>{tickets.data?.length ?? 0}</strong></div>
        <div className="seo-stat"><span>Conversations</span><strong>{conversations.count ?? 0}</strong></div>
        <div className="seo-stat"><span>Messages sent</span><strong>{eventCounts.MESSAGE_SENT ?? 0}</strong></div>
        <div className="seo-stat"><span>Deflected</span><strong>{eventCounts.DEFLECTED ?? 0}</strong></div>
        <div className="seo-stat"><span>Escalated</span><strong>{eventCounts.ESCALATED ?? 0}</strong></div>
        <div className="seo-stat"><span>Tickets created</span><strong>{eventCounts.TICKET_CREATED ?? 0}</strong></div>
        <div className="seo-stat"><span>KB entries</span><strong>{kb.count ?? 0}</strong></div>
      </section>

      <section className="seo-panel">
        <h2>Tickets</h2>
        <table className="ad-table">
          <thead>
            <tr><th>ID</th><th>Created</th><th>Category</th><th>Priority</th><th>Status</th><th>Email</th><th>Subject</th></tr>
          </thead>
          <tbody>
            {(tickets.data ?? []).length === 0 && <tr><td colSpan={7} className="ad-empty">No tickets yet.</td></tr>}
            {(tickets.data ?? []).map((ticket) => (
              <tr key={String(ticket.id)}>
                <td className="ad-mono">{String(ticket.id)}</td>
                <td className="ad-mono">{String(ticket.created_at ?? '').slice(0, 16).replace('T', ' ')}</td>
                <td><span className="ad-chip">{String(ticket.category ?? '-')}</span></td>
                <td>{String(ticket.priority ?? '-')}</td>
                <td>{String(ticket.status ?? '-')}</td>
                <td>{String(ticket.email_status ?? '-')}<br /><span style={{ fontSize: 11 }}>{ticket.email_error ? String(ticket.email_error).slice(0, 40) : ''}</span></td>
                <td>{String(ticket.subject ?? '-')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="seo-two-col">
        <div className="seo-panel">
          <h2>Recent conversations</h2>
          <table className="ad-table">
            <thead><tr><th>Started</th><th>Route</th><th>Status</th></tr></thead>
            <tbody>
              {(conversations.data ?? []).length === 0 && <tr><td colSpan={3} className="ad-empty">No conversations yet.</td></tr>}
              {(conversations.data ?? []).map((conversation) => (
                <tr key={String(conversation.id)}>
                  <td className="ad-mono">{String(conversation.created_at ?? '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="ad-mono">{String(conversation.route ?? '-')}</td>
                  <td><span className="ad-chip">{String(conversation.status ?? '-')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="seo-panel">
          <h2>Escalation triggers in effect</h2>
          <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 18 }}>
            <li>Billing, payment, refund, subscription keywords</li>
            <li>Security concerns (hacked, compromised, unauthorized)</li>
            <li>Data requests (account or data deletion, export, GDPR)</li>
            <li>Account lockout and login failures</li>
            <li>Three exchanges without resolution</li>
            <li>Explicit request for a human</li>
          </ul>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Trigger detection is deterministic and runs before and after the model. The model itself runs server-side on the
            platform chain with a versioned prompt ({`v1`}) and injection defenses; raw user text is never trusted.
          </p>
        </div>
      </section>
    </AdminShell>
  );
}
