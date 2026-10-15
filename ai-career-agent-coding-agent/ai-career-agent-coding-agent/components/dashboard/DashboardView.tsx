import Link from 'next/link';
import { Icon } from '@/components/icons/icons';
import { DashboardSetup } from '@/components/site/DashboardSetup';
import { AutoSubmitToggle } from '@/components/site/AutoSubmitToggle';
import ProfileReadiness from '@/components/ProfileReadiness';
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
 * Command Deck: the dashboard interior. Every number, list and control here
 * is fed by the real page queries; this component only arranges them.
 * Navy hero band with the profile-strength ring, a connected pipeline rail,
 * and bento cards: approvals first, then allowances, stats, controls and
 * next steps.
 */
export function DashboardView(props: DashboardViewProps) {
  const {
    greeting, firstName, autoMode, planLabel, quotaLine, profilePercent,
    stats, pipeline, drafts, allowances, autoSubmit, boardLinks, suggestions,
    setup, careerHeadline,
  } = props;

  const nodes = [
    { n: pipeline.prepared, label: 'Prepared or awaiting you' },
    { n: pipeline.checking, label: 'Checking send' },
    { n: pipeline.sent, label: 'Submitted' },
    { n: pipeline.interviews, label: 'Verified (interview)' },
  ];

  return (
    <div className={styles.deck}>
      <div className={styles.trustStrip} role="note">
        <Icon name="shield" width={18} height={18} />
        <p style={{ margin: 0 }}>
          {autoMode ? (
            <>
              Your application is free. Jobiest never asks candidates for money. Automatic submission
              is on for your account and we email you after every submission.
            </>
          ) : (
            <>
              Your application is free. Jobiest never asks candidates for money, and nothing is ever
              sent without your approval.
            </>
          )}
        </p>
      </div>

      <section className={styles.heroBand} data-animate aria-labelledby="deck-title">
        <div className={styles.heroCopy}>
          <p className={styles.heroKicker}>
            <Icon name="spark" width={16} height={16} />
            Command deck
          </p>
          <h1 id="deck-title" className={styles.heroTitle}>
            {greeting}, {firstName}.
          </h1>
          <p className={styles.heroLead}>Let&apos;s get your next application moving.</p>
          <div className={styles.heroActions}>
            <Link className={styles.heroCta} href="/applications">
              Start an application
              <Icon name="arrow-right" width={18} height={18} />
            </Link>
            <span className={styles.heroChip}>
              <Icon name="check-circle" width={15} height={15} />
              Plan · {planLabel} · {quotaLine}
            </span>
          </div>
        </div>
        <div className={styles.ringWrap}>
          <div className={styles.ring} style={{ ['--pct' as string]: Math.max(0, Math.min(100, profilePercent)) }}>
            <div className={styles.ringCore}>
              <span className={styles.ringNum}>
                {profilePercent}<small>%</small>
              </span>
              <span className={styles.ringLbl}>Profile</span>
            </div>
          </div>
          <span className={styles.ringCaption}>Profile strength. Stronger profiles get stronger matches.</span>
        </div>
      </section>

      <DashboardSetup needsSetup={setup.needsSetup} required={setup.required} />

      <section className={styles.rail} data-animate aria-label="Application pipeline">
        <div className={styles.railHead}>
          <h2 className={styles.railTitle}>Your pipeline</h2>
          <Link className={styles.railLink} href="/applications">
            View applications →
          </Link>
        </div>
        <div className={styles.railTrack} data-stagger>
          {nodes.map((node) => (
            <div className={`${styles.node}${node.n > 0 ? ` ${styles.nodeOn}` : ''}`} key={node.label}>
              <span className={styles.nodeDot} aria-hidden="true" />
              <span className={styles.nodeNum}>{node.n}</span>
              <span className={styles.nodeLbl}>{node.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.bento}>
        <section
          className={`${styles.card} ${styles.span7} ${styles.needsYou}`}
          data-animate
          aria-labelledby="needs-title"
        >
          <div className={styles.needsHead}>
            <span className={styles.pulseDot} aria-hidden="true" />
            <p className={styles.cardKicker}>Approval first</p>
          </div>
          <h2 className={styles.cardTitle} id="needs-title">
            {drafts.length > 0
              ? `${drafts.length} application${drafts.length === 1 ? '' : 's'} waiting on you`
              : 'Nothing is waiting on you'}
          </h2>
          {drafts.length > 0 ? (
            <>
              {drafts.map((d) => (
                <div className={styles.draftRow} key={d.id}>
                  <span className={styles.draftWho}>
                    <b>{d.role}</b>
                    <span>{d.company}</span>
                  </span>
                  <Link className={styles.reviewLink} href="/applications">
                    Review →
                  </Link>
                </div>
              ))}
              <p className={styles.cardNote}>
                Drafts are prepared from your verified facts only. Approve, edit, or reject, your call, every time.
              </p>
            </>
          ) : (
            <>
              <p className={styles.cardNote} style={{ fontSize: 14.5 }}>
                Bring the job you want as a link or a description. Your agent prepares a truthful,
                tailored package and you approve every send.
              </p>
              <Link className={styles.reviewLink} href="/applications">
                Start an application →
              </Link>
            </>
          )}
        </section>

        <section className={`${styles.card} ${styles.span5}`} data-animate aria-labelledby="allow-title">
          <p className={styles.cardKicker}>Allowances</p>
          <h2 className={styles.cardTitle} id="allow-title">What you have left</h2>
          <div className={styles.meter}>
            <div className={styles.meterTop}>
              <span>Documents</span>
              <strong>{allowances.documents.left} left</strong>
            </div>
            <div
              className={styles.meterBar}
              role="img"
              aria-label={`${allowances.documents.left} of ${allowances.documents.max} document allowance remaining.`}
            >
              <div
                className={styles.meterFill}
                style={{ width: `${Math.max(4, Math.min(100, (allowances.documents.left / Math.max(1, allowances.documents.max)) * 100))}%` }}
              />
            </div>
            <span className={styles.meterNote}>{allowances.documents.note}</span>
          </div>
          <div className={styles.meter}>
            <div className={styles.meterTop}>
              <span>Auto-apply runs</span>
              <strong>{allowances.autoApply.left} left</strong>
            </div>
            <div
              className={styles.meterBar}
              role="img"
              aria-label={
                allowances.autoApply.locked
                  ? 'Automatic applications are not unlocked on this account yet.'
                  : `${allowances.autoApply.left} of ${allowances.autoApply.max} auto-apply runs remaining this month.`
              }
            >
              <div
                className={`${styles.meterFill}${allowances.autoApply.locked ? ` ${styles.lime}` : ''}`}
                style={{ width: allowances.autoApply.locked ? '100%' : `${Math.max(4, Math.min(100, (allowances.autoApply.left / Math.max(1, allowances.autoApply.max)) * 100))}%` }}
              />
            </div>
            <span className={styles.meterNote}>{allowances.autoApply.note}</span>
          </div>
          {allowances.extraNote ? <span className={styles.meterNote}>{allowances.extraNote}</span> : null}
        </section>

        <div style={{ gridColumn: 'span 12' }} data-stagger>
          <div className={styles.statsGrid}>
            <section className={`${styles.card} ${styles.statTile}`} aria-label="Applications">
              <span className={styles.statIco}><Icon name="briefcase" width={20} height={20} /></span>
              <span>
                <span className={styles.statNum}>{stats.applications}</span>
                <span className={styles.statLbl}>Applications</span>
              </span>
            </section>
            <section className={`${styles.card} ${styles.statTile}`} aria-label="Interviews">
              <span className={styles.statIco}><Icon name="user" width={20} height={20} /></span>
              <span>
                <span className={styles.statNum}>{stats.interviews}</span>
                <span className={styles.statLbl}>Interviews</span>
              </span>
            </section>
            <section className={`${styles.card} ${styles.statTile}`} aria-label="Response rate">
              <span className={styles.statIco}><Icon name="activity" width={20} height={20} /></span>
              <span>
                <span className={styles.statNum}>{stats.responseRate}%</span>
                <span className={styles.statLbl}>Response rate</span>
              </span>
            </section>
          </div>
        </div>

        <section className={`${styles.card} ${styles.span5}`} data-animate aria-labelledby="auto-title">
          <p className={styles.cardKicker}>Control</p>
          <h2 className={styles.cardTitle} id="auto-title">Automatic submission</h2>
          <AutoSubmitToggle
            initialMode={autoSubmit.initialMode}
            planIncludesAutomation={autoSubmit.planIncludesAutomation}
            sendingLive={autoSubmit.sendingLive}
          />
        </section>

        <section className={`${styles.card} ${styles.span7}`} data-animate aria-labelledby="steps-title">
          <p className={styles.cardKicker}>Next steps</p>
          <h2 className={styles.cardTitle} id="steps-title">Keep the momentum</h2>
          <div>
            {suggestions.map((s, i) => (
              <div className={styles.suggestRow} key={i}>
                <Icon name="arrow-right" width={16} height={16} />
                <Link href={s.href}>{s.text}</Link>
              </div>
            ))}
          </div>
        </section>

        {boardLinks.length > 0 && (
          <section className={`${styles.card} ${styles.span7}`} data-animate aria-labelledby="boards-title">
            <p className={styles.cardKicker}>Browse the boards yourself</p>
            <h2 className={styles.cardTitle} id="boards-title">Boards for your roles</h2>
            <div className={styles.boardChips}>
              {boardLinks.map((l) => (
                <a className={styles.boardChip} key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.boardLabel}: {l.role}
                  <Icon name="arrow-up-right" width={14} height={14} />
                </a>
              ))}
            </div>
            <p className={styles.cardNote}>
              Search links built from your roles and locations. Your agent applies through employers&apos; own
              career sites; these boards are for your own browsing.
            </p>
          </section>
        )}

        <section className={`${styles.card} ${styles.span5}`} data-animate aria-labelledby="ready-title">
          <p className={styles.cardKicker}>Profile readiness</p>
          <h2 className={styles.cardTitle} id="ready-title">Your foundation</h2>
          <ProfileReadiness />
          {careerHeadline ? <p className={styles.readinessNote}>{careerHeadline}</p> : null}
        </section>
      </div>
    </div>
  );
}
