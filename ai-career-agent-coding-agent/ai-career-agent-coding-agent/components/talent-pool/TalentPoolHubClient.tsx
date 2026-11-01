'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  TALENT_DISPLAY_STATUSES,
  TALENT_STATUS_META,
  type TalentDisplayStatus,
} from '@/lib/talent-pool/constants';
import type { CandidateTalentPoolOverview } from '@/lib/talent-pool/candidate-service';
import styles from './talent-pool.module.css';

interface Props {
  initialOverview: CandidateTalentPoolOverview;
  planCode: string;
}

const EXPLAINER_ITEMS = [
  {
    title: 'What Jobiest Talent Pool is',
    body: 'A curated, competence-verified talent network built into Jobiest. Participation is free on every plan, including Free accounts.',
  },
  {
    title: 'How you become discoverable',
    body: 'Confirm your career profile, grant explicit per-purpose consent, complete a structured role assessment, and pass human review before any employer sees your profile.',
  },
  {
    title: 'Why employers use Jobiest',
    body: 'Verified hiring teams filter by real experience, role-specific competency scores, availability, and work preferences instead of keyword-stuffed resumes.',
  },
  {
    title: 'What the assessment involves',
    body: 'A 15 to 25 minute conversational voice and video interview tailored to your career category and seniority, with an accessible written route if you cannot use audio or video.',
  },
  {
    title: 'How candidates are evaluated',
    body: 'Structured rubrics measure role execution, problem decomposition, communication clarity, and consistency with your profile. Human reviewers make every approval decision.',
  },
  {
    title: 'How opportunities reach you',
    body: 'Verified employers send structured contact requests or interview invitations inside Jobiest. You choose whether to accept, decline, share your CV, or pause visibility.',
  },
];

export function TalentPoolHubClient({ initialOverview, planCode }: Props) {
  const router = useRouter();
  const [overview, setOverview] = useState<CandidateTalentPoolOverview>(initialOverview);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsBanner, setPrefsBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [blockedInput, setBlockedInput] = useState(
    initialOverview.preferences.blocked_employer_domains.join(', '),
  );
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [startingInterview, setStartingInterview] = useState(false);

  const statusMeta = TALENT_STATUS_META[overview.displayStatus] ?? TALENT_STATUS_META.NOT_APPLIED;
  const activeApp = overview.activeApplication;
  const activeSession = activeApp?.latest_session ?? null;

  const canApplyOrUpdate =
    overview.displayStatus === 'NOT_APPLIED' ||
    overview.displayStatus === 'PROFILE_INCOMPLETE' ||
    overview.displayStatus === 'WITHDRAWN' ||
    overview.displayStatus === 'REASSESSMENT_REQUESTED';

  const canLaunchOrResumeInterview =
    overview.displayStatus === 'APPLICATION_SUBMITTED' ||
    overview.displayStatus === 'ASSESSMENT_PENDING' ||
    overview.displayStatus === 'INTERVIEW_SCHEDULED' ||
    overview.displayStatus === 'ASSESSMENT_IN_PROGRESS';

  async function refreshOverview() {
    const res = await fetch('/api/talent-pool/overview');
    if (res.ok) {
      const next = (await res.json()) as CandidateTalentPoolOverview;
      setOverview(next);
      setBlockedInput(next.preferences.blocked_employer_domains.join(', '));
    }
  }

  async function handleStartOrResumeAssessment() {
    if (!activeApp) return;
    if (activeSession && activeSession.state !== 'CANCELLED' && activeSession.state !== 'FAILED') {
      router.push(`/talent-pool/interview/${activeSession.id}`);
      return;
    }
    setStartingInterview(true);
    setPrefsBanner(null);
    try {
      const res = await fetch('/api/talent-pool/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: activeApp.id,
          mode: activeApp.assessment_route,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { sessionId?: string; message?: string };
      if (res.ok && json.sessionId) {
        router.push(`/talent-pool/interview/${json.sessionId}`);
      } else {
        setPrefsBanner({ kind: 'err', text: json.message ?? 'Could not open assessment session.' });
      }
    } finally {
      setStartingInterview(false);
    }
  }

  async function handleSavePreferences(patch: Partial<CandidateTalentPoolOverview['preferences']>) {
    setSavingPrefs(true);
    setPrefsBanner(null);
    try {
      const domains =
        patch.blocked_employer_domains ??
        blockedInput
          .split(',')
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean);

      const res = await fetch('/api/talent-pool/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: patch.visibility ?? overview.preferences.visibility,
          allow_cv_access: patch.allow_cv_access ?? overview.preferences.allow_cv_access,
          allow_contact_requests: patch.allow_contact_requests ?? overview.preferences.allow_contact_requests,
          blocked_employer_domains: domains,
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.ok) {
        await refreshOverview();
        setPrefsBanner({ kind: 'ok', text: 'Your visibility and contact settings have been saved.' });
      } else {
        setPrefsBanner({
          kind: 'err',
          text: out.message ?? 'Check domain formatting (for example: currentcompany.com) and try again.',
        });
      }
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleConfirmWithdraw() {
    setWithdrawing(true);
    try {
      const res = await fetch('/api/talent-pool/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: withdrawReason || undefined,
          revoke_consents: ['EMPLOYER_DISCOVERY'],
        }),
      });
      if (res.ok) {
        setWithdrawModalOpen(false);
        setWithdrawReason('');
        await refreshOverview();
        setPrefsBanner({ kind: 'ok', text: 'You have withdrawn from the Talent Pool and are hidden from search.' });
      } else {
        setPrefsBanner({ kind: 'err', text: 'Could not process withdrawal. Please retry.' });
      }
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {prefsBanner && (
        <div role="status" className={prefsBanner.kind === 'ok' ? styles.alertSuccess : styles.alertError}>
          {prefsBanner.text}
        </div>
      )}

      <section className={styles.hero} aria-labelledby="tp-hero-heading">
        <div>
          <span className={styles.eyebrow}>Jobiest Talent Pool · Included on {planCode} Plan</span>
          <h1 id="tp-hero-heading" className={styles.heroTitle}>
            Get discovered by verified employers for what you can actually do.
          </h1>
          <p className={styles.heroLead}>
            Complete one structured competency assessment grounded in your real experience. Every application is
            reviewed by a human specialist before your profile becomes discoverable, and you control visibility, CV
            permissions, and employer outreach at every step.
          </p>

          <div className={styles.ctaRow}>
            {canApplyOrUpdate && (
              <Link href="/talent-pool/apply" className={styles.primaryBtn}>
                Apply to Join Talent Pool
              </Link>
            )}
            {canLaunchOrResumeInterview && (
              <button
                type="button"
                onClick={() => void handleStartOrResumeAssessment()}
                disabled={startingInterview}
                className={styles.primaryBtn}
              >
                {startingInterview
                  ? 'Opening assessment...'
                  : overview.displayStatus === 'ASSESSMENT_IN_PROGRESS'
                    ? 'Resume AI Assessment'
                    : 'Start AI Assessment'}
              </button>
            )}
            <Link href="/talent-pool/requests" className={styles.secondaryBtn}>
              Employer Requests &amp; Messages
              {overview.pendingContactRequestsCount > 0 ? ` (${overview.pendingContactRequestsCount} new)` : ''}
            </Link>
          </div>
        </div>

        <aside className={styles.statusCard} aria-label="Your Talent Pool status">
          <div className={styles.statusHeader}>
            <span className={styles.statusLabel}>Current status</span>
            <span className={`${styles.statusPill} ${styles[`tone_${statusMeta.tone}`]}`}>{statusMeta.label}</span>
          </div>
          <p style={{ fontSize: 14.5, color: 'var(--color-ink)', lineHeight: 1.55 }}>{statusMeta.summary}</p>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 6 }}>
              <span className="muted">Profile readiness</span>
              <strong>{overview.onboarding.completenessScore}%</strong>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: '#e2e6ed',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${overview.onboarding.completenessScore}%`,
                  height: '100%',
                  background: 'var(--color-primary-navy)',
                }}
              />
            </div>
            {overview.onboarding.missingRequired.length > 0 && (
              <p className={styles.hint} style={{ marginTop: 8 }}>
                Missing required items: {overview.onboarding.missingRequired.map((f) => f.label).join(', ')}.
              </p>
            )}
          </div>

          {activeApp?.reassessment_instructions && overview.displayStatus === 'REASSESSMENT_REQUESTED' && (
            <div className={styles.alertInfo} style={{ marginTop: 14, marginBottom: 0 }}>
              <strong>Reassessment guidance:</strong> {activeApp.reassessment_instructions}
            </div>
          )}

          {activeApp?.candidate_feedback && (
            <div style={{ marginTop: 12, fontSize: 13.5, color: 'var(--color-ink)' }}>
              <strong>Reviewer note:</strong> {activeApp.candidate_feedback}
            </div>
          )}
        </aside>
      </section>

      <section className={styles.section} aria-labelledby="tp-how-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="tp-how-heading" className={styles.sectionTitle}>
              How the Jobiest Talent Pool works
            </h2>
            <p className={styles.sectionSub}>
              Transparent evaluation, human review, and strict candidate privacy from application to placement.
            </p>
          </div>
        </div>

        <div className={styles.explainerGrid}>
          {EXPLAINER_ITEMS.map((item) => (
            <article key={item.title} className={styles.infoCard}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="tp-stages-heading">
        <div className={styles.panel}>
          <h2 id="tp-stages-heading" className={styles.sectionTitle} style={{ fontSize: 18 }}>
            Application lifecycle stages
          </h2>
          <p className={styles.sectionSub}>
            Every candidate progresses through clear, auditable states. Your active stage is highlighted.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {TALENT_DISPLAY_STATUSES.map((st: TalentDisplayStatus) => {
              const meta = TALENT_STATUS_META[st];
              const isCurrent = st === overview.displayStatus;
              return (
                <span
                  key={st}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`${styles.statusPill} ${isCurrent ? styles[`tone_${meta.tone}`] : ''}`}
                  style={{
                    opacity: isCurrent ? 1 : 0.68,
                    fontWeight: isCurrent ? 700 : 500,
                    outline: isCurrent ? '2px solid var(--color-primary-navy)' : 'none',
                  }}
                >
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="tp-history-heading">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="tp-history-heading" className={styles.sectionTitle}>
              Application &amp; interview history
            </h2>
            <p className={styles.sectionSub}>
              Track your application dates, interview progress, review outcomes, and reviewer feedback.
            </p>
          </div>
        </div>

        {overview.history.length === 0 ? (
          <div className={styles.panel}>
            <p style={{ fontWeight: 600, color: 'var(--color-ink)' }}>No Talent Pool applications yet</p>
            <p className={styles.sectionSub} style={{ marginBottom: 16 }}>
              Start your application to confirm your career details and unlock your personalized competency interview.
            </p>
            <Link href="/talent-pool/apply" className={styles.primaryBtn}>
              Apply to Join Talent Pool
            </Link>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Application date</th>
                  <th>Category &amp; route</th>
                  <th>Assessment status</th>
                  <th>Interview completion</th>
                  <th>Submitted for review</th>
                  <th>Approval &amp; review status</th>
                  <th>Feedback / instructions</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {overview.history.map((item) => {
                  const statusInfo = TALENT_STATUS_META[item.status] ?? TALENT_STATUS_META.NOT_APPLIED;
                  const sess = item.latest_session;
                  return (
                    <tr key={item.id}>
                      <td>{item.created_at.slice(0, 10)}</td>
                      <td>
                        <div>{item.career_category ?? 'General'}</div>
                        <small className="muted">{item.assessment_route.replace(/_/g, ' ')}</small>
                      </td>
                      <td>{sess ? sess.state.replace(/_/g, ' ') : 'Pending setup'}</td>
                      <td>{item.interview_completed_at ? item.interview_completed_at.slice(0, 10) : 'Not yet'}</td>
                      <td>{item.review_submitted_at ? item.review_submitted_at.slice(0, 10) : 'Not yet'}</td>
                      <td>
                        <span className={`${styles.statusPill} ${styles[`tone_${statusInfo.tone}`]}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td style={{ maxWidth: 280 }}>
                        {item.reassessment_instructions ? (
                          <div>
                            <strong>Reassessment:</strong> {item.reassessment_instructions}
                          </div>
                        ) : item.candidate_feedback ? (
                          <div>{item.candidate_feedback}</div>
                        ) : (
                          <span className="muted">No external notes yet</span>
                        )}
                      </td>
                      <td>
                        {sess &&
                        ['CREATED', 'PRECHECK', 'READY', 'IN_PROGRESS', 'RETRY_PENDING'].includes(sess.state) &&
                        item.status !== 'WITHDRAWN' ? (
                          <Link href={`/talent-pool/interview/${sess.id}`} className={styles.secondaryBtn}>
                            {sess.state === 'IN_PROGRESS' ? 'Resume' : 'Open'}
                          </Link>
                        ) : item.status === 'REASSESSMENT_REQUESTED' ? (
                          <Link href="/talent-pool/apply" className={styles.secondaryBtn}>
                            Start reassessment
                          </Link>
                        ) : (
                          <span className="muted">Recorded</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="tp-privacy-heading">
        <div className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="tp-privacy-heading" className={styles.sectionTitle}>
                Visibility, CV access &amp; contact preferences
              </h2>
              <p className={styles.sectionSub}>
                Even after approval, you stay in full control of who can discover you, view your CV, or reach out.
              </p>
            </div>
          </div>

          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label htmlFor="tp-visibility-select">Employer search visibility</label>
              <select
                id="tp-visibility-select"
                value={overview.preferences.visibility}
                onChange={(e) =>
                  setOverview({
                    ...overview,
                    preferences: {
                      ...overview.preferences,
                      visibility: e.target.value === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
                    },
                  })
                }
              >
                <option value="ACTIVE">Active (visible to verified employers once approved)</option>
                <option value="PAUSED">Paused (hidden from all employer searches)</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-blocked-domains">Hide me from specific employer domains</label>
              <input
                id="tp-blocked-domains"
                value={blockedInput}
                onChange={(e) => setBlockedInput(e.target.value)}
                placeholder="currentemployer.com, subsidiary.org"
              />
              <span className={styles.hint}>Comma-separated company domains that will never see your profile.</span>
            </div>

            <label className={`${styles.consentCard} ${styles.fieldFull}`} style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={overview.preferences.allow_cv_access}
                onChange={(e) =>
                  setOverview({
                    ...overview,
                    preferences: { ...overview.preferences, allow_cv_access: e.target.checked },
                  })
                }
              />
              <div>
                <strong>Allow verified employers to view my Master CV</strong>
                <p className={styles.hint}>
                  When unchecked, employers only see your structured profile and competency summary unless you accept a
                  direct request.
                </p>
              </div>
            </label>

            <label className={`${styles.consentCard} ${styles.fieldFull}`} style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={overview.preferences.allow_contact_requests}
                onChange={(e) =>
                  setOverview({
                    ...overview,
                    preferences: { ...overview.preferences, allow_contact_requests: e.target.checked },
                  })
                }
              />
              <div>
                <strong>Accept new employer contact requests and interview invitations</strong>
                <p className={styles.hint}>
                  You can pause incoming outreach anytime without losing your approved status.
                </p>
              </div>
            </label>
          </div>

          <div className={styles.ctaRow} style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={savingPrefs}
              onClick={() => void handleSavePreferences({})}
            >
              {savingPrefs ? 'Saving settings...' : 'Save visibility preferences'}
            </button>

            {overview.activeApplication && overview.displayStatus !== 'WITHDRAWN' && (
              <button type="button" className={styles.dangerBtn} onClick={() => setWithdrawModalOpen(true)}>
                Withdraw from Talent Pool
              </button>
            )}
          </div>
        </div>
      </section>

      {withdrawModalOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="tp-withdraw-title">
          <div className={styles.modalDialog}>
            <h2 id="tp-withdraw-title" className={styles.sectionTitle} style={{ fontSize: 20 }}>
              Withdraw from Jobiest Talent Pool?
            </h2>
            <p className={styles.sectionSub} style={{ marginTop: 8, marginBottom: 14 }}>
              Your profile will immediately be hidden from employer searches, any active interview session will be
              cancelled, and your employer-discovery consent will be marked withdrawn. Your regular Jobiest Career Agent
              account and saved documents remain untouched.
            </p>
            <div className={styles.field}>
              <label htmlFor="tp-withdraw-reason">Optional note</label>
              <textarea
                id="tp-withdraw-reason"
                rows={3}
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="Accepted a new role, taking a break, etc."
              />
            </div>
            <div className={styles.ctaRow} style={{ justifyContent: 'flex-end' }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setWithdrawModalOpen(false)}>
                Keep my application
              </button>
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={withdrawing}
                onClick={() => void handleConfirmWithdraw()}
              >
                {withdrawing ? 'Withdrawing...' : 'Confirm withdrawal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
