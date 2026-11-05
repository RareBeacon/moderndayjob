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
  const journeyIndex = overview.displayStatus === 'UNDER_ADMIN_REVIEW' ? 2 : ['APPROVED', 'REJECTED'].includes(overview.displayStatus) ? 3 : ['NOT_APPLIED', 'PROFILE_INCOMPLETE', 'WITHDRAWN'].includes(overview.displayStatus) ? 0 : 1;
  const journeyLabels = ['Profile', 'Application', 'Review', 'Decision'];

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
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Jobiest Talent Pool</span>
          <h1 id="tp-hero-heading" className={styles.heroTitle}>Get discovered by verified employers</h1>
          <p className={styles.heroLead}>
            Complete your profile, choose what employers can see, and control every request.
          </p>
          <div className={styles.ctaRow}>
            {canApplyOrUpdate && (overview.onboarding.readyToApply ? (
              <Link href="/talent-pool/apply" className={styles.primaryBtn}>Apply to Join Talent Pool</Link>
            ) : (
              <>
                <Link href="/profile" className={styles.primaryBtn}>Complete profile</Link>
                <Link href="/talent-pool/apply" className={styles.secondaryBtn}>Continue to application</Link>
              </>
            ))}
            {canLaunchOrResumeInterview && (
              <button type="button" onClick={() => void handleStartOrResumeAssessment()} disabled={startingInterview} className={styles.primaryBtn}>
                {startingInterview ? 'Opening assessment...' : overview.displayStatus === 'ASSESSMENT_IN_PROGRESS' ? 'Resume AI Assessment' : 'Start AI Assessment'}
              </button>
            )}
            <a href="#tp-how-heading" className={styles.howLink}>How the Talent Pool works <span aria-hidden="true">→</span></a>
          </div>
          <p className={styles.planContext}>Talent Pool is included on your {planCode} plan.</p>
          <Link href="/talent-pool/requests" className={styles.requestLink}>
            Employer Requests &amp; Messages{overview.pendingContactRequestsCount > 0 ? ` (${overview.pendingContactRequestsCount} new)` : ''}
          </Link>
        </div>

        <aside className={styles.statusCard} aria-label="Your Talent Pool profile readiness">
          <div className={styles.statusHeader}>
            <span className={styles.statusLabel}>Profile readiness</span>
            <span className={`${styles.statusPill} ${styles[`tone_${statusMeta.tone}`]}`}>{statusMeta.label}</span>
          </div>
          <div className={styles.readinessLine}>
            <div className={styles.readinessTrack} role="progressbar" aria-label="Profile readiness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overview.onboarding.completenessScore}>
              <span style={{ width: `${overview.onboarding.completenessScore}%` }} />
            </div>
            <strong>{overview.onboarding.completenessScore}%</strong>
          </div>
          <p className={styles.readinessHelp}>
            {overview.onboarding.missingRequired.length > 0
              ? 'Add the required career details before applying.'
              : statusMeta.summary}
          </p>
          {overview.onboarding.missingRequired.length > 0 && (
            <details className={styles.missingDetails}>
              <summary>
                <span className={styles.missingIcon} aria-hidden="true">▤</span>
                <span>{overview.onboarding.missingRequired.map((field) => field.label).join(' · ')}</span>
                <span className={styles.detailsChevron} aria-hidden="true">⌄</span>
              </summary>
              <ul>
                {overview.onboarding.missingRequired.map((field) => <li key={field.key}>{field.label}</li>)}
              </ul>
            </details>
          )}
          {overview.onboarding.missingRequired.length === 0 && (
            <div className={styles.statusSummary}>{statusMeta.summary}</div>
          )}
          {activeApp?.reassessment_instructions && overview.displayStatus === 'REASSESSMENT_REQUESTED' && (
            <div className={styles.alertInfo} style={{ marginTop: 14, marginBottom: 0 }}><strong>Reassessment guidance:</strong> {activeApp.reassessment_instructions}</div>
          )}
          {activeApp?.candidate_feedback && <p className={styles.reviewerNote}><strong>Reviewer note:</strong> {activeApp.candidate_feedback}</p>}
        </aside>
      </section>

      <section className={styles.section} aria-labelledby="tp-how-heading">
        <div className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="tp-how-heading" className={styles.sectionTitle}>How it works</h2>
              <p className={styles.sectionSub}>A simple path to new opportunities through verified employers.</p>
            </div>
          </div>
          <div className={styles.journeyCards}>
            <article><span>1</span><div><h3>Complete your profile</h3><p>Tell us about your experience, skills, and target roles.</p></div></article>
            <article><span>2</span><div><h3>Join &amp; get reviewed</h3><p>Your profile is reviewed by our team before it’s visible to employers.</p></div></article>
            <article><span>3</span><div><h3>Choose your visibility</h3><p>Control who can find you and manage every contact request or interview invitation.</p></div></article>
          </div>
          <details className={styles.moreExplainers}>
            <summary>Assessment, human review and candidate privacy details</summary>
            <div className={styles.explainerGrid}>
              {EXPLAINER_ITEMS.map((item) => <article key={item.title} className={styles.infoCard}><h3>{item.title}</h3><p>{item.body}</p></article>)}
            </div>
          </details>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="tp-stages-heading">
        <div className={styles.panel}>
          <h2 id="tp-stages-heading" className={styles.sectionTitle}>Application journey</h2>
          <p className={styles.sectionSub}>Track your progress from profile to opportunities.</p>
          <ol className={styles.journeyTrack} aria-label={`Current journey stage: ${journeyLabels[journeyIndex]}`}>
            {journeyLabels.map((label, index) => (
              <li key={label} className={index < journeyIndex ? styles.journeyDone : index === journeyIndex ? styles.journeyCurrent : ''}>
                <span className={styles.journeyNode}>{index < journeyIndex ? '✓' : ''}</span>
                <span className={styles.journeyLabel}>{label}</span>
                {index === journeyIndex && <span className={styles.journeyStatus}>{statusMeta.label}</span>}
              </li>
            ))}
          </ol>
          <details className={styles.allStatuses}>
            <summary>View all application statuses</summary>
            <div className={styles.statusList}>
              {TALENT_DISPLAY_STATUSES.map((st: TalentDisplayStatus) => {
                const meta = TALENT_STATUS_META[st];
                const isCurrent = st === overview.displayStatus;
                return <span key={st} aria-current={isCurrent ? 'step' : undefined} className={`${styles.statusPill} ${isCurrent ? styles[`tone_${meta.tone}`] : ''}`} style={{ opacity: isCurrent ? 1 : 0.68 }}>{meta.label}</span>;
              })}
            </div>
          </details>
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
          <div className={styles.emptyHistory}>
            <span className={styles.emptyHistoryIcon} aria-hidden="true">▤</span>
            <strong>No Talent Pool applications yet</strong>
            <p>Complete your profile to join the Talent Pool and start applying for opportunities with verified employers.</p>
            <Link href={overview.onboarding.readyToApply ? '/talent-pool/apply' : '/profile'} className={styles.secondaryBtn}>
              {overview.onboarding.readyToApply ? 'Apply to Join Talent Pool' : 'Complete your profile'}
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
                Visibility &amp; contact preferences
              </h2>
              <p className={styles.sectionSub}>
                You control who can discover you, view your information, and reach out. These settings can be changed later.
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
                placeholder="company.com, subsidiary.org"
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
              {savingPrefs ? 'Saving settings...' : 'Save preferences'}
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
