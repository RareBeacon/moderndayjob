'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Admin → Coupons & Discounts (spec Part 13/19/26).
 * Create with a full form (all validation server-side), list with usage,
 * activate/deactivate behind a confirmation, and open a coupon to see its
 * redemptions and totals. Codes are normalized to uppercase by the server.
 */

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discount_value: string;
  currency: string;
  applicable_plans: string[] | null;
  min_purchase_amount: string | null;
  max_discount_amount: string | null;
  usage_limit: number | null;
  usage_count: number;
  per_user_limit: number;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface Redemption {
  id: number;
  user_id: string;
  plan: string;
  currency: string;
  original_amount: string;
  discount_amount: string;
  final_amount: string;
  redeemed_at: string;
}

function fmtDate(d: string | null): string {
  return d ? d.slice(0, 10) : '-';
}

function discountLabel(c: Coupon): string {
  return c.discount_type === 'PERCENTAGE'
    ? `${Number(c.discount_value)}%`
    : `${c.currency === 'USD' ? '$' : '₦'}${Number(c.discount_value).toLocaleString()}`;
}

export default function CouponsManager() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<{ coupon: Coupon; redemptions: Redemption[]; analytics: { totalRedemptions: number; totalDiscountGiven: number; totalRevenueGenerated: number } } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/coupons');
      const j = await r.json();
      if (r.ok) setCoupons(j.coupons ?? []);
      else setStatus(j.message ?? j.error ?? 'Failed to load coupons.');
    } catch {
      setStatus('Network error.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setDetail(null);
    try {
      const r = await fetch(`/api/admin/coupons/${id}`);
      const j = await r.json();
      if (r.ok) setDetail(j);
      else setStatus(j.message ?? j.error ?? 'Failed to load coupon.');
    } catch {
      setStatus('Network error.');
    }
  }

  async function toggleActive(c: Coupon) {
    const next = !c.is_active;
    if (next === false && !window.confirm(`Deactivate ${c.code}? Users will no longer be able to redeem this coupon.`)) return;
    if (next === true && !window.confirm(`Activate ${c.code}? Users will be able to redeem it again.`)) return;
    try {
      const r = await fetch(`/api/admin/coupons/${c.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      });
      const j = await r.json();
      if (r.ok) void load();
      else setStatus(j.message ?? j.error ?? 'Update failed.');
    } catch {
      setStatus('Network error.');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <button className="btn" style={{ minHeight: 36, fontSize: 13 }} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Close form' : 'Create coupon'}
        </button>
        {status && <span className="muted" style={{ fontSize: 12 }} role="status">{status}</span>}
      </div>

      {showCreate && <CreateForm onCreated={() => { setShowCreate(false); void load(); }} />}

      {coupons === null ? (
        <p className="muted">Loading…</p>
      ) : coupons.length === 0 ? (
        <p className="ad-empty">No coupons yet. Create the first promotion above.</p>
      ) : (
        <div className="ad-scroll">
          <table className="ad-table">
            <thead>
              <tr><th>Code</th><th>Discount</th><th>Plans</th><th>Usage</th><th>Per user</th><th>Status</th><th>Starts</th><th>Expires</th><th></th></tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const now = Date.now();
                const windowOk = new Date(c.starts_at).getTime() <= now && (!c.expires_at || new Date(c.expires_at).getTime() > now);
                const exhausted = c.usage_limit != null && c.usage_count >= c.usage_limit;
                const live = c.is_active && windowOk && !exhausted;
                return (
                  <tr key={c.id}>
                    <td className="ad-mono"><button className="inline-link" style={{ padding: 0 }} onClick={() => openDetail(c.id)}>{c.code}</button></td>
                    <td className="ad-mono">{discountLabel(c)}</td>
                    <td className="ad-mono">{(c.applicable_plans ?? []).join(', ')}</td>
                    <td className="ad-mono">{c.usage_count}{c.usage_limit != null ? ` / ${c.usage_limit}` : ''}</td>
                    <td className="ad-mono">{c.per_user_limit}</td>
                    <td className="ad-mono">{live ? 'ACTIVE' : exhausted ? 'EXHAUSTED' : !c.is_active ? 'INACTIVE' : 'OUT OF WINDOW'}</td>
                    <td className="ad-mono">{fmtDate(c.starts_at)}</td>
                    <td className="ad-mono">{fmtDate(c.expires_at)}</td>
                    <td>
                      <button className="btn-ghost" style={{ minHeight: 30, padding: '4px 10px', fontSize: 12 }} onClick={() => toggleActive(c)}>
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 16, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontWeight: 600 }}>{detail.coupon.code} · {discountLabel(detail.coupon)}{(detail.coupon.description ? ` · ${detail.coupon.description}` : '')}</p>
            <button className="btn-ghost" style={{ minHeight: 30, padding: '4px 10px', fontSize: 12 }} onClick={() => setDetail(null)}>Close</button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {detail.analytics.totalRedemptions} redemption(s) · {detail.coupon.currency === 'USD' ? '$' : '₦'}{detail.analytics.totalDiscountGiven.toLocaleString()} discount given · {detail.coupon.currency === 'USD' ? '$' : '₦'}{detail.analytics.totalRevenueGenerated.toLocaleString()} revenue generated
          </p>
          {detail.redemptions.length === 0 ? (
            <p className="ad-empty">No redemptions yet.</p>
          ) : (
            <div className="ad-scroll" style={{ marginTop: 8 }}>
              <table className="ad-table">
                <thead><tr><th>When</th><th>User</th><th>Plan</th><th>Original</th><th>Discount</th><th>Paid</th></tr></thead>
                <tbody>
                  {detail.redemptions.map((r) => (
                    <tr key={r.id}>
                      <td className="ad-mono">{String(r.redeemed_at).slice(0, 16).replace('T', ' ')}</td>
                      <td className="ad-mono">{r.user_id.slice(0, 8)}…</td>
                      <td className="ad-mono">{r.plan}</td>
                      <td className="ad-mono">{Number(r.original_amount).toLocaleString()} {r.currency}</td>
                      <td className="ad-mono">−{Number(r.discount_amount).toLocaleString()}</td>
                      <td className="ad-mono">{Number(r.final_amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState(50);
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [plans, setPlans] = useState<Record<'BASIC' | 'PREMIUM' | 'MAX', boolean>>({ BASIC: false, PREMIUM: true, MAX: false });
  const [minimumPurchase, setMinimumPurchase] = useState('');
  const [maximumDiscount, setMaximumDiscount] = useState('');
  const [usageLimit, setUsageLimit] = useState('100');
  const [perUserLimit, setPerUserLimit] = useState(1);
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    if (busy) return;
    const applicablePlans = (Object.keys(plans) as Array<'BASIC' | 'PREMIUM' | 'MAX'>).filter((p) => plans[p]);
    if (applicablePlans.length === 0) {
      setMessage('Select at least one plan.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code,
          description: description || undefined,
          discountType,
          discountValue,
          currency: discountType === 'FIXED_AMOUNT' ? currency : 'NGN',
          applicablePlans,
          minimumPurchase: minimumPurchase ? Number(minimumPurchase) : undefined,
          maximumDiscount: maximumDiscount ? Number(maximumDiscount) : undefined,
          usageLimit: usageLimit ? Number(usageLimit) : undefined,
          perUserLimit,
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      const j = await r.json();
      if (r.ok) {
        setMessage(`Coupon ${j.coupon.code} created.`);
        onCreated();
      } else {
        setMessage(j.message ?? j.error ?? 'Creation failed.');
      }
    } catch {
      setMessage('Network error.');
    } finally {
      setBusy(false);
    }
  }

  const field: React.CSSProperties = { width: 200 };

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <p style={{ fontWeight: 600, marginBottom: 10 }}>Create coupon</p>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', fontSize: 13 }}>
        <label>Code <input style={field} value={code} maxLength={32} placeholder="JOBIEST50" onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
        <label>Description <input style={field} value={description} maxLength={200} placeholder="Black Friday promotion" onChange={(e) => setDescription(e.target.value)} /></label>
        <label>Type
          <select style={field} value={discountType} onChange={(e) => setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED_AMOUNT')}>
            <option value="PERCENTAGE">Percentage</option>
            <option value="FIXED_AMOUNT">Fixed amount</option>
          </select>
        </label>
        <label>Value {discountType === 'PERCENTAGE' ? '(%)' : ''} <input style={field} type="number" min={0.01} step="0.01" value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} /></label>
        {discountType === 'FIXED_AMOUNT' && (
          <label>Currency
            <select style={field} value={currency} onChange={(e) => setCurrency(e.target.value as 'NGN' | 'USD')}>
              <option value="NGN">NGN (₦)</option>
              <option value="USD">USD ($)</option>
            </select>
          </label>
        )}
        <label>Minimum purchase (optional) <input style={field} type="number" min={0} step="0.01" value={minimumPurchase} onChange={(e) => setMinimumPurchase(e.target.value)} /></label>
        {discountType === 'PERCENTAGE' && (
          <label>Max discount cap (optional) <input style={field} type="number" min={0} step="0.01" value={maximumDiscount} onChange={(e) => setMaximumDiscount(e.target.value)} /></label>
        )}
        <label>Usage limit (blank = unlimited) <input style={field} type="number" min={1} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} /></label>
        <label>Per-user limit <input style={field} type="number" min={1} max={1000} value={perUserLimit} onChange={(e) => setPerUserLimit(Number(e.target.value))} /></label>
        <label>Start date (blank = now) <input style={field} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
        <label>Expiration (optional) <input style={field} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></label>
      </div>
      <div style={{ margin: '12px 0', fontSize: 13 }}>
        Applicable plans:{' '}
        {(['BASIC', 'PREMIUM', 'MAX'] as const).map((p) => (
          <label key={p} style={{ marginRight: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={plans[p]} onChange={(e) => setPlans((prev) => ({ ...prev, [p]: e.target.checked }))} /> {p.charAt(0) + p.slice(1).toLowerCase()}
          </label>
        ))}
      </div>
      <button className="btn" style={{ minHeight: 36, fontSize: 13 }} disabled={busy || code.trim().length < 3} onClick={submit}>
        {busy ? 'Creating…' : 'Create coupon'}
      </button>
      {message && <span className="muted" style={{ fontSize: 12, marginLeft: 10 }} role="status">{message}</span>}
    </div>
  );
}
