'use client';

import React, { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/site/AppShell';
import { ErrorState, LoadingState } from '@/components/ui/state-feedback';
import { JobTitleAutocomplete } from '@/components/ui/JobTitleAutocomplete';
import { SkillAutocomplete } from '@/components/ui/SkillAutocomplete';
import { StrengthAutocomplete } from '@/components/ui/StrengthAutocomplete';
import { ExperienceBuilder, type StructuredExperience } from '@/components/ui/ExperienceBuilder';

type Education = { institution: string; qualification: string };
type NaSection = 'experience' | 'education' | 'projects';

type FormFields = {
  full_name: string;
  headline: string;
  summary: string;
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
    | 'strengths'
    | 'links'
    | 'experience'
    | 'education',
    string[]
  >
>;

const EMPTY_FORM: FormFields = {
  full_name: '',
  headline: '',
  summary: '',
  portfolio: '',
  application_email: '',
};

const HEADLINE_MAX = 160;
const SUMMARY_MAX = 3000;
const TARGET_ROLES_MAX = 20;
const SKILLS_MAX = 60;
const STRENGTHS_MAX = 40;

function normalizePortfolioInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function isBlankEducation(item: Education): boolean {
  return !item.institution.trim() && !item.qualification.trim();
}

export default function ProfilePage() {
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [strengths, setStrengths] = useState<string[]>([]);
  const [strengthReflection, setStrengthReflection] = useState('');
  const [experience, setExperience] = useState<StructuredExperience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [notApplicable, setNotApplicable] = useState<NaSection[]>([]);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'ok' | 'err' | ''>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});
  const [, setSubmittedOnce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/profile')
      .then((r) => {
        if (!r.ok) throw new Error(`Profile request failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        const profile = data.profile || {};
        const career = data.career || {};

        setForm({
          full_name: profile.full_name || '',
          headline: career.headline || '',
          summary: career.summary || '',
          portfolio: career.links?.portfolio || '',
          application_email: profile.application_email || '',
        });

        if (Array.isArray(profile.target_roles)) {
          setTargetRoles(profile.target_roles);
        } else if (typeof profile.target_roles === 'string' && profile.target_roles) {
          setTargetRoles(profile.target_roles.split(',').map((s: string) => s.trim()).filter(Boolean));
        }

        if (Array.isArray(career.skills)) {
          setSkills(career.skills);
        } else if (typeof career.skills === 'string' && career.skills) {
          setSkills(career.skills.split(',').map((s: string) => s.trim()).filter(Boolean));
        }

        if (Array.isArray(career.strengths)) {
          setStrengths(career.strengths);
        }
        if (typeof career.strength_reflection === 'string') {
          setStrengthReflection(career.strength_reflection);
        }

        if (Array.isArray(career.experience)) {
          setExperience(
            career.experience.map((e: Record<string, unknown>, idx: number) => ({
              id: (e.id as string) || `exp_${idx}`,
              company: (e.company as string) || (e.company_name as string) || '',
              title: (e.title as string) || (e.job_title as string) || '',
              location: (e.location as string) || undefined,
              employment_type: (e.employment_type as string) || 'Full-time',
              workplace_type: (e.workplace_type as string) || 'Remote',
              start_month: typeof e.start_month === 'number' ? e.start_month : null,
              start_year: typeof e.start_year === 'number' ? e.start_year : null,
              end_month: typeof e.end_month === 'number' ? e.end_month : null,
              end_year: typeof e.end_year === 'number' ? e.end_year : null,
              is_current: Boolean(e.is_current),
              bullets: Array.isArray(e.bullets)
                ? (e.bullets as string[])
                : typeof e.description === 'string' && e.description
                  ? e.description.split('\n').map((s) => s.trim()).filter(Boolean)
                  : [],
              description: (e.description as string) || '',
            })),
          );
        }

        setEducation(Array.isArray(career.education) ? career.education : []);
        setNotApplicable(
          Array.isArray(career.not_applicable)
            ? career.not_applicable.filter((v: string): v is NaSection =>
                v === 'experience' || v === 'education' || v === 'projects',
              )
            : [],
        );

        const key = `jobiest.profile-draft.v2.${data.userId}`;
        setDraftKey(key);
        try {
          const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
          if (saved && Date.now() - saved.savedAt < 24 * 60 * 60 * 1000) {
            if (saved.form) setForm(saved.form);
            if (saved.targetRoles) setTargetRoles(saved.targetRoles);
            if (saved.skills) setSkills(saved.skills);
            if (saved.strengths) setStrengths(saved.strengths);
            if (saved.strengthReflection) setStrengthReflection(saved.strengthReflection);
            if (saved.experience) setExperience(saved.experience);
            if (saved.education) setEducation(saved.education);
            if (saved.notApplicable) setNotApplicable(saved.notApplicable);
            setDraftRecovered(true);
          }
        } catch {}
        setProfileReady(true);
      })
      .catch(() => {
        if (active) setProfileLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profileReady || !draftKey) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          savedAt: Date.now(),
          form,
          targetRoles,
          skills,
          strengths,
          strengthReflection,
          experience,
          education,
          notApplicable,
        }),
      );
    } catch {}
  }, [
    profileReady,
    draftKey,
    form,
    targetRoles,
    skills,
    strengths,
    strengthReflection,
    experience,
    education,
    notApplicable,
  ]);

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

  function addEducation() {
    setEducation((prev) => [...prev, { institution: '', qualification: '' }]);
  }

  function removeEducation(index: number) {
    setEducation((prev) => prev.filter((_, j) => j !== index));
    clearFieldError('education');
  }

  function buildPayload() {
    const cleanEdu = education.filter((item) => !isBlankEducation(item));
    const updatedNa = notApplicable.filter((sec) => {
      if (sec === 'experience' && experience.length > 0) return false;
      if (sec === 'education' && cleanEdu.length > 0) return false;
      return true;
    });

    return {
      full_name: form.full_name.trim(),
      target_roles: targetRoles,
      headline: form.headline.trim(),
      summary: form.summary.trim(),
      application_email: form.application_email.trim(),
      skills,
      strengths,
      strength_reflection: strengthReflection.trim(),
      experience: experience.map((item) => ({
        company: item.company.trim(),
        title: item.title.trim(),
        description: item.description?.trim() || undefined,
        location: item.location?.trim() || undefined,
        employment_type: item.employment_type || undefined,
        workplace_type: item.workplace_type || undefined,
        start_month: item.start_month,
        start_year: item.start_year,
        end_month: item.end_month,
        end_year: item.end_year,
        is_current: item.is_current,
        bullets: item.bullets || [],
      })),
      education: cleanEdu.map((item) => ({
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
      next.target_roles = [`Please list up to ${TARGET_ROLES_MAX} target roles.`];
    }

    if (payload.application_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.application_email)) {
      next.application_email = ['Enter a valid application email address (or leave blank).'];
    }

    if (payload.headline.length > HEADLINE_MAX) {
      next.headline = [`Headline must be ${HEADLINE_MAX} characters or fewer.`];
    }

    if (payload.summary.length > SUMMARY_MAX) {
      next.summary = [`Professional summary must be ${SUMMARY_MAX.toLocaleString()} characters or fewer.`];
    }

    if (payload.skills.length > SKILLS_MAX) {
      next.skills = [`Please list up to ${SKILLS_MAX} skills.`];
    }

    if (payload.strengths.length > STRENGTHS_MAX) {
      next.strengths = [`Please list up to ${STRENGTHS_MAX} personal strengths.`];
    }

    return next;
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
      return;
    }

    setFieldErrors({});
    setBusy(true);
    let res: Response;
    try {
      res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      setBusy(false);
      setStatusTone('err');
      setStatus('Could not reach Jobiest. Reconnect and try again.');
      return;
    }
    setBusy(false);

    if (res.status === 401) {
      setStatusTone('err');
      setStatus('Your session expired. Please sign in again.');
      return;
    }

    if (res.ok) {
      setEducation(education.filter((item) => !isBlankEducation(item)));
      setNotApplicable(payload.not_applicable);
      setStatusTone('ok');
      setStatus('Profile saved successfully.');
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

  const headlineLen = form.headline.trim().length;
  const summaryLen = form.summary.trim().length;

  return (
    <AppShell active="profile" title="Career profile" userName={form.full_name.trim() || undefined}>
      <section className="workspace-hero">
        <p className="eyebrow">CAREER PROFILE</p>
        <h1>Your verified career story.</h1>
        <p>Add only information that is true. Jobiest tools and AI agents use this profile as their factual source.</p>
        <div style={{ marginTop: 14 }}>
          <Link
            className="btn btn-ghost"
            href="/profile/ai"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 18px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              background: '#fff',
              border: '1px solid #cbd5e1',
              boxShadow: '0 1px 3px rgba(17, 29, 53, 0.05)',
            }}
          >
            <span aria-hidden="true">⚙️</span> Manage your AI providers →
          </Link>
        </div>
      </section>

      {!profileReady &&
        (profileLoadFailed ? (
          <ErrorState onRetry={() => window.location.reload()}>
            We couldn’t load your profile. Check your connection or sign in again, then retry.
          </ErrorState>
        ) : (
          <LoadingState label="Loading your profile" detail="Your saved profile is being prepared." />
        ))}

      {draftRecovered && (
        <p className="form-status ok" role="status">
          We restored an unsaved draft from this tab. Review it and save to keep your changes.
        </p>
      )}

      {status && (
        <p className={`form-status ${statusTone}`} role="status">
          {status}
        </p>
      )}

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-xs text-red-300">
          <p className="font-semibold mb-1">Please correct the following:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <form className="form-stack profile-form space-y-8" onSubmit={save} noValidate hidden={!profileReady} aria-busy={!profileReady}>
        {/* Core Identity */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 space-y-4">
          <h2 className="text-base font-bold text-white border-b border-zinc-800 pb-2">1. Identity & Contact</h2>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Full Name</span>
            <input
              name="full_name"
              value={form.full_name}
              onChange={update('full_name', 'full_name')}
              aria-invalid={Boolean(fieldErrors.full_name?.length)}
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100"
            />
            {fieldErrors.full_name?.[0] && <small className="field-error-text text-red-400">{fieldErrors.full_name[0]}</small>}
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Target Roles</span>
              <span className="text-[11px] text-zinc-500">{targetRoles.length}/{TARGET_ROLES_MAX} roles</span>
            </div>
            <JobTitleAutocomplete
              value={targetRoles}
              onChange={(next) => {
                setTargetRoles(next);
                clearFieldError('target_roles');
              }}
              placeholder="Search and select roles (e.g. Frontend Developer, Data Analyst)..."
            />
            {fieldErrors.target_roles?.[0] && <small className="field-error-text text-red-400">{fieldErrors.target_roles[0]}</small>}
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Application Contact Email</span>
            <input
              name="application_email"
              type="email"
              value={form.application_email}
              onChange={update('application_email', 'application_email')}
              placeholder="alex@career.com (optional)"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100"
            />
          </label>

          <label className="block space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Headline</span>
              <span className="text-[11px] text-zinc-500">{headlineLen}/{HEADLINE_MAX}</span>
            </div>
            <input
              name="headline"
              value={form.headline}
              onChange={update('headline', 'headline')}
              maxLength={HEADLINE_MAX}
              placeholder="e.g. BSc Economics Graduate & Junior Data Analyst"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100"
            />
          </label>

          <label className="block space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Professional Summary</span>
              <span className="text-[11px] text-zinc-500">{summaryLen}/{SUMMARY_MAX}</span>
            </div>
            <textarea
              name="summary"
              rows={4}
              value={form.summary}
              onChange={update('summary', 'summary')}
              maxLength={SUMMARY_MAX}
              placeholder="Summarize your professional background, core competencies, and career objectives..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">Portfolio or Website URL</span>
            <input
              name="portfolio"
              type="text"
              value={form.portfolio}
              onChange={update('portfolio', 'links')}
              onBlur={() => setForm((prev) => ({ ...prev, portfolio: normalizePortfolioInput(prev.portfolio) }))}
              placeholder="https://..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100"
            />
          </label>
        </div>

        {/* Section 2: Professional Skills */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div>
              <h2 className="text-base font-bold text-white">2. Professional Skills</h2>
              <p className="text-xs text-zinc-400">Add technical and job-specific capabilities.</p>
            </div>
            <span className="text-xs font-semibold text-[#10b981]">{skills.length} selected</span>
          </div>

          <SkillAutocomplete
            value={skills}
            onChange={(next) => {
              setSkills(next);
              clearFieldError('skills');
            }}
          />
          {fieldErrors.skills?.[0] && <small className="field-error-text text-red-400">{fieldErrors.skills[0]}</small>}
        </div>

        {/* Section 3: Personal Strengths */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div>
              <h2 className="text-base font-bold text-white">3. Personal Strengths & Qualities</h2>
              <p className="text-xs text-zinc-400">Describe how you think, execute, and collaborate with teams.</p>
            </div>
            <span className="text-xs font-semibold text-purple-400">{strengths.length} selected</span>
          </div>

          <StrengthAutocomplete
            value={strengths}
            onChange={(next) => {
              setStrengths(next);
              clearFieldError('strengths');
            }}
            reflection={strengthReflection}
            onReflectionChange={setStrengthReflection}
            showReflection={true}
          />
          {fieldErrors.strengths?.[0] && <small className="field-error-text text-red-400">{fieldErrors.strengths[0]}</small>}
        </div>

        {/* Section 4: Professional Experience */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div>
              <h2 className="text-base font-bold text-white">4. Professional Experience</h2>
              <p className="text-xs text-zinc-400">Employment history, timeline, and structured bullet points.</p>
            </div>
            <span className="text-xs font-semibold text-zinc-400">{experience.length} roles</span>
          </div>

          <ExperienceBuilder experiences={experience} onChange={setExperience} />
        </div>

        {/* Section 5: Education */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h2 className="text-base font-bold text-white">5. Education & Credentials</h2>
            <button type="button" onClick={addEducation} className="text-xs text-[#10b981] font-semibold">
              + Add Education
            </button>
          </div>

          {education.length === 0 && <p className="text-xs text-zinc-500">No education entries added yet.</p>}

          <div className="space-y-3">
            {education.map((item, i) => (
              <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">Education #{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeEducation(i)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    placeholder="Institution"
                    value={item.institution}
                    onChange={(e) => {
                      clearFieldError('education');
                      setEducation(education.map((v, j) => (j === i ? { ...v, institution: e.target.value } : v)));
                    }}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-100"
                  />
                  <input
                    placeholder="Degree / Qualification"
                    value={item.qualification}
                    onChange={(e) => {
                      clearFieldError('education');
                      setEducation(education.map((v, j) => (j === i ? { ...v, qualification: e.target.value } : v)));
                    }}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-100"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submit & Secondary Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-6">
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#10b981] px-6 py-2.5 text-sm font-bold text-zinc-950 shadow-lg shadow-[#10b981]/20 hover:bg-[#059669] disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save Profile'}
            </button>
            <button
              type="button"
              onClick={exportProfile}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Export JSON
            </button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
