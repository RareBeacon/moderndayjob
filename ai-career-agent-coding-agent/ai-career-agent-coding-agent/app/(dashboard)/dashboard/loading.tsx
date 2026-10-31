import { AppShell } from '@/components/site/AppShell';

/**
 * Workspace loading state: shown inside AppShell while the server component
 * fetches the user's profile, entitlements, and application counts so the
 * transition into DashboardView happens without layout shift.
 */
export default function DashboardLoading() {
  return (
    <AppShell active="dashboard" title="Workspace">
      <div aria-busy="true" aria-label="Loading your workspace" style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 8, width: 'min(100%, 420px)' }}>
            <div className="skeleton" style={{ height: 30, width: '58%', borderRadius: 8 }} />
            <div className="skeleton skeleton-line" style={{ height: 16, width: '88%', borderRadius: 6 }} />
          </div>
          <div className="skeleton" style={{ height: 32, width: 190, borderRadius: 999 }} />
        </div>

        <div className="skeleton" style={{ height: 148, width: '100%', borderRadius: 18 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />
          <div className="skeleton" style={{ height: 240, borderRadius: 16 }} />
        </div>

        <p className="muted" role="status" style={{ textAlign: 'center', marginTop: 4, fontSize: 13 }}>
          Loading your workspace…
        </p>
      </div>
    </AppShell>
  );
}
