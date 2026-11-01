'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminRadarSweepAndExclusionClient({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [patternType, setPatternType] = useState<'DOMAIN' | 'URL_PREFIX' | 'EMPLOYER_SLUG' | 'ATS_BOARD'>('DOMAIN');
  const [patternValue, setPatternValue] = useState('');
  const [reason, setReason] = useState<'EMPLOYER_OPT_OUT' | 'CONFIRMED_SCAM_DOMAIN' | 'LEGAL_TAKEDOWN' | 'ADMIN_BLOCK'>(
    'EMPLOYER_OPT_OUT',
  );

  async function triggerSweep() {
    setBusy(true);
    setStatusMsg('Running bounded ATS compliance & ingestion sweep...');
    try {
      const res = await fetch('/api/admin/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_sweep', maxSources: 4 }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        sweep?: { sourcesPolled: number; upsertedCount: number; migrationPending: boolean };
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setStatusMsg(json.error ?? 'Sweep request failed.');
      } else if (json.sweep?.migrationPending) {
        setStatusMsg('Radar database tables are awaiting SQL bundle activation (053 to 056).');
      } else {
        setStatusMsg(
          `Sweep complete: polled ${json.sweep?.sourcesPolled ?? 0} compliant boards, canonicalized ${json.sweep?.upsertedCount ?? 0} openings.`,
        );
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function triggerFullCycle() {
    setBusy(true);
    setStatusMsg('Running full Intelligence Network cycle (Scout, Promote, Poll, Alerts)...');
    try {
      const res = await fetch('/api/admin/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_autonomous_cycle', maxSources: 5 }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        cycle?: {
          scoutedCandidatesQueued: number;
          candidatesAutoPromoted: number;
          atsSourcesPolled: number;
          careerPagesPolled: number;
          totalJobsUpserted: number;
          alerts: { usersNotified: number };
        };
        error?: string;
      };
      if (!res.ok || !json.ok || !json.cycle) {
        setStatusMsg(json.error ?? 'Network cycle failed.');
      } else {
        setStatusMsg(
          `Cycle complete: queued ${json.cycle.scoutedCandidatesQueued} new sources, promoted ${json.cycle.candidatesAutoPromoted}, polled ${json.cycle.atsSourcesPolled + json.cycle.careerPagesPolled} sources (${json.cycle.totalJobsUpserted} openings), alerted ${json.cycle.alerts.usersNotified} subscribers.`,
        );
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function addExclusion(e: React.FormEvent) {
    e.preventDefault();
    if (!patternValue.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_exclusion',
          patternType,
          patternValue: patternValue.trim(),
          reason,
        }),
      });
      if (res.ok) {
        setPatternValue('');
        setStatusMsg('Exclusion rule recorded and enforced immediately.');
        router.refresh();
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setStatusMsg(j.error ?? 'Could not save exclusion rule.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
        <button type="button" className="btn" disabled={busy || disabled} onClick={() => void triggerSweep()}>
          {busy ? 'Running...' : 'Run bounded Radar sweep'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy || disabled} onClick={() => void triggerFullCycle()}>
          {busy ? 'Running...' : 'Run full Network cycle'}
        </button>
        {statusMsg && (
          <span className="muted" style={{ fontSize: 13.5 }} role="status">
            {statusMsg}
          </span>
        )}
      </div>

      <form onSubmit={(e) => void addExclusion(e)} className="ad-form" aria-label="Add opt-out or takedown exclusion">
        <div>
          <label htmlFor="rx-type">Exclusion Scope</label>
          <select
            id="rx-type"
            value={patternType}
            onChange={(e) => setPatternType(e.target.value as typeof patternType)}
            disabled={busy || disabled}
          >
            <option value="DOMAIN">Domain</option>
            <option value="EMPLOYER_SLUG">Employer Slug</option>
            <option value="ATS_BOARD">ATS Board</option>
            <option value="URL_PREFIX">URL Prefix</option>
          </select>
        </div>
        <div>
          <label htmlFor="rx-val">Pattern Value</label>
          <input
            id="rx-val"
            placeholder="example.com or greenhouse:slug"
            value={patternValue}
            onChange={(e) => setPatternValue(e.target.value)}
            disabled={busy || disabled}
            required
          />
        </div>
        <div>
          <label htmlFor="rx-reason">Compliance Reason</label>
          <select
            id="rx-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            disabled={busy || disabled}
          >
            <option value="EMPLOYER_OPT_OUT">Employer Opt-Out</option>
            <option value="CONFIRMED_SCAM_DOMAIN">Confirmed Scam Domain</option>
            <option value="LEGAL_TAKEDOWN">Legal Takedown</option>
            <option value="ADMIN_BLOCK">Admin Block</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" className="btn btn-ghost" disabled={busy || disabled}>
            Enforce exclusion
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdminRadarCandidateDecisionButtons({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function review(decision: 'PROMOTE' | 'REJECT_COMPLIANCE' | 'REJECT_DEAD') {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review_candidate', candidateId, decision }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void review('PROMOTE')}>
        Promote
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => void review('REJECT_COMPLIANCE')}
      >
        Block ToS
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => void review('REJECT_DEAD')}
      >
        Dead
      </button>
    </div>
  );
}
