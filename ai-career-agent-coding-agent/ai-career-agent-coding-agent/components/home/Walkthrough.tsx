'use client';

/**
 * Interactive agent walkthrough (homepage design, "Your next move" stage).
 * React port of the design's app.js: tabbed workflow (matches / prepare /
 * review), selectable example jobs, a consent-gated approval step, and a
 * reset. Keyboard navigation follows the design (Arrow keys cycle tabs).
 */
import { useEffect, useState } from 'react';
import styles from '@/app/home.module.css';
import { Icon } from './Icons';

type TabKey = 'match' | 'prepare' | 'review';
type JobKey = 'northstar' | 'forma';

const TABS: Array<{ key: TabKey; label: string; icon: 'search' | 'file' | 'shield'; number: string }> = [
  { key: 'match', label: 'Find my matches', icon: 'search', number: '01' },
  { key: 'prepare', label: 'Prepare my CV', icon: 'file', number: '02' },
  { key: 'review', label: 'Review & approve', icon: 'shield', number: '03' },
];

interface DemoJob {
  role: string;
  company: string;
  mark: string;
  color: string;
  fit: string;
  fitClass: string;
  location: string;
  title: string;
  description: string;
  reasons: string[];
  gap: string;
}

const JOBS: Record<JobKey, DemoJob> = {
  northstar: {
    role: 'Product Designer',
    company: 'Northstar Studio',
    mark: 'n.',
    color: styles['company-n'],
    fit: 'Strong fit',
    fitClass: styles['fit-tag'],
    location: 'Remote',
    title: 'Your experience has a place here.',
    description: 'Northstar\u2019s Product Designer role aligns with the strengths in your example profile.',
    reasons: ['User research experience', 'Design systems knowledge', 'Accessible product design'],
    gap: 'B2B experience isn\u2019t confirmed in this profile.',
  },
  forma: {
    role: 'UX Designer',
    company: 'Forma',
    mark: 'f.',
    color: styles['company-f'],
    fit: 'Good fit',
    fitClass: `${styles['fit-tag']} ${styles['neutral-tag']}`,
    location: 'Hybrid',
    title: 'A good fit, with a detail to check.',
    description: 'Forma\u2019s UX Designer role connects with your research and interface design experience.',
    reasons: ['User interview experience', 'Prototyping skills', 'Usability-focused design'],
    gap: 'This hybrid role needs a location check before you apply.',
  },
};

export default function Walkthrough() {
  const [tab, setTab] = useState<TabKey>('match');
  const [job, setJob] = useState<JobKey>('northstar');
  const [consent, setConsent] = useState(false);
  const [approved, setApproved] = useState(false);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const update = () => setOrientation(mq.matches ? 'horizontal' : 'vertical');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const active = JOBS[job];
  const statusText = approved
    ? 'Example complete. No application has been sent.'
    : consent
      ? 'Ready to try approval. Nothing will be sent.'
      : 'Select the checkbox to try this step.';

  function selectJob(key: JobKey) {
    setJob(key);
    setConsent(false);
    setApproved(false);
  }

  function onTabKeydown(event: React.KeyboardEvent, index: number) {
    const forward = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
    const backward = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    let next: number | undefined;
    if (event.key === forward) next = (index + 1) % TABS.length;
    if (event.key === backward) next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      setTab(TABS[next].key);
    }
  }

  return (
    <div className={styles['agent-workspace']}>
      <aside className={styles['agent-sidebar']}>
        <div className={styles['workspace-brand']}>
          <span className={styles['mini-brand']}><Icon name="spark" /></span>
          My workspace
        </div>
        <p className={styles['nav-label']}>YOUR CAREER AGENT</p>
        <div className={styles['product-tabs']} role="tablist" aria-label="Explore the agent workflow" aria-orientation={orientation}>
          {TABS.map((t, i) => (
            <button
              key={t.key}
              role="tab"
              id={`tab-${t.key}`}
              aria-controls={`panel-${t.key}`}
              aria-selected={tab === t.key}
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => onTabKeydown(e, i)}
            >
              <Icon name={t.icon} />
              <span>{t.label}</span>
              <span className={styles['tab-number']}>{t.number}</span>
            </button>
          ))}
        </div>
        <div className={styles['sidebar-promise']}>
          <Icon name="shield" />
          <strong>Your career.<br />Your call.</strong>
          <p>You approve every application.</p>
        </div>
        <div className={styles['sample-person']}>
          <span className={styles.avatar}>AM</span>
          <div>Alex Morgan<span>Sample profile</span></div>
        </div>
      </aside>

      <div className={styles['workspace-main']}>
        <div className={styles['workspace-topbar']}>
          <span><Icon name="briefcase" /> Your next move</span>
          <span className={styles['approval-tag']}><Icon name="shield" />Approval mode</span>
        </div>
        <div className={styles['product-content']}>
          {/* Step 01: shortlist */}
          <div id="panel-match" role="tabpanel" aria-labelledby="tab-match" tabIndex={0} hidden={tab !== 'match'}>
            <div className={styles['workspace-heading']}>
              <div>
                <h2>A shortlist worth your time.</h2>
                <p>A little more relevant. A lot less scrolling.</p>
              </div>
              <span className={styles['small-label']}>2 example matches</span>
            </div>
            <div className={styles['match-layout']}>
              <div className={styles['match-list']}>
                {(Object.keys(JOBS) as JobKey[]).map((key) => {
                  const j = JOBS[key];
                  return (
                    <button
                      key={key}
                      className={`${styles['match-card']} ${job === key ? styles['is-selected'] : ''}`}
                      aria-pressed={job === key}
                      onClick={() => selectJob(key)}
                    >
                      <span className={styles['match-card-top']}>
                        <span className={`${styles['company-icon']} ${j.color}`}>{j.mark}</span>
                        <span className={j.fitClass}>{j.fit}</span>
                      </span>
                      <span className={styles['match-title']}>{j.role}</span>
                      <span className={styles['match-company']}>{j.company}</span>
                      <span className={styles['match-bottom']}>
                        <span><Icon name="location" />{j.location}</span>
                        <span>Full-time</span>
                        <Icon name="arrow" className={styles['match-arrow']} />
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className={styles['match-detail']} aria-live="polite">
                <div className={styles['detail-eyebrow']}><Icon name="spark" />THE THINKING BEHIND THE MATCH</div>
                <h3>{active.title}</h3>
                <p>{active.description}</p>
                <ul className={styles['match-reasons']}>
                  {active.reasons.map((r) => <li key={r}><Icon name="check" />{r}</li>)}
                </ul>
                <div className={styles['clarify-note']}>
                  <span>Worth checking</span>
                  <p>{active.gap}</p>
                </div>
                <button className={`${styles.button} ${styles['button-navy']}`} onClick={() => setTab('prepare')}>
                  Prepare this application <Icon name="arrow" />
                </button>
              </div>
            </div>
          </div>

          {/* Step 02: prepare */}
          <div id="panel-prepare" role="tabpanel" aria-labelledby="tab-prepare" tabIndex={0} hidden={tab !== 'prepare'}>
            <div className={styles['workspace-heading']}>
              <div>
                <h2>Your experience. Well presented.</h2>
                <p>Relevant to the role. Grounded in your own story.</p>
              </div>
              <span className={styles['small-label']}>Sample CV draft</span>
            </div>
            <div className={styles['prepare-layout']}>
              <article className={styles['cv-preview']}>
                <div className={styles['cv-heading']}>
                  <div>
                    <h3>Alex Morgan</h3>
                    <p>{active.role}</p>
                  </div>
                  <Icon name="file" />
                </div>
                <div className={styles['cv-rule']} />
                <p className={styles['cv-section-label']}>PROFILE</p>
                <p className={styles['cv-text']}>Product designer with experience in user research, accessible interfaces, and shared design systems.</p>
                <p className={styles['cv-section-label']}>RELEVANT EXPERIENCE</p>
                <p className={`${styles['cv-text']} ${styles['cv-highlight']}`}>Led user interviews to understand customer needs and turn findings into accessible product experiences.</p>
                <p className={styles['cv-text']}>Built and maintained a component library to support consistent interface design.</p>
                <p className={styles['cv-section-label']}>SKILLS</p>
                <div className={styles['skill-chips']}>
                  <span>User research</span>
                  <span>Prototyping</span>
                  <span>Design systems</span>
                </div>
              </article>
              <div className={styles['document-context']}>
                <span className={styles['detail-eyebrow']}><Icon name="shield" />BUILT FROM YOUR FACTS</span>
                <h3>A clearer story.<br />Still your story.</h3>
                <p>The draft brings relevant experience forward without adding roles, qualifications, or results you haven’t verified.</p>
                <div className={styles['context-note']}>
                  <Icon name="file" />
                  <span>Source: Alex’s sample profile</span>
                </div>
                <button className={`${styles.button} ${styles['button-navy']}`} onClick={() => setTab('review')}>
                  Review the application <Icon name="arrow" />
                </button>
              </div>
            </div>
          </div>

          {/* Step 03: review + approval */}
          <div id="panel-review" role="tabpanel" aria-labelledby="tab-review" tabIndex={0} hidden={tab !== 'review'}>
            <div className={styles['workspace-heading']}>
              <div>
                <h2>The final decision is always yours.</h2>
                <p>Check the details. Move forward when you’re ready.</p>
              </div>
              <span className={styles['small-label']}>Sample approval</span>
            </div>
            <div className={styles['review-layout']}>
              <div className={styles['review-summary']}>
                <div className={styles['review-role']}>
                  <span className={`${styles['company-icon']} ${active.color}`}>{active.mark}</span>
                  <div>
                    <h3>{active.role}</h3>
                    <p>{active.company}</p>
                  </div>
                </div>
                <div className={styles['review-document']}>
                  <Icon name="file" />
                  <div>
                    <strong>Tailored CV</strong>
                    <span>Prepared from the sample profile</span>
                  </div>
                  <button className={styles['inline-button']} onClick={() => setTab('prepare')}>View draft</button>
                </div>
                <div className={styles['review-document']}>
                  <Icon name="shield" />
                  <div>
                    <strong>Your approval</strong>
                    <span>{approved ? 'Example approved by you' : 'Waiting for your decision'}</span>
                  </div>
                </div>
                <p className={styles['review-footnote']}>This walkthrough is illustrative. No application is sent.</p>
              </div>
              <div className={styles['approval-panel']}>
                <span className={styles['approval-symbol']}><Icon name="shield" /></span>
                <h3>{approved ? 'That\u2019s your final say.' : 'Ready when you are.'}</h3>
                <p>
                  {approved
                    ? 'You\u2019ve completed the walkthrough. In Jobiest, this is the decision that lets an application move forward.'
                    : 'Nothing moves forward until you\u2019ve reviewed the application and given your approval.'}
                </p>
                <label className={styles['consent-label']}>
                  <input
                    type="checkbox"
                    checked={consent}
                    disabled={approved}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>I’ve reviewed this example application.</span>
                </label>
                <button
                  className={[
                    styles.button,
                    styles['button-navy'],
                    approved ? styles['approval-complete'] : '',
                  ].filter(Boolean).join(' ')}
                  disabled={!consent && !approved}
                  onClick={() => {
                    if (approved) {
                      setConsent(false);
                      setApproved(false);
                      return;
                    }
                    if (consent) setApproved(true);
                  }}
                >
                  {approved ? <>Example approved · Try again <Icon name="check" /></> : <>Approve example <Icon name="arrow" /></>}
                </button>
                <p className={styles['approval-status']} role="status">{statusText}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
