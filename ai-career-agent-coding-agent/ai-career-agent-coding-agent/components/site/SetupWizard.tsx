'use client';

import React, { useEffect, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { JobTitleAutocomplete } from '@/components/ui/JobTitleAutocomplete';
import { SkillAutocomplete } from '@/components/ui/SkillAutocomplete';
import { StrengthAutocomplete } from '@/components/ui/StrengthAutocomplete';
import { LocationAutocomplete } from '@/components/ui/LocationAutocomplete';
import { ExperienceBuilder, type StructuredExperience } from '@/components/ui/ExperienceBuilder';

type Education = { institution: string; qualification: string };
type Mode = 'draft' | 'assist' | 'approval' | 'auto';

type FormState = {
  full_name: string;
  target_roles: string[];
  headline: string;
  summary: string;
  skills: string[];
  strengths: string[];
  strength_reflection: string;
  application_email: string;
  experience: StructuredExperience[];
  education: Education[];
  portfolio: string;
  remote_types: string[];
  locations: string[];
  employment_types: string[];
  salary_min: string;
  currency: string;
  application_mode: Mode;
  daily_target: string;
  not_applicable: string[];
};

const REMOTE_OPTIONS = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
];

const EMP_OPTIONS = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'internship', label: 'Internship' },
];

const MODES: { value: Mode; label: string; desc: string }[] = [
  { value: 'draft', label: 'Draft only', desc: 'Generate materials. You handle the rest.' },
  { value: 'assist', label: 'Assist', desc: 'Prepare and fill where possible, stop before submitting.' },
  { value: 'approval', label: 'Approval (recommended)', desc: 'Prepare complete applications. You approve each one before it is sent.' },
  { value: 'auto', label: 'Auto', desc: 'Paid plans: submit eligible applications within your rules, then email you each one. Still stops on CAPTCHA or unsupported sites.' },
];

const STEPS = ['You', 'Targets & Skills', 'Strengths', 'Where & how', 'Your CV', 'Experience', 'Ready'];
const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR', 'CAD'];

const EMPTY: FormState = {
  full_name: '',
  target_roles: [],
  headline: '',
  summary: '',
  skills: [],
  strengths: [],
  strength_reflection: '',
  application_email: '',
  experience: [],
  education: [],
  portfolio: '',
  not_applicable: [],
  remote_types: ['remote'],
  locations: [],
  employment_types: ['full-time'],
  salary_min: '',
  currency: 'NGN',
  application_mode: 'approval',
  daily_target: '10',
};

export function SetupWizard({
  onFinish,
  onSkip,
  required = false,
}: {
  onFinish: () => void;
  onSkip: () => void;
  required?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [upload, setUpload] = useState({ busy: false, status: '' });
  const [cvUploaded, setCvUploaded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/profile').then((r) => r.json()).catch(() => ({})),
      fetch('/api/preferences').then((r) => r.json()).catch(() => ({})),
    ])
      .then(([pData, prefData]) => {
        if (!active) return;
        const p = pData.profile || {};
        const c = pData.career || {};
        const pr = prefData.preferences || {};

        setForm({
          full_name: p.full_name || '',
          target_roles: Array.isArray(p.target_roles)
            ? p.target_roles
            : typeof p.target_roles === 'string'
              ? p.target_roles.split(',').map((x: string) => x.trim()).filter(Boolean)
              : [],
          headline: c.headline || '',
          summary: c.summary || '',
          skills: Array.isArray(c.skills)
            ? c.skills
            : typeof c.skills === 'string'
              ? c.skills.split(',').map((x: string) => x.trim()).filter(Boolean)
              : [],
          strengths: Array.isArray(c.strengths) ? c.strengths : [],
          strength_reflection: c.strength_reflection || '',
          application_email: p.application_email || '',
          experience: Array.isArray(c.experience)
            ? c.experience.map((e: Record<string, unknown>, idx: number) => ({
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
              }))
            : [],
          education: Array.isArray(c.education) ? c.education : [],
          portfolio: c.links?.portfolio || '',
          remote_types: Array.isArray(pr.remote_types) ? pr.remote_types : ['remote'],
          locations: Array.isArray(pr.locations)
            ? pr.locations
            : typeof pr.locations === 'string'
              ? pr.locations.split(',').map((x: string) => x.trim()).filter(Boolean)
              : [],
          employment_types: Array.isArray(pr.employment_types) ? pr.employment_types : ['full-time'],
          salary_min: pr.salary_min != null ? String(pr.salary_min) : '',
          currency: pr.currency || 'NGN',
          application_mode: (pr.application_mode as Mode) || 'approval',
          daily_target: pr.daily_target != null ? String(pr.daily_target) : '10',
          not_applicable: Array.isArray(c.not_applicable)
            ? c.not_applicable.filter((v: string) => ['experience', 'education', 'projects'].includes(v))
            : [],
        });
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function field<K extends keyof FormState>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value } as FormState));
  }

  function toggleNA(section: 'experience' | 'education') {
    setForm((f) => ({
      ...f,
      not_applicable: f.not_applicable.includes(section)
        ? f.not_applicable.filter((v) => v !== section)
        : [...f.not_applicable, section],
    }));
  }

  function toggle(key: 'remote_types' | 'employment_types', value: string) {
    setForm((f) => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  function canProceed(s: number): boolean {
    if (s === 0) return form.full_name.trim().length >= 2 && form.headline.trim().length <= 160 && form.summary.trim().length <= 3000;
    if (s === 1) return form.target_roles.length >= 1;
    if (s === 3) return form.remote_types.length >= 1;
    if (s === 5) {
      const email = form.application_email.trim();
      const emailOk = email === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      const dt = Number(form.daily_target);
      return emailOk && Number.isFinite(dt) && dt >= 1 && dt <= 50;
    }
    return true;
  }

  async function finish() {
    setSaving(true);
    setError('');

    const profileBody = {
      full_name: form.full_name.trim(),
      target_roles: form.target_roles,
      headline: form.headline,
      summary: form.summary,
      application_email: form.application_email.trim(),
      skills: form.skills,
      strengths: form.strengths,
      strength_reflection: form.strength_reflection,
      experience: form.experience.map((x) => ({
        company: x.company.trim(),
        title: x.title.trim(),
        location: x.location?.trim() || undefined,
        employment_type: x.employment_type || undefined,
        workplace_type: x.workplace_type || undefined,
        start_month: x.start_month,
        start_year: x.start_year,
        end_month: x.end_month,
        end_year: x.end_year,
        is_current: x.is_current,
        bullets: x.bullets || [],
        description: x.description?.trim() || undefined,
      })),
      education: form.education
        .filter((x) => x.institution.trim() && x.qualification.trim())
        .map((x) => ({ institution: x.institution.trim(), qualification: x.qualification.trim() })),
      links: form.portfolio ? { portfolio: form.portfolio } : {},
      not_applicable: form.not_applicable,
    };

    const prefBody = {
      remote_types: form.remote_types,
      locations: form.locations,
      employment_types: form.employment_types,
      salary_min: form.salary_min ? Number(form.salary_min) : null,
      currency: form.currency || 'NGN',
      application_mode: form.application_mode,
      daily_target: Number(form.daily_target) || 10,
    };

    try {
      const [pr, qr] = await Promise.all([
        fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileBody),
        }),
        fetch('/api/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prefBody),
        }),
      ]);

      if (!pr.ok) {
        const errData = await pr.json().catch(() => ({}));
        const firstMsg = (Object.values(errData.issues?.fieldErrors ?? {}).flat()[0] ??
          errData.issues?.formErrors?.[0]) as string | undefined;
        throw new Error(firstMsg || 'We could not save your profile details. Please review your entries and try again.');
      }
      if (!qr.ok) throw new Error('We could not save your preferences. Please try again.');

      router.refresh();
      onFinish();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'We could not save your details. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (!canProceed(step)) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpload({ busy: true, status: 'Uploading securely…' });
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/documents', { method: 'POST', body: fd });
    const x = await r.json().catch(() => ({}));
    if (r.ok) {
      setCvUploaded(true);
      setUpload({ busy: false, status: 'Your CV is stored privately.' });
    } else {
      setUpload({
        busy: false,
        status: x.error === 'PDF_REQUIRED' ? 'Please choose a PDF file.' : 'Upload could not be completed.',
      });
    }
    e.target.value = '';
  }

  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <section className="setup-wizard" aria-label="Account setup wizard">
      <div className="wizard-head">
        <div>
          <span className="wizard-kicker">GETTING STARTED · STEP {step + 1} OF {STEPS.length}</span>
          <h2>{STEPS[step]}</h2>
        </div>
        {!required && (
          <button type="button" className="btn btn-ghost" onClick={onSkip} aria-label="Close setup wizard">
            Dismiss
          </button>
        )}
      </div>

      <div className="stepper" aria-hidden="true">
        {STEPS.map((label, i) => (
          <div key={label} className={`step-item${i < step ? ' is-complete' : i === step ? ' is-active' : ''}`}>
            <span className="dot">{i < step ? '✓' : i + 1}</span>
            <span className="label">{label}</span>
            {i < STEPS.length - 1 ? <span className="bar" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
      <div className="progress" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
      </div>

      {loading ? (
        <p className="muted">Loading your workspace…</p>
      ) : (
        <div className="wizard-body">
          {step === 0 && (
            <div className="form-stack">
              <label>
                What’s your name?
                <input value={form.full_name} onChange={field('full_name')} placeholder="Your name" />
              </label>
              <label>
                <span className="field-hint-row">
                  <span>What do you do?</span>
                  <small className={form.headline.trim().length > 160 ? 'counter-over' : 'counter-muted'}>
                    {form.headline.trim().length}/160
                  </small>
                </span>
                <span>A short headline in your own words, any profession.</span>
                <input
                  value={form.headline}
                  onChange={field('headline')}
                  maxLength={160}
                  placeholder="e.g. Senior Product Designer"
                />
              </label>
              <label>
                Short professional summary
                <span>The experience you want your agent to understand.</span>
                <textarea
                  value={form.summary}
                  onChange={field('summary')}
                  rows={3}
                  maxLength={3000}
                  placeholder="A few lines about your work and strengths."
                />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="form-stack space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-300 mb-1">
                  Which roles are you targeting?
                </label>
                <JobTitleAutocomplete
                  value={form.target_roles}
                  onChange={(roles) => setForm((f) => ({ ...f, target_roles: roles }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-300 mb-1">
                  Your key skills
                </label>
                <SkillAutocomplete
                  value={form.skills}
                  onChange={(skills) => setForm((f) => ({ ...f, skills }))}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="form-stack space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-300 mb-1">
                  What are your personal strengths?
                </label>
                <StrengthAutocomplete
                  value={form.strengths}
                  onChange={(strengths) => setForm((f) => ({ ...f, strengths }))}
                  reflection={form.strength_reflection}
                  onReflectionChange={(strength_reflection) => setForm((f) => ({ ...f, strength_reflection }))}
                  showReflection={true}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="form-stack">
              <label>Work arrangement</label>
              <div className="chip-group">
                {REMOTE_OPTIONS.map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    className="chip"
                    aria-pressed={form.remote_types.includes(o.value)}
                    onClick={() => toggle('remote_types', o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-300 mb-1">Locations</label>
                <LocationAutocomplete
                  value={form.locations}
                  onChange={(locs) => setForm((f) => ({ ...f, locations: locs }))}
                  placeholder="Search cities or select Remote..."
                />
              </div>

              <label>Employment type</label>
              <div className="chip-group">
                {EMP_OPTIONS.map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    className="chip"
                    aria-pressed={form.employment_types.includes(o.value)}
                    onClick={() => toggle('employment_types', o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 132px', gap: 10 }}>
                <label>
                  Salary floor (optional)
                  <input
                    type="number"
                    min={0}
                    value={form.salary_min}
                    onChange={field('salary_min')}
                    placeholder="e.g. 250000"
                  />
                </label>
                <label>
                  Currency
                  <select value={form.currency} onChange={field('currency')}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="form-stack">
              <p className="muted">Optional: upload your master CV (PDF, max 5 MB). It stays private to your account.</p>
              <label className={`upload-card${upload.busy ? ' is-busy' : ''}`}>
                <input type="file" accept="application/pdf,.pdf" onChange={onUpload} disabled={upload.busy} />
                <strong>{upload.busy ? 'Uploading…' : cvUploaded ? 'Upload another CV' : 'Upload your master CV'}</strong>
                <span>PDF only · maximum 5 MB</span>
              </label>
              {upload.status ? <p className="form-status">{upload.status}</p> : null}
            </div>
          )}

          {step === 5 && (
            <div className="form-stack space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-300 mb-2">
                  Professional Experience
                </label>
                {!form.not_applicable.includes('experience') && (
                  <ExperienceBuilder
                    experiences={form.experience}
                    onChange={(exp) => setForm((f) => ({ ...f, experience: exp }))}
                  />
                )}
              </div>

              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={form.not_applicable.includes('experience')}
                  onChange={() => toggleNA('experience')}
                />
                <span>I don&apos;t have work experience yet</span>
              </label>

              <label>
                Application contact email
                <input
                  type="email"
                  value={form.application_email}
                  onChange={field('application_email')}
                  placeholder="you@example.com"
                />
              </label>

              <label>How much control should your agent have?</label>
              <div className="mode-cards">
                {MODES.map((m) => (
                  <div
                    key={m.value}
                    className="mode-card"
                    role="button"
                    tabIndex={0}
                    aria-pressed={form.application_mode === m.value}
                    onClick={() => setForm((f) => ({ ...f, application_mode: m.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setForm((f) => ({ ...f, application_mode: m.value }));
                      }
                    }}
                  >
                    <strong>{m.label}</strong>
                    <span>{m.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="form-stack">
              <h3>Everything looks ready!</h3>
              <p className="muted">
                Your profile has been captured. Click Complete below to step into your Jobiest workspace and start discovering matching roles.
              </p>
            </div>
          )}
        </div>
      )}

      {error ? (
        <p className="form-status error" role="alert">{error}</p>
      ) : null}

      <div className="wizard-foot">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={back}
          disabled={step === 0 || saving}
        >
          Back
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={next}
          disabled={!canProceed(step) || saving}
        >
          {saving ? 'Saving…' : step === STEPS.length - 1 ? 'Complete Setup →' : 'Continue →'}
        </button>
      </div>
    </section>
  );
}
