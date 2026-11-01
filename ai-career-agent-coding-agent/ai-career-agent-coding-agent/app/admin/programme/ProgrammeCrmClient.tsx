'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CRM_STAGE_LABELS,
  PARTNER_CATEGORIES,
  PROGRAMME_DEPARTMENTS,
  PROGRAMME_TRACKS,
  type CrmStage,
  type PartnerOrganizationType,
} from '@/lib/programme/catalog';

interface ProgrammeItem {
  id: string;
  reference_code: string;
  track: 'JOIN_TEAM' | 'PARTNER' | 'COLLABORATOR';
  department: string;
  role_title: string;
  priority_rank: number | null;
  arrangement: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  country: string;
  city: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  resume_url: string | null;
  organization_name: string | null;
  organization_type: string | null;
  organization_website: string | null;
  partnership_market: string | null;
  partnership_use_case: string | null;
  availability_hours_per_week: number | null;
  experience_summary: string;
  motivation_statement: string;
  compensation_expectation: string | null;
  status: CrmStage;
  priority_band: 'TOP_PRIORITY' | 'HIGH' | 'MEDIUM' | 'LOW';
  review_60d_due_at: string | null;
  next_follow_up_at: string | null;
  partnership_verified: boolean;
  partnership_verified_at: string | null;
  decision_maker_contact: string | null;
  internal_notes: string | null;
  source_channel: string | null;
  created_at: string;
}

interface ProgrammeSummary {
  total: number;
  joinTeam: number;
  partners: number;
  collaborators: number;
  topPriority: number;
  activeContributors: number;
  verifiedUsPartners: number;
  verifiedUkPartners: number;
  verifiedTotalUsUkPartners: number;
  partnerDiscoveryOrActive: number;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
}

export function ProgrammeCrmClient() {
  const [items, setItems] = useState<ProgrammeItem[]>([]);
  const [summary, setSummary] = useState<ProgrammeSummary | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);

  const [trackFilter, setTrackFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [marketFilter, setMarketFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [selected, setSelected] = useState<ProgrammeItem | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [editStatus, setEditStatus] = useState<CrmStage>('NEW');
  const [editPriority, setEditPriority] = useState<'TOP_PRIORITY' | 'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [editFollowUp, setEditFollowUp] = useState('');
  const [editReview60d, setEditReview60d] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDecisionMaker, setEditDecisionMaker] = useState('');
  const [editVerified, setEditVerified] = useState(false);
  const [verificationBasis, setVerificationBasis] = useState('SIGNED_MOU_OR_PILOT');
  const [timelineNote, setTimelineNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [showOutboundModal, setShowOutboundModal] = useState(false);
  const [outOrgName, setOutOrgName] = useState('');
  const [outOrgType, setOutOrgType] = useState<PartnerOrganizationType>('US_COMPANY');
  const [outMarket, setOutMarket] = useState<'US' | 'UK' | 'AFRICA' | 'GLOBAL' | 'OTHER'>('US');
  const [outContactName, setOutContactName] = useState('');
  const [outContactEmail, setOutContactEmail] = useState('');
  const [outRoleTitle, setOutRoleTitle] = useState('Employer Talent Discovery & Hiring Pilot');
  const [outWebsite, setOutWebsite] = useState('');
  const [outNotes, setOutNotes] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (trackFilter) qs.set('track', trackFilter);
      if (statusFilter) qs.set('status', statusFilter);
      if (deptFilter) qs.set('department', deptFilter);
      if (marketFilter) qs.set('market', marketFilter);
      if (searchQuery.trim()) qs.set('q', searchQuery.trim());

      const res = await fetch(`/api/admin/programme?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setSummary(data.summary ?? null);
        setCanManage(Boolean(data.canManage));
      }
    } finally {
      setLoading(false);
    }
  }, [trackFilter, statusFilter, deptFilter, marketFilter, searchQuery]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function openDetail(item: ProgrammeItem) {
    setSelected(item);
    setEditStatus(item.status);
    setEditPriority(item.priority_band);
    setEditFollowUp(item.next_follow_up_at ? item.next_follow_up_at.slice(0, 10) : '');
    setEditReview60d(item.review_60d_due_at ? item.review_60d_due_at.slice(0, 10) : '');
    setEditNotes(item.internal_notes ?? '');
    setEditDecisionMaker(item.decision_maker_contact ?? `${item.applicant_name} <${item.applicant_email}>`);
    setEditVerified(item.partnership_verified);
    setTimelineNote('');
    setStatusMsg(null);
    setEvents([]);

    const res = await fetch(`/api/admin/programme/${item.id}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events ?? []);
    }
  }

  async function saveChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/admin/programme/${selected.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          priorityBand: editPriority,
          nextFollowUpAt: editFollowUp ? new Date(editFollowUp).toISOString() : null,
          review60dDueAt: editReview60d ? new Date(editReview60d).toISOString() : null,
          internalNotes: editNotes || null,
          decisionMakerContact: editDecisionMaker || null,
          partnershipVerified: selected.track === 'PARTNER' ? editVerified : undefined,
          verificationBasis: selected.track === 'PARTNER' && editVerified ? verificationBasis : undefined,
          timelineNote: timelineNote || undefined,
        }),
      });
      const out = await res.json();
      if (!res.ok) {
        setStatusMsg({ kind: 'err', text: out.message ?? out.error ?? 'Failed to update CRM record.' });
        return;
      }
      setStatusMsg({ kind: 'ok', text: 'CRM record and timeline updated.' });
      setTimelineNote('');
      await loadList();
      await openDetail(out.record);
    } finally {
      setSaving(false);
    }
  }

  async function logOutboundPartner(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/programme', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          track: 'PARTNER',
          organizationName: outOrgName,
          organizationType: outOrgType,
          partnershipMarket: outMarket,
          applicantName: outContactName,
          applicantEmail: outContactEmail,
          roleTitle: outRoleTitle,
          organizationWebsite: outWebsite || undefined,
          country: outMarket === 'UK' ? 'United Kingdom' : outMarket === 'US' ? 'United States' : 'Global',
          status: 'UNDER_REVIEW',
          internalNotes: outNotes || undefined,
        }),
      });
      if (res.ok) {
        setShowOutboundModal(false);
        setOutOrgName('');
        setOutContactName('');
        setOutContactEmail('');
        setOutWebsite('');
        setOutNotes('');
        await loadList();
      }
    } finally {
      setSaving(false);
    }
  }

  const exportHref = `/api/admin/programme?format=csv${trackFilter ? `&track=${trackFilter}` : ''}${
    statusFilter ? `&status=${statusFilter}` : ''
  }${marketFilter ? `&market=${marketFilter}` : ''}`;

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <span className="eyebrow">Recruitment &amp; Strategic Partnerships CRM</span>
          <h1 style={{ fontSize: 24, margin: '4px 0' }}>Founding Team &amp; Partner Pipeline</h1>
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
            Live intake from <a href="/apply" target="_blank" rel="noreferrer">jobiest.com/apply</a> plus outbound US/UK employer acquisition tracking.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {canManage && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowOutboundModal((v) => !v)}>
              {showOutboundModal ? 'Close Outbound Form' : '+ Log Outbound US/UK Prospect'}
            </button>
          )}
          <a href={exportHref} className="btn btn-ghost btn-sm">
            Export CSV
          </a>
        </div>
      </div>

      {summary && (
        <div className="grid grid-4" style={{ gap: 12, marginBottom: 18 }}>
          <div className="panel" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 12 }}>Total Submissions &amp; Leads</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{summary.total}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Team: {summary.joinTeam} · Partners: {summary.partners} · Collab: {summary.collaborators}
            </div>
          </div>

          <div className="panel" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 12 }}>Top-5 Immediate Wave Candidates</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{summary.topPriority}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Active Founding Network: {summary.activeContributors} / 15 target
            </div>
          </div>

          <div className="panel" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 12 }}>Verified US + UK Partnerships</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
              {summary.verifiedTotalUsUkPartners} <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>/ 50 Mar 2027</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              US: {summary.verifiedUsPartners} / 30 · UK: {summary.verifiedUkPartners} / 20
            </div>
          </div>

          <div className="panel" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 12 }}>Discovery / Pilot Conversations</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
              {summary.partnerDiscoveryOrActive} <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>/ 100 funnel</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Rule #1 enforced: documented proof required
            </div>
          </div>
        </div>
      )}

      {showOutboundModal && canManage && (
        <form onSubmit={logOutboundPartner} className="panel" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Log Outbound US / UK / Institutional Prospect</h2>
          <div className="grid grid-3" style={{ gap: 10 }}>
            <label className="field">
              <span className="label">Organization Name *</span>
              <input className="input" required value={outOrgName} onChange={(e) => setOutOrgName(e.target.value)} placeholder="Acme Staffing US" />
            </label>
            <label className="field">
              <span className="label">Category</span>
              <select className="select" value={outOrgType} onChange={(e) => setOutOrgType(e.target.value as PartnerOrganizationType)}>
                {PARTNER_CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Market</span>
              <select className="select" value={outMarket} onChange={(e) => setOutMarket(e.target.value as 'US' | 'UK' | 'AFRICA' | 'GLOBAL' | 'OTHER')}>
                <option value="US">United States (Target: 30)</option>
                <option value="UK">United Kingdom (Target: 20)</option>
                <option value="AFRICA">Africa</option>
                <option value="GLOBAL">Global</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Decision-Maker Name *</span>
              <input className="input" required value={outContactName} onChange={(e) => setOutContactName(e.target.value)} placeholder="Jordan Smith" />
            </label>
            <label className="field">
              <span className="label">Decision-Maker Email *</span>
              <input className="input" type="email" required value={outContactEmail} onChange={(e) => setOutContactEmail(e.target.value)} placeholder="jordan@acme.com" />
            </label>
            <label className="field">
              <span className="label">Website</span>
              <input className="input" value={outWebsite} onChange={(e) => setOutWebsite(e.target.value)} placeholder="https://acme.com" />
            </label>
          </div>
          <div className="grid grid-2" style={{ gap: 10, marginTop: 10 }}>
            <label className="field">
              <span className="label">Proposed Pilot / Focus</span>
              <input className="input" value={outRoleTitle} onChange={(e) => setOutRoleTitle(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Research &amp; Outreach Notes</span>
              <input className="input" value={outNotes} onChange={(e) => setOutNotes(e.target.value)} placeholder="Hiring 4 remote engineers; contacted VP Engineering on LinkedIn" />
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              Save Prospect to CRM
            </button>
          </div>
        </form>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="grid grid-5" style={{ gap: 10 }}>
          <input
            className="input"
            placeholder="Search name, email, org, ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select className="select" value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}>
            <option value="">All Tracks</option>
            {PROGRAMME_TRACKS.map((t) => (
              <option key={t.code} value={t.code}>{t.title}</option>
            ))}
          </select>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Stages</option>
            {Object.entries(CRM_STAGE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          <select className="select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {PROGRAMME_DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.code}>{d.letter}. {d.name}</option>
            ))}
            <option value="EXTERNAL_PARTNER">External Partner</option>
          </select>
          <select className="select" value={marketFilter} onChange={(e) => setMarketFilter(e.target.value)}>
            <option value="">All Markets</option>
            <option value="US">United States</option>
            <option value="UK">United Kingdom</option>
            <option value="AFRICA">Africa</option>
            <option value="GLOBAL">Global</option>
          </select>
        </div>
      </div>

      <div className={selected ? 'grid grid-2' : ''} style={{ gap: 16, alignItems: 'start' }}>
        <div className="panel" style={{ overflowX: 'auto' }}>
          {loading ? (
            <p className="muted" style={{ fontSize: 13.5 }}>Loading CRM records…</p>
          ) : items.length === 0 ? (
            <p className="muted" style={{ fontSize: 13.5 }}>No matching applications or partner leads yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Applicant / Organization</th>
                  <th>Track &amp; Role</th>
                  <th>Stage</th>
                  <th>Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{item.reference_code}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.organization_name || item.applicant_name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {item.applicant_email} · {item.partnership_market || item.country}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      <div>
                        <span className={`badge ${item.priority_band === 'TOP_PRIORITY' ? 'badge-accent' : 'badge-neutral'}`}>
                          {item.track}
                        </span>
                        {item.partnership_verified && (
                          <span className="badge badge-success" style={{ marginLeft: 4 }}>Verified Partner</span>
                        )}
                      </div>
                      <div style={{ marginTop: 4 }}>{item.role_title}</div>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{CRM_STAGE_LABELS[item.status] ?? item.status}</span>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDetail(item)}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <span className="mono muted" style={{ fontSize: 12 }}>{selected.reference_code}</span>
                <h2 style={{ fontSize: 18, margin: '2px 0' }}>{selected.organization_name || selected.applicant_name}</h2>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
              <div><strong>Contact:</strong> {selected.applicant_name} ({selected.applicant_email}) {selected.applicant_phone ? `· ${selected.applicant_phone}` : ''}</div>
              <div><strong>Location / Market:</strong> {selected.city ? `${selected.city}, ` : ''}{selected.country} {selected.partnership_market ? `(${selected.partnership_market})` : ''}</div>
              <div><strong>Role / Arrangement:</strong> {selected.role_title} ({selected.arrangement})</div>
              {selected.linkedin_url && (
                <div><strong>LinkedIn:</strong> <a href={selected.linkedin_url} target="_blank" rel="noreferrer">{selected.linkedin_url}</a></div>
              )}
              {selected.portfolio_url && (
                <div><strong>Portfolio:</strong> <a href={selected.portfolio_url} target="_blank" rel="noreferrer">{selected.portfolio_url}</a></div>
              )}
              {selected.resume_url && (
                <div><strong>CV Link:</strong> <a href={selected.resume_url} target="_blank" rel="noreferrer">{selected.resume_url}</a></div>
              )}
              {selected.organization_website && (
                <div><strong>Website:</strong> <a href={selected.organization_website} target="_blank" rel="noreferrer">{selected.organization_website}</a></div>
              )}
              <div style={{ marginTop: 8, background: 'var(--bg-subtle)', padding: 10, borderRadius: 8 }}>
                <strong>Experience / Organization Profile:</strong>
                <p style={{ margin: '4px 0 8px', whiteSpace: 'pre-wrap' }}>{selected.experience_summary}</p>
                <strong>60-Day Contribution / Proposed Collaboration:</strong>
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{selected.motivation_statement}</p>
              </div>
            </div>

            {statusMsg && (
              <div className={`alert ${statusMsg.kind === 'ok' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 12 }}>
                {statusMsg.text}
              </div>
            )}

            {canManage && (
              <form onSubmit={saveChanges} style={{ display: 'grid', gap: 10 }}>
                <div className="grid grid-2" style={{ gap: 10 }}>
                  <label className="field">
                    <span className="label">CRM Stage</span>
                    <select className="select" value={editStatus} onChange={(e) => setEditStatus(e.target.value as CrmStage)}>
                      {Object.entries(CRM_STAGE_LABELS).map(([code, label]) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Priority Band</span>
                    <select
                      className="select"
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as 'TOP_PRIORITY' | 'HIGH' | 'MEDIUM' | 'LOW')}
                    >
                      <option value="TOP_PRIORITY">Top Priority (Wave 1-5)</option>
                      <option value="HIGH">High</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LOW">Low</option>
                    </select>
                  </label>

                  <label className="field">
                    <span className="label">Next Follow-Up Date</span>
                    <input type="date" className="input" value={editFollowUp} onChange={(e) => setEditFollowUp(e.target.value)} />
                  </label>

                  <label className="field">
                    <span className="label">60-Day Review Date</span>
                    <input type="date" className="input" value={editReview60d} onChange={(e) => setEditReview60d(e.target.value)} />
                  </label>
                </div>

                {selected.track === 'PARTNER' && (
                  <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600 }}>
                      <input type="checkbox" checked={editVerified} onChange={(e) => setEditVerified(e.target.checked)} />
                      <span>Count as Documented Active Partnership (Scorecard Verified)</span>
                    </label>
                    {editVerified && (
                      <div className="grid grid-2" style={{ gap: 8, marginTop: 8 }}>
                        <label className="field">
                          <span className="label">Documented Verification Basis *</span>
                          <select className="select" value={verificationBasis} onChange={(e) => setVerificationBasis(e.target.value)}>
                            <option value="SIGNED_MOU_OR_PILOT">1. Signed Partnership / Pilot MoU</option>
                            <option value="EMPLOYER_ACCOUNT_CREATED">2. Employer Account Created on Jobiest</option>
                            <option value="ACTIVE_VACANCY_SHARED">3. Active Vacancy Shared for Candidate Sourcing</option>
                            <option value="RECRUITMENT_AGENCY_COLLAB">4. Recruitment Agency Collaboration Agreement</option>
                            <option value="WRITTEN_PILOT_CONFIRMATION">5. Written Pilot Confirmation from Decision-Maker</option>
                          </select>
                        </label>
                        <label className="field">
                          <span className="label">Decision-Maker Contact *</span>
                          <input className="input" required value={editDecisionMaker} onChange={(e) => setEditDecisionMaker(e.target.value)} />
                        </label>
                      </div>
                    )}
                  </div>
                )}

                <label className="field">
                  <span className="label">Internal CRM Notes</span>
                  <textarea className="input" rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                </label>

                <label className="field">
                  <span className="label">Add Timeline Event Note (optional)</span>
                  <input className="input" value={timelineNote} onChange={(e) => setTimelineNote(e.target.value)} placeholder="e.g. Completed 20-min discovery call; agreed on 2-role pilot" />
                </label>

                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  {saving ? 'Saving…' : 'Save CRM Update'}
                </button>
              </form>
            )}

            {events.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <strong style={{ fontSize: 13 }}>CRM Timeline</strong>
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 6 }}>
                  {events.map((ev) => (
                    <li key={ev.id} style={{ fontSize: 12.5, padding: '6px 8px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
                      <strong>{ev.event_type}</strong> {ev.to_status ? `(${ev.to_status})` : ''} ·{' '}
                      <span className="muted">{new Date(ev.created_at).toLocaleString()}</span>
                      {ev.note && <div style={{ marginTop: 2 }}>{ev.note}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
