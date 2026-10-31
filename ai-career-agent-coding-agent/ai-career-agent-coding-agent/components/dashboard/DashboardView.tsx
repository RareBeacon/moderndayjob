'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Icon } from '@/components/icons/icons';
import { DashboardSetup } from '@/components/site/DashboardSetup';
import { AutoSubmitToggle } from '@/components/site/AutoSubmitToggle';
import styles from './dashboard.module.css';

export type DashboardDraft = { id: string; role: string; company: string };
export type DashboardSuggestion = { text: string; href: string };
export type DashboardBoardLink = { url: string; boardLabel: string; role: string };

export type DashboardViewProps = {
  greeting: string;
  firstName: string;
  autoMode: boolean;
  planLabel: string;
  quotaLine: string;
  profilePercent: number;
  profileNextSteps?: string[];
  stats: { applications: number; interviews: number; responseRate: number };
  pipeline: { prepared: number; checking: number; sent: number; interviews: number };
  drafts: DashboardDraft[];
  allowances: {
    documents: { left: number; max: number; note: string };
    autoApply: { left: number; max: number; locked: boolean; note: string };
    extraNote?: string;
  };
  autoSubmit: { initialMode: string; planIncludesAutomation: boolean; sendingLive: boolean };
  boardLinks: DashboardBoardLink[];
  suggestions: DashboardSuggestion[];
  setup: { needsSetup: boolean; required: boolean };
  careerHeadline?: string | null;
};

/**
 * Calm Career Desk: the signed-in workspace interior.
 * Every number, draft, checklist item, and allowance is fed by real server
 * queries in app/(dashboard)/dashboard/page.tsx; this client component arranges
 * them into a clear, low-friction hierarchy across desktop and mobile.
 */
export function DashboardView(props: DashboardViewProps) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const [jobUrl, setJobUrl] = useState('');

  const {
    greeting,
    firstName,
    autoMode,
    planLabel,
    quotaLine,
    profilePercent,
    profileNextSteps = [],
    stats,
    pipeline,
    drafts,
    allowances,
    autoSubmit,
    boardLinks,
    suggestions,
    setup,
    careerHeadline,
  } = props;

  const submittedTotal = pipeline.sent + pipeline.checking;
  const hasActivity =
    stats.applications > 0 ||
    pipeline.prepared > 0 ||
    submittedTotal > 0 ||
    pipeline.interviews > 0 ||
    drafts.length > 0;

  const statusSummary =
    drafts.length > 0
      ? `You have ${drafts.length} tailored application${drafts.length === 1 ? '' : 's'} waiting for your approval.`
      : hasActivity
        ? 'Paste a job link below to prepare your next role-specific CV and cover letter.'
        : 'Set up your profile once, then paste any job link below to prepare your first tailored package.';

  function handleQuickStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = jobUrl.trim();
    if (trimmed) {
      router.push(`/applications?openTarget=1&jobUrl=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/applications?openTarget=1');
    }
  }

  const progressStages = [
    {
      label: 'Ready to review',
      value: pipeline.prepared,
      sub: pipeline.prepared > 0 ? 'Waiting on your go-ahead' : 'No pending drafts',
      highlight: pipeline.prepared > 0,
    },
    {
      label: 'Submitted',
      value: submittedTotal,
      sub:
        pipeline.checking > 0
          ? `${pipeline.checking} confirming delivery`
          : 'Sent to employers',
      highlight: false,
    },
    {
      label: 'Interviews',
      value: pipeline.interviews,
      sub:
        submittedTotal > 0
          ? `${stats.responseRate}% response rate`
          : 'Logged interview invites',
      highlight: false,
    },
    {
      label: 'Total tracked',
      value: stats.applications,
      sub: 'All roles in your history',
      highlight: false,
    },
  ];

  const docPct = Math.max(
    0,
    Math.min(100, Math.round((allowances.documents.left / Math.max(1, allowances.documents.max)) * 100)),
  );
  const autoPct = allowances.autoApply.locked
    ? 0
    : Math.max(
        0,
        Math.min(100, Math.round((allowances.autoApply.left / Math.max(1, allowances.autoApply.max)) * 100)),
      );
  const clampedProfilePct = Math.max(0, Math.min(100, profilePercent));

  return (
    <div className={styles.desk}>
      {/* Top Greeting + Status Meta */}
      <header className={styles.headerRow} data-animate>
        <div className={styles.headerCopy}>
          <h1 id="deck-title" className={styles.greetingTitle}>
            {greeting}, {firstName}.
          </h1>
          <p className={styles.greetingLead}>{statusSummary}</p>
        </div>
        <div className={styles.headerPills}>
          <Link href="/billing" className={styles.planPill}>
            <span className={styles.planBadge}>{planLabel}</span>
            <span>{quotaLine}</span>
          </Link>
          <span className={styles.modePill}>
            <Icon name="shield" width={14} height={14} />
            {autoMode ? 'Auto-submit active' : 'Review before send'}
          </span>
        </div>
      </header>

      {/* Inline Job-Link Quick-Start Card (Signature Jobiest Deep Navy + Lime) */}
      <section className={styles.quickStart} data-animate aria-labelledby="quickstart-title">
        <div className={styles.quickStartTop}>
          <div>
            <h2 id="quickstart-title" className={styles.quickStartTitle}>
              Prepare a tailored application
            </h2>
            <p className={styles.quickStartSub}>
              Paste a public job link to draft a truthful, role-specific CV and cover letter, or open Resume Studio.
            </p>
          </div>
          <Link href="/generate" className={styles.studioGhost}>
            <Icon name="file" width={15} height={15} />
            Open Resume Studio
          </Link>
        </div>

        <form className={styles.quickForm} onSubmit={handleQuickStart}>
          <label htmlFor="dashboard-job-url" className={styles.srOnly}>
            Job posting link
          </label>
          <div className={styles.inputWrap}>
            <Icon name="search" width={17} height={17} />
            <input
              id="dashboard-job-url"
              type="text"
              inputMode="url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="Paste any job posting URL (Greenhouse, Lever, Ashby, Workable, or company site)..."
              className={styles.urlInput}
            />
          </div>
          <button type="submit" className={styles.quickCta}>
            Tailor application
            <Icon name="arrow-right" width={17} height={17} />
          </button>
        </form>

        <p className={styles.quickFoot}>
          <Icon name="check-circle" width={14} height={14} />
          {autoMode
            ? 'Jobiest never charges candidates to apply. Eligible submissions trigger an email confirmation.'
            : 'Jobiest never charges candidates to apply, and nothing is ever sent without your approval.'}
        </p>
      </section>

      <DashboardSetup needsSetup={setup.needsSetup} required={setup.required} />

      {/* Unified 4-Stage Application Progress Strip (shown once user has activity) */}
      {hasActivity ? (
        <section className={styles.progressSection} data-animate aria-label="Application progress">
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Application progress</h2>
            <Link className={styles.sectionLink} href="/applications">
              View full tracker →
            </Link>
          </div>
          <div className={styles.progressGrid} data-stagger>
            {progressStages.map((stage) => (
              <Link
                href="/applications"
                key={stage.label}
                className={`${styles.stageCard}${stage.highlight ? ` ${styles.stageHighlight}` : ''}`}
              >
                <div className={styles.stageTop}>
                  <span className={styles.stageLabel}>{stage.label}</span>
                  {stage.highlight ? <span className={styles.stageDot} aria-hidden="true" /> : null}
                </div>
                <span className={styles.stageNum}>{stage.value}</span>
                <span className={styles.stageSub}>{stage.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Two-Column Workspace Grid */}
      <div className={styles.workspaceGrid}>
        {/* Primary Work Column */}
        <div className={styles.mainCol}>
          <section
            className={`${styles.card} ${drafts.length > 0 ? styles.approvalActive : ''}`}
            data-animate
            aria-labelledby="queue-title"
          >
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                {drafts.length > 0 ? <span className={styles.pulseDot} aria-hidden="true" /> : null}
                <p className={styles.cardKicker}>
                  {drafts.length > 0
                    ? 'Needs your approval'
                    : hasActivity
                      ? 'Approval queue'
                      : 'Getting started'}
                </p>
              </div>
              {drafts.length > 0 ? (
                <span className={styles.countBadge}>
                  {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}
                </span>
              ) : null}
            </div>

            <h2 className={styles.cardTitle} id="queue-title">
              {drafts.length > 0
                ? `${drafts.length} tailored package${drafts.length === 1 ? '' : 's'} ready to review`
                : hasActivity
                  ? 'No drafts waiting for review'
                  : 'Prepare your first tailored application in 3 steps'}
            </h2>

            <AnimatePresence mode="wait">
              {drafts.length > 0 ? (
                <motion.div
                  key="has-drafts"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={styles.draftList}>
                    {drafts.map((d) => (
                      <motion.div
                        className={styles.draftItem}
                        key={d.id}
                        initial={reduce ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className={styles.draftMeta}>
                          <strong className={styles.draftRole}>{d.role}</strong>
                          <span className={styles.draftCompany}>
                            {d.company} · Verified against your profile
                          </span>
                        </div>
                        <Link
                          className={styles.reviewBtn}
                          href={`/applications?open=${encodeURIComponent(d.id)}`}
                        >
                          Review package
                          <Icon name="arrow-right" width={15} height={15} />
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                  <p className={styles.cardNote}>
                    Every draft is built strictly from facts on your profile. Edit any line, export PDF or DOCX, or approve sending.
                  </p>
                </motion.div>
              ) : !hasActivity ? (
                <motion.div
                  key="onboarding-steps"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={styles.startSteps}
                >
                  <Link href="/profile" className={styles.startStep}>
                    <span className={`${styles.stepBadge}${clampedProfilePct >= 70 ? ` ${styles.stepDone}` : ''}`}>
                      {clampedProfilePct >= 70 ? <Icon name="check" width={15} height={15} /> : '1'}
                    </span>
                    <div className={styles.stepBody}>
                      <strong>Build your career profile ({clampedProfilePct}% ready)</strong>
                      <span>Upload your current CV or add your real roles, skills, and achievements once.</span>
                    </div>
                    <Icon name="arrow-right" width={16} height={16} />
                  </Link>

                  <Link href="/generate" className={styles.startStep}>
                    <span className={styles.stepBadge}>2</span>
                    <div className={styles.stepBody}>
                      <strong>Preview 30 CV templates in Resume Studio</strong>
                      <span>Tailor a role-specific CV and cover letter and export clean PDF or DOCX files.</span>
                    </div>
                    <Icon name="arrow-right" width={16} height={16} />
                  </Link>

                  <Link href="/applications?openTarget=1" className={styles.startStep}>
                    <span className={styles.stepBadge}>3</span>
                    <div className={styles.stepBody}>
                      <strong>Paste your first job link to review &amp; track</strong>
                      <span>Prepare a complete application package and keep every stage in one timeline.</span>
                    </div>
                    <Icon name="arrow-right" width={16} height={16} />
                  </Link>
                </motion.div>
              ) : (
                <motion.div
                  key="caught-up"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={styles.caughtUpBox}
                >
                  <p className={styles.cardBodyText}>
                    All prepared drafts have been reviewed. Paste a job link in the bar above whenever a new opening catches your eye, or tailor a standalone CV in Resume Studio.
                  </p>
                  <div className={styles.inlineActions}>
                    <Link className={styles.primaryInlineBtn} href="/applications?openTarget=1">
                      Start a new application
                    </Link>
                    <Link className={styles.secondaryInlineBtn} href="/generate">
                      Open Resume Studio
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <AnimatePresence>
            {boardLinks.length > 0 ? (
              <motion.section
                className={styles.card}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                data-animate
                aria-labelledby="boards-title"
              >
                <p className={styles.cardKicker}>Role discovery shortcuts</p>
                <h2 className={styles.cardTitle} id="boards-title">
                  Job boards filtered for your target roles
                </h2>
                <div className={styles.boardChips}>
                  {boardLinks.map((l) => (
                    <a
                      className={styles.boardChip}
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span>{l.boardLabel}: <strong>{l.role}</strong></span>
                      <Icon name="arrow-up-right" width={14} height={14} />
                    </a>
                  ))}
                </div>
                <p className={styles.cardNote}>
                  Pre-filtered searches built from your target roles and locations. Copy any job posting URL back into your workspace above to prepare a tailored package.
                </p>
              </motion.section>
            ) : null}
          </AnimatePresence>

          {suggestions.length > 0 ? (
            <section className={styles.card} data-animate aria-labelledby="steps-title">
              <p className={styles.cardKicker}>Recommended actions</p>
              <h2 className={styles.cardTitle} id="steps-title">
                Helpful next steps
              </h2>
              <div className={styles.suggestList}>
                {suggestions.map((s, i) => (
                  <Link className={styles.suggestRow} key={i} href={s.href}>
                    <span>{s.text}</span>
                    <Icon name="arrow-right" width={16} height={16} />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Right Foundation & Controls Column */}
        <aside className={styles.sideCol} aria-label="Profile readiness and account controls">
          {/* Unified Server-Rendered Career Profile Card */}
          <section className={styles.card} data-animate aria-labelledby="ready-title">
            <div className={styles.cardHeader}>
              <p className={styles.cardKicker}>Your foundation</p>
              <span className={`${styles.pctBadge}${clampedProfilePct === 100 ? ` ${styles.pctComplete}` : ''}`}>
                {clampedProfilePct}% complete
              </span>
            </div>
            <h2 className={styles.cardTitle} id="ready-title">
              Career profile readiness
            </h2>
            {careerHeadline ? <p className={styles.headlineText}>{careerHeadline}</p> : null}

            <div
              className={styles.meterBar}
              role="progressbar"
              aria-valuenow={clampedProfilePct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Career profile completion"
            >
              <div
                className={`${styles.meterFill}${clampedProfilePct >= 85 ? ` ${styles.meterLime}` : ''}`}
                style={{ width: `${Math.max(4, clampedProfilePct)}%` }}
              />
            </div>

            {profileNextSteps.length > 0 ? (
              <div className={styles.missingList}>
                <span className={styles.missingIntro}>Add next for stronger tailoring:</span>
                {profileNextSteps.slice(0, 3).map((step) => (
                  <Link href="/profile" key={step} className={styles.missingItem}>
                    <span className={styles.missingBullet} aria-hidden="true">+</span>
                    <span>{step}</span>
                  </Link>
                ))}
                {profileNextSteps.length > 3 ? (
                  <span className={styles.cardNote}>
                    +{profileNextSteps.length - 3} more optional item{profileNextSteps.length - 3 === 1 ? '' : 's'} on your profile
                  </span>
                ) : null}
              </div>
            ) : (
              <p className={styles.cardNote}>
                Your profile foundation is complete and ready for role-specific tailoring.
              </p>
            )}

            <Link href="/profile" className={styles.cardFooterLink}>
              Edit career profile
              <Icon name="arrow-right" width={15} height={15} />
            </Link>
          </section>

          {/* Honest Plan & Remaining Credits Card */}
          <section className={styles.card} data-animate aria-labelledby="allow-title">
            <div className={styles.cardHeader}>
              <p className={styles.cardKicker}>Plan &amp; usage</p>
              <Link href="/billing" className={styles.inlineHeaderLink}>
                Manage plan →
              </Link>
            </div>
            <h2 className={styles.cardTitle} id="allow-title">
              Remaining credits ({planLabel})
            </h2>

            <div className={styles.meter}>
              <div className={styles.meterTop}>
                <span>Tailored documents</span>
                <strong>{allowances.documents.left} left</strong>
              </div>
              <div
                className={styles.meterBar}
                role="img"
                aria-label={`${allowances.documents.left} of ${allowances.documents.max} tailored document credits remaining.`}
              >
                <div
                  className={styles.meterFill}
                  style={{ width: `${allowances.documents.left > 0 ? Math.max(6, docPct) : 0}%` }}
                />
              </div>
              <span className={styles.meterNote}>{allowances.documents.note}</span>
            </div>

            <div className={styles.meter}>
              <div className={styles.meterTop}>
                <span>Agent Mode runs</span>
                <strong>
                  {allowances.autoApply.locked ? 'Not active' : `${allowances.autoApply.left} left`}
                </strong>
              </div>
              <div
                className={styles.meterBar}
                role="img"
                aria-label={
                  allowances.autoApply.locked
                    ? 'Agent Mode runs are not unlocked on this account yet.'
                    : `${allowances.autoApply.left} of ${allowances.autoApply.max} Agent Mode runs remaining this month.`
                }
              >
                <div
                  className={styles.meterFill}
                  style={{ width: `${!allowances.autoApply.locked && allowances.autoApply.left > 0 ? Math.max(6, autoPct) : 0}%` }}
                />
              </div>
              <span className={styles.meterNote}>{allowances.autoApply.note}</span>
              {allowances.autoApply.locked ? (
                <Link href="/auto-apply/activation" className={styles.unlockLink}>
                  Unlock 5 free runs/month →
                </Link>
              ) : null}
            </div>

            {allowances.extraNote ? (
              <Link href="/portfolios" className={styles.portfolioNote}>
                <Icon name="briefcase" width={14} height={14} />
                <span>{allowances.extraNote}</span>
              </Link>
            ) : null}
          </section>

          {/* Submission Mode Control */}
          <section className={styles.card} data-animate aria-labelledby="auto-title">
            <p className={styles.cardKicker}>Sending control</p>
            <h2 className={styles.cardTitle} id="auto-title">
              Submission preference
            </h2>
            <AutoSubmitToggle
              initialMode={autoSubmit.initialMode}
              planIncludesAutomation={autoSubmit.planIncludesAutomation}
              sendingLive={autoSubmit.sendingLive}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
