'use client';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { AppShell } from '@/components/site/AppShell';

type Experience = { company: string; title: string; description?: string };
type Education = { institution: string; qualification: string };

type FormFields = {
  full_name: string;
  roles: string;
  headline: string;
  summary: string;
  skills: string;
  portfolio: string;
  application_email: string;
};

const EMPTY_FORM: FormFields = {
  full_name: '',
  roles: '',
  headline: '',
  summary: '',
  skills: '',
  portfolio: '',
  application_email: '',
};

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ProfilePage() {
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [experience, setExperience] = useState<Experience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
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
      })
      .catch(() => {
        if (active) setStatus('Could not load your profile.');
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof FormFields>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function addExperience() {
    setExperience((prev) => [...prev, { company: '', title: '', description: '' }]);
  }

  function addEducation() {
    setEducation((prev) => [...prev, { institution: '', qualification: '' }]);
  }

  function buildPayload() {
    return {
      full_name: form.full_name,
      target_roles: splitList(form.roles),
      headline: form.headline,
      summary: form.summary,
      application_email: form.application_email.trim(),
      skills: splitList(form.skills),
      experience,
      education,
      links: { portfolio: form.portfolio },
    };
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setStatus('');
    setErrors([]);
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload()),
    });
    setBusy(false);
    if (res.ok) {
      setStatus('Profile saved.');
      return;
    }
    const data = await res.json().catch(() => ({}));
    const fieldErrors = data.issues?.fieldErrors ?? {};
    const issues = (
      [...(data.issues?.formErrors ?? []), ...Object.values(fieldErrors).flat()] as unknown[]
    ).filter(Boolean) as string[];
    setErrors(issues);
    setStatus(issues.length ? 'Please fix the highlighted fields.' : 'Could not save. Please try again.');
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
      setStatus('Career profile cleared.');
    } else {
      setStatus('Could not delete. Please try again.');
    }
  }

  return (
    <AppShell active="profile" title="Profile">
      <section className="workspace-hero">
        <p className="eyebrow">PROFILE</p>
        <h1>Your verified career story.</h1>
        <p>Add only information that is true. Future career tools will use this profile as their factual source.</p>
      </section>

      <form className="form-stack profile-form" onSubmit={save}>
        <label>
          Full name
          <input name="full_name" value={form.full_name} onChange={update('full_name')} required />
        </label>
        <label>
          Target roles
          <input
            name="roles"
            value={form.roles}
            onChange={update('roles')}
            required
            placeholder="e.g. Product Designer, UX Researcher"
          />
        </label>
        <label>
          Application email
          <input
            name="application_email"
            type="email"
            value={form.application_email}
            onChange={update('application_email')}
            placeholder="The email used when you apply"
          />
        </label>
        <label>
          Headline
          <input name="headline" value={form.headline} onChange={update('headline')} />
        </label>
        <label>
          Professional summary
          <textarea name="summary" rows={4} value={form.summary} onChange={update('summary')} />
        </label>
        <label>
          Skills
          <input name="skills" value={form.skills} onChange={update('skills')} placeholder="Comma-separated" />
        </label>
        <label>
          Portfolio URL
          <input
            name="portfolio"
            type="url"
            value={form.portfolio}
            onChange={update('portfolio')}
            placeholder="https://…"
          />
        </label>

        <section>
          <div className="section-title">
            <h2>Experience</h2>
            <button type="button" className="text-button" onClick={addExperience}>Add experience</button>
          </div>
          {experience.map((item, i) => (
            <div className="repeat-row" key={i}>
              <input
                placeholder="Company"
                value={item.company}
                onChange={(e) =>
                  setExperience(experience.map((v, j) => (j === i ? { ...v, company: e.target.value } : v)))
                }
              />
              <input
                placeholder="Role title"
                value={item.title}
                onChange={(e) =>
                  setExperience(experience.map((v, j) => (j === i ? { ...v, title: e.target.value } : v)))
                }
              />
              <textarea
                placeholder="What did you do?"
                value={item.description || ''}
                onChange={(e) =>
                  setExperience(experience.map((v, j) => (j === i ? { ...v, description: e.target.value } : v)))
                }
              />
            </div>
          ))}
        </section>

        <section>
          <div className="section-title">
            <h2>Education</h2>
            <button type="button" className="text-button" onClick={addEducation}>Add education</button>
          </div>
          {education.map((item, i) => (
            <div className="repeat-row two" key={i}>
              <input
                placeholder="Institution"
                value={item.institution}
                onChange={(e) =>
                  setEducation(education.map((v, j) => (j === i ? { ...v, institution: e.target.value } : v)))
                }
              />
              <input
                placeholder="Qualification"
                value={item.qualification}
                onChange={(e) =>
                  setEducation(education.map((v, j) => (j === i ? { ...v, qualification: e.target.value } : v)))
                }
              />
            </div>
          ))}
        </section>

        {errors.length > 0 && (
          <ul className="form-errors">
            {errors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}

        <div className="form-actions">
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
          <button type="button" className="text-button" onClick={exportProfile} disabled={busy}>
            Export profile (JSON)
          </button>
          <button type="button" className="text-button danger" onClick={deleteCareerProfile} disabled={busy}>
            Delete career profile
          </button>
        </div>

        {status && <p className="form-status">{status}</p>}
      </form>
    </AppShell>
  );
}
