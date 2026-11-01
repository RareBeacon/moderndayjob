'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ASSESSMENT_ROUTES,
  AVAILABILITY_OPTIONS,
  CAREER_CATEGORIES,
  CONSENT_DEFINITIONS,
  CONSENT_VERSION,
  EMPLOYMENT_PREFERENCES,
  REMOTE_PREFERENCES,
  SENIORITY_LEVELS,
  SUPPORTED_CURRENCIES,
  type AssessmentRoute,
  type ConsentPurpose,
} from '@/lib/talent-pool/constants';
import type { OnboardingInspectionResult } from '@/lib/talent-pool/onboarding-inspector';
import styles from './talent-pool.module.css';

interface Props {
  initialOnboarding: OnboardingInspectionResult;
  initialPreferences: {
    allow_cv_access: boolean;
    allow_contact_requests: boolean;
    blocked_employer_domains: string[];
  };
}

export function TalentPoolApplyClient({ initialOnboarding, initialPreferences }: Props) {
  const router = useRouter();
  const snap = initialOnboarding.snapshot;

  const [onboarding, setOnboarding] = useState<OnboardingInspectionResult>(initialOnboarding);
  const [step, setStep] = useState<'COMPLETE_PROFILE' | 'REVIEW_AND_CONSENT'>(
    initialOnboarding.readyToApply ? 'REVIEW_AND_CONSENT' : 'COMPLETE_PROFILE',
  );

  const [fullName, setFullName] = useState(snap.full_name ?? '');
  const [headline, setHeadline] = useState(snap.headline ?? '');
  const [location, setLocation] = useState(snap.location ?? '');
  const [country, setCountry] = useState(snap.country ?? '');
  const [timeZone, setTimeZone] = useState(
    snap.time_zone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC'),
  );
  const [careerCategory, setCareerCategory] = useState<string>(snap.career_category ?? CAREER_CATEGORIES[0]);
  const [seniorityLevel, setSeniorityLevel] = useState<string>(snap.seniority_level ?? 'MID');
  const [targetRolesText, setTargetRolesText] = useState(snap.target_roles.join(', '));
  const [yearsOfExperience, setYearsOfExperience] = useState<string>(
    snap.years_of_experience !== null ? String(snap.years_of_experience) : '',
  );

  const [expCompany, setExpCompany] = useState(snap.experience[0]?.company ?? '');
  const [expTitle, setExpTitle] = useState(snap.experience[0]?.title ?? '');
  const [expDesc, setExpDesc] = useState(snap.experience[0]?.description ?? '');
  const [expNotApplicable, setExpNotApplicable] = useState(snap.not_applicable.includes('experience'));

  const [eduInstitution, setEduInstitution] = useState(snap.education[0]?.institution ?? '');
  const [eduQualification, setEduQualification] = useState(snap.education[0]?.qualification ?? '');
  const [eduNotApplicable, setEduNotApplicable] = useState(snap.not_applicable.includes('education'));

  const [skillsText, setSkillsText] = useState(snap.skills.join(', '));
  const [competenciesText, setCompetenciesText] = useState(snap.technical_competencies.join(', '));
  const [certName, setCertName] = useState(snap.certifications[0]?.name ?? '');
  const [certIssuer, setCertIssuer] = useState(snap.certifications[0]?.issuer ?? '');
  const [qualificationsText, setQualificationsText] = useState(snap.relevant_qualifications.join(', '));
  const [portfolioUrl, setPortfolioUrl] = useState(snap.portfolio_url ?? '');
  const [projectName, setProjectName] = useState(snap.projects[0]?.name ?? '');
  const [projectDesc, setProjectDesc] = useState(snap.projects[0]?.description ?? '');

  const [employmentTypes, setEmploymentTypes] = useState<string[]>(
    snap.employment_types.length > 0 ? snap.employment_types : ['FULL_TIME'],
  );
  const [remoteTypes, setRemoteTypes] = useState<string[]>(
    snap.remote_types.length > 0 ? snap.remote_types : ['REMOTE'],
  );
  const [salaryCurrency, setSalaryCurrency] = useState(snap.salary_currency || 'USD');
  const [salaryMin, setSalaryMin] = useState(snap.salary_min !== null ? String(snap.salary_min) : '');
  const [salaryMax, setSalaryMax] = useState(snap.salary_max !== null ? String(snap.salary_max) : '');
  const [availability, setAvailability] = useState(snap.availability ?? 'IMMEDIATE');
  const [workAuthorization, setWorkAuthorization] = useState(snap.work_authorization ?? '');

  const [assessmentRoute, setAssessmentRoute] = useState<AssessmentRoute>(snap.preferred_assessment_route);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [scheduledIsoLocal, setScheduledIsoLocal] = useState('');
  const [allowCvAccess, setAllowCvAccess] = useState(initialPreferences.allow_cv_access);
  const [allowContactRequests, setAllowContactRequests] = useState(initialPreferences.allow_contact_requests);
  const [blockedDomainsText, setBlockedDomainsText] = useState(
    initialPreferences.blocked_employer_domains.join(', '),
  );
  const [confirmedAccurate, setConfirmedAccurate] = useState(false);
  const [consents, setConsents] = useState<Record<ConsentPurpose, boolean>>({
    AI_ASSESSMENT: false,
    AUDIO_VIDEO_PROCESSING: false,
    INTERVIEW_RECORDING: false,
    HUMAN_ASSESSMENT_REVIEW: false,
    EMPLOYER_DISCOVERY: false,
    DATA_RETENTION_WITHDRAWAL: false,
  });

  const [savingIntake, setSavingIntake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function toggleArrayItem(list: string[], value: string, setter: (next: string[]) => void) {
    if (list.includes(value)) {
      setter(list.filter((x) => x !== value));
    } else {
      setter([...list, value]);
    }
  }

  async function handleSaveIntake(e: FormEvent) {
    e.preventDefault();
    setSavingIntake(true);
    setBanner(null);

    const preservedAdditionalExp = snap.experience.slice(1);
    const experiencePayload = expNotApplicable
      ? []
      : expCompany.trim() && expTitle.trim()
        ? [{ company: expCompany.trim(), title: expTitle.trim(), description: expDesc.trim() || undefined }, ...preservedAdditionalExp]
        : snap.experience;

    const preservedAdditionalEdu = snap.education.slice(1);
    const educationPayload = eduNotApplicable
      ? []
      : eduInstitution.trim() && eduQualification.trim()
        ? [{ institution: eduInstitution.trim(), qualification: eduQualification.trim() }, ...preservedAdditionalEdu]
        : snap.education;

    const projectsPayload =
      projectName.trim()
        ? [{ name: projectName.trim(), description: projectDesc.trim() || undefined }, ...snap.projects.slice(1)]
        : snap.projects;

    const certificationsPayload =
      certName.trim() && certIssuer.trim()
        ? [{ name: certName.trim(), issuer: certIssuer.trim() }, ...snap.certifications.slice(1)]
        : snap.certifications;

    const naList: Array<'experience' | 'education' | 'projects'> = [];
    if (expNotApplicable) naList.push('experience');
    if (eduNotApplicable) naList.push('education');
    if (snap.not_applicable.includes('projects') && projectsPayload.length === 0) naList.push('projects');

    const payload = {
      full_name: fullName.trim(),
      headline: headline.trim(),
      location: location.trim(),
      country: country.trim(),
      time_zone: timeZone.trim() || 'UTC',
      career_category: careerCategory,
      seniority_level: seniorityLevel,
      target_roles: targetRolesText.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6),
      years_of_experience: Number(yearsOfExperience || 0),
      experience: experiencePayload,
      education: educationPayload,
      projects: projectsPayload,
      not_applicable: naList,
      skills: skillsText.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40),
      technical_competencies: competenciesText.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30),
      certifications: certificationsPayload,
      relevant_qualifications: qualificationsText.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20),
      portfolio_url: portfolioUrl.trim(),
      employment_types: employmentTypes,
      remote_types: remoteTypes,
      salary_currency: salaryCurrency,
      salary_min: salaryMin.trim() ? Number(salaryMin) : null,
      salary_max: salaryMax.trim() ? Number(salaryMax) : null,
      availability,
      work_authorization: workAuthorization.trim(),
      preferred_assessment_route: assessmentRoute,
    };

    try {
      const res = await fetch('/api/talent-pool/intake', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        onboarding?: OnboardingInspectionResult;
        message?: string;
      };
      if (res.ok && json.onboarding) {
        setOnboarding(json.onboarding);
        if (json.onboarding.readyToApply) {
          setStep('REVIEW_AND_CONSENT');
          setBanner({ kind: 'ok', text: 'Profile information saved. Please review and confirm your application below.' });
        } else {
          setBanner({
            kind: 'err',
            text: `Saved progress, but some required items are still missing: ${json.onboarding.missingRequired.map((f) => f.label).join(', ')}.`,
          });
        }
      } else {
        setBanner({
          kind: 'err',
          text: json.message ?? 'Please check all required fields (minimum 2 skills, at least 1 competency, valid URLs) and try again.',
        });
      }
    } finally {
      setSavingIntake(false);
    }
  }

  async function handleSubmitApplication(e: FormEvent) {
    e.preventDefault();
    if (!confirmedAccurate) {
      setBanner({ kind: 'err', text: 'Please confirm that your application snapshot is accurate before submitting.' });
      return;
    }

    setSubmitting(true);
    setBanner(null);
    try {
      const scheduledIso =
        scheduleLater && scheduledIsoLocal ? new Date(scheduledIsoLocal).toISOString() : null;
      const blockedDomains = blockedDomainsText
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);

      const res = await fetch('/api/talent-pool/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessment_route: assessmentRoute,
          scheduled_interview_at: scheduledIso,
          allow_cv_access: allowCvAccess,
          allow_contact_requests: allowContactRequests,
          blocked_employer_domains: blockedDomains,
          confirmed_information_accurate: true,
          consents,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sessionId?: string;
        message?: string;
      };
      if (res.ok && json.sessionId) {
        if (scheduledIso) {
          router.push('/talent-pool');
        } else {
          router.push(`/talent-pool/interview/${json.sessionId}`);
        }
      } else {
        setBanner({
          kind: 'err',
          text: json.message ?? 'Unable to submit application. Ensure every required consent checkbox is selected.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const currentSnap = onboarding.snapshot;

  return (
    <div className={styles.wrap}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/talent-pool" className={styles.secondaryBtn}>
          Back to Talent Pool
        </Link>
      </div>

      {banner && (
        <div role="alert" className={banner.kind === 'ok' ? styles.alertSuccess : styles.alertError}>
          {banner.text}
        </div>
      )}

      <div className={styles.panel} style={{ marginBottom: 22 }}>
        <div className={styles.sectionHeader} style={{ marginBottom: 10 }}>
          <div>
            <span className={styles.eyebrow}>Application &amp; Onboarding Inspection</span>
            <h1 className={styles.sectionTitle} style={{ fontSize: 26, marginTop: 10 }}>
              {step === 'COMPLETE_PROFILE'
                ? 'Step 1 of 2: Complete missing profile details'
                : 'Step 2 of 2: Confirm your snapshot & grant consent'}
            </h1>
            <p className={styles.sectionSub}>
              We inspected your existing Jobiest profile without inventing any missing details. Readiness:{' '}
              <strong>{onboarding.completenessScore}%</strong>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={step === 'COMPLETE_PROFILE' ? styles.primaryBtn : styles.secondaryBtn}
              onClick={() => setStep('COMPLETE_PROFILE')}
            >
              1. Profile details
            </button>
            <button
              type="button"
              className={step === 'REVIEW_AND_CONSENT' ? styles.primaryBtn : styles.secondaryBtn}
              disabled={!onboarding.readyToApply}
              onClick={() => setStep('REVIEW_AND_CONSENT')}
            >
              2. Review &amp; consent
            </button>
          </div>
        </div>

        <ul className={styles.checkList}>
          {onboarding.fields.map((field) => (
            <li
              key={field.key}
              className={`${styles.checkItem} ${!field.present && field.required ? styles.checkMissing : ''}`}
            >
              <span>
                {field.label}
                {!field.required ? ' (optional)' : ''}
              </span>
              <strong style={{ color: field.present ? 'var(--color-success)' : field.required ? '#b45309' : 'var(--color-muted)' }}>
                {field.present ? (field.note ?? 'Ready') : field.required ? 'Missing' : 'Not added'}
              </strong>
            </li>
          ))}
        </ul>
      </div>

      {step === 'COMPLETE_PROFILE' ? (
        <form onSubmit={(e) => void handleSaveIntake(e)} className={styles.panel}>
          <h2 className={styles.sectionTitle}>Complete or update your career information</h2>
          <p className={styles.sectionSub} style={{ marginBottom: 18 }}>
            Changes saved here keep your Jobiest Career Profile in sync and preserve your data if you leave and return.
          </p>

          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label htmlFor="tp-full-name">Full name *</label>
              <input id="tp-full-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-headline">Professional headline *</label>
              <input
                id="tp-headline"
                required
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Senior Backend Engineer | Distributed Systems"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-location">City / State *</label>
              <input id="tp-location" required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lagos / London / Remote" />
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-country">Country *</label>
              <input id="tp-country" required value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Nigeria" />
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-timezone">Time zone *</label>
              <input id="tp-timezone" required value={timeZone} onChange={(e) => setTimeZone(e.target.value)} placeholder="Africa/Lagos" />
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-category">Career category *</label>
              <select id="tp-category" value={careerCategory} onChange={(e) => setCareerCategory(e.target.value)}>
                {CAREER_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-seniority">Professional level *</label>
              <select id="tp-seniority" value={seniorityLevel} onChange={(e) => setSeniorityLevel(e.target.value)}>
                {SENIORITY_LEVELS.map((lvl) => (
                  <option key={lvl.code} value={lvl.code}>
                    {lvl.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-yoe">Years of experience *</label>
              <input
                id="tp-yoe"
                type="number"
                step="0.5"
                min="0"
                max="60"
                required
                value={yearsOfExperience}
                onChange={(e) => setYearsOfExperience(e.target.value)}
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="tp-target-roles">Target job titles (comma separated) *</label>
              <input
                id="tp-target-roles"
                required
                value={targetRolesText}
                onChange={(e) => setTargetRolesText(e.target.value)}
                placeholder="Backend Engineer, Platform Engineer"
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="tp-skills">Skills (comma separated, at least 2) *</label>
              <input
                id="tp-skills"
                required
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                placeholder="TypeScript, PostgreSQL, Node.js, System Design"
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="tp-competencies">Technical / domain competencies (comma separated) *</label>
              <input
                id="tp-competencies"
                required
                value={competenciesText}
                onChange={(e) => setCompetenciesText(e.target.value)}
                placeholder="API Architecture, Database Performance, Incident Response"
              />
            </div>

            <div className={styles.field}>
              <label>
                <input
                  type="checkbox"
                  checked={expNotApplicable}
                  onChange={(e) => setExpNotApplicable(e.target.checked)}
                />{' '}
                No prior employment history yet (entry-level)
              </label>
              {!expNotApplicable && (
                <>
                  <input
                    value={expCompany}
                    onChange={(e) => setExpCompany(e.target.value)}
                    placeholder="Most recent company *"
                  />
                  <input
                    value={expTitle}
                    onChange={(e) => setExpTitle(e.target.value)}
                    placeholder="Role title *"
                  />
                  <textarea
                    rows={2}
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    placeholder="Key outcomes and responsibilities"
                  />
                </>
              )}
            </div>

            <div className={styles.field}>
              <label>
                <input
                  type="checkbox"
                  checked={eduNotApplicable}
                  onChange={(e) => setEduNotApplicable(e.target.checked)}
                />{' '}
                Self-taught / formal degree not applicable
              </label>
              {!eduNotApplicable && (
                <>
                  <input
                    value={eduInstitution}
                    onChange={(e) => setEduInstitution(e.target.value)}
                    placeholder="University or institution *"
                  />
                  <input
                    value={eduQualification}
                    onChange={(e) => setEduQualification(e.target.value)}
                    placeholder="Degree / qualification *"
                  />
                </>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-cert-name">Certification (optional)</label>
              <input id="tp-cert-name" value={certName} onChange={(e) => setCertName(e.target.value)} placeholder="AWS Certified Solutions Architect" />
              <input value={certIssuer} onChange={(e) => setCertIssuer(e.target.value)} placeholder="Issuing organization (e.g. Amazon Web Services)" />
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-project-name">Notable project (optional)</label>
              <input id="tp-project-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" />
              <input value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} placeholder="Brief impact summary" />
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-portfolio-url">Portfolio URL (optional)</label>
              <input
                id="tp-portfolio-url"
                type="url"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-qualifications">Relevant qualifications (comma separated, optional)</label>
              <input
                id="tp-qualifications"
                value={qualificationsText}
                onChange={(e) => setQualificationsText(e.target.value)}
                placeholder="B.Sc. Computer Science, ACCA, PMP"
              />
            </div>

            <div className={styles.field}>
              <label>Work preferences *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {EMPLOYMENT_PREFERENCES.map((pref) => (
                  <label key={pref} style={{ fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={employmentTypes.includes(pref)}
                      onChange={() => toggleArrayItem(employmentTypes, pref, setEmploymentTypes)}
                    />{' '}
                    {pref.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label>Remote / hybrid / onsite *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {REMOTE_PREFERENCES.map((mode) => (
                  <label key={mode} style={{ fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={remoteTypes.includes(mode)}
                      onChange={() => toggleArrayItem(remoteTypes, mode, setRemoteTypes)}
                    />{' '}
                    {mode}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label>Annual salary expectations (optional)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '95px 1fr 1fr', gap: 8 }}>
                <select value={salaryCurrency} onChange={(e) => setSalaryCurrency(e.target.value)}>
                  {SUPPORTED_CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
                <input type="number" min="0" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="Minimum" />
                <input type="number" min="0" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="Maximum" />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-availability">Availability *</label>
              <select id="tp-availability" value={availability} onChange={(e) => setAvailability(e.target.value)}>
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="tp-work-auth">Work authorization *</label>
              <input
                id="tp-work-auth"
                required
                value={workAuthorization}
                onChange={(e) => setWorkAuthorization(e.target.value)}
                placeholder="Authorized to work in Nigeria; open to global remote contracts or visa sponsorship"
              />
            </div>
          </div>

          <div className={styles.ctaRow}>
            <button type="submit" disabled={savingIntake} className={styles.primaryBtn}>
              {savingIntake ? 'Saving & validating...' : 'Save & Continue to Application Review'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => void handleSubmitApplication(e)} className={styles.panel}>
          <h2 className={styles.sectionTitle}>Application confirmation &amp; explicit consent</h2>
          <p className={styles.sectionSub} style={{ marginBottom: 18 }}>
            Review the exact snapshot that will be preserved with your Talent Pool application (Consent Version{' '}
            <code>{CONSENT_VERSION}</code>).
          </p>

          <div className={styles.statusCard} style={{ marginBottom: 20 }}>
            <div className={styles.fieldGrid}>
              <div>
                <span className={styles.statusLabel}>Candidate</span>
                <p><strong>{currentSnap.full_name}</strong> ({currentSnap.email})</p>
                <p className={styles.hint}>{currentSnap.headline}</p>
              </div>
              <div>
                <span className={styles.statusLabel}>Location &amp; authorization</span>
                <p>{currentSnap.location}, {currentSnap.country} ({currentSnap.time_zone ?? 'UTC'})</p>
                <p className={styles.hint}>{currentSnap.work_authorization}</p>
              </div>
              <div>
                <span className={styles.statusLabel}>Category &amp; experience</span>
                <p>{currentSnap.career_category} · {currentSnap.seniority_level} ({currentSnap.years_of_experience} yrs)</p>
                <p className={styles.hint}>Roles: {currentSnap.target_roles.join(', ')}</p>
              </div>
              <div>
                <span className={styles.statusLabel}>Skills &amp; competencies</span>
                <p>{currentSnap.skills.slice(0, 8).join(', ')}</p>
                <p className={styles.hint}>Competencies: {currentSnap.technical_competencies.join(', ')}</p>
              </div>
              <div>
                <span className={styles.statusLabel}>Preferences &amp; availability</span>
                <p>{currentSnap.availability} · {currentSnap.remote_types.join(', ')} · {currentSnap.employment_types.join(', ')}</p>
                <p className={styles.hint}>
                  Master CV: {currentSnap.master_cv_present ? currentSnap.master_cv_name : 'Not uploaded yet (optional)'}
                </p>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setStep('COMPLETE_PROFILE')}>
                Edit profile information
              </button>
            </div>
          </div>

          <div className={styles.fieldGrid} style={{ marginBottom: 20 }}>
            <div className={styles.field}>
              <label htmlFor="tp-route-select">Choose your assessment format</label>
              <select
                id="tp-route-select"
                value={assessmentRoute}
                onChange={(e) => setAssessmentRoute(e.target.value as AssessmentRoute)}
              >
                {ASSESSMENT_ROUTES.map((r) => (
                  <option key={r} value={r}>
                    {r === 'VIDEO_VOICE'
                      ? 'Video + Voice AI Interview (standard)'
                      : r === 'VOICE_ONLY'
                        ? 'Voice-Only AI Interview (low-bandwidth friendly)'
                        : 'Accessible Written Competency Assessment (no camera or microphone required)'}
                  </option>
                ))}
              </select>
              <span className={styles.hint}>
                Candidates who cannot use video or audio can select the Accessible Written route with zero penalty.
              </span>
            </div>

            <div className={styles.field}>
              <label>
                <input
                  type="checkbox"
                  checked={scheduleLater}
                  onChange={(e) => setScheduleLater(e.target.checked)}
                />{' '}
                Schedule interview for a later date/time instead of starting right away
              </label>
              {scheduleLater && (
                <input
                  type="datetime-local"
                  required
                  value={scheduledIsoLocal}
                  onChange={(e) => setScheduledIsoLocal(e.target.value)}
                />
              )}
            </div>

            <div className={styles.field}>
              <label>
                <input
                  type="checkbox"
                  checked={allowCvAccess}
                  onChange={(e) => setAllowCvAccess(e.target.checked)}
                />{' '}
                Permit verified employers to view my uploaded CV once approved
              </label>
            </div>

            <div className={styles.field}>
              <label htmlFor="tp-apply-blocked">Optional blocked employer domains</label>
              <input
                id="tp-apply-blocked"
                value={blockedDomainsText}
                onChange={(e) => setBlockedDomainsText(e.target.value)}
                placeholder="currentcompany.com"
              />
            </div>
          </div>

          <h3 style={{ fontSize: 17, marginBottom: 10, color: 'var(--color-primary-navy)' }}>
            Granular, purpose-specific consents
          </h3>
          <p className={styles.hint} style={{ marginBottom: 12 }}>
            Each consent applies strictly to its stated purpose and is recorded independently with version{' '}
            <code>{CONSENT_VERSION}</code>.
          </p>

          {CONSENT_DEFINITIONS.map((def) => {
            const required = def.requiredForRoutes.includes(assessmentRoute);
            return (
              <label key={def.purpose} className={styles.consentCard}>
                <input
                  type="checkbox"
                  checked={consents[def.purpose]}
                  onChange={(e) => setConsents({ ...consents, [def.purpose]: e.target.checked })}
                />
                <div>
                  <strong>
                    {def.title} {required ? '(Required)' : '(Optional for accessible written route)'}
                  </strong>
                  <p className={styles.hint} style={{ marginTop: 4 }}>
                    {def.summary}
                  </p>
                </div>
              </label>
            );
          })}

          <label className={styles.consentCard} style={{ background: 'var(--color-surface-soft)' }}>
            <input
              type="checkbox"
              checked={confirmedAccurate}
              onChange={(e) => setConfirmedAccurate(e.target.checked)}
            />
            <div>
              <strong>Confirmation of truthful profile information (Required)</strong>
              <p className={styles.hint} style={{ marginTop: 4 }}>
                I confirm that the profile, experience, skills, and qualifications shown in my application snapshot are
                truthful and accurate.
              </p>
            </div>
          </label>

          <div className={styles.ctaRow}>
            <button type="submit" disabled={submitting} className={styles.primaryBtn}>
              {submitting
                ? 'Submitting application...'
                : scheduleLater
                  ? 'Submit Application & Schedule Assessment'
                  : 'Submit Application & Proceed to Assessment'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
