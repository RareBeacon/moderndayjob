/**
 * Dashboard loading state: shown while the server component fetches the
 * user's profile, entitlements and application counts. A visible indicator
 * instead of a blank screen, per the dashboard-reliability brief
 * (2026-09-21); errors surface through the app-level error boundary, which
 * offers a retry.
 */
export default function DashboardLoading() {
  return (
    <div className="jl-page" aria-busy="true" aria-label="Loading your dashboard">
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 0' }}>
        <div className="spinner" style={{ margin: '0 auto 18px' }} role="status" aria-label="Loading" />
        <div className="skeleton" style={{ height: 28, width: '46%', borderRadius: 8 }} />
        <div className="skeleton skeleton-line" style={{ width: '64%', marginTop: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 28 }}>
          <div className="skeleton" style={{ height: 92, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 92, borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 92, borderRadius: 12 }} />
        </div>
        <div className="skeleton skeleton-line" style={{ width: '100%', marginTop: 26, height: 60, borderRadius: 12 }} />
        <div className="skeleton skeleton-line" style={{ width: '100%', height: 60, borderRadius: 12 }} />
        <p className="muted" style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>
          Loading your dashboard…
        </p>
      </div>
    </div>
  );
}
