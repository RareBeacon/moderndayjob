'use client';

import { useEffect, useState } from 'react';

interface PermissionItem {
  key: string;
  label: string;
  ownerRecommendedOnly?: boolean;
}

interface AdminMember {
  userId: string;
  fullName: string;
  email: string;
  role: 'OWNER' | 'SUB_ADMIN' | 'STAFF';
  isOwner: boolean;
  isActive: boolean;
  requireMfa: boolean;
  permissions: Record<string, boolean>;
  notes: string;
  createdAt: string;
}

export function TeamRbacClient() {
  const [viewer, setViewer] = useState<{ userId: string; role: string; isOwner: boolean } | null>(null);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'SUB_ADMIN' | 'STAFF'>('SUB_ADMIN');
  const [selectedPerms, setSelectedPerms] = useState<Record<string, boolean>>({
    can_view_analytics: true,
    can_view_users: true,
    can_manage_programme: true,
    can_manage_support: true,
  });
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/team');
      if (!r.ok) {
        setError(r.status === 403 ? 'You do not have permission to view Admin Team & RBAC settings.' : 'Failed to load team.');
        return;
      }
      const j = await r.json();
      setViewer(j.viewer);
      setMembers(j.members ?? []);
      setAvailablePermissions(j.availablePermissions ?? []);
    } catch {
      setError('Unable to reach server.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveMember(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const r = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          role,
          permissions: selectedPerms,
          notes: notes.trim() || undefined,
          reason: reason.trim(),
        }),
      });
      const j = await r.json();
      if (j.ok) {
        setStatusMsg('Admin role saved and recorded in the immutable audit log.');
        setEmail('');
        setNotes('');
        setReason('');
        await load();
      } else {
        setStatusMsg(j.message ?? j.error ?? 'Unable to assign admin role.');
      }
    } catch {
      setStatusMsg('Network error.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeMember(member: AdminMember) {
    const revokeReason = window.prompt(`Enter documented reason (min 5 chars) to revoke ${member.fullName} (${member.role}):`);
    if (!revokeReason || revokeReason.trim().length < 5) return;
    setBusy(true);
    setStatusMsg('');
    try {
      const r = await fetch('/api/admin/team', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: member.userId, reason: revokeReason.trim() }),
      });
      const j = await r.json();
      if (j.ok) {
        setStatusMsg(`Revoked ${member.fullName} from admin access.`);
        await load();
      } else {
        setStatusMsg(j.message ?? j.error ?? 'Failed to revoke access.');
      }
    } catch {
      setStatusMsg('Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="ad-h1">Admin Team &amp; RBAC Hierarchy</h1>
      <p className="ad-lede">
        3-tier administrative security model: Level 1 <b>OWNER</b> (sole, non-assignable, DB-trigger protected),
        Level 2 <b>SUB_ADMIN</b> (granular permissions), and Level 3 <b>STAFF</b> (least-privilege support &amp; triage).
        All role changes require TOTP 2FA and write to the append-only <code>admin_audit_logs</code> table.
      </p>

      {error && <p className="form-status">{error}</p>}
      {statusMsg && <p className="form-status">{statusMsg}</p>}

      {loading ? (
        <p className="muted">Loading administrative roster…</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', marginTop: 20 }}>
            <table className="ad-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Tier / Role</th>
                  <th>MFA Policy</th>
                  <th>Permissions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td><b>{m.fullName}</b></td>
                    <td className="ad-mono">{m.email}</td>
                    <td>
                      <span className="ad-chip">
                        {m.isOwner ? 'OWNER (Level 1 · Protected)' : m.role === 'SUB_ADMIN' ? 'SUB_ADMIN (Level 2)' : 'STAFF (Level 3)'}
                      </span>
                    </td>
                    <td><span className="ad-chip">Mandatory TOTP</span></td>
                    <td style={{ fontSize: 12.5 }}>
                      {m.isOwner
                        ? 'Full Platform & Security Authority (Immutable)'
                        : Object.entries(m.permissions ?? {})
                            .filter(([, v]) => v)
                            .map(([k]) => k.replace(/^can_/, '').replace(/_/g, ' '))
                            .join(', ') || 'Default read-only support'}
                    </td>
                    <td>
                      {m.isOwner ? (
                        <span className="muted" style={{ fontSize: 12 }}>Locked by DB trigger</span>
                      ) : viewer?.isOwner ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ minHeight: 30, padding: '4px 10px', fontSize: 12 }}
                          disabled={busy}
                          onClick={() => revokeMember(m)}
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>Owner only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {viewer?.isOwner && (
            <form onSubmit={saveMember} style={{ marginTop: 28, border: '1px solid rgba(15,23,42,0.12)', borderRadius: 12, padding: 20 }}>
              <h2 style={{ fontSize: 18, marginBottom: 6 }}>Assign or Update Sub-Admin / Staff (Owner Only)</h2>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Owner authority can never be delegated through this form. Target user must already have a verified Jobiest account and enroll TOTP 2FA.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 14 }}>
                <label style={{ fontSize: 13 }}>
                  Registered Jobiest Email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@jobiest.com"
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>

                <label style={{ fontSize: 13 }}>
                  Administrative Tier
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'SUB_ADMIN' | 'STAFF')}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <option value="SUB_ADMIN">Level 2: Sub-Admin (Granular operational permissions)</option>
                    <option value="STAFF">Level 3: Staff / Support (Least-privilege support &amp; triage)</option>
                  </select>
                </label>

                <label style={{ fontSize: 13 }}>
                  Internal Role Note (optional)
                  <input
                    type="text"
                    maxLength={200}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Growth & Partnerships Coordinator"
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
              </div>

              <fieldset style={{ border: '1px solid rgba(15,23,42,0.1)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <legend style={{ fontSize: 12.5, fontWeight: 600, padding: '0 6px' }}>Granular Permissions</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
                  {availablePermissions.map((perm) => {
                    const disabledForStaff =
                      role === 'STAFF' && (perm.key === 'can_terminate_users' || perm.key === 'can_manage_credentials');
                    return (
                      <label
                        key={perm.key}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          opacity: disabledForStaff ? 0.45 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={disabledForStaff}
                          checked={disabledForStaff ? false : Boolean(selectedPerms[perm.key])}
                          onChange={(e) =>
                            setSelectedPerms((prev) => ({ ...prev, [perm.key]: e.target.checked }))
                          }
                        />
                        <span>{perm.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label style={{ display: 'block', fontSize: 13, marginBottom: 14 }}>
                Audit Reason (required, min 5 characters)
                <input
                  type="text"
                  required
                  minLength={5}
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Onboarding Sales & Partnerships Coordinator for Q1 2027 US/UK outreach"
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>

              <button type="submit" className="btn" disabled={busy || reason.trim().length < 5 || !email.trim()}>
                {busy ? 'Saving…' : 'Assign / Update Role'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
