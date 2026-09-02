'use client';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

type Experience = { company: string; title: string; description?: string };
type Education = { institution: string; qualification: string };
type Mode = 'draft' | 'assist' | 'approval' | 'auto';

type FormState = {
  full_name: string;
  target_roles: string;
  headline: string;
  summary: string;
  skills: string;
  application_email: string;
  experience: Experience[];
  education: Education[];
  remote_types: string[];
  locations: string;
  employment_types: string[];
  salary_min: string;
  application_mode: Mode;
  daily_target: string;
};

const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

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
  { value: 'auto', label: 'Auto', desc: 'Submit eligible applications within your rules. Still stops on CAPTCHA or unsupported sites.' },
];
// 6 steps per design plan §6.2 (Gmail removed per D-001)
const STEPS = ['You', 'Targets', 'Where & how', 'Your CV', 'Experience', 'Ready'];

const EMPTY: FormState = {
  full_name: '', target_roles: '', headline: '', summary: '', skills: '', application_email: '',
  experience: [], education: [],
  remote_types: [], locations: '', employment_types: [], salary_min: '', application_mode: 'approval', daily_target: '10',
};

export default function OnboardingPage() {
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
      fetch('/api/profile').then((r) => r.json()),
      fetch('/api/preferences').then((r) => r.json()),
    ])
      .then(([pData, prefData]) => {
        if (!active) return;
        const p = pData.profile || {};
        const c = pData.career || {};
        const pr = prefData.preferences || {};
        setForm({
          full_name: p.full_name || '',
          target_roles: Array.isArray(p.target_roles) ? p.target_roles.join(', ') : '',
          headline: c.headline || '',
          summary: c.summary || '',
          skills: Array.isArray(c.skills) ? c.skills.join(', ') : '',
          application_email: p.application_email || '',
          experience: Array.isArray(c.experience) ? c.experience : [],
          education: Array.isArray(c.education) ? c.education : [],
          remote_types: Array.isArray(pr.remote_types) ? pr.remote_types : [],
          locations: Array.isArray(pr.locations) ? pr.locations.join(', ') : '',
          employment_types: Array.isArray(pr.employment_types) ? pr.employment_types : [],
          salary_min: pr.salary_min != null ? String(pr.salary_min) : '',
          application_mode: (pr.application_mode as Mode) || 'approval',
          daily_target: pr.daily_target != null ? String(pr.daily_target) : '10',
        });
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function field<K extends keyof FormState>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value } as FormState));
  }

  function toggle(key: 'remote_types' | 'employment_types', value: string) {
    setForm((f) => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  function canProceed(s: number): boolean {
    if (s === 0) return form.full_name.trim().length >= 2;
    if (s === 1) return split(form.target_roles).length >= 1;
    if (s === 2) return form.remote_types.length >= 1;
    if (s === 4) {
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
      target_roles: split(form.target_roles),
      headline: form.headline,
      summary: form.summary,
      application_email: form.application_email.trim(),
      skills: split(form.skills),
      experience: form.experience
        .filter((x) => x.company.trim() && x.title.trim())
        .map((x) => ({ company: x.company.trim(), title: x.title.trim(), description: x.description?.trim() || undefined })),
      education: form.education
        .filter((x) => x.institution.trim() && x.qualification.trim())
        .map((x) => ({ institution: x.institution.trim(), qualification: x.qualification.trim() })),
      links: {},
    };
    const prefBody = {
      remote_types: form.remote_types,
      locations: split(form.locations),
      employment_types: form.employment_types,
      salary_min: form.salary_min ? Number(form.salary_min) : null,
      currency: 'NGN',
      application_mode: form.application_mode,
      daily_target: Number(form.daily_target) || 10,
    };
    try {
      const [pr, qr] = await Promise.all([
        fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profileBody) }),
        fetch('/api/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefBody) }),
      ]);
      if (!pr.ok || !qr.ok) throw new Error('save failed');
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('We couldn’t save your details. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (!canProceed(step)) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  }
  function back() { if (step > 0) setStep(step - 1); }

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
      setUpload({ busy: false, status: x.error === 'PDF_REQUIRED' ? 'Please choose a PDF file.' : 'Upload could not be completed.' });
    }
    e.target.value = '';
  }

  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;
  const modeLabel = MODES.find((m) => m.value === form.application_mode)?.label ?? 'Approval';

  return (
    <main className="auth-page">
      <section className="onboarding-card wizard-card">
        <p className="eyebrow">SET UP YOUR CAREER WORKSPACE</p>
        <h1>Let’s tailor your agent.</h1>
        <p className="step-sub">Six quick steps. Your profile is the source of facts we use, we never invent.</p>

        <div className="stepper" role="list">
          {STEPS.map((label, i) => (
            <div className={`seg${i === step ? ' active' : ''}`} role="listitem" key={label}>
              <span className={`pip${i === step ? ' active' : i < step ? ' done' : ''}`}>{i < step ? '✓' : i + 1}</span>
              <span className="seg-label">{label}</span>
              {i < STEPS.length - 1 ? <span className="bar" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
        <div className="progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>

        {loading ? (
          <p className="muted">Loading your workspace…</p>
        ) : (
          <div className="wizard-body">
            {step === 0 && (
              <div className="form-stack">
                <label>What’s your name?<input value={form.full_name} onChange={field('full_name')} placeholder="Your name" /></label>
                <label>What do you do?<span>A headline in your own words, any profession.</span><input value={form.headline} onChange={field('headline')} placeholder="e.g. Senior Product Designer" /></label>
                <label>Short professional summary<span>The experience you want your agent to understand.</span><textarea value={form.summary} onChange={field('summary')} rows={3} placeholder="A few lines about your work and strengths." /></label>
              </div>
            )}

            {step === 1 && (
              <div className="form-stack">
                <label>Which roles are you targeting?<span>Comma-separated, e.g. Product Designer, UX Researcher</span><input value={form.target_roles} onChange={field('target_roles')} placeholder="e.g. Product Designer, UX Researcher" /></label>
                <label>Your key skills<span>Comma-separated, these power matching and truthful applications.</span><input value={form.skills} onChange={field('skills')} placeholder="e.g. Figma, research, strategy" /></label>
              </div>
            )}

            {step === 2 && (
              <div className="form-stack">
                <label>Work arrangement</label>
                <div className="chip-group">
                  {REMOTE_OPTIONS.map((o) => (
                    <button type="button" key={o.value} className="chip" aria-pressed={form.remote_types.includes(o.value)} onClick={() => toggle('remote_types', o.value)}>{o.label}</button>
                  ))}
                </div>
                <label>Locations<span>Comma-separated, e.g. Lagos, Nigeria; Remote</span><input value={form.locations} onChange={field('locations')} placeholder="Lagos, Nigeria" /></label>
                <label>Employment type</label>
                <div className="chip-group">
                  {EMP_OPTIONS.map((o) => (
                    <button type="button" key={o.value} className="chip" aria-pressed={form.employment_types.includes(o.value)} onClick={() => toggle('employment_types', o.value)}>{o.label}</button>
                  ))}
                </div>
                <label>Salary floor (optional, NGN)<input type="number" min={0} value={form.salary_min} onChange={field('salary_min')} placeholder="e.g. 250000" /></label>
              </div>
            )}

            {step === 3 && (
              <div className="form-stack">
                <p className="muted">Optional: upload your master CV (PDF, max 5 MB). It stays private to your account and is the source for future materials.</p>
                <label className={`upload-card${upload.busy ? ' is-busy' : ''}`}>
                  <input type="file" accept="application/pdf,.pdf" onChange={onUpload} disabled={upload.busy} />
                  <strong>{upload.busy ? 'Uploading…' : cvUploaded ? 'Upload another CV' : 'Upload your master CV'}</strong>
                  <span>PDF only · maximum 5 MB</span>
                </label>
                {upload.status ? <p className="form-status">{upload.status}</p> : null}
                <p className="muted">You can skip this and upload later from Documents.</p>
              </div>
            )}

            {step === 4 && (
              <div className="form-stack">
                <div>
                  <div className="section-title"><h2>Experience</h2><button type="button" className="text-button" onClick={() => setForm((f) => ({ ...f, experience: [...f.experience, { company: '', title: '', description: '' }] }))}>Add</button></div>
                  {form.experience.map((x, i) => (
                    <div className="repeat-row" key={i}>
                      <input placeholder="Company" value={x.company} onChange={(e) => setForm((f) => ({ ...f, experience: f.experience.map((v, j) => (j === i ? { ...v, company: e.target.value } : v)) }))} />
                      <input placeholder="Role title" value={x.title} onChange={(e) => setForm((f) => ({ ...f, experience: f.experience.map((v, j) => (j === i ? { ...v, title: e.target.value } : v)) }))} />
                      <textarea placeholder="What did you do?" value={x.description || ''} onChange={(e) => setForm((f) => ({ ...f, experience: f.experience.map((v, j) => (j === i ? { ...v, description: e.target.value } : v)) }))} />
                    </div>
                  ))}
                </div>
                <div>
                  <div className="section-title"><h2>Education</h2><button type="button" className="text-button" onClick={() => setForm((f) => ({ ...f, education: [...f.education, { institution: '', qualification: '' }] }))}>Add</button></div>
                  {form.education.map((x, i) => (
                    <div className="repeat-row two" key={i}>
                      <input placeholder="Institution" value={x.institution} onChange={(e) => setForm((f) => ({ ...f, education: f.education.map((v, j) => (j === i ? { ...v, institution: e.target.value } : v)) }))} />
                      <input placeholder="Qualification" value={x.qualification} onChange={(e) => setForm((f) => ({ ...f, education: f.education.map((v, j) => (j === i ? { ...v, qualification: e.target.value } : v)) }))} />
                    </div>
                  ))}
                </div>
                <label>Application email<span>The address used when you apply. No inbox access, just a contact email.</span><input type="email" value={form.application_email} onChange={field('application_email')} placeholder="you@example.com" /></label>
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
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setForm((f) => ({ ...f, application_mode: m.value })); } }}
                    >
                      <strong>{m.label}</strong>
                      <span>{m.desc}</span>
                    </div>
                  ))}
                </div>
                <label>Daily application target<input type="number" min={1} max={50} value={form.daily_target} onChange={field('daily_target')} /></label>
              </div>
            )}

            {step === 5 && (
              <div className="form-stack">
                <div className="ready-card">
                  <div className="ready-check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><path d="M5 12.5 L10 17 L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                  <h2>Your agent is ready to work.</h2>
                  <p className="muted">Here’s what we’ll use. You can change anything later.</p>
                  <ul className="ready-list">
                    <li><span>Name</span><b>{form.full_name || '-'}</b></li>
                    <li><span>Target roles</span><b>{split(form.target_roles).join(', ') || '-'}</b></li>
                    <li><span>Arrangement</span><b>{form.remote_types.length ? form.remote_types.join(', ') : '-'}{form.locations ? ` · ${form.locations}` : ''}</b></li>
                    <li><span>Control</span><b>{modeLabel}</b></li>
                    <li><span>Daily target</span><b>{form.daily_target || '-'} applications/day</b></li>
                  </ul>
                  <p className="ready-note">Approval mode keeps you in charge. Your agent prepares, you review and release.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {error ? <div className="auth-error" role="alert" style={{ marginTop: 16 }}>{error}</div> : null}

        <div className="wizard-nav">
          <button type="button" className="text-button" onClick={back} disabled={step === 0 || saving}>Back</button>
          <div className="right">
            {!isLast ? <span className="muted" style={{ fontSize: 13 }}>Step {step + 1} of {STEPS.length}</span> : null}
            <button type="button" className="btn" onClick={next} disabled={!canProceed(step) || saving || loading}>
              {isLast ? (saving ? 'Saving…' : 'Finish & open dashboard') : 'Continue'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
