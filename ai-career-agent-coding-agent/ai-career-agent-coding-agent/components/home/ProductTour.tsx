'use client';

/**
 * Interactive end-to-end product tour (homepage "show, not tell" section).
 *
 * Five screens mirroring the real dashboard UI with clearly-labeled sample
 * data: preferences -> overnight matches with honest fit scoring -> tailored
 * documents -> the approval step -> the morning tracker. The approval step is
 * real product behavior: nothing is submitted until the user approves, and
 * approvals expire after 24 hours.
 */
import { useState } from 'react';
import styles from '../../app/home.module.css';
import { Icon } from './Icons';

const TABS = [
  { id: 'preferences', label: 'Your preferences', icon: 'user' as const },
  { id: 'matches', label: 'Overnight matches', icon: 'search' as const },
  { id: 'documents', label: 'Tailored documents', icon: 'file' as const },
  { id: 'approval', label: 'Your approval', icon: 'shield' as const },
  { id: 'tracker', label: 'Morning tracker', icon: 'chart' as const },
];

const MATCHES = [
  { company: 'F', tone: 'company-f', title: 'Senior Product Manager', company2: 'Fintech platform · Lagos / hybrid', fit: '92% fit', selected: true, meta: '₦700k+ / month · Full-time' },
  { company: 'L', tone: 'company-n', title: 'Product Owner, Logistics', company2: 'Logistics scale-up · Remote', fit: '84% fit', selected: false, meta: '₦650k / month · Full-time' },
  { company: 'H', tone: 'company-f', title: 'Product Lead, Health', company2: 'Health tech · Lagos', fit: '71% fit', selected: false, meta: '₦600k / month · Full-time' },
];

export function ProductTour() {
  const [active, setActive] = useState(0);

  return (
    <div className={styles['demo-stage']} id="product-tour" tabIndex={-1} aria-label="Product tour: preferences, matches, documents, approval, tracker">
      <div className={styles['stage-caption']}>
        <span>THE PRODUCT, END TO END</span>
        <span className={styles['sample-label']}>Real interface · sample data</span>
      </div>

      <div className={styles['agent-workspace']}>
        <div className={styles['agent-sidebar']}>
          <div className={styles['workspace-brand']}>
            <span className={styles['mini-brand']}><Icon name="spark" small /></span> Jobiest
          </div>
          <p className={styles['nav-label']}>THE OVERNIGHT RUN</p>
          <div className={styles['product-tabs']} role="tablist" aria-label="Product tour steps">
            {TABS.map((tab, index) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active === index}
                onClick={() => setActive(index)}
              >
                <Icon name={tab.icon} />
                {tab.label}
                <span className={styles['tab-number']}>{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
          <div className={styles['sidebar-promise']}>
            <Icon name="shield" />
            <strong>Nothing sends without your approval.</strong>
            <p>Approvals expire after 24 hours and restart if your documents change.</p>
          </div>
          <div className={styles['sample-person']}>
            <span className={styles.avatar}>AM</span>
            <div>Alex Morgan<span>Sample data, for the tour</span></div>
          </div>
        </div>

        <div className={styles['workspace-main']}>
          <div className={styles['workspace-topbar']}>
            <span><Icon name="moon" small /> Overnight run · sample night</span>
            <span className={styles['approval-tag']}>Agent mode · you approve sends</span>
          </div>

          <div className={styles['product-content']}>
            {active === 0 && (
              <section aria-label="Preferences screen">
                <div className={styles['workspace-heading']}>
                  <div>
                    <h2>Your preferences</h2>
                    <p>Set once. The agent only searches within these rules.</p>
                  </div>
                  <span className={styles['small-label']}>Sample data</span>
                </div>
                <div className={styles['pref-rows']}>
                  <div className={styles['pref-row']}><span>Target roles</span><strong>Senior Product Manager, Product Lead</strong></div>
                  <div className={styles['pref-row']}><span>Location</span><strong>Lagos or remote (UTC+1)</strong></div>
                  <div className={styles['pref-row']}><span>Salary floor</span><strong>₦600,000 / month</strong></div>
                  <div className={styles['pref-row']}><span>Seniority</span><strong>Senior</strong></div>
                  <div className={`${styles['pref-row']} ${styles['pref-row-hot']}`}><span>Send policy</span><strong>I approve every send</strong></div>
                </div>
                <p className={styles['context-note']}><Icon name="check" small /> Prefer full autopilot? Not offered: every Jobiest plan keeps you as the sender of record.</p>
              </section>
            )}

            {active === 1 && (
              <section aria-label="Matches screen">
                <div className={styles['workspace-heading']}>
                  <div>
                    <h2>Overnight matches</h2>
                    <p>Scored against your profile. Gaps flagged, never hidden.</p>
                  </div>
                  <span className={styles['small-label']}>Found 02:14 AM</span>
                </div>
                <div className={styles['match-layout']}>
                  <div className={styles['match-list']}>
                    {MATCHES.map((match) => (
                      <button key={match.title} className={`${styles['match-card']} ${match.selected ? styles['is-selected'] : ''}`}>
                        <span className={styles['match-card-top']}>
                          <span className={`${styles['company-icon']} ${styles[match.tone]}`}>{match.company}</span>
                          <span className={styles['fit-tag']}>{match.fit}</span>
                        </span>
                        <span className={styles['match-title']}>{match.title}</span>
                        <span className={styles['match-company']}>{match.company2}</span>
                        <span className={styles['match-bottom']}>
                          <span><Icon name="location" small />{match.meta}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className={styles['match-detail']}>
                    <span className={styles['detail-eyebrow']}><Icon name="search" small /> Why this match</span>
                    <h3>Senior Product Manager, Fintech</h3>
                    <ul className={styles['why-list']}>
                      <li className={styles['why-ok']}><Icon name="check" small /> 7+ years product experience, evidenced in your profile</li>
                      <li className={styles['why-ok']}><Icon name="check" small /> Fintech domain, matches your Paystack and Flutterwave years</li>
                      <li className={styles['why-ok']}><Icon name="check" small /> SQL and analytics, listed in your verified skills</li>
                      <li className={styles['why-gap']}><Icon name="plus" small /> P&amp;L ownership: not evidenced in your profile, flagged for you to address or ignore</li>
                    </ul>
                    <p className={styles['context-note']}><Icon name="shield" small /> Fit scores are honest: a 71% match is shown as 71%.</p>
                  </div>
                </div>
              </section>
            )}

            {active === 2 && (
              <section aria-label="Documents screen">
                <div className={styles['workspace-heading']}>
                  <div>
                    <h2>Tailored documents</h2>
                    <p>Built only from your verified facts, per role.</p>
                  </div>
                  <span className={styles['small-label']}>Prepared 02:30 AM</span>
                </div>
                <div className={styles['prepare-layout']}>
                  <div className={styles['cv-preview']}>
                    <strong className={styles['cv-name']}>Alex Morgan</strong>
                    <span className={styles['cv-line']}>Senior Product Manager · Lagos</span>
                    <span className={styles['cv-meta']}>Senior PM, Fintech platform · tailored version 3</span>
                    <p className={styles['cv-body']}>
                      Led a 9-person platform squad at Paystack, cutting checkout latency 38%...
                      Grew weekly active merchants 3x at Flutterwave...
                    </p>
                  </div>
                  <div className={styles['doc-side']}>
                    <div className={styles['doc-card']}>
                      <strong>Cover letter, tailored</strong>
                      <p>Opens on your fintech payments experience because this role asks for it, then your honest gap on P&amp;L ownership with how you close it.</p>
                    </div>
                    <div className={styles['doc-card']}>
                      <strong>Where facts come from</strong>
                      <p>14 verified profile facts used. 1 gap flagged for your attention. Nothing invented, ever.</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {active === 3 && (
              <section aria-label="Approval screen">
                <div className={styles['workspace-heading']}>
                  <div>
                    <h2>Your approval</h2>
                    <p>The send happens here, or not at all.</p>
                  </div>
                  <span className={styles['small-label']}>Waiting for you</span>
                </div>
                <div className={styles['review-layout']}>
                  <div className={styles['review-summary']}>
                    <span className={styles['detail-eyebrow']}><Icon name="file" small /> Application package</span>
                    <div className={styles['review-document']}><Icon name="file" small /> <span>CV, tailored version 3</span> <button className={styles['inline-button']} type="button">View</button></div>
                    <div className={styles['review-document']}><Icon name="file" small /> <span>Cover letter, fintech-tailored</span> <button className={styles['inline-button']} type="button">View</button></div>
                    <div className={styles['review-document']}><Icon name="shield" small /> <span>Employer form: Greenhouse, pre-filled</span> <button className={styles['inline-button']} type="button">Preview</button></div>
                  </div>
                  <div className={styles['approval-panel']}>
                    <strong>Approve this application?</strong>
                    <p>One tap submits the Greenhouse form with your documents. Edit anything first if you prefer.</p>
                    <div className={styles['approval-buttons']}>
                      <span className={styles['tour-btn']}>Approve send</span>
                      <span className={`${styles['tour-btn']} ${styles['tour-btn-quiet']}`}>Edit first</span>
                    </div>
                    <p className={styles['approval-fine']}>Tour buttons are for show. Approvals expire after 24 hours and restart if your package changes.</p>
                  </div>
                </div>
              </section>
            )}

            {active === 4 && (
              <section aria-label="Tracker screen">
                <div className={styles['workspace-heading']}>
                  <div>
                    <h2>Morning tracker</h2>
                    <p>Every application, every status, one place.</p>
                  </div>
                  <span className={styles['small-label']}>07:30 AM</span>
                </div>
                <ul className={styles['tracker-list']}>
                  <li>
                    <span className={styles['tracker-title']}><strong>Senior PM, Fintech platform</strong><em>Greenhouse</em></span>
                    <span className={`${styles['tracker-chip']} ${styles['chip-submitted']}`}>Approved · submitted 8:02 AM</span>
                  </li>
                  <li>
                    <span className={styles['tracker-title']}><strong>Growth Marketing Lead</strong><em>Lever</em></span>
                    <span className={`${styles['tracker-chip']} ${styles['chip-ready']}`}>Ready for your approval</span>
                  </li>
                  <li>
                    <span className={styles['tracker-title']}><strong>Product Owner, Logistics</strong><em>Company site</em></span>
                    <span className={`${styles['tracker-chip']} ${styles['chip-manual']}`}>Prepared · form needs a CAPTCHA, you send</span>
                  </li>
                  <li>
                    <span className={styles['tracker-title']}><strong>Product Lead, Health</strong><em>71% fit</em></span>
                    <span className={`${styles['tracker-chip']} ${styles['chip-skipped']}`}>Skipped · below your salary floor</span>
                  </li>
                </ul>
                <p className={styles['context-note']}><Icon name="check" small /> Sample statuses shown. Your tracker shows your roles, your rules, your mornings.</p>
              </section>
            )}
          </div>
        </div>
      </div>

      <div className={styles['demo-bottom']}>
        <span><Icon name="shield" /> Prepared by your agent. Approved by you. Every single time.</span>
        <span className={styles['sample-label']}>Sample data throughout</span>
      </div>
    </div>
  );
}
