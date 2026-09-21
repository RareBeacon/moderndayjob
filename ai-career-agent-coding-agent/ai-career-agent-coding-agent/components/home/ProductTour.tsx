'use client';

/**
 * Interactive end-to-end product tour (homepage "show, not tell" section).
 *
 * Five screens mirroring the real dashboard UI with clearly-labeled sample
 * data: criteria (job_preferences fields) -> found for you (roles the agent
 * discovers on employer job boards, matched to the persona's criteria;
 * pasting your own link stays available as a one-line hint) -> tailored
 * documents -> the approval step -> the morning tracker. The approval step
 * is real product behavior: nothing is submitted until the user approves,
 * and approvals expire after 24 hours.
 */
import { useState } from 'react';
import styles from '../../app/home.module.css';
import { Icon } from './Icons';

const TABS = [
  { id: 'criteria', label: 'Your criteria', icon: 'user' as const },
  { id: 'jobs', label: 'Found for you', icon: 'briefcase' as const },
  { id: 'documents', label: 'Tailored documents', icon: 'file' as const },
  { id: 'approval', label: 'Your approval', icon: 'shield' as const },
  { id: 'tracker', label: 'Morning tracker', icon: 'chart' as const },
];

export function ProductTour() {
  const [active, setActive] = useState(0);

  return (
    <div className={styles['demo-stage']} id="product-tour" tabIndex={-1} aria-label="Product tour: criteria, bring the jobs, documents, approval, tracker">
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
            <span><Icon name="briefcase" small /> Agent run · sample data</span>
            <span className={styles['approval-tag']}>Agent mode · you approve sends</span>
          </div>

          <div className={styles['product-content']}>
            {active === 0 && (
              <section aria-label="Criteria screen">
                <div className={styles['workspace-heading']}>
                  <div>
                    <h2>Your criteria</h2>
                    <p>Tell Jobiest what you are looking for, once.</p>
                  </div>
                  <span className={styles['small-label']}>Sample data</span>
                </div>
                <div className={styles['pref-rows']}>
                  <div className={styles['pref-row']}><span>Target roles</span><strong>Senior Product Manager, Product Lead</strong></div>
                  <div className={styles['pref-row']}><span>Locations</span><strong>Lagos + Remote</strong></div>
                  <div className={styles['pref-row']}><span>Employment type</span><strong>Full-time</strong></div>
                  <div className={styles['pref-row']}><span>Salary floor</span><strong>₦600,000 / month</strong></div>
                  <div className={styles['pref-row']}><span>Daily target</span><strong>10 applications a day</strong></div>
                  <div className={`${styles['pref-row']} ${styles['pref-row-hot']}`}><span>Send policy</span><strong>I approve every send</strong></div>
                </div>
                <p className={styles['context-note']}><Icon name="check" small /> Change anything anytime. The agent works inside your rules.</p>
              </section>
            )}

            {active === 1 && (
              <section aria-label="Found for you screen">
                <div className={styles['workspace-heading']}>
                  <div>
                    <h2>Found for you</h2>
                    <p>Roles your agent found on employer job boards, inside your rules.</p>
                  </div>
                  <span className={styles['small-label']}>Sample data</span>
                </div>
                <ul className={styles['found-list']}>
                  <li>
                    <span className={styles['found-main']}>
                      <strong>Senior Product Manager</strong>
                      <em>Sabilux Fintech · Lagos (hybrid) · ₦850,000/mo</em>
                      <span className={styles['found-match']}>Matches: target role · Lagos · above your salary floor · via Greenhouse</span>
                    </span>
                    <span className={`${styles['tracker-chip']} ${styles['chip-ready']}`}>Ready for your approval</span>
                  </li>
                  <li>
                    <span className={styles['found-main']}>
                      <strong>Product Lead, Payments</strong>
                      <em>Paytrail · Remote (WAT ±2) · ₦980,000/mo</em>
                      <span className={styles['found-match']}>Matches: target role · remote · above your salary floor · via Lever</span>
                    </span>
                    <span className={`${styles['tracker-chip']} ${styles['chip-manual']}`}>Documents drafted</span>
                  </li>
                  <li>
                    <span className={styles['found-main']}>
                      <strong>Group Product Manager</strong>
                      <em>Trustline Health · Lagos · ₦1,300,000/mo</em>
                      <span className={styles['found-match']}>Matches: seniority · Lagos · well above your floor · via Greenhouse</span>
                    </span>
                    <span className={`${styles['tracker-chip']} ${styles['chip-ready']}`}>Ready for your approval</span>
                  </li>
                </ul>
                <p className={styles['paste-hint']}><Icon name="arrow" small /> Spotted a role yourself? Paste any job link and the agent takes it from there.</p>
                <p className={styles['context-note']}><Icon name="shield" small /> Discovery runs on paid plans and only reads public employer boards. Nothing sends without your approval.</p>
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
                    <span className={styles['tracker-title']}><strong>Product Lead, Health</strong><em>Company site</em></span>
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
