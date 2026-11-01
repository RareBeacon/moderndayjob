'use client';

import { useRef, useState } from 'react';
import styles from './apply.module.css';
import {
  EARLY_STAGE_TEAM_STRUCTURE,
  IMMEDIATE_PRIORITY_ROLES,
  PARTNER_CATEGORIES,
  PARTNER_USE_CASES,
  PROGRAMME_DEPARTMENTS,
  PROGRAMME_TRACKS,
  PUBLIC_ANNOUNCEMENT_TEXT,
  WHO_CAN_JOIN,
  WORKING_ARRANGEMENTS,
  type PartnerOrganizationType,
  type ProgrammeDepartmentCode,
  type ProgrammeTrack,
  type WorkingArrangement,
} from '@/lib/programme/catalog';

export function ApplyPortalClient({ initialTrack = 'JOIN_TEAM' }: { initialTrack?: ProgrammeTrack }) {
  const formRef = useRef<HTMLDivElement | null>(null);

  const [track, setTrack] = useState<ProgrammeTrack>(initialTrack);
  const [department, setDepartment] = useState<ProgrammeDepartmentCode>('CONTENT_MEDIA');
  const [roleTitle, setRoleTitle] = useState('Content Creator');
  const [arrangement, setArrangement] = useState<WorkingArrangement>(
    initialTrack === 'PARTNER' ? 'STRATEGIC_PARTNERSHIP' : initialTrack === 'COLLABORATOR' ? 'FREELANCE' : 'PART_TIME',
  );
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [city, setCity] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationType, setOrganizationType] = useState<PartnerOrganizationType>('US_COMPANY');
  const [organizationWebsite, setOrganizationWebsite] = useState('');
  const [partnershipMarket, setPartnershipMarket] = useState<'US' | 'UK' | 'AFRICA' | 'GLOBAL' | 'OTHER'>('US');
  const [partnershipUseCase, setPartnershipUseCase] = useState(PARTNER_USE_CASES[0]);
  const [availabilityHours, setAvailabilityHours] = useState('15');
  const [experienceSummary, setExperienceSummary] = useState('');
  const [motivationStatement, setMotivationStatement] = useState('');
  const [compensationExpectation, setCompensationExpectation] = useState('');
  const [sourceChannel, setSourceChannel] = useState('LinkedIn');
  const [termsAcknowledged, setTermsAcknowledged] = useState(false);
  const [websiteTrap, setWebsiteTrap] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [copiedAnnouncement, setCopiedAnnouncement] = useState(false);

  function selectTrackAndScroll(nextTrack: ProgrammeTrack) {
    setTrack(nextTrack);
    setSubmittedRef(null);
    setErrorMsg('');
    if (nextTrack === 'PARTNER') {
      setDepartment('EXTERNAL_PARTNER');
      setArrangement('STRATEGIC_PARTNERSHIP');
      setRoleTitle('Employer Talent Discovery & Hiring Pilot');
    } else if (nextTrack === 'COLLABORATOR') {
      setDepartment('CONTENT_MEDIA');
      setArrangement('FREELANCE');
      setRoleTitle('Independent Growth / Creative Collaborator');
    } else {
      setDepartment('CONTENT_MEDIA');
      setArrangement('PART_TIME');
      setRoleTitle('Content Creator');
    }
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectRoleAndScroll(role: string, dept: Exclude<ProgrammeDepartmentCode, 'EXTERNAL_PARTNER'>) {
    setTrack('JOIN_TEAM');
    setDepartment(dept);
    setRoleTitle(role);
    if (role.toLowerCase().includes('intern')) {
      setArrangement('INTERNSHIP');
    } else if (arrangement === 'STRATEGIC_PARTNERSHIP') {
      setArrangement('PART_TIME');
    }
    setSubmittedRef(null);
    setErrorMsg('');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    if (!termsAcknowledged) {
      setErrorMsg('Please confirm that you understand the collaboration stage and transparent arrangement terms.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/founding-programme/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          track,
          department: track === 'PARTNER' ? 'EXTERNAL_PARTNER' : department,
          roleTitle,
          arrangement: track === 'PARTNER' ? 'STRATEGIC_PARTNERSHIP' : arrangement,
          applicantName,
          applicantEmail,
          applicantPhone: applicantPhone || undefined,
          country,
          city: city || undefined,
          linkedinUrl: linkedinUrl || undefined,
          portfolioUrl: portfolioUrl || undefined,
          resumeUrl: resumeUrl || undefined,
          organizationName: track === 'PARTNER' ? organizationName : organizationName || undefined,
          organizationType: track === 'PARTNER' ? organizationType : undefined,
          organizationWebsite: track === 'PARTNER' ? organizationWebsite || undefined : undefined,
          partnershipMarket: track === 'PARTNER' ? partnershipMarket : undefined,
          partnershipUseCase: track === 'PARTNER' ? partnershipUseCase : undefined,
          availabilityHoursPerWeek: track !== 'PARTNER' && availabilityHours ? Number(availabilityHours) : undefined,
          experienceSummary,
          motivationStatement,
          compensationExpectation: compensationExpectation || undefined,
          sourceChannel: sourceChannel || undefined,
          termsAcknowledged: true,
          websiteTrap,
        }),
      });
      const out = await res.json();
      if (!res.ok || !out.ok) {
        setErrorMsg(out.message ?? 'Could not submit right now. Please review all fields and try again.');
        return;
      }
      setSubmittedRef(out.referenceCode);
    } catch {
      setErrorMsg('Network error while submitting. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyAnnouncement() {
    try {
      await navigator.clipboard.writeText(PUBLIC_ANNOUNCEMENT_TEXT);
      setCopiedAnnouncement(true);
      setTimeout(() => setCopiedAnnouncement(false), 2500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.container}>
          <span className={styles.eyebrow}>Founding Team &amp; Strategic Partnerships Programme</span>
          <h1 className={styles.heroTitle}>
            Help build a global AI career and talent company from its founding stage.
          </h1>
          <p className={styles.heroLead}>
            Jobiest is an AI-powered career and recruitment technology company starting from Africa with a 10-year
            ambition to become global talent infrastructure. We are opening our founding contributor network,
            internships, freelance collaborations, and US/UK &amp; institutional partnerships.
          </p>
          <div className={styles.heroActions}>
            <button type="button" className={styles.primaryBtn} onClick={() => selectTrackAndScroll('JOIN_TEAM')}>
              Join the Founding Team
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => selectTrackAndScroll('PARTNER')}>
              Become a Strategic Partner
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => selectTrackAndScroll('COLLABORATOR')}>
              Collaborate as a Specialist
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="entry-points-heading">
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <p className={styles.sectionEyebrow}>Three Entry Points</p>
            <h2 id="entry-points-heading">Choose how you want to build with Jobiest</h2>
            <p>
              Whether you are an ambitious builder, an employer in the US or UK looking for qualified talent, a
              university or agency partner, or an independent specialist, there is a structured path for you.
            </p>
          </div>

          <div className={styles.trackGrid}>
            {PROGRAMME_TRACKS.map((item) => (
              <article
                key={item.code}
                className={`${styles.trackCard} ${track === item.code ? styles.trackCardActive : ''}`}
              >
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.subtitle}</p>
                </div>
                <button
                  type="button"
                  className={track === item.code ? styles.primaryBtn : styles.ghostBtn}
                  onClick={() => selectTrackAndScroll(item.code)}
                >
                  {item.ctaLabel}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="priority-roles-heading">
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <p className={styles.sectionEyebrow}>Immediate Recruitment Priorities</p>
            <h2 id="priority-roles-heading">First 10 positions we are prioritizing right now</h2>
            <p>
              Roles #1 to #5 receive immediate priority review because our March 2027 milestones (1,000 structured
              talent members, 100 paying subscribers, and 50 documented US &amp; UK company partnerships) depend
              directly on visibility, acquisition, and employer outreach.
            </p>
          </div>

          <div className={styles.priorityGrid}>
            {IMMEDIATE_PRIORITY_ROLES.map((item) => (
              <article
                key={item.rank}
                className={`${styles.priorityCard} ${item.immediateWave ? styles.priorityTop : ''}`}
              >
                <div>
                  <div className={styles.badgeRow}>
                    <span className={styles.rankBadge}>Priority #{item.rank}</span>
                    {item.immediateWave && <span className={styles.waveBadge}>Top 5 Immediate Wave</span>}
                  </div>
                  <h3 style={{ fontSize: 17, margin: '10px 0 6px' }}>{item.role}</h3>
                  <p style={{ fontSize: 13.5, color: '#475569', margin: 0, lineHeight: 1.5 }}>{item.responsibility}</p>
                </div>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => selectRoleAndScroll(item.role, item.department)}
                >
                  Apply for {item.role}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="departments-heading">
        <div className={styles.container}>
          <div className={styles.sectionHead}>
            <p className={styles.sectionEyebrow}>Six Departments</p>
            <h2 id="departments-heading">Explore roles across our founding organization</h2>
            <p>Click any role below to load it directly into the application form.</p>
          </div>

          <div className={styles.deptGrid}>
            {PROGRAMME_DEPARTMENTS.map((dept) => (
              <article key={dept.code} className={styles.deptCard}>
                <div className={styles.deptHeader}>
                  <span className={styles.deptLetter}>{dept.letter}</span>
                  <h3 style={{ fontSize: 17.5, margin: 0 }}>{dept.name}</h3>
                </div>
                <p className={styles.deptGoal}>Goal: {dept.goal}</p>
                <div className={styles.rolePills}>
                  {dept.roles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={styles.rolePill}
                      onClick={() => selectRoleAndScroll(r, dept.code)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.infoGrid}>
            <div className={styles.infoPanel}>
              <p className={styles.sectionEyebrow}>Working Arrangements</p>
              <h3>Flexible ways to contribute</h3>
              <div className={styles.arrangementList}>
                {WORKING_ARRANGEMENTS.map((a) => (
                  <div key={a.code} className={styles.arrangementItem}>
                    <strong>{a.label}</strong>
                    <span>{a.description}</span>
                  </div>
                ))}
              </div>
              <div className={styles.transparencyNote}>
                <strong>Transparency &amp; Stage Commitment:</strong> Jobiest is an ambitious early-stage company.
                Internship, volunteer, part-time, freelance, full-time, and partnership arrangements carry clear
                written terms, measurable deliverables, and a 60-day contribution and performance review. Productive
                work is never misrepresented as guaranteed future employment or equity, and any unpaid student
                internship is structured to be genuinely educational and legally appropriate.
              </div>
            </div>

            <div className={styles.infoPanel}>
              <p className={styles.sectionEyebrow}>Who Can Join &amp; Partner</p>
              <h3>Open to builders &amp; institutions</h3>
              <p style={{ fontSize: 14, color: '#475569', marginTop: 0 }}>
                We welcome proactive, resourceful people who take ownership:
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
                {WHO_CAN_JOIN.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <h3 style={{ marginTop: 22 }}>Early-Stage Founding Structure (10-15 Network)</h3>
              <div className={styles.arrangementList}>
                {EARLY_STAGE_TEAM_STRUCTURE.map((u) => (
                  <div key={u.unit} className={styles.arrangementItem}>
                    <strong>
                      {u.unit} · <span style={{ fontWeight: 500 }}>{u.headcount}</span>
                    </strong>
                    <span>{u.focus}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} ref={formRef} id="application-form" aria-labelledby="apply-form-heading">
        <div className={styles.container}>
          <div className={styles.formShell}>
            <p className={styles.sectionEyebrow}>Official Application &amp; Partnership Intake</p>
            <h2 id="apply-form-heading" style={{ fontSize: 26, margin: '0 0 8px' }}>
              Submit your application or partnership proposal
            </h2>
            <p style={{ fontSize: 14.5, color: '#475569', margin: '0 0 20px' }}>
              Every submission goes directly into the Jobiest Founding Team &amp; Partnerships CRM and receives a
              tracking reference code.
            </p>

            <div className={styles.trackTabs} role="tablist" aria-label="Application track">
              {PROGRAMME_TRACKS.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  role="tab"
                  aria-selected={track === t.code}
                  className={`${styles.trackTab} ${track === t.code ? styles.trackTabActive : ''}`}
                  onClick={() => {
                    setTrack(t.code);
                    setSubmittedRef(null);
                    if (t.code === 'PARTNER') {
                      setDepartment('EXTERNAL_PARTNER');
                      setArrangement('STRATEGIC_PARTNERSHIP');
                      if (!roleTitle.toLowerCase().includes('partner') && !roleTitle.toLowerCase().includes('pilot')) {
                        setRoleTitle('Employer Talent Discovery & Hiring Pilot');
                      }
                    } else if (t.code === 'COLLABORATOR') {
                      setArrangement('FREELANCE');
                    }
                  }}
                >
                  {t.title}
                </button>
              ))}
            </div>

            {submittedRef ? (
              <div className={styles.successCard} role="status">
                <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>Submission received - Reference {submittedRef}</h3>
                <p style={{ margin: '0 0 14px', lineHeight: 1.6 }}>
                  Thank you for reaching out to build with Jobiest. Your details have been logged in our CRM under
                  reference <strong>{submittedRef}</strong>, and a confirmation email is on its way to{' '}
                  <strong>{applicantEmail}</strong>.
                </p>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => {
                    setSubmittedRef(null);
                    setExperienceSummary('');
                    setMotivationStatement('');
                  }}
                >
                  Submit another inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {errorMsg && (
                  <div
                    role="alert"
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#991b1b',
                      padding: '12px 14px',
                      borderRadius: 10,
                      marginBottom: 16,
                      fontSize: 13.5,
                    }}
                  >
                    {errorMsg}
                  </div>
                )}

                <input
                  type="text"
                  name="websiteTrap"
                  value={websiteTrap}
                  onChange={(e) => setWebsiteTrap(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                />

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Full Name *</span>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={140}
                      value={applicantName}
                      onChange={(e) => setApplicantName(e.target.value)}
                      placeholder="Adaeze Okafor"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Email Address *</span>
                    <input
                      type="email"
                      required
                      maxLength={200}
                      value={applicantEmail}
                      onChange={(e) => setApplicantEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Phone / WhatsApp</span>
                    <input
                      type="tel"
                      maxLength={40}
                      value={applicantPhone}
                      onChange={(e) => setApplicantPhone(e.target.value)}
                      placeholder="+234 800 000 0000"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Country *</span>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="Nigeria / United States / United Kingdom"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>City</span>
                    <input
                      type="text"
                      maxLength={100}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Lagos / London / Austin"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>How did you hear about us?</span>
                    <select value={sourceChannel} onChange={(e) => setSourceChannel(e.target.value)}>
                      <option value="LinkedIn">LinkedIn</option>
                      <option value="X / Twitter">X / Twitter</option>
                      <option value="University / Campus Community">University / Campus Community</option>
                      <option value="Professional Community">Professional Community</option>
                      <option value="Direct Outreach">Direct Outreach</option>
                      <option value="Referral">Referral</option>
                      <option value="Jobiest Website">Jobiest Website</option>
                    </select>
                  </label>
                </div>

                {track === 'PARTNER' ? (
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Company / Institution Name *</span>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={180}
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        placeholder="Acme Technologies Ltd"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Organization Category *</span>
                      <select
                        value={organizationType}
                        onChange={(e) => setOrganizationType(e.target.value as PartnerOrganizationType)}
                      >
                        {PARTNER_CATEGORIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Primary Market *</span>
                      <select
                        value={partnershipMarket}
                        onChange={(e) =>
                          setPartnershipMarket(e.target.value as 'US' | 'UK' | 'AFRICA' | 'GLOBAL' | 'OTHER')
                        }
                      >
                        <option value="US">United States</option>
                        <option value="UK">United Kingdom</option>
                        <option value="AFRICA">Africa (Nigeria, Ghana, Kenya, SA, etc.)</option>
                        <option value="GLOBAL">Global / Remote-First</option>
                        <option value="OTHER">Europe / Canada / Asia / Other</option>
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Proposed Collaboration Use Case *</span>
                      <select
                        value={partnershipUseCase}
                        onChange={(e) => {
                          setPartnershipUseCase(e.target.value);
                          setRoleTitle(e.target.value);
                        }}
                      >
                        {PARTNER_USE_CASES.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Organization Website</span>
                      <input
                        type="text"
                        maxLength={300}
                        value={organizationWebsite}
                        onChange={(e) => setOrganizationWebsite(e.target.value)}
                        placeholder="https://company.com"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Your Role / Decision-Maker Title *</span>
                      <input
                        type="text"
                        required
                        maxLength={160}
                        value={roleTitle}
                        onChange={(e) => setRoleTitle(e.target.value)}
                        placeholder="Head of Talent / Partnerships Lead / Founder"
                      />
                    </label>
                  </div>
                ) : (
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Department *</span>
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value as ProgrammeDepartmentCode)}
                      >
                        {PROGRAMME_DEPARTMENTS.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.letter}. {d.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Target Role / Specialty *</span>
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={160}
                        value={roleTitle}
                        onChange={(e) => setRoleTitle(e.target.value)}
                        placeholder="e.g. Content Creator, B2B Outreach Associate"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Preferred Working Arrangement *</span>
                      <select
                        value={arrangement}
                        onChange={(e) => setArrangement(e.target.value as WorkingArrangement)}
                      >
                        {WORKING_ARRANGEMENTS.filter((w) => w.code !== 'STRATEGIC_PARTNERSHIP').map((w) => (
                          <option key={w.code} value={w.code}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span>Weekly Availability (hours/week)</span>
                      <input
                        type="number"
                        min={1}
                        max={80}
                        value={availabilityHours}
                        onChange={(e) => setAvailabilityHours(e.target.value)}
                        placeholder="15"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>LinkedIn Profile URL</span>
                      <input
                        type="text"
                        maxLength={300}
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        placeholder="https://linkedin.com/in/yourprofile"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Portfolio / Work Samples / GitHub URL</span>
                      <input
                        type="text"
                        maxLength={300}
                        value={portfolioUrl}
                        onChange={(e) => setPortfolioUrl(e.target.value)}
                        placeholder="https://portfolio.com"
                      />
                    </label>

                    <label className={styles.field}>
                      <span>CV / Resume Link (Google Drive, Jobiest Portfolio, etc.)</span>
                      <input
                        type="text"
                        maxLength={300}
                        value={resumeUrl}
                        onChange={(e) => setResumeUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Compensation / Arrangement Expectations (optional)</span>
                      <input
                        type="text"
                        maxLength={300}
                        value={compensationExpectation}
                        onChange={(e) => setCompensationExpectation(e.target.value)}
                        placeholder="e.g. Educational internship / Project stipend / Retainer"
                      />
                    </label>
                  </div>
                )}

                <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr' }}>
                  <label className={styles.field}>
                    <span>
                      {track === 'PARTNER'
                        ? 'Tell us about your organization, hiring needs, or community *'
                        : 'Relevant Experience, Skills & Past Work (min 20 chars) *'}
                    </span>
                    <textarea
                      required
                      minLength={20}
                      maxLength={3000}
                      value={experienceSummary}
                      onChange={(e) => setExperienceSummary(e.target.value)}
                      placeholder={
                        track === 'PARTNER'
                          ? 'Share the roles you hire for, your community reach, or what a pilot collaboration with Jobiest would look like.'
                          : 'Share concrete examples of content, campaigns, outreach, design, strategy, or engineering projects you have shipped.'
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span>
                      {track === 'PARTNER'
                        ? 'Proposed Next Step & Desired Outcomes *'
                        : 'Why Jobiest, and what would you deliver in your first 60 days? *'}
                    </span>
                    <textarea
                      required
                      minLength={20}
                      maxLength={3000}
                      value={motivationStatement}
                      onChange={(e) => setMotivationStatement(e.target.value)}
                      placeholder={
                        track === 'PARTNER'
                          ? 'e.g. 30-day pilot shortlist for 2 remote engineering/operations roles, or co-hosted graduate career workshop.'
                          : 'Describe the measurable results you want to drive in your first 60 days on the founding contributor network.'
                      }
                    />
                  </label>
                </div>

                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={termsAcknowledged}
                    onChange={(e) => setTermsAcknowledged(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    I understand that Jobiest is an early-stage startup and that all internships, contributor roles,
                    freelance projects, employment offers, and partnerships are governed by transparent written terms
                    and a 60-day contribution review.
                  </span>
                </label>

                <button type="submit" className={styles.primaryBtn} disabled={submitting}>
                  {submitting
                    ? 'Submitting to Jobiest CRM…'
                    : track === 'PARTNER'
                      ? 'Submit Partnership Proposal'
                      : track === 'COLLABORATOR'
                        ? 'Submit Collaborator Application'
                        : 'Submit Founding Team Application'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.announcementBox}>
            <p className={styles.sectionEyebrow} style={{ color: '#93c5fd' }}>
              Share With Your Network
            </p>
            <h2 style={{ fontSize: 22, margin: '0 0 8px', color: '#ffffff' }}>
              Official Public Recruitment &amp; Partnership Announcement
            </h2>
            <p style={{ fontSize: 14, color: '#cbd5e1', margin: 0 }}>
              Know an ambitious creator, B2B growth builder, engineer, university career lead, or US/UK hiring manager?
              Share our call for founding contributors and partners on LinkedIn or X.
            </p>
            <pre className={styles.announcementPre}>{PUBLIC_ANNOUNCEMENT_TEXT}</pre>
            <button type="button" className={styles.primaryBtn} onClick={copyAnnouncement}>
              {copiedAnnouncement ? 'Announcement copied!' : 'Copy announcement for LinkedIn / X'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
