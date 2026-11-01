'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { getAuthorizedCandidateDetailForEmployer } from '@/lib/talent-pool/recruiter-service';
import { safeExternalHref } from '@/lib/security/safe-url';
import styles from './talent-pool.module.css';

const PIPELINE_STAGES = [
  'SHORTLISTED',
  'CONTACT_REQUESTED',
  'IN_CONVERSATION',
  'INTERVIEWING',
  'OFFER_EXTENDED',
  'HIRED',
  'ARCHIVED',
] as const;

type CandidateDetail = Awaited<ReturnType<typeof getAuthorizedCandidateDetailForEmployer>>;

interface CandidateDetailProps {
  candidate: CandidateDetail;
  shortlists: Array<{ id: string; name: string }>;
  vacancies: Array<{ id: string; title: string }>;
}

export function EmployerCandidateDetailClient({
  candidate,
  shortlists,
  vacancies,
}: CandidateDetailProps) {
  const [requestType, setRequestType] = useState<'CONTACT_REQUEST' | 'INTERVIEW_INVITATION'>(
    'INTERVIEW_INVITATION',
  );
  const [roleTitle, setRoleTitle] = useState('');
  const [vacancyId, setVacancyId] = useState('');
  const [proposedComp, setProposedComp] = useState('');
  const [message, setMessage] = useState('');
  const [selectedShortlist, setSelectedShortlist] = useState(shortlists[0]?.id ?? '');
  const [pipelineStage, setPipelineStage] = useState<(typeof PIPELINE_STAGES)[number]>('SHORTLISTED');
  const [reportReason, setReportReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadCv() {
    setError(null);
    const res = await fetch(`/api/employer/candidates/${candidate.candidate_user_id}/cv`);
    const json = await res.json().catch(() => null);
    if (!res.ok || !(json?.signedUrl || json?.url)) {
      setError(json?.message || json?.error || 'CV download is not permitted for this candidate.');
      return;
    }
    window.open(json.signedUrl ?? json.url, '_blank', 'noopener,noreferrer');
  }

  async function addToShortlist() {
    if (!selectedShortlist) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/employer/shortlists/${selectedShortlist}/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_user_id: candidate.candidate_user_id }),
    });
    setBusy(false);
    if (res.ok) setBanner('Candidate added to shortlist.');
    else setError('Could not add candidate to shortlist.');
  }

  async function updatePipeline() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/employer/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_user_id: candidate.candidate_user_id,
        vacancy_id: vacancyId || null,
        stage: pipelineStage,
      }),
    });
    setBusy(false);
    if (res.ok) setBanner(`Pipeline stage updated to ${pipelineStage}.`);
    else setError('Could not update pipeline stage.');
  }

  async function sendOutreach(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setBanner(null);
    const res = await fetch('/api/employer/contact-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_user_id: candidate.candidate_user_id,
        vacancy_id: vacancyId || null,
        request_type: requestType,
        role_title: roleTitle.trim(),
        message: message.trim(),
        compensation_range: proposedComp.trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(json?.message || json?.error || 'Could not send request.');
      return;
    }
    setBanner('Outreach sent. Direct messaging opens once the candidate accepts.');
    setMessage('');
  }

  async function submitReport() {
    if (reportReason.trim().length < 10) {
      setError('Provide at least 10 characters describing the issue.');
      return;
    }
    const res = await fetch('/api/talent-pool/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_user_id: candidate.candidate_user_id,
        reason_category: 'MISREPRESENTATION',
        details: reportReason.trim(),
      }),
    });
    if (res.ok) {
      setReportReason('');
      setBanner('Concern submitted to Jobiest Trust & Safety.');
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.statusHeader}>
          <div>
            <div className={styles.eyebrow}>Verified Candidate Profile</div>
            <h1 className={styles.heroTitle}>{candidate.display_name}</h1>
            <p className={styles.heroLead}>
              {candidate.headline || 'Verified Specialist'} · {candidate.location || 'Remote'}
              {candidate.country ? `, ${candidate.country}` : ''}
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link href="/employer" className={styles.btnSecondary}>
              Back to Discovery
            </Link>
            {candidate.cv_permitted && (
              <button type="button" onClick={() => void downloadCv()} className={styles.btnPrimary}>
                Download Authorized CV
              </button>
            )}
          </div>
        </div>
      </section>

      {banner && <div className={styles.alertSuccess}>{banner}</div>}
      {error && <div className={styles.alertError}>{error}</div>}

      <div className={styles.grid2}>
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Professional Summary &amp; Preferences</h2>
          <p className={styles.cardBody}>
            {candidate.summary || 'Approved Jobiest Talent Pool member.'}
          </p>
          <div className={styles.tagRow} style={{ marginTop: 12 }}>
            {candidate.career_category && <span className={styles.tag}>{candidate.career_category}</span>}
            {candidate.seniority_level && <span className={styles.tag}>{candidate.seniority_level}</span>}
            {candidate.years_of_experience != null && (
              <span className={styles.tag}>{candidate.years_of_experience} yrs exp</span>
            )}
            {candidate.availability && <span className={styles.tag}>{candidate.availability}</span>}
            {candidate.remote_types.map((m) => (
              <span key={m} className={styles.tag}>{m}</span>
            ))}
          </div>
          <p className={styles.cardBody} style={{ marginTop: 12 }}>
            {candidate.work_authorization && (
              <>
                <strong>Work authorization:</strong> {candidate.work_authorization}
                <br />
              </>
            )}
            <strong>Target roles:</strong> {candidate.target_roles.join(', ') || 'Open'}
            {candidate.salary_min != null && (
              <>
                <br />
                <strong>Compensation range:</strong> {candidate.salary_currency}{' '}
                {candidate.salary_min.toLocaleString()} to{' '}
                {(candidate.salary_max ?? candidate.salary_min).toLocaleString()}
              </>
            )}
          </p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Verified Assessment Summary</h2>
          {candidate.assessment && (
            <>
              <p className={styles.cardTitle}>
                Verified Score: {Math.round(candidate.assessment.overall_score)} / 100 ·{' '}
                {candidate.assessment.calibrated_level}
              </p>
              <p className={styles.cardBody} style={{ marginTop: 8 }}>
                {candidate.assessment.recruiter_summary}
              </p>
              <div className={styles.tagRow} style={{ marginTop: 12 }}>
                {candidate.assessment.competency_scores.map((dim) => (
                  <span key={dim.dimension_key} className={styles.tag}>
                    {dim.dimension_label}: {Math.round(dim.score)}/100
                  </span>
                ))}
              </div>
            </>
          )}
          <div className={styles.tagRow} style={{ marginTop: 12 }}>
            {candidate.skills.map((s) => (
              <span key={s} className={styles.tag}>{s}</span>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Employment History &amp; Education</h2>
          {(candidate.experience as Array<Record<string, unknown>>).map((item, idx) => (
            <div key={idx} style={{ marginBottom: 12 }}>
              <div className={styles.cardTitle}>
                {String(item.title || 'Role')} · {String(item.company || '')}
              </div>
              <div className={styles.cardBody}>{String(item.description || '')}</div>
            </div>
          ))}
          {(candidate.education as Array<Record<string, unknown>>).map((edu, idx) => (
            <div key={idx} className={styles.cardBody}>
              <strong>{String(edu.qualification || '')}</strong> · {String(edu.institution || '')}
            </div>
          ))}
          {(() => {
            const safePortfolio = safeExternalHref(candidate.portfolio_url);
            return safePortfolio ? (
              <div className={styles.tagRow} style={{ marginTop: 10 }}>
                <a
                  href={safePortfolio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.tag}
                >
                  Portfolio Website
                </a>
              </div>
            ) : null;
          })()}
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Shortlist &amp; Hiring Pipeline</h2>
          <div className={styles.formGrid}>
            {shortlists.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label}>Add to shortlist</label>
                <select className={styles.select} value={selectedShortlist} onChange={(e) => setSelectedShortlist(e.target.value)}>
                  {shortlists.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => void addToShortlist()} disabled={busy} className={styles.btnSecondary}>
                  Add to Shortlist
                </button>
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.label}>Pipeline stage</label>
              <select
                className={styles.select}
                value={pipelineStage}
                onChange={(e) => setPipelineStage(e.target.value as (typeof PIPELINE_STAGES)[number])}
              >
                {PIPELINE_STAGES.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              <button type="button" onClick={() => void updatePipeline()} disabled={busy} className={styles.btnSecondary}>
                Save Pipeline Stage
              </button>
            </div>
          </div>
        </section>
      </div>

      <form onSubmit={sendOutreach} className={styles.card}>
        <h2 className={styles.sectionTitle}>Request Contact or Invite to Interview</h2>
        <p className={styles.sectionSub}>
          Candidate private contact details remain protected until the candidate accepts your invitation.
        </p>
        <div className={styles.formGrid} style={{ marginTop: 14 }}>
          <div className={styles.field}>
            <label className={styles.label}>Request type</label>
            <select
              className={styles.select}
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as 'CONTACT_REQUEST' | 'INTERVIEW_INVITATION')}
            >
              <option value="INTERVIEW_INVITATION">Interview Invitation</option>
              <option value="CONTACT_REQUEST">Direct Contact Request</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Role title</label>
            <input className={styles.input} required placeholder="Senior Backend Engineer" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Link to vacancy (optional)</label>
            <select className={styles.select} value={vacancyId} onChange={(e) => setVacancyId(e.target.value)}>
              <option value="">General Outreach</option>
              {vacancies.map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Proposed compensation range (optional)</label>
            <input className={styles.input} placeholder="USD 110,000 - 140,000 + equity" value={proposedComp} onChange={(e) => setProposedComp(e.target.value)} />
          </div>
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label className={styles.label}>Role context and next steps (min 20 characters)</label>
            <textarea className={styles.textarea} required minLength={20} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
        <div className={styles.heroActions} style={{ marginTop: 14 }}>
          <button
            type="submit"
            disabled={busy || !candidate.allow_contact_requests}
            className={styles.btnPrimary}
          >
            Send Opportunity Request
          </button>
        </div>
      </form>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Trust &amp; Safety Report</h2>
        <div className={styles.heroActions}>
          <input
            className={styles.input}
            style={{ flex: 1 }}
            placeholder="Report profile inaccuracy or policy concern (min 10 chars)"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
          />
          <button type="button" onClick={() => void submitReport()} className={styles.btnDanger}>
            Report Concern
          </button>
        </div>
      </section>
    </div>
  );
}
