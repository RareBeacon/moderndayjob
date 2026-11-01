'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CandidateRadarAlertSettings } from '@/lib/radar/alerts/dispatcher';
import type { AssistedPreparationPack } from '@/lib/radar/forms/assisted-prep';
import type { RankedPublicRadarOpportunity } from '@/lib/radar/matching/semantic-matcher';
import type { WorkplaceType } from '@/lib/radar/types';

interface Props {
  initialOpportunities: RankedPublicRadarOpportunity[];
  initialAlerts: CandidateRadarAlertSettings;
  migrationPending: boolean;
}

function exclusivityLabel(tier: string, leadHours: number | null): string {
  if (tier === 'FIRST_PARTY_EXCLUSIVE') return 'Posted directly on Jobiest';
  if (tier === 'FIRST_MOVER_EXCLUSIVE') {
    return leadHours && leadHours > 0
      ? `First-Mover (${leadHours}h ahead of feeds)`
      : 'First-Mover Direct';
  }
  if (tier === 'EARLY_DIRECT') return 'Early Direct Employer';
  return 'Public Feed';
}

function verificationBadgeLabel(status: string): string {
  if (status === 'VERIFIED_HIGH_TRUST') return 'Verified High-Trust';
  if (status === 'VERIFIED_STANDARD') return 'Verified Employer Source';
  if (status === 'UNVERIFIED_EXTERNAL_FORM') return 'External Form - Human Review Required';
  return 'Pending Verification';
}

export function OpportunitiesClient({
  initialOpportunities,
  initialAlerts,
  migrationPending,
}: Props) {
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [query, setQuery] = useState('');
  const [workplace, setWorkplace] = useState<'' | WorkplaceType>('');
  const [exclusivityOnly, setExclusivityOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [alerts, setAlerts] = useState(initialAlerts);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [alertStatus, setAlertStatus] = useState('');

  const [activePrepJobId, setActivePrepJobId] = useState<string | null>(null);
  const [prepByJobId, setPrepByJobId] = useState<Record<string, AssistedPreparationPack>>({});
  const [prepBusyId, setPrepBusyId] = useState<string | null>(null);
  const [prepError, setPrepError] = useState('');

  async function runSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setLoadingSearch(true);
    try {
      const sp = new URLSearchParams();
      if (query.trim()) sp.set('q', query.trim());
      if (workplace) sp.set('workplace', workplace);
      if (exclusivityOnly) sp.set('exclusivityOnly', '1');
      if (verifiedOnly) sp.set('verifiedOnly', '1');
      sp.set('limit', '35');

      const res = await fetch(`/api/radar/opportunities?${sp.toString()}`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        opportunities?: RankedPublicRadarOpportunity[];
      };
      if (Array.isArray(json.opportunities)) {
        setOpportunities(json.opportunities);
      }
    } finally {
      setLoadingSearch(false);
    }
  }

  async function saveAlerts(next: CandidateRadarAlertSettings) {
    setAlerts(next);
    setSavingAlerts(true);
    setAlertStatus('');
    try {
      const res = await fetch('/api/radar/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: next.enabled,
          exclusivityOnly: next.exclusivityOnly,
          minConfidence: next.minConfidence,
          workplaceTypes: next.workplaceTypes,
          targetRoles: next.targetRoles,
          countryCodes: next.countryCodes,
          frequency: next.frequency,
          emailEnabled: next.emailEnabled,
        }),
      });
      if (res.ok) {
        setAlertStatus('Radar alert preferences saved.');
      } else {
        setAlertStatus('Could not save alert settings right now.');
      }
    } finally {
      setSavingAlerts(false);
    }
  }

  async function generatePrepPack(jobId: string) {
    setActivePrepJobId(jobId);
    setPrepBusyId(jobId);
    setPrepError('');
    try {
      const res = await fetch(`/api/radar/opportunities/${jobId}/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', useAiPitch: true }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        pack?: AssistedPreparationPack | null;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.pack) {
        setPrepError(json.error ?? 'Could not prepare this application pack right now.');
        return;
      }
      setPrepByJobId((prev) => ({ ...prev, [jobId]: json.pack! }));
    } finally {
      setPrepBusyId(null);
    }
  }

  async function confirmHumanReview(jobId: string) {
    setPrepBusyId(jobId);
    try {
      const res = await fetch(`/api/radar/opportunities/${jobId}/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_human_review' }),
      });
      const json = (await res.json()) as { ok?: boolean; approvedAt?: string | null };
      if (res.ok && json.ok) {
        setPrepByJobId((prev) => {
          const cur = prev[jobId];
          if (!cur) return prev;
          return {
            ...prev,
            [jobId]: {
              ...cur,
              status: 'APPROVED_BY_USER',
              humanApprovedAt: json.approvedAt ?? new Date().toISOString(),
            },
          };
        });
      }
    } finally {
      setPrepBusyId(null);
    }
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', display: 'grid', gap: 20 }}>
      <section
        style={{
          padding: 20,
          borderRadius: 12,
          border: '1px solid var(--line, #e2e8f0)',
          background: 'var(--surface, #ffffff)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>
              First-Mover Job Radar
            </h1>
            <p className="muted" style={{ margin: 0, maxWidth: 680, fontSize: 14.5 }}>
              Verified openings discovered directly from official employer ATS boards, corporate career pages, and
              Jobiest employers before conventional job boards syndicate them.
            </p>
          </div>
          <Link href="/profile" className="btn btn-ghost">
            Tune career profile
          </Link>
        </div>

        <form
          onSubmit={(e) => void runSearch(e)}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginTop: 18,
            alignItems: 'end',
          }}
        >
          <div>
            <label htmlFor="radar-q" style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>
              Role or employer
            </label>
            <input
              id="radar-q"
              type="search"
              placeholder="e.g. Backend Engineer, Designer"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label htmlFor="radar-wp" style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>
              Workplace mode
            </label>
            <select
              id="radar-wp"
              value={workplace}
              onChange={(e) => setWorkplace(e.target.value as '' | WorkplaceType)}
              style={{ width: '100%' }}
            >
              <option value="">All modes</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ONSITE">Onsite</option>
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, paddingBottom: 8 }}>
            <input
              type="checkbox"
              checked={exclusivityOnly}
              onChange={(e) => setExclusivityOnly(e.target.checked)}
            />
            First-Mover &amp; Direct only
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, paddingBottom: 8 }}>
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
            />
            Verified employers only
          </label>

          <div>
            <button type="submit" className="btn" disabled={loadingSearch} style={{ width: '100%' }}>
              {loadingSearch ? 'Searching...' : 'Search Radar'}
            </button>
          </div>
        </form>
      </section>

      <section
        style={{
          padding: '16px 20px',
          borderRadius: 12,
          border: '1px solid var(--line, #e2e8f0)',
          background: 'var(--surface, #ffffff)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong style={{ fontSize: 15 }}>First-Mover Radar Alerts</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            Get notified when Jobiest verifies a high-confidence direct opening matching your target roles.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={alerts.enabled}
              disabled={savingAlerts || migrationPending}
              onChange={(e) =>
                void saveAlerts({
                  ...alerts,
                  enabled: e.target.checked,
                  frequency: e.target.checked && alerts.frequency === 'PAUSED' ? 'DAILY' : alerts.frequency,
                })
              }
            />
            Enable alerts
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={alerts.exclusivityOnly}
              disabled={savingAlerts || !alerts.enabled}
              onChange={(e) => void saveAlerts({ ...alerts, exclusivityOnly: e.target.checked })}
            />
            Direct exclusives only
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={alerts.emailEnabled}
              disabled={savingAlerts || !alerts.enabled}
              onChange={(e) => void saveAlerts({ ...alerts, emailEnabled: e.target.checked })}
            />
            Email digest
          </label>
          {alertStatus && (
            <span className="muted" style={{ fontSize: 12.5 }} role="status">
              {alertStatus}
            </span>
          )}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 14 }}>
        {opportunities.length === 0 && (
          <div
            style={{
              padding: 28,
              borderRadius: 12,
              border: '1px solid var(--line, #e2e8f0)',
              textAlign: 'center',
            }}
          >
            <strong style={{ display: 'block', marginBottom: 6 }}>
              No matching verified Radar opportunities right now
            </strong>
            <span className="muted" style={{ fontSize: 14 }}>
              Broaden your filters or enable First-Mover Radar Alerts above so we notify you as soon as new direct
              employer openings land.
            </span>
          </div>
        )}

        {opportunities.map((rankedItem) => {
          const opp = rankedItem.opportunity;
          const prep = prepByJobId[opp.id];
          const isExpanded = activePrepJobId === opp.id;
          const isBusy = prepBusyId === opp.id;

          return (
            <article
              key={opp.id}
              style={{
                padding: 20,
                borderRadius: 12,
                border: '1px solid var(--line, #e2e8f0)',
                background: 'var(--surface, #ffffff)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: 'rgba(16, 185, 129, 0.12)',
                      }}
                    >
                      {exclusivityLabel(opp.exclusivityTier, null)}
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        padding: '3px 8px',
                        borderRadius: 999,
                        border: '1px solid var(--line, #cbd5e1)',
                      }}
                    >
                      {verificationBadgeLabel(opp.trust.verificationStatus)}
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        padding: '3px 8px',
                        borderRadius: 999,
                        border: '1px solid var(--line, #cbd5e1)',
                      }}
                    >
                      {opp.workplaceType}
                      {opp.location ? ` · ${opp.location}` : ''}
                    </span>
                  </div>

                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>{opp.title}</h2>
                  <div className="muted" style={{ fontSize: 14 }}>
                    {opp.companyName}
                    {opp.salary
                      ? ` · ${opp.salary.currency ?? ''} ${opp.salary.min ?? ''} - ${opp.salary.max ?? ''} (${opp.salary.period ?? 'YEAR'})`
                      : ''}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{rankedItem.matchScore}% match</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Trust band: {opp.trust.confidenceBand}
                  </div>
                </div>
              </div>

              {rankedItem.matchReasons.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {rankedItem.matchReasons.map((reason, idx) => (
                    <span key={idx} className="muted" style={{ fontSize: 12.5 }}>
                      • {reason}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={isBusy}
                  onClick={() => void generatePrepPack(opp.id)}
                >
                  {isBusy ? 'Preparing pack...' : prep ? 'Refresh Assisted Pack' : 'Prepare Assisted Pack'}
                </button>
                <a
                  href={opp.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost"
                >
                  Open official posting
                </a>
                <Link
                  href={`/applications?openTarget=1&url=${encodeURIComponent(opp.applyUrl)}&title=${encodeURIComponent(opp.title)}&company=${encodeURIComponent(opp.companyName)}`}
                  className="btn btn-ghost"
                >
                  Track in Applications
                </Link>
              </div>

              {isExpanded && prepError && (
                <div style={{ marginTop: 12, fontSize: 13.5, color: '#b91c1c' }} role="alert">
                  {prepError}
                </div>
              )}

              {prep && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 16,
                    borderRadius: 10,
                    border: '1px solid var(--line, #cbd5e1)',
                    background: 'rgba(248, 250, 252, 0.7)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginBottom: 10,
                    }}
                  >
                    <strong>Assisted Application Prep Pack (Human Review Mandatory)</strong>
                    <span style={{ fontSize: 12.5 }}>
                      Status:{' '}
                      <strong>
                        {prep.status === 'APPROVED_BY_USER'
                          ? 'Reviewed & Approved by You'
                          : 'Awaiting Your Review'}
                      </strong>
                    </span>
                  </div>

                  <p style={{ fontSize: 13.5, margin: '0 0 12px' }}>
                    <strong>Tailored Introduction:</strong> {prep.tailoredPitch}
                  </p>

                  {prep.draftAnswers.length > 0 && (
                    <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                      {prep.draftAnswers.map((ans) => (
                        <div
                          key={ans.questionId}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--line, #e2e8f0)',
                            background: '#ffffff',
                            fontSize: 13,
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            {ans.questionLabel}
                            {ans.required ? ' *' : ''}
                          </div>
                          <div className="muted" style={{ marginTop: 2 }}>
                            {ans.suggestedAnswer ?? '[Fill directly on official form before submitting]'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {prep.safetyNotes.length > 0 && (
                    <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12.5 }} className="muted">
                      {prep.safetyNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  )}

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {prep.status !== 'APPROVED_BY_USER' && (
                      <button
                        type="button"
                        className="btn"
                        disabled={isBusy}
                        onClick={() => void confirmHumanReview(opp.id)}
                      >
                        Confirm I reviewed these answers
                      </button>
                    )}
                    <a
                      href={prep.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost"
                    >
                      Continue to official form to submit
                    </a>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
