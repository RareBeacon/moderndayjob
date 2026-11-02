'use client';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { AppShell } from '@/components/site/AppShell';

type Experience = { company: string; title: string; description?: string };
type Education = { institution: string; qualification: string };
type NaSection = 'experience' | 'education' | 'projects';

type FormFields = {
  full_name: string;
  roles: string;
  headline: string;
  summary: string;
  skills: string;
  portfolio: string;
  application_email: string;
};

type FieldErrorMap = Partial<
  Record<
    | 'full_name'
    | 'target_roles'
    | 'application_email'
    | 'headline'
    | 'summary'
    | 'skills'
    | 'links'
    | 'experience'
    | 'education',
    string[]
  >
>;

const EMPTY_FORM: FormFields = {
  full_name: '',
  roles: '',
  headline: '',
  summary: '',
  skills: '',
  portfolio: '',
  application_email: '',
};

const HEADLINE_MAX = 160;
const SUMMARY_MAX = 3000;
const TARGET_ROLES_MAX = 20;
const SKILLS_MAX = 60;

function splitList(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[,;\n]+/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function normalizePortfolioInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isBlankExperience(item: Experience): boolean {
  return !item.company.trim() && !item.title.trim() && !(item.description ?? '').trim();
}

function isBlankEducation(item: Education): boolean {
  return !item.institution.trim() && !item.qualification.trim();
}

export default function ProfilePage() {
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [experience, setExperience] = useState<Experience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [notApplicable, setNotApplicable] = useState<NaSection[]>([]);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'ok' | 'err' | ''>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        const profile = data.profile || {};
        const career = data.career || {};
        setForm({
          full_name: profile.full_name || '',
          roles: Array.isArray(profile.target_roles) ? profile.target_roles.join(', ') : '',
          headline: career.headline || '',
          summary: career.summary || '',
          skills: Array.isArray(career.skills) ? career.skills.join(', ') : '',
          portfolio: career.links?.portfolio || '',
          application_email: profile.application_email || '',
        });
        setExperience(Array.isArray(career.experience) ? career.experience : []);
        setEducation(Array.isArray(career.education) ? career.education : []);
        setNotApplicable(
          Array.isArray(career.not_applicable)
            ? career.not_applicable.filter((v: string): v is NaSection =>
                v === 'experience' || v === 'education' || v === 'projects',
              )
            : [],
        );
      })
      .catch(() => {
        if (active) {
          setStatusTone('err');
          setStatus('Could not load your profile.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function clearFieldError(fieldKey: keyof FieldErrorMap) {
    setFieldErrors((prev) => {
      if (!prev[fieldKey]) return prev;
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  }

  function update<K extends keyof FormFields>(key: K, errorKey?: keyof FieldErrorMap) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
      if (errorKey) clearFieldError(errorKey);
    };
  }

  function addExperience() {
    setExperience((prev) => [...prev, { company: '', title: '', description: '' }]);
  }

  function removeExperience(index: number) {
    setExperience((prev) => prev.filter((_, j) => j !== index));
    clearFieldError('experience');
  }

  function addEducation() {
    setEducation((prev) => [...prev, { institution: '', qualification: '' }]);
  }

  function removeEducation(index: number) {
    setEducation((prev) => prev.filter((_, j) => j !== index));
    clearFieldError('education');
  }

  function buildPayload() {
    const nonEmptyExp = experience.filter((item) => !isBlankExperience(item));
    const nonEmptyEdu = education.filter((item) => !isBlankEducation(item));
    const updatedNa = notApplicable.filter((sec) => {
      if (sec === 'experience' && nonEmptyExp.length > 0) return false;
      if (sec === 'education' && nonEmptyEdu.length > 0) return false;
      return true;
    });

    return {
      full_name: form.full_name.trim(),
      target_roles: splitList(form.roles),
      headline: form.headline.trim(),
      summary: form.summary.trim(),
      application_email: form.application_email.trim(),
      skills: splitList(form.skills),
      experience: nonEmptyExp.map((item) => ({
        company: item.company.trim(),
        title: item.title.trim(),
        description: item.description?.trim() || undefined,
      })),
      education: nonEmptyEdu.map((item) => ({
        institution: item.institution.trim(),
        qualification: item.qualification.trim(),
      })),
      links: { portfolio: normalizePortfolioInput(form.portfolio) },
      not_applicable: updatedNa,
    };
  }

  function validateClientSide(payload: ReturnType<typeof buildPayload>): FieldErrorMap {
    const next: FieldErrorMap = {};
    if (payload.full_name.length < 2) {
      next.full_name = ['Full name must be at least 2 characters.'];
    } else if (payload.full_name.length > 100) {
      next.full_name = ['Full name must be 100 characters or fewer.'];
    }

    if (payload.target_roles.length < 1) {
      next.target_roles = ['Add at least one target role (for example: Product Designer, Data Analyst).'];
    } else if (payload.target_roles.length > TARGET_ROLES_MAX) {
      next.target_roles = [`Please list up to ${TARGET_ROLES_MAX} target roles (currently ${payload.target_roles.length}).`];
    } else if (payload.target_roles.some((r) => r.length < 2)) {
      next.target_roles = ['Each target role must be at least 2 characters.'];
    } else if (payload.target_roles.some((r) => r.length > 80)) {
      next.target_roles = ['Each target role must be 80 characters or fewer.'];
    }

    if (payload.application_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.application_email)) {
      next.application_email = ['Enter a valid application email address (or leave blank).'];
    }

    if (payload.headline.length > HEADLINE_MAX) {
      next.headline = [
        `Headline is ${payload.headline.length}/${HEADLINE_MAX} characters. Shorten it to ${HEADLINE_MAX} or fewer and move extra details into Professional summary below.`,
      ];
    }

    if (payload.summary.length > SUMMARY_MAX) {
      next.summary = [`Professional summary must be ${SUMMARY_MAX.toLocaleString()} characters or fewer.`];
    }

    if (payload.skills.length > SKILLS_MAX) {
      next.skills = [`Please list up to ${SKILLS_MAX} skills (currently ${payload.skills.length}).`];
    }

    if (payload.links.portfolio) {
      try {
        const parsed = new URL(payload.links.portfolio);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          next.links = ['Portfolio URL must start with https:// or http://.'];
        }
      } catch {
        next.links = ['Enter a valid web link (for example: https://yourportfolio.com) or leave blank.'];
      }
    }

    const expIssues: string[] = [];
    payload.experience.forEach((item, idx) => {
      if (!item.company) expIssues.push(`Experience #${idx + 1}: enter the company name (or tap Remove).`);
      if (!item.title) expIssues.push(`Experience #${idx + 1}: enter your role title (or tap Remove).`);
    });
    if (expIssues.length) next.experience = expIssues;

    const eduIssues: string[] = [];
    payload.education.forEach((item, idx) => {
      if (!item.institution) eduIssues.push(`Education #${idx + 1}: enter the institution name (or tap Remove).`);
      if (!item.qualification) eduIssues.push(`Education #${idx + 1}: enter your qualification or degree (or tap Remove).`);
    });
    if (eduIssues.length) next.education = eduIssues;

    return next;
  }

  function focusFirstInvalidField() {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('.profile-form [aria-invalid="true"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
      }
    });
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmittedOnce(true);
    setStatus('');
    setStatusTone('');
    setErrors([]);

    const payload = buildPayload();
    const clientIssues = validateClientSide(payload);
    if (Object.keys(clientIssues).length > 0) {
      setFieldErrors(clientIssues);
      const flat = Object.values(clientIssues).flat().filter(Boolean) as string[];
      setErrors(flat);
      setStatusTone('err');
      setStatus('Please check the highlighted fields above.');
      focusFirstInvalidField();
      return;
    }

    setFieldErrors({});
    setBusy(true);
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setBusy(false);

    if (res.ok) {
      // Remove any trailing blank rows from the UI and normalize portfolio URL so UI matches saved state.
      setExperience(experience.filter((item) => !isBlankExperience(item)));
      setEducation(education.filter((item) => !isBlankEducation(item)));
      setNotApplicable(payload.not_applicable);
      if (payload.links.portfolio !== form.portfolio) {
        setForm((prev) => ({ ...prev, portfolio: payload.links.portfolio }));
      }
      setSubmittedOnce(false);
      setStatusTone('ok');
      setStatus('Profile saved.');
      return;
    }

    const data = await res.json().catch(() => ({}));
    const serverFieldErrors = (data.issues?.fieldErrors ?? {}) as FieldErrorMap;
    setFieldErrors(serverFieldErrors);
    const issues = (
      [...(data.issues?.formErrors ?? []), ...Object.values(serverFieldErrors).flat()] as unknown[]
    ).filter(Boolean) as string[];
    setErrors(issues);
    setStatusTone('err');
    setStatus(issues.length ? 'Please check the highlighted fields above.' : 'Could not save. Please try again.');
    focusFirstInvalidField();
  }

  function exportProfile() {
    const payload = { ...buildPayload(), exported_at: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jobiest-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteCareerProfile() {
    const ok = window.confirm(
      'Delete your career profile? This removes your headline, summary, skills, experience and education. Your account is not deleted. This cannot be undone.',
    );
    if (!ok) return;
    setBusy(true);
    const res = await fetch('/api/profile', { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setForm((prev) => ({
        ...prev,
        headline: '',
        summary: '',
        skills: '',
        portfolio: '',
        application_email: '',
      }));
      setExperience([]);
      setEducation([]);
      setNotApplicable([]);
      setFieldErrors({});
      setErrors([]);
      setStatusTone('ok');
      setStatus('Career profile cleared.');
    } else {
      setStatusTone('err');
      setStatus('Could not delete. Please try again.');
    }
  }

  const parsedRolesCount = splitList(form.roles).length;
  const headlineLen = form.headline.trim().length;
  const summaryLen = form.summary.trim().length;

  return (
    <AppShell active="profile" title="Profile">
      <section className="workspace-hero">
        <p className="eyebrow">PROFILE</p>
        <h1>Your verified career story.</h1>
        <p>Add only information that is true. Future career tools will use this profile as their factual source.</p>
        <p style={{ marginTop: 10 }}>
          <a className="btn-ghost" href="/profile/ai" style={{ textDecoration: 'none' }}>Manage your AI providers</a>
        </p>
      </section>

      <form className="form-stack profile-form" onSubmit={save} noValidate>
        <label>
          Full name
          <input
            name="full_name"
            value={form.full_name}
            onChange={update('full_name', 'full_name')}
            aria-invalid={Boolean(fieldErrors.full_name?.length)}
            required
          />
          {fieldErrors.full_name?.[0] && <small className="field-error-text">{fieldErrors.full_name[0]}</small>}
        </label>

        <label>
          <span className="field-hint-row">
            <span>Target roles</span>
            <small className={parsedRolesCount > TARGET_ROLES_MAX ? 'counter-over' : 'counter-muted'}>
              {parsedRolesCount}/{TARGET_ROLES_MAX} roles
            </small>
          </span>
          <input
            name="roles"
            value={form.roles}
            onChange={update('roles', 'target_roles')}
            aria-invalid={Boolean(fieldErrors.target_roles?.length || parsedRolesCount > TARGET_ROLES_MAX)}
            required
            placeholder="Comma-separated, e.g. Business Analyst, Operations Associate"
          />
          {fieldErrors.target_roles?.[0] && <small className="field-error-text">{fieldErrors.target_roles[0]}</small>}
        </label>

        <label>
          Application email
          <input
            name="application_email"
            type="email"
            value={form.application_email}
            onChange={update('application_email', 'application_email')}
            aria-invalid={Boolean(fieldErrors.application_email?.length)}
            placeholder="The email used when you apply (optional)"
          />
          {fieldErrors.application_email?.[0] && (
            <small className="field-error-text">{fieldErrors.application_email[0]}</small>
          )}
        </label>

        <label>
          <span className="field-hint-row">
            <span>Headline</span>
            <small className={headlineLen > HEADLINE_MAX ? 'counter-over' : 'counter-muted'}>
              {headlineLen}/{HEADLINE_MAX}
            </small>
          </span>
          <input
            name="headline"
            value={form.headline}
            onChange={update('headline', 'headline')}
            aria-invalid={Boolean(fieldErrors.headline?.length || headlineLen > HEADLINE_MAX)}
            placeholder="Short title, e.g. BSc Economics Graduate & Junior Data Analyst"
          />
          {(fieldErrors.headline?.[0] || headlineLen > HEADLINE_MAX) && (
            <small className="field-error-text">
              {fieldErrors.headline?.[0] ??
                `Headline is ${headlineLen}/${HEADLINE_MAX} characters. Shorten it to ${HEADLINE_MAX} or fewer and use Professional summary below for extra details.`}
            </small>
          )}
        </label>

        <label>
          <span className="field-hint-row">
            <span>Professional summary</span>
            <small className={summaryLen > SUMMARY_MAX ? 'counter-over' : 'counter-muted'}>
              {summaryLen}/{SUMMARY_MAX}
            </small>
          </span>
          <textarea
            name="summary"
            rows={4}
            value={form.summary}
            onChange={update('summary', 'summary')}
            aria-invalid={Boolean(fieldErrors.summary?.length || summaryLen > SUMMARY_MAX)}
          />
          {fieldErrors.summary?.[0] && <small className="field-error-text">{fieldErrors.summary[0]}</small>}
        </label>

        <label>
          Skills
          <input
            name="skills"
            value={form.skills}
            onChange={update('skills', 'skills')}
            aria-invalid={Boolean(fieldErrors.skills?.length)}
            placeholder="Comma-separated, e.g. Excel, SQL, Customer Research"
          />
          {fieldErrors.skills?.[0] && <small className="field-error-text">{fieldErrors.skills[0]}</small>}
        </label>

        <label>
          Portfolio URL
          <input
            name="portfolio"
            type="text"
            inputMode="url"
            value={form.portfolio}
            onChange={update('portfolio', 'links')}
            onBlur={() =>
              setForm((prev) => ({
                ...prev,
                portfolio: normalizePortfolioInput(prev.portfolio),
              }))
            }
            aria-invalid={Boolean(fieldErrors.links?.length)}
            placeholder="https://..."
          />
          {fieldErrors.links?.[0] && <small className="field-error-text">{fieldErrors.links[0]}</small>}
        </label>

        <section>
          <div className="section-title">
            <h2>Experience</h2>
            <button type="button" className="text-button" onClick={addExperience}>Add experience</button>
          </div>
          {experience.length === 0 && (
            <p className="repeat-empty-hint">No work experience added yet (optional).</p>
          )}
          {experience.map((item, i) => {
            const partial = !isBlankExperience(item);
            const companyMissing = submittedOnce && partial && !item.company.trim();
            const titleMissing = submittedOnce && partial && !item.title.trim();
            return (
              <div className="repeat-row" key={i}>
                <div className="repeat-row-header">
                  <span>Experience #{i + 1}</span>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => removeExperience(i)}
                    aria-label={`Remove experience ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
                <input
                  placeholder="Company"
                  value={item.company}
                  aria-invalid={companyMissing}
                  onChange={(e) => {
                    clearFieldError('experience');
                    setExperience(experience.map((v, j) => (j === i ? { ...v, company: e.target.value } : v)));
                  }}
                />
                <input
                  placeholder="Role title"
                  value={item.title}
                  aria-invalid={titleMissing}
                  onChange={(e) => {
                    clearFieldError('experience');
                    setExperience(experience.map((v, j) => (j === i ? { ...v, title: e.target.value } : v)));
                  }}
                />
                <textarea
                  placeholder="What did you do?"
                  value={item.description || ''}
                  onChange={(e) => {
                    clearFieldError('experience');
                    setExperience(experience.map((v, j) => (j === i ? { ...v, description: e.target.value } : v)));
                  }}
                />
              </div>
            );
          })}
          {fieldErrors.experience?.map((msg, idx) => (
            <small key={idx} className="field-error-text">{msg}</small>
          ))}
        </section>

        <section>
          <div className="section-title">
            <h2>Education</h2>
            <button type="button" className="text-button" onClick={addEducation}>Add education</button>
          </div>
          {education.length === 0 && (
            <p className="repeat-empty-hint">No education entries added yet (optional).</p>
          )}
          {education.map((item, i) => {
            const partial = !isBlankEducation(item);
            const instMissing = submittedOnce && partial && !item.institution.trim();
            const qualMissing = submittedOnce && partial && !item.qualification.trim();
            return (
              <div className="repeat-row two" key={i}>
                <div className="repeat-row-header">
                  <span>Education #{i + 1}</span>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => removeEducation(i)}
                    aria-label={`Remove education ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
                <input
                  placeholder="Institution"
                  value={item.institution}
                  aria-invalid={instMissing}
                  onChange={(e) => {
                    clearFieldError('education');
                    setEducation(education.map((v, j) => (j === i ? { ...v, institution: e.target.value } : v)));
                  }}
                />
                <input
                  placeholder="Qualification"
                  value={item.qualification}
                  aria-invalid={qualMissing}
                  onChange={(e) => {
                    clearFieldError('education');
                    setEducation(education.map((v, j) => (j === i ? { ...v, qualification: e.target.value } : v)));
                  }}
                />
              </div>
            );
          })}
          {fieldErrors.education?.map((msg, idx) => (
            <small key={idx} className="field-error-text">{msg}</small>
          ))}
        </section>

        {errors.length > 0 && (
          <ul className="form-errors" role="alert">
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}

        <div className="form-actions">
          <button className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save profile'}</button>
          <button type="button" className="text-button" onClick={exportProfile} disabled={busy}>
            Export profile (JSON)
          </button>
          <button type="button" className="text-button danger" onClick={deleteCareerProfile} disabled={busy}>
            Delete career profile
          </button>
        </div>

        {status && (
          <p className={`form-status${statusTone === 'err' ? ' err' : statusTone === 'ok' ? ' ok' : ''}`}>
            {status}
          </p>
        )}
      </form>
    </AppShell>
  );
}
