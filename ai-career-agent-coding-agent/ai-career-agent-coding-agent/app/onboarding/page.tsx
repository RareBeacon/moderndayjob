'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { JobTitleAutocomplete } from '@/components/ui/JobTitleAutocomplete';
import { SkillAutocomplete } from '@/components/ui/SkillAutocomplete';
import { StrengthAutocomplete } from '@/components/ui/StrengthAutocomplete';
import { LocationAutocomplete } from '@/components/ui/LocationAutocomplete';
import { ExperienceBuilder, type StructuredExperience } from '@/components/ui/ExperienceBuilder';

const STEPS = [
  { id: 'basic', title: 'Basic Profile', desc: 'Welcome! Tell us who you are.' },
  { id: 'identity', title: 'Professional Identity', desc: 'What roles are you targeting?' },
  { id: 'skills', title: 'What are your skills?', desc: 'Add professional and technical skills you have developed.' },
  { id: 'strengths', title: 'What are your personal strengths?', desc: 'Tell us how you think, execute, and collaborate.' },
  { id: 'experience', title: 'Professional Experience', desc: 'Build your career timeline and achievements.' },
  { id: 'education', title: 'Education & Qualifications', desc: 'Where did you study or train?' },
  { id: 'preferences', title: 'Career Preferences', desc: 'Your preferred locations and work environment.' },
  { id: 'review', title: 'Review & Complete', desc: 'Confirm your profile before stepping into your workspace.' },
] as const;

const WORKPLACE_OPTIONS = ['Remote', 'Hybrid', 'On-site'];
const EMPLOYMENT_OPTIONS = ['Full-time', 'Contract', 'Part-time', 'Internship'];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [fullName, setFullName] = useState('');
  const [applicationEmail, setApplicationEmail] = useState('');
  const [location, setLocation] = useState<string[]>([]);
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [strengths, setStrengths] = useState<string[]>([]);
  const [strengthReflection, setStrengthReflection] = useState('');
  const [experiences, setExperiences] = useState<StructuredExperience[]>([]);
  const [education, setEducation] = useState<Array<{ institution: string; qualification: string }>>([
    { institution: '', qualification: '' },
  ]);
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);
  const [remoteTypes, setRemoteTypes] = useState<string[]>(['Remote']);
  const [employmentTypes, setEmploymentTypes] = useState<string[]>(['Full-time']);
  const [salaryMin, setSalaryMin] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notApplicable, setNotApplicable] = useState<string[]>([]);

  // Load existing profile or saved draft
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/profile').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch('/api/preferences').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ])
      .then(([pData, prefData]: [any, any]) => {
        if (!active) return;
        const p = pData.profile || {};
        const c = pData.career || {};
        const pr = prefData.preferences || {};

        if (p.full_name) setFullName(p.full_name);
        if (p.application_email) setApplicationEmail(p.application_email);
        if (Array.isArray(p.target_roles) && p.target_roles.length > 0) setTargetRoles(p.target_roles);
        if (c.headline) setHeadline(c.headline);
        if (c.summary) setSummary(c.summary);
        if (Array.isArray(c.skills) && c.skills.length > 0) setSkills(c.skills);
        if (Array.isArray(c.strengths) && c.strengths.length > 0) setStrengths(c.strengths);
        if (c.strength_reflection) setStrengthReflection(c.strength_reflection);
        if (Array.isArray(c.experience) && c.experience.length > 0) setExperiences(c.experience);
        if (Array.isArray(c.education) && c.education.length > 0) setEducation(c.education);
        if (Array.isArray(c.not_applicable)) setNotApplicable(c.not_applicable);

        if (Array.isArray(pr.locations) && pr.locations.length > 0) setPreferredLocations(pr.locations);
        if (Array.isArray(pr.remote_types) && pr.remote_types.length > 0) setRemoteTypes(pr.remote_types);
        if (Array.isArray(pr.employment_types) && pr.employment_types.length > 0) setEmploymentTypes(pr.employment_types);
        if (pr.salary_min != null) setSalaryMin(String(pr.salary_min));
        if (pr.currency) setCurrency(pr.currency);

        // Check local draft fallback
        try {
          const draft = JSON.parse(sessionStorage.getItem('jobiest_onboarding_draft') || 'null');
          if (draft && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
            if (draft.fullName) setFullName(draft.fullName);
            if (draft.targetRoles) setTargetRoles(draft.targetRoles);
            if (draft.skills) setSkills(draft.skills);
            if (draft.strengths) setStrengths(draft.strengths);
            if (draft.experiences) setExperiences(draft.experiences);
          }
        } catch {}
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Autosave draft to session storage
  useEffect(() => {
    if (loading) return;
    try {
      sessionStorage.setItem(
        'jobiest_onboarding_draft',
        JSON.stringify({
          savedAt: Date.now(),
          fullName,
          applicationEmail,
          headline,
          summary,
          targetRoles,
          skills,
          strengths,
          strengthReflection,
          experiences,
          education,
          preferredLocations,
          remoteTypes,
          employmentTypes,
        }),
      );
    } catch {}
  }, [
    loading,
    fullName,
    applicationEmail,
    headline,
    summary,
    targetRoles,
    skills,
    strengths,
    strengthReflection,
    experiences,
    education,
    preferredLocations,
    remoteTypes,
    employmentTypes,
  ]);

  const saveCurrentData = async (): Promise<boolean> => {
    setSaving(true);
    setErrorMsg('');

    try {
      const cleanEdu = education.filter((e) => e.institution.trim() || e.qualification.trim());

      const profilePayload = {
        full_name: fullName.trim() || 'Jobiest Professional',
        target_roles: targetRoles.length > 0 ? targetRoles : ['Professional'],
        headline: headline.trim() || undefined,
        summary: summary.trim() || undefined,
        application_email: applicationEmail.trim() || undefined,
        skills,
        strengths,
        strength_reflection: strengthReflection.trim() || undefined,
        experience: experiences,
        education: cleanEdu,
        not_applicable: notApplicable,
      };

      const prefPayload = {
        locations: preferredLocations,
        remote_types: remoteTypes.map((r) => r.toLowerCase()),
        employment_types: employmentTypes.map((e) => e.toLowerCase()),
        salary_min: salaryMin ? Number(salaryMin) : null,
        currency,
        application_mode: 'approval',
        daily_target: 10,
      };

      const [pRes, prefRes] = await Promise.all([
        fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profilePayload),
        }),
        fetch('/api/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prefPayload),
        }),
      ]);

      if (!pRes.ok) {
        const err = await pRes.json().catch(() => ({}));
        setErrorMsg(err.error || 'Failed to update profile. Please verify required fields.');
        return false;
      }

      return true;
    } catch (err: unknown) {
      setErrorMsg('Network error. Check connection and retry.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    setErrorMsg('');

    // Step-specific validation
    if (currentStep === 0 && !fullName.trim()) {
      setErrorMsg('Please enter your full name to proceed.');
      return;
    }
    if (currentStep === 1 && targetRoles.length === 0) {
      setErrorMsg('Please select at least one target role (e.g. Software Engineer, Data Analyst).');
      return;
    }

    // Persist to server on each forward step
    await saveCurrentData();

    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Final completion
      const ok = await saveCurrentData();
      if (ok) {
        sessionStorage.removeItem('jobiest_onboarding_draft');
        router.push('/dashboard');
      }
    }
  };

  const handleBack = () => {
    setErrorMsg('');
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#10b981] border-t-transparent" />
          <p className="text-sm font-medium text-zinc-400">Loading your onboarding session...</p>
        </div>
      </div>
    );
  }

  const stepMeta = STEPS[currentStep];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-base font-bold text-white tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#10b981] text-xs font-black text-zinc-950">
              J
            </span>
            <span>Jobiest</span>
          </Link>
          <span className="hidden sm:inline-block text-xs uppercase tracking-widest text-zinc-500 font-semibold border-l border-zinc-800 pl-3">
            Onboarding Experience
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-400">
            Step {currentStep + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Skip to Dashboard
          </button>
        </div>
      </header>

      {/* Progress Track */}
      <div className="w-full bg-zinc-900 h-1">
        <div
          className="bg-[#10b981] h-1 transition-all duration-300"
          style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:py-12">
        {/* Step Header */}
        <div className="mb-8 text-center sm:text-left">
          <p className="text-xs font-bold uppercase tracking-wider text-[#10b981] mb-1.5">
            Step {currentStep + 1}: {stepMeta.title}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {stepMeta.title === 'What are your skills?' || stepMeta.title === 'What are your personal strengths?'
              ? stepMeta.title
              : stepMeta.desc}
          </h1>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-2xl">
            {currentStep === 2
              ? "Tell us what you're good at. Add the professional and technical skills you've developed through work, education, projects or personal experience."
              : currentStep === 3
              ? 'Everyone brings something different to the table. Tell us about the qualities that describe how you think, work, solve problems and collaborate with others.'
              : stepMeta.desc}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-xs sm:text-sm text-red-300 flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step Form Bodies */}
        <div className="space-y-6">
          {/* STEP 1: Basic Information */}
          {currentStep === 0 && (
            <div className="space-y-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-8 backdrop-blur-sm">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-[#10b981] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  Application Contact Email
                </label>
                <input
                  type="email"
                  value={applicationEmail}
                  onChange={(e) => setApplicationEmail(e.target.value)}
                  placeholder="e.g. alex.morgan@career.com"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-[#10b981] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Used exclusively when automated job applications are submitted on your behalf.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  Current Location
                </label>
                <LocationAutocomplete
                  value={location}
                  onChange={setLocation}
                  maxItems={1}
                  placeholder="e.g. Lagos, Nigeria or London, United Kingdom..."
                />
              </div>
            </div>
          )}

          {/* STEP 2: Professional Identity */}
          {currentStep === 1 && (
            <div className="space-y-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-8 backdrop-blur-sm">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  Target Roles & Desired Job Titles <span className="text-red-400">*</span>
                </label>
                <JobTitleAutocomplete
                  value={targetRoles}
                  onChange={setTargetRoles}
                  placeholder="Search and select roles (e.g. Frontend Developer, Product Designer)..."
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Select all positions you would be interested in applying for.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  Professional Headline
                </label>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={160}
                  placeholder="e.g. Senior Frontend Engineer | React, Next.js & TypeScript"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-[#10b981] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  Professional Summary
                </label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                  maxLength={3000}
                  placeholder="Briefly describe your career focus, core competencies, and primary professional achievements..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-[#10b981] focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Professional Skills */}
          {currentStep === 2 && (
            <div className="space-y-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-8 backdrop-blur-sm">
              <SkillAutocomplete
                value={skills}
                onChange={setSkills}
                placeholder="Search technical and professional skills (e.g. React, SQL, Project Management)..."
              />
              <p className="text-xs text-zinc-400 italic">
                Skills can come from employment, freelance work, education, personal projects, volunteering, or self-directed learning.
              </p>
            </div>
          )}

          {/* STEP 4: Personal Strengths */}
          {currentStep === 3 && (
            <div className="space-y-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-8 backdrop-blur-sm">
              <StrengthAutocomplete
                value={strengths}
                onChange={setStrengths}
                reflection={strengthReflection}
                onReflectionChange={setStrengthReflection}
                showReflection={true}
                placeholder="Search personal qualities (e.g. Analytical Thinking, Accountability, Adaptability)..."
              />
            </div>
          )}

          {/* STEP 5: Professional Experience */}
          {currentStep === 4 && (
            <div className="space-y-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-8 backdrop-blur-sm">
              <ExperienceBuilder experiences={experiences} onChange={setExperiences} />

              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
                <span>Early career or transitioning? You can skip and add experience later.</span>
                <button
                  type="button"
                  onClick={() => {
                    setNotApplicable((prev) => Array.from(new Set([...prev, 'experience'])));
                    handleNext();
                  }}
                  className="text-zinc-400 hover:text-white underline underline-offset-4"
                >
                  I don&apos;t have work experience yet
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: Education */}
          {currentStep === 5 && (
            <div className="space-y-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-8 backdrop-blur-sm">
              {education.map((edu, idx) => (
                <div key={idx} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-400">Education #{idx + 1}</span>
                    {education.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEducation(education.filter((_, i) => i !== idx))}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={edu.institution}
                      onChange={(e) => {
                        const copy = [...education];
                        copy[idx].institution = e.target.value;
                        setEducation(copy);
                      }}
                      placeholder="Institution (e.g. University of Lagos)"
                      className="rounded-xl border border-zinc-700 bg-zinc-900 p-2.5 text-xs sm:text-sm text-zinc-100"
                    />
                    <input
                      type="text"
                      value={edu.qualification}
                      onChange={(e) => {
                        const copy = [...education];
                        copy[idx].qualification = e.target.value;
                        setEducation(copy);
                      }}
                      placeholder="Degree / Qualification (e.g. BSc Computer Science)"
                      className="rounded-xl border border-zinc-700 bg-zinc-900 p-2.5 text-xs sm:text-sm text-zinc-100"
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setEducation([...education, { institution: '', qualification: '' }])}
                className="w-full rounded-xl border border-dashed border-zinc-700 py-3 text-xs font-medium text-zinc-400 hover:text-white"
              >
                + Add Another Qualification
              </button>
            </div>
          )}

          {/* STEP 7: Career Preferences */}
          {currentStep === 6 && (
            <div className="space-y-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-8 backdrop-blur-sm">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  Preferred Job Locations
                </label>
                <LocationAutocomplete
                  value={preferredLocations}
                  onChange={setPreferredLocations}
                  placeholder="Search cities or select Remote (Worldwide)..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  Workplace Arrangements
                </label>
                <div className="flex flex-wrap gap-2">
                  {WORKPLACE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setRemoteTypes((prev) =>
                          prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
                        )
                      }
                      className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                        remoteTypes.includes(opt)
                          ? 'border-[#10b981] bg-[#10b981]/20 text-[#10b981]'
                          : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  Employment Types
                </label>
                <div className="flex flex-wrap gap-2">
                  {EMPLOYMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setEmploymentTypes((prev) =>
                          prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
                        )
                      }
                      className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                        employmentTypes.includes(opt)
                          ? 'border-[#10b981] bg-[#10b981]/20 text-[#10b981]'
                          : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                    Minimum Monthly Salary
                  </label>
                  <input
                    type="number"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-xs sm:text-sm text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                    Currency
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-xs sm:text-sm text-zinc-100"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="NGN">NGN (₦)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="CAD">CAD ($)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 8: Review & Complete */}
          {currentStep === 7 && (
            <div className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:p-8 backdrop-blur-sm">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2 mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Profile Identity</h4>
                  <button type="button" onClick={() => setCurrentStep(0)} className="text-xs text-[#10b981]">
                    Edit
                  </button>
                </div>
                <p className="text-sm font-semibold text-white">{fullName}</p>
                {headline && <p className="text-xs text-zinc-400 mt-0.5">{headline}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {targetRoles.map((r) => (
                    <span key={r} className="rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 text-[11px]">
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2 mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Skills ({skills.length})
                  </h4>
                  <button type="button" onClick={() => setCurrentStep(2)} className="text-xs text-[#10b981]">
                    Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <span key={s} className="rounded-full bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30 px-2 py-0.5 text-[11px]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2 mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Personal Strengths ({strengths.length})
                  </h4>
                  <button type="button" onClick={() => setCurrentStep(3)} className="text-xs text-[#10b981]">
                    Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {strengths.map((str) => (
                    <span key={str} className="rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 text-[11px]">
                      {str}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2 mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                    Experience ({experiences.length})
                  </h4>
                  <button type="button" onClick={() => setCurrentStep(4)} className="text-xs text-[#10b981]">
                    Edit
                  </button>
                </div>
                {experiences.length === 0 ? (
                  <p className="text-xs text-zinc-500">No experience added yet.</p>
                ) : (
                  <div className="space-y-2">
                    {experiences.map((exp, idx) => (
                      <div key={idx} className="text-xs text-zinc-300">
                        <span className="font-semibold text-white">{exp.title}</span> at {exp.company}
                        {exp.is_current ? ' (Present)' : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="mt-8 flex items-center justify-between border-t border-zinc-800/80 pt-6">
          {currentStep > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={saving}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-xs sm:text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNext}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[#10b981] px-6 py-2.5 text-xs sm:text-sm font-bold text-zinc-950 shadow-lg shadow-[#10b981]/20 transition-all hover:bg-[#059669] hover:shadow-[#10b981]/30 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
                <span>Saving...</span>
              </>
            ) : currentStep === STEPS.length - 1 ? (
              <span>Complete & Open Workspace →</span>
            ) : (
              <span>Continue →</span>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
