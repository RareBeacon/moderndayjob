'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AppShell } from '@/components/site/AppShell';
import { EMPTY_STUDIO_DRAFT, normalizeStudioDraft, scoreResumeDraft, type ResumeScore, type StudioDraft, type StudioEducation, type StudioExperience, type StudioProject } from '@/lib/resume-studio/draft';
import { RESUME_TEMPLATES, TEMPLATE_CATEGORIES, getResumeTemplate, recommendResumeTemplates, type ResumeTemplate, type ResumeTemplateCategory } from '@/lib/resume-studio/templates';

type Kind = 'CV' | 'COVER_LETTER' | 'ANSWERS';
type StudioMode = 'builder' | 'classic';
type AiMode = 'stronger' | 'simpler' | 'technical' | 'senior' | 'ats';

interface Claim {
  category: string;
  value: string;
  reason?: string;
}
interface Report {
  supported: Claim[];
  unsupported: Claim[];
  suspicious: Claim[];
  passed: boolean;
  summary: string;
}
interface Job {
  id: string;
  company: string;
  title: string;
}
interface GenDoc {
  id: string;
  kind: Kind;
  title: string;
  version: number;
  created_at: string;
  content?: string;
  source_facts?: { truthfulnessPassed?: boolean; resumeStudio?: boolean; templateName?: string; resumeScore?: ResumeScore };
}
interface GeneratedResume {
  id: string;
  version: number;
  title: string;
  content: string;
}
interface DraftApiResponse {
  draft?: {
    id: string;
    name: string;
    selectedTemplate: string;
    currentStep: string;
    targetJobDescription: string;
    content: Partial<StudioDraft>;
    completion: number;
  } | null;
  memory?: {
    fullName?: string;
    email?: string;
    targetRoles?: string[];
    career?: {
      headline?: string | null;
      summary?: string | null;
      skills?: string[] | null;
      experience?: { company?: string; title?: string; description?: string }[] | null;
      education?: { institution?: string; qualification?: string }[] | null;
      projects?: { name?: string; description?: string; technologies?: string[]; url?: string }[] | null;
      links?: { website?: string; linkedin?: string; github?: string } | null;
    } | null;
  };
}

const STEPS = [
  { id: 'welcome', label: 'Welcome', short: 'Start' },
  { id: 'about', label: 'About you', short: 'About' },
  { id: 'career', label: 'Career identity', short: 'Career' },
  { id: 'experience', label: 'AI Experience Builder', short: 'Experience' },
  { id: 'skills', label: 'Skills', short: 'Skills' },
  { id: 'education', label: 'Education and projects', short: 'Education' },
  { id: 'optimize', label: 'Resume optimization', short: 'Polish' },
  { id: 'templates', label: 'Template library', short: 'Templates' },
  { id: 'review', label: 'Final review', short: 'Review' },
] as const;
type StepId = typeof STEPS[number]['id'];

const KINDS: { id: Exclude<Kind, 'CV'>; label: string; hint: string }[] = [
  { id: 'COVER_LETTER', label: 'Cover letter', hint: 'Concise and specific' },
  { id: 'ANSWERS', label: 'Application answers', hint: 'Question by question' },
];

function newId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function freshDraft(): StudioDraft {
  return normalizeStudioDraft(JSON.parse(JSON.stringify(EMPTY_STUDIO_DRAFT)) as StudioDraft);
}

function draftFromMemory(memory?: DraftApiResponse['memory']): StudioDraft {
  const draft = freshDraft();
  if (!memory) return draft;
  draft.personal.name = memory.fullName ?? '';
  draft.personal.email = memory.email ?? '';
  draft.career.targetRole = memory.targetRoles?.[0] ?? '';
  draft.career.headline = memory.career?.headline ?? draft.career.targetRole;
  draft.career.summary = memory.career?.summary ?? '';
  draft.personal.website = memory.career?.links?.website ?? '';
  draft.personal.linkedin = memory.career?.links?.linkedin ?? '';
  draft.personal.github = memory.career?.links?.github ?? '';
  draft.skills = (memory.career?.skills ?? []).map((name, index) => ({ name, category: 'Profile', priority: index + 1 }));
  draft.experiences = (memory.career?.experience ?? []).map((e, index) => ({
    id: newId(`exp-${index}`),
    company: e.company ?? '',
    role: e.title ?? '',
    roughNotes: e.description ?? '',
    tools: [],
    impact: '',
    bullets: e.description ? [e.description] : [],
  }));
  draft.education = (memory.career?.education ?? []).map((e, index) => ({
    id: newId(`edu-${index}`),
    institution: e.institution ?? '',
    degree: e.qualification ?? '',
  }));
  draft.projects = (memory.career?.projects ?? []).map((p, index) => ({
    id: newId(`project-${index}`),
    name: p.name ?? '',
    description: p.description ?? '',
    technologies: p.technologies ?? [],
    url: p.url ?? '',
    achievements: [],
  }));
  return normalizeStudioDraft(draft);
}

export default function GeneratePage() {
  const [mode, setMode] = useState<StudioMode>('builder');
  const [draft, setDraft] = useState<StudioDraft>(() => freshDraft());
  const [draftId, setDraftId] = useState<string | undefined>();
  const [activeStep, setActiveStep] = useState<StepId>('welcome');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [recent, setRecent] = useState<GenDoc[]>([]);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'local' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [generated, setGenerated] = useState<GeneratedResume | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ResumeTemplateCategory>('modern');
  const [jobMatch, setJobMatch] = useState<{ match: number; matchingSkills: string[]; missingKeywords: string[]; recommendations: string[] } | null>(null);
  const [finalReview, setFinalReview] = useState<{ ready: boolean; summary: string; checks: { label: string; ok: boolean; detail: string }[] } | null>(null);
  const [booted, setBooted] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const score = useMemo(() => scoreResumeDraft(draft), [draft]);
  const template = useMemo(() => getResumeTemplate(draft.selectedTemplate), [draft.selectedTemplate]);
  const recommended = useMemo(() => recommendResumeTemplates({ role: draft.career.targetRole || draft.career.headline, yearsExperience: Number(draft.career.yearsExperience || 0), skills: draft.skills.map((s) => s.name) }), [draft]);
  const stepIndex = STEPS.findIndex((s) => s.id === activeStep);

  useEffect(() => {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => {});
    loadRecent();
    const local = typeof window !== 'undefined' ? window.localStorage.getItem('jobiest.resumeStudio.draft') : null;
    const hasLocalDraft = Boolean(local);
    if (local) {
      try {
        const parsed = normalizeStudioDraft(JSON.parse(local));
        setDraft(parsed);
        setActiveStep((parsed.currentStep as StepId) || 'welcome');
      } catch {}
    }
    fetch('/api/resume-studio/draft')
      .then(async (r) => {
        if (!r.ok) throw new Error('draft unavailable');
        return (await r.json()) as DraftApiResponse;
      })
      .then((data) => {
        if (data.draft?.content) {
          const loaded = normalizeStudioDraft({ ...data.draft.content, selectedTemplate: data.draft.selectedTemplate, currentStep: data.draft.currentStep, targetJobDescription: data.draft.targetJobDescription });
          setDraft(loaded);
          setDraftId(data.draft.id);
          setActiveStep((loaded.currentStep as StepId) || 'welcome');
        } else {
          const remembered = draftFromMemory(data.memory);
          setDraft((current) => {
            if (!hasLocalDraft) return remembered;
            return normalizeStudioDraft({
              ...current,
              personal: {
                name: current.personal.name || remembered.personal.name,
                email: current.personal.email || remembered.personal.email,
                phone: current.personal.phone || remembered.personal.phone,
                location: current.personal.location || remembered.personal.location,
                website: current.personal.website || remembered.personal.website,
                linkedin: current.personal.linkedin || remembered.personal.linkedin,
                github: current.personal.github || remembered.personal.github,
              },
              career: {
                ...current.career,
                headline: current.career.headline || remembered.career.headline,
                targetRole: current.career.targetRole || remembered.career.targetRole,
                summary: current.career.summary || remembered.career.summary,
              },
              skills: current.skills.length ? current.skills : remembered.skills,
              experiences: current.experiences.length ? current.experiences : remembered.experiences,
              education: current.education.length ? current.education : remembered.education,
              projects: current.projects.length ? current.projects : remembered.projects,
            });
          });
        }
      })
      .catch(() => setSaveState('local'))
      .finally(() => setBooted(true));
  }, []);

  useEffect(() => {
    if (!booted) return;
    if (typeof window !== 'undefined') window.localStorage.setItem('jobiest.resumeStudio.draft', JSON.stringify(draft));
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/resume-studio/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftId, name: draft.versionName, selectedTemplate: draft.selectedTemplate, currentStep: activeStep, targetJobDescription: draft.targetJobDescription, content: { ...draft, currentStep: activeStep } }),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data?.message ?? data?.error ?? 'save failed');
          if (data?.draft?.id && !draftId) setDraftId(data.draft.id);
          setSaveState('saved');
        })
        .catch(() => setSaveState('local'));
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, activeStep, draftId, booted]);

  function loadRecent() {
    fetch('/api/documents/generated')
      .then((r) => r.json())
      .then((d) => setRecent(d.documents ?? []))
      .catch(() => {});
  }

  function patchDraft(patch: Partial<StudioDraft>) {
    setDraft((current) => normalizeStudioDraft({ ...current, ...patch }));
  }

  function patchPersonal(key: keyof StudioDraft['personal'], value: string) {
    setDraft((current) => normalizeStudioDraft({ ...current, personal: { ...current.personal, [key]: value } }));
  }

  function patchCareer(key: keyof StudioDraft['career'], value: string) {
    setDraft((current) => normalizeStudioDraft({ ...current, career: { ...current.career, [key]: value } }));
  }

  function goStep(step: StepId) {
    setActiveStep(step);
    setDraft((current) => normalizeStudioDraft({ ...current, currentStep: step }));
  }

  function nextStep() {
    const next = STEPS[Math.min(STEPS.length - 1, stepIndex + 1)]?.id ?? 'review';
    goStep(next);
  }

  function prevStep() {
    const prev = STEPS[Math.max(0, stepIndex - 1)]?.id ?? 'welcome';
    goStep(prev);
  }

  async function callAi<T>(action: string, payload: Record<string, unknown>): Promise<T | null> {
    setAiBusy(action);
    setMessage('');
    try {
      const res = await fetch('/api/resume-studio/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message ?? "Looks like my writing assistant took a tiny coffee break. Let's try that again.");
      return json as T;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Looks like my writing assistant took a tiny coffee break. Let's try that again.");
      return null;
    } finally {
      setAiBusy(null);
    }
  }

  async function suggestSkills() {
    const result = await callAi<{ suggestions: string[]; note: string }>('suggestSkills', { role: draft.career.targetRole || draft.career.headline, existing: draft.skills.map((s) => s.name) });
    if (!result) return;
    addSkills(result.suggestions.slice(0, 8), 'Suggested');
    setMessage(result.note);
  }

  async function writeSummary() {
    const result = await callAi<{ text: string; notes: string[] }>('writeSummary', { draft });
    if (!result) return;
    patchCareer('summary', result.text);
    setMessage(result.notes.join(' '));
  }

  async function extractMessy(text: string) {
    const result = await callAi<{ extracted: Partial<StudioDraft>; questions: string[] }>('extractProfile', { text });
    if (!result) return;
    setDraft((current) => normalizeStudioDraft({
      ...current,
      ...result.extracted,
      personal: { ...current.personal, ...(result.extracted.personal ?? {}) },
      career: { ...current.career, ...(result.extracted.career ?? {}) },
      skills: result.extracted.skills?.length ? [...current.skills, ...result.extracted.skills] : current.skills,
      additional: [current.additional, result.extracted.additional].filter(Boolean).join(' '),
    }));
    setMessage(result.questions.join(' '));
  }

  function addSkills(skills: string[], category = 'Core') {
    setDraft((current) => {
      const existing = new Set(current.skills.map((s) => s.name.toLowerCase()));
      const next = [...current.skills];
      for (const skill of skills.map((s) => s.trim()).filter(Boolean)) {
        if (existing.has(skill.toLowerCase())) continue;
        existing.add(skill.toLowerCase());
        next.push({ name: skill, category, priority: next.length + 1 });
      }
      return normalizeStudioDraft({ ...current, skills: next });
    });
  }

  function removeSkill(name: string) {
    setDraft((current) => normalizeStudioDraft({ ...current, skills: current.skills.filter((s) => s.name !== name) }));
  }

  function upsertExperience(id: string, patch: Partial<StudioExperience>) {
    setDraft((current) => normalizeStudioDraft({ ...current, experiences: current.experiences.map((e) => e.id === id ? { ...e, ...patch } : e) }));
  }

  function addExperience() {
    setDraft((current) => normalizeStudioDraft({ ...current, experiences: [...current.experiences, { id: newId('exp'), company: '', role: draft.career.targetRole || '', roughNotes: '', tools: [], impact: '', bullets: [] }] }));
  }

  function removeExperience(id: string) {
    setDraft((current) => normalizeStudioDraft({ ...current, experiences: current.experiences.filter((e) => e.id !== id) }));
  }

  async function buildExperience(exp: StudioExperience) {
    const result = await callAi<{ bullets: string[]; followUpQuestions: string[]; note: string }>('generateExperience', { experience: exp, seniority: draft.career.seniority });
    if (!result) return;
    upsertExperience(exp.id, { bullets: result.bullets });
    setMessage([result.note, ...result.followUpQuestions].join(' '));
  }

  async function improveExperience(exp: StudioExperience, mode: AiMode) {
    const result = await callAi<{ bullets: string[]; note: string }>('improveExperience', { experience: exp, bullets: exp.bullets, mode, seniority: draft.career.seniority });
    if (!result) return;
    upsertExperience(exp.id, { bullets: result.bullets });
    setMessage(result.note);
  }

  function upsertEducation(id: string, patch: Partial<StudioEducation>) {
    setDraft((current) => normalizeStudioDraft({ ...current, education: current.education.map((e) => e.id === id ? { ...e, ...patch } : e) }));
  }

  function addEducation() {
    setDraft((current) => normalizeStudioDraft({ ...current, education: [...current.education, { id: newId('edu'), institution: '', degree: '', field: '' }] }));
  }

  function upsertProject(id: string, patch: Partial<StudioProject>) {
    setDraft((current) => normalizeStudioDraft({ ...current, projects: current.projects.map((p) => p.id === id ? { ...p, ...patch } : p) }));
  }

  function addProject() {
    setDraft((current) => normalizeStudioDraft({ ...current, projects: [...current.projects, { id: newId('project'), name: '', description: '', technologies: [], achievements: [] }] }));
  }

  async function optimizeForJob() {
    const result = await callAi<typeof jobMatch>('optimizeForJob', { draft, jobDescription: draft.targetJobDescription });
    if (!result) return;
    setJobMatch(result);
  }

  async function runFinalReview() {
    const result = await callAi<typeof finalReview>('finalReview', { draft });
    if (!result) return;
    setFinalReview(result);
  }

  async function generateFinalResume() {
    setAiBusy('generateFinalResume');
    setMessage('');
    try {
      const res = await fetch('/api/resume-studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, templateId: draft.selectedTemplate, draft }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message ?? 'Resume generation failed. You can continue manually and try again.');
      setGenerated(json.document);
      setMessage('Your resume is ready. Download it, edit it, tailor it to a job, or create another version.');
      loadRecent();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Looks like my writing assistant took a tiny coffee break. Let's try that again.");
    } finally {
      setAiBusy(null);
    }
  }

  return (
    <AppShell active="generate" title="Generate">
      <div className="resume2-hero">
        <div>
          <p className="eyebrow">Resume Studio 2.0</p>
          <h1>Build your resume with an AI career assistant, not a boring form.</h1>
          <p>
            Answer naturally, improve rough thoughts into professional resume language, preview the result live,
            and generate a truthful ATS-friendly resume only when you approve it.
          </p>
          <div className="resume2-mode-switch" role="tablist" aria-label="Resume Studio mode">
            <button className={mode === 'builder' ? 'active' : ''} onClick={() => setMode('builder')}>AI Resume Builder Journey</button>
            <button className={mode === 'classic' ? 'active' : ''} onClick={() => setMode('classic')}>Cover letters and answers</button>
          </div>
        </div>
        <div className="resume2-headline-features" aria-label="Headline Resume Studio features">
          <FeatureCard title="AI Experience Builder" body="Tell me what you actually did. The assistant asks better follow-up questions and turns your facts into stronger bullets." />
          <FeatureCard title="50-template library" body="Browse Minimal, Modern, Professional, Creative and Executive systems. Switching templates keeps your content intact." />
          <FeatureCard title="Live preview" body="Watch your resume update while you build. Desktop gets side-by-side preview. Mobile gets a focused preview button." />
        </div>
      </div>

      {mode === 'builder' ? (
        <div className="resume2-shell">
          <aside className="resume2-left">
            <Progress steps={STEPS} activeStep={activeStep} goStep={goStep} score={score.total} saveState={saveState} />
            <AssistantBubble step={activeStep} draft={draft} />
            {message && <div className="resume2-message">{message}</div>}
            <div className="resume2-panel">
              <StepContent
                activeStep={activeStep}
                draft={draft}
                jobs={jobs}
                aiBusy={aiBusy}
                recommended={recommended}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                score={score}
                jobMatch={jobMatch}
                finalReview={finalReview}
                generated={generated}
                patchDraft={patchDraft}
                patchPersonal={patchPersonal}
                patchCareer={patchCareer}
                nextStep={nextStep}
                prevStep={prevStep}
                suggestSkills={suggestSkills}
                writeSummary={writeSummary}
                extractMessy={extractMessy}
                addSkills={addSkills}
                removeSkill={removeSkill}
                addExperience={addExperience}
                upsertExperience={upsertExperience}
                removeExperience={removeExperience}
                buildExperience={buildExperience}
                improveExperience={improveExperience}
                addEducation={addEducation}
                upsertEducation={upsertEducation}
                addProject={addProject}
                upsertProject={upsertProject}
                optimizeForJob={optimizeForJob}
                runFinalReview={runFinalReview}
                generateFinalResume={generateFinalResume}
              />
            </div>
          </aside>
          <aside className="resume2-preview-wrap">
            <div className="resume2-preview-sticky">
              <div className="resume2-preview-head">
                <div>
                  <p className="eyebrow">Live preview</p>
                  <strong>{template.name}</strong>
                </div>
                <button className="btn secondary" onClick={() => goStep('templates')}>Change template</button>
              </div>
              <ResumePreview draft={draft} template={template} score={score.total} />
            </div>
          </aside>
        </div>
      ) : (
        <ClassicGenerator jobs={jobs} recent={recent} loadRecent={loadRecent} />
      )}
    </AppShell>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return <div><strong>{title}</strong><p>{body}</p></div>;
}

function Progress({ steps, activeStep, goStep, score, saveState }: { steps: typeof STEPS; activeStep: StepId; goStep: (step: StepId) => void; score: number; saveState: string }) {
  const index = steps.findIndex((s) => s.id === activeStep);
  return (
    <div className="resume2-progress-card">
      <div className="resume2-progress-top">
        <span>Step {index + 1} of {steps.length}</span>
        <span>Resume strength {score}/100</span>
        <span>{saveState === 'saved' ? 'Autosaved' : saveState === 'saving' ? 'Saving' : saveState === 'local' ? 'Saved locally' : 'Draft ready'}</span>
      </div>
      <div className="resume2-progress-bar"><span style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
      <div className="resume2-step-tabs">
        {steps.map((step, i) => (
          <button key={step.id} className={step.id === activeStep ? 'active' : i < index ? 'done' : ''} onClick={() => goStep(step.id)}>{step.short}</button>
        ))}
      </div>
    </div>
  );
}

function AssistantBubble({ step, draft }: { step: StepId; draft: StudioDraft }) {
  const firstName = draft.personal.name.split(' ')[0] || 'there';
  const copy: Record<StepId, string> = {
    welcome: "Let's build your resume together. Give me the rough version. Making it professional is my job.",
    about: `Nice to meet you${draft.personal.name ? `, ${firstName}` : ''}. I need the contact details employers should use, and only the ones you want on your resume.`,
    career: 'Tell me what you do or what role you are targeting. I will keep the wording strong without inflating your seniority.',
    experience: "Tell me what you actually did. If it is messy, that is fine. I will ask one more question when it helps.",
    skills: 'Select skills you actually have. Suggestions are not claims until you choose them.',
    education: 'Add education, projects, certifications and achievements only where they strengthen your story.',
    optimize: 'Now we polish. I can write a summary, check ATS basics, and compare your resume to a target job description.',
    templates: 'Based on your profile, I recommend a few templates, but you can browse all 50.',
    review: 'Final check. If anything important is missing, we fix it before generating the document.',
  };
  return <div className="resume2-assistant"><span>AI assistant</span><p>{copy[step]}</p></div>;
}

interface StepContentProps {
  activeStep: StepId;
  draft: StudioDraft;
  jobs: Job[];
  aiBusy: string | null;
  recommended: ResumeTemplate[];
  selectedCategory: ResumeTemplateCategory;
  setSelectedCategory: (category: ResumeTemplateCategory) => void;
  score: ResumeScore;
  jobMatch: { match: number; matchingSkills: string[]; missingKeywords: string[]; recommendations: string[] } | null;
  finalReview: { ready: boolean; summary: string; checks: { label: string; ok: boolean; detail: string }[] } | null;
  generated: GeneratedResume | null;
  patchDraft: (patch: Partial<StudioDraft>) => void;
  patchPersonal: (key: keyof StudioDraft['personal'], value: string) => void;
  patchCareer: (key: keyof StudioDraft['career'], value: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  suggestSkills: () => void;
  writeSummary: () => void;
  extractMessy: (text: string) => void;
  addSkills: (skills: string[], category?: string) => void;
  removeSkill: (name: string) => void;
  addExperience: () => void;
  upsertExperience: (id: string, patch: Partial<StudioExperience>) => void;
  removeExperience: (id: string) => void;
  buildExperience: (experience: StudioExperience) => void;
  improveExperience: (experience: StudioExperience, mode: AiMode) => void;
  addEducation: () => void;
  upsertEducation: (id: string, patch: Partial<StudioEducation>) => void;
  addProject: () => void;
  upsertProject: (id: string, patch: Partial<StudioProject>) => void;
  optimizeForJob: () => void;
  runFinalReview: () => void;
  generateFinalResume: () => void;
}

function StepContent(props: StepContentProps) {
  if (props.activeStep === 'welcome') return <WelcomeStep {...props} />;
  if (props.activeStep === 'about') return <AboutStep {...props} />;
  if (props.activeStep === 'career') return <CareerStep {...props} />;
  if (props.activeStep === 'experience') return <ExperienceStep {...props} />;
  if (props.activeStep === 'skills') return <SkillsStep {...props} />;
  if (props.activeStep === 'education') return <EducationStep {...props} />;
  if (props.activeStep === 'optimize') return <OptimizeStep {...props} />;
  if (props.activeStep === 'templates') return <TemplatesStep {...props} />;
  return <ReviewStep {...props} />;
}

function StepActions({ prevStep, nextStep, nextLabel = 'Continue' }: { prevStep: () => void; nextStep: () => void; nextLabel?: string }) {
  return <div className="resume2-actions"><button className="btn secondary" onClick={prevStep}>Back</button><button className="btn" onClick={nextStep}>{nextLabel}</button></div>;
}

function WelcomeStep({ draft, patchDraft, nextStep, extractMessy, aiBusy }: StepContentProps) {
  const [messy, setMessy] = useState('');
  return (
    <div className="resume2-step">
      <p className="eyebrow">Welcome</p>
      <h2>Generate My Resume starts a guided journey.</h2>
      <p className="resume2-copy">Paste messy notes or start step by step. The assistant extracts what it can, asks you to confirm uncertain details, and never invents experience.</p>
      <label className="resume2-field full"><span>Paste messy career notes, optional</span><textarea rows={7} value={messy} onChange={(e) => setMessy(e.target.value)} placeholder="I worked at XYZ from 2023 to 2025, mostly building automation with Python and AI. I also worked on a customer support bot." /></label>
      <div className="resume2-actions left">
        <button className="btn" disabled={!messy.trim() || aiBusy === 'extractProfile'} onClick={() => extractMessy(messy)}>{aiBusy === 'extractProfile' ? 'Reading notes' : 'Extract with AI'}</button>
        <button className="btn secondary" onClick={nextStep}>Start step by step</button>
        <button className="btn secondary" onClick={() => patchDraft(freshDraft())}>Create from scratch</button>
      </div>
    </div>
  );
}

function AboutStep({ draft, patchPersonal, prevStep, nextStep }: StepContentProps) {
  return (
    <div className="resume2-step">
      <p className="eyebrow">About you</p>
      <h2>What should employers see first?</h2>
      <div className="resume2-form-grid">
        <Field label="Full name" value={draft.personal.name} onChange={(v) => patchPersonal('name', v)} placeholder="Philip Okwoyemi" />
        <Field label="Email" value={draft.personal.email} onChange={(v) => patchPersonal('email', v)} placeholder="philip@example.com" />
        <Field label="Phone" value={draft.personal.phone} onChange={(v) => patchPersonal('phone', v)} placeholder="+234..." />
        <Field label="Location" value={draft.personal.location} onChange={(v) => patchPersonal('location', v)} placeholder="Lagos, Nigeria" />
        <Field label="Website" value={draft.personal.website} onChange={(v) => patchPersonal('website', v)} placeholder="https://..." />
        <Field label="LinkedIn" value={draft.personal.linkedin} onChange={(v) => patchPersonal('linkedin', v)} placeholder="https://linkedin.com/in/..." />
        <Field label="GitHub or portfolio" value={draft.personal.github} onChange={(v) => patchPersonal('github', v)} placeholder="https://github.com/..." />
      </div>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function CareerStep({ draft, patchCareer, patchDraft, prevStep, nextStep, suggestSkills, aiBusy }: StepContentProps) {
  return (
    <div className="resume2-step">
      <p className="eyebrow">Career identity</p>
      <h2>What do you do, and where are you going?</h2>
      <div className="resume2-form-grid">
        <Field label="Target role" value={draft.career.targetRole} onChange={(v) => patchCareer('targetRole', v)} placeholder="AI Engineer" />
        <Field label="Professional headline" value={draft.career.headline} onChange={(v) => patchCareer('headline', v)} placeholder="AI Engineer focused on agents and automation" />
        <Field label="Years of experience" value={draft.career.yearsExperience} onChange={(v) => patchCareer('yearsExperience', v)} placeholder="3" />
        <label className="resume2-field"><span>Seniority</span><select value={draft.career.seniority} onChange={(e) => patchCareer('seniority', e.target.value)}><option value="">Select</option><option value="student">Student or graduate</option><option value="early">1 to 2 years</option><option value="mid">2 to 5 years</option><option value="senior">5+ years</option><option value="executive">Executive</option></select></label>
      </div>
      <div className="resume2-inline-card">
        <strong>AI suggestions</strong>
        <p>Based on your role, I can suggest skills. Keep only the ones you genuinely have.</p>
        <button className="btn secondary" onClick={suggestSkills} disabled={aiBusy === 'suggestSkills'}>{aiBusy === 'suggestSkills' ? 'Suggesting' : 'Suggest relevant skills'}</button>
      </div>
      <label className="resume2-field full"><span>Version name</span><input value={draft.versionName} onChange={(e) => patchDraft({ versionName: e.target.value })} placeholder="AI Engineer Resume" /></label>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function ExperienceStep({ draft, addExperience, upsertExperience, removeExperience, buildExperience, improveExperience, prevStep, nextStep, aiBusy }: StepContentProps) {
  return (
    <div className="resume2-step">
      <p className="eyebrow">AI Experience Builder</p>
      <h2>Turn rough work notes into strong resume bullets.</h2>
      <p className="resume2-copy">Do not worry about grammar. Add what you did, tools you used, who it helped, and any outcome you can honestly support.</p>
      <div className="resume2-list">
        {draft.experiences.map((exp) => (
          <div className="resume2-item" key={exp.id}>
            <div className="resume2-item-head"><strong>{exp.role || 'New role'} {exp.company ? `| ${exp.company}` : ''}</strong><button className="link-button" onClick={() => removeExperience(exp.id)}>Remove</button></div>
            <div className="resume2-form-grid">
              <Field label="Company, client or project" value={exp.company} onChange={(v) => upsertExperience(exp.id, { company: v })} placeholder="ABC Technologies" />
              <Field label="Role" value={exp.role} onChange={(v) => upsertExperience(exp.id, { role: v })} placeholder="AI Engineer" />
              <Field label="Location" value={exp.location ?? ''} onChange={(v) => upsertExperience(exp.id, { location: v })} placeholder="Remote or Lagos" />
              <Field label="Start" value={exp.startDate ?? ''} onChange={(v) => upsertExperience(exp.id, { startDate: v })} placeholder="2023" />
              <Field label="End" value={exp.endDate ?? ''} onChange={(v) => upsertExperience(exp.id, { endDate: v })} placeholder="2025 or Present" />
              <label className="resume2-field checkbox"><input type="checkbox" checked={Boolean(exp.current)} onChange={(e) => upsertExperience(exp.id, { current: e.target.checked })} /> Current role</label>
            </div>
            <label className="resume2-field full"><span>Tell me what you actually did</span><textarea rows={4} value={exp.roughNotes} onChange={(e) => upsertExperience(exp.id, { roughNotes: e.target.value })} placeholder="I built AI agents and automation systems for companies." /></label>
            <Field label="Tools, comma separated" value={exp.tools.join(', ')} onChange={(v) => upsertExperience(exp.id, { tools: v.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="Python, LangChain, APIs, n8n" />
            <label className="resume2-field full"><span>Impact or outcome, only if true</span><textarea rows={2} value={exp.impact} onChange={(e) => upsertExperience(exp.id, { impact: e.target.value })} placeholder="Reduced repetitive manual work for the operations team. Add numbers only if you have them." /></label>
            <div className="resume2-ai-row">
              <button className="btn" disabled={Boolean(aiBusy)} onClick={() => buildExperience(exp)}>Write with AI</button>
              <button className="btn secondary" disabled={!exp.bullets.length || Boolean(aiBusy)} onClick={() => improveExperience(exp, 'stronger')}>Make stronger</button>
              <button className="btn secondary" disabled={!exp.bullets.length || Boolean(aiBusy)} onClick={() => improveExperience(exp, 'technical')}>More technical</button>
              <button className="btn secondary" disabled={!exp.bullets.length || Boolean(aiBusy)} onClick={() => improveExperience(exp, 'ats')}>ATS-friendly</button>
            </div>
            <label className="resume2-field full"><span>Resume bullets</span><textarea rows={Math.max(3, exp.bullets.length + 1)} value={exp.bullets.join('\n')} onChange={(e) => upsertExperience(exp.id, { bullets: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} placeholder="Built and integrated AI agents to streamline repetitive business processes." /></label>
          </div>
        ))}
      </div>
      <button className="btn secondary" onClick={addExperience}>Add experience</button>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function SkillsStep({ draft, addSkills, removeSkill, suggestSkills, aiBusy, prevStep, nextStep }: StepContentProps) {
  const [skill, setSkill] = useState('');
  return (
    <div className="resume2-step">
      <p className="eyebrow">Skills</p>
      <h2>Select what you actually know.</h2>
      <div className="resume2-add-row"><input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Add a skill" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkills([skill]); setSkill(''); } }} /><button className="btn secondary" onClick={() => { addSkills([skill]); setSkill(''); }}>Add</button><button className="btn secondary" disabled={aiBusy === 'suggestSkills'} onClick={suggestSkills}>Suggest skills</button></div>
      <div className="resume2-skill-cloud">
        {draft.skills.length === 0 && <p className="muted">No skills yet. Add a few or let the assistant suggest options.</p>}
        {draft.skills.map((s) => <button key={s.name} onClick={() => removeSkill(s.name)}>{s.name}<span>×</span></button>)}
      </div>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function EducationStep({ draft, addEducation, upsertEducation, addProject, upsertProject, patchDraft, prevStep, nextStep }: StepContentProps) {
  return (
    <div className="resume2-step">
      <p className="eyebrow">Education, projects and more</p>
      <h2>Add the details that support your target role.</h2>
      <div className="resume2-subhead"><strong>Education</strong><button className="btn secondary" onClick={addEducation}>Add education</button></div>
      {draft.education.map((edu) => <div className="resume2-item" key={edu.id}><div className="resume2-form-grid"><Field label="Institution" value={edu.institution} onChange={(v) => upsertEducation(edu.id, { institution: v })} /><Field label="Degree or qualification" value={edu.degree} onChange={(v) => upsertEducation(edu.id, { degree: v })} /><Field label="Field" value={edu.field ?? ''} onChange={(v) => upsertEducation(edu.id, { field: v })} /><Field label="Start" value={edu.startDate ?? ''} onChange={(v) => upsertEducation(edu.id, { startDate: v })} /><Field label="End" value={edu.endDate ?? ''} onChange={(v) => upsertEducation(edu.id, { endDate: v })} /></div><label className="resume2-field full"><span>Education notes or achievements</span><textarea rows={2} value={edu.achievements ?? ''} onChange={(e) => upsertEducation(edu.id, { achievements: e.target.value })} /></label></div>)}
      <div className="resume2-subhead"><strong>Projects</strong><button className="btn secondary" onClick={addProject}>Add project</button></div>
      {draft.projects.map((project) => <div className="resume2-item" key={project.id}><div className="resume2-form-grid"><Field label="Project name" value={project.name} onChange={(v) => upsertProject(project.id, { name: v })} /><Field label="Project URL" value={project.url ?? ''} onChange={(v) => upsertProject(project.id, { url: v })} /><Field label="Technologies" value={project.technologies.join(', ')} onChange={(v) => upsertProject(project.id, { technologies: v.split(',').map((x) => x.trim()).filter(Boolean) })} /></div><label className="resume2-field full"><span>Description</span><textarea rows={3} value={project.description} onChange={(e) => upsertProject(project.id, { description: e.target.value })} /></label><label className="resume2-field full"><span>Project achievements, one per line</span><textarea rows={3} value={project.achievements.join('\n')} onChange={(e) => upsertProject(project.id, { achievements: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} /></label></div>)}
      <label className="resume2-field full"><span>Achievements, one per line</span><textarea rows={3} value={draft.achievements.join('\n')} onChange={(e) => patchDraft({ achievements: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} /></label>
      <label className="resume2-field full"><span>Certifications, one per line</span><textarea rows={3} value={draft.certifications.map((c) => c.name).join('\n')} onChange={(e) => patchDraft({ certifications: e.target.value.split('\n').map((name) => ({ id: newId('cert'), name: name.trim() })).filter((c) => c.name) })} /></label>
      <label className="resume2-field full"><span>References</span><textarea rows={2} value={draft.references} onChange={(e) => patchDraft({ references: e.target.value })} placeholder="Available on request, or add named references only if you have permission." /></label>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function OptimizeStep({ draft, jobs, patchDraft, patchCareer, writeSummary, optimizeForJob, score, jobMatch, aiBusy, prevStep, nextStep }: StepContentProps) {
  return (
    <div className="resume2-step">
      <p className="eyebrow">Resume optimization</p>
      <h2>Polish the resume without adding fake facts.</h2>
      <label className="resume2-field full"><span>Professional summary</span><textarea rows={5} value={draft.career.summary} onChange={(e) => patchCareer('summary', e.target.value)} placeholder="A concise summary based on your real experience." /></label>
      <div className="resume2-ai-row"><button className="btn" onClick={writeSummary} disabled={aiBusy === 'writeSummary'}>{aiBusy === 'writeSummary' ? 'Writing' : 'Write with AI'}</button><span className="muted">Uses only the facts already in this draft.</span></div>
      <label className="resume2-field full"><span>Paste target job description, optional</span><textarea rows={6} value={draft.targetJobDescription} onChange={(e) => patchDraft({ targetJobDescription: e.target.value })} placeholder="Paste the job you are applying for. I will compare keywords without treating the job post as facts about you." /></label>
      {jobs.length > 0 && <p className="muted" style={{ fontSize: 13 }}>You can also save jobs in your workspace, then use them when generating cover letters and answers.</p>}
      <div className="resume2-ai-row"><button className="btn secondary" onClick={optimizeForJob} disabled={aiBusy === 'optimizeForJob' || draft.targetJobDescription.length < 30}>Check target job match</button></div>
      {jobMatch && <div className="resume2-inline-card"><strong>Resume Match: {jobMatch.match}%</strong><ul>{jobMatch.recommendations.map((r) => <li key={r}>{r}</li>)}</ul></div>}
      <ScoreCard score={score} />
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function TemplatesStep({ draft, recommended, selectedCategory, setSelectedCategory, patchDraft, prevStep, nextStep }: StepContentProps) {
  const visible = RESUME_TEMPLATES.filter((t) => t.category === selectedCategory);
  return (
    <div className="resume2-step">
      <p className="eyebrow">Template library</p>
      <h2>Choose from 50 professional templates.</h2>
      <p className="resume2-copy">These are five distinct design families with different layouts, density, hierarchy and skill treatments.</p>
      <div className="resume2-subhead"><strong>Recommended for you</strong></div>
      <div className="resume2-template-grid recommended">
        {recommended.map((template) => <TemplateCard key={template.id} template={template} selected={draft.selectedTemplate === template.id} onSelect={() => patchDraft({ selectedTemplate: template.id })} />)}
      </div>
      <div className="resume2-category-row">{TEMPLATE_CATEGORIES.map((cat) => <button key={cat} className={selectedCategory === cat ? 'active' : ''} onClick={() => setSelectedCategory(cat)}>{cat} <span>10</span></button>)}</div>
      <div className="resume2-template-grid">
        {visible.map((template) => <TemplateCard key={template.id} template={template} selected={draft.selectedTemplate === template.id} onSelect={() => patchDraft({ selectedTemplate: template.id })} />)}
      </div>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function ReviewStep({ draft, score, finalReview, generated, runFinalReview, generateFinalResume, aiBusy, prevStep }: StepContentProps) {
  return (
    <div className="resume2-step">
      <p className="eyebrow">Final review</p>
      <h2>Your resume is almost ready.</h2>
      <p className="resume2-copy">We built a resume around {draft.career.targetRole || draft.career.headline || 'your target role'} using your actual information. Run one final check, then generate the document.</p>
      <ScoreCard score={score} />
      <div className="resume2-ai-row"><button className="btn secondary" onClick={runFinalReview} disabled={aiBusy === 'finalReview'}>Run final AI review</button><button className="btn" onClick={generateFinalResume} disabled={Boolean(aiBusy)}>{aiBusy === 'generateFinalResume' ? 'Generating' : 'Generate final resume'}</button></div>
      {finalReview && <div className="resume2-checks"><strong>{finalReview.summary}</strong>{finalReview.checks.map((c) => <p key={c.label} className={c.ok ? 'ok' : 'warn'}>{c.ok ? '✓' : '!'} {c.label}: {c.detail}</p>)}</div>}
      {generated && <div className="resume2-ready"><h3>Your resume is ready</h3><p>Your resume now presents your experience in a stronger and more structured way.</p><strong>Resume Strength: {score.total}/100</strong><div className="resume2-actions left"><a className="btn" href={`/api/documents/${generated.id}/export?format=pdf`}>Download PDF</a><a className="btn secondary" href={`/api/documents/${generated.id}/export?format=docx`}>Download DOCX</a><button className="btn secondary" onClick={prevStep}>Edit Resume</button></div></div>}
      <div className="resume2-actions"><button className="btn secondary" onClick={prevStep}>Back</button></div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="resume2-field"><span>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

function ScoreCard({ score }: { score: ResumeScore }) {
  return (
    <div className="resume2-score-card">
      <div><span>Resume Strength</span><strong>{score.total}/100</strong></div>
      <div className="resume2-score-bars">
        <ScoreLine label="Content" value={score.content} />
        <ScoreLine label="Experience" value={score.experience} />
        <ScoreLine label="Skills" value={score.skills} />
        <ScoreLine label="ATS" value={score.ats} />
        <ScoreLine label="Formatting" value={score.formatting} />
      </div>
      {score.fixes.length > 0 && <ul>{score.fixes.slice(0, 3).map((fix) => <li key={fix.message}>{fix.message}</li>)}</ul>}
    </div>
  );
}

function ScoreLine({ label, value }: { label: string; value: number }) {
  return <p><span>{label}</span><b>{value}</b><i><em style={{ width: `${value}%` }} /></i></p>;
}

function TemplateCard({ template, selected, onSelect }: { template: ResumeTemplate; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`resume2-template-card ${selected ? 'selected' : ''}`} onClick={onSelect} style={{ '--accent': template.accent } as CSSProperties}>
      <MiniTemplate template={template} />
      <strong>{template.name}</strong>
      <span>{template.category} | {template.layout} | {template.density}</span>
      <p>{template.description}</p>
      <b>{selected ? 'Selected' : 'Use this template'}</b>
    </button>
  );
}

function MiniTemplate({ template }: { template: ResumeTemplate }) {
  return <div className={`resume2-mini mini-${template.layout}`}><span /><span /><span /><span /><span /></div>;
}

function ResumePreview({ draft, template, score }: { draft: StudioDraft; template: ResumeTemplate; score: number }) {
  const summary = draft.career.summary || 'Your professional summary will appear here. Use Write with AI when your facts are ready.';
  return (
    <div className={`resume2-preview template-${template.layout} density-${template.density}`} style={{ '--accent': template.accent } as CSSProperties}>
      <header>
        <h2>{draft.personal.name || 'Your Name'}</h2>
        <p>{[draft.personal.email, draft.personal.phone, draft.personal.location].filter(Boolean).join(' | ') || 'email | phone | location'}</p>
        <strong>{draft.career.headline || draft.career.targetRole || 'Target Role'}</strong>
      </header>
      <section><h3>Professional Summary</h3><p>{summary}</p></section>
      <section><h3>Experience</h3>{draft.experiences.length ? draft.experiences.slice(0, 4).map((e) => <div key={e.id} className="resume2-preview-role"><b>{e.role || 'Role'} {e.company ? `| ${e.company}` : ''}</b><ul>{(e.bullets.length ? e.bullets : [e.roughNotes || 'Experience details will appear here.']).slice(0, 4).map((b, i) => <li key={i}>{b}</li>)}</ul></div>) : <p>Add experience, internships, freelance work or projects.</p>}</section>
      {draft.projects.length > 0 && <section><h3>Projects</h3>{draft.projects.slice(0, 3).map((p) => <p key={p.id}><b>{p.name}</b>: {p.description}</p>)}</section>}
      <section><h3>Skills</h3><p>{draft.skills.map((s) => s.name).slice(0, 18).join(', ') || 'Add skills to improve ATS matching.'}</p></section>
      {draft.education.length > 0 && <section><h3>Education</h3>{draft.education.slice(0, 3).map((e) => <p key={e.id}>{[e.degree, e.field, e.institution].filter(Boolean).join(' | ')}</p>)}</section>}
      <footer>Strength {score}/100 | {template.name}</footer>
    </div>
  );
}

function ClassicGenerator({ jobs, recent, loadRecent }: { jobs: Job[]; recent: GenDoc[]; loadRecent: () => void }) {
  const [kind, setKind] = useState<Exclude<Kind, 'CV'>>('COVER_LETTER');
  const [jobId, setJobId] = useState('');
  const [questions, setQuestions] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ content: string; report: Report; version?: number; id?: string } | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  async function generate() {
    setStatus('loading');
    setError(null);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { kind };
      if (jobId) payload.jobId = jobId;
      if (kind === 'ANSWERS') payload.questions = questions.split('\n').map((s) => s.trim()).filter(Boolean);
      const res = await fetch('/api/documents/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) {
        const map: Record<string, { title: string; detail: string }> = {
          AI_QUOTA_EXHAUSTED: { title: 'Out of AI documents', detail: 'You have reached your plan document limit.' },
          DAILY_AI_CREDITS_EXHAUSTED: { title: 'Out of AI documents', detail: 'You have reached your plan document limit.' },
          CAREER_PROFILE_REQUIRED: { title: 'Complete your profile', detail: 'Generation needs your career profile first.' },
          RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment.' },
          TRUTHFULNESS_FAILED: { title: 'Unsupported facts found', detail: 'The draft contained claims not in your profile, so it was not saved.' },
          ANSWERS_REQUIRES_QUESTIONS: { title: 'Add questions', detail: 'Enter at least one application question.' },
        };
        if (json?.error === 'TRUTHFULNESS_FAILED') {
          setResult({ content: json.draft ?? '', report: json.report });
          setStatus('error');
          setError(map.TRUTHFULNESS_FAILED);
          return;
        }
        setError(map[json?.error] ?? { title: 'Writing assistant paused', detail: "Looks like my writing assistant took a tiny coffee break. Let's try that again, or continue manually." });
        setStatus('error');
        return;
      }
      setResult({ content: json.document.content, report: json.report, version: json.document.version, id: json.document.id });
      setStatus('done');
      loadRecent();
    } catch {
      setError({ title: 'Network error', detail: 'Could not reach the server. Try again or continue manually.' });
      setStatus('error');
    }
  }

  return (
    <div className="resume2-classic">
      <div className="card" style={{ maxWidth: 860, marginBottom: 18 }}>
        <p className="eyebrow">Classic document mode</p>
        <h2 style={{ margin: '0 0 8px' }}>Cover letters and application answers</h2>
        <p className="muted">Resume generation now uses the guided AI Resume Builder Journey. This mode keeps the existing cover letter and answer flow working.</p>
        <div className="chip-group" style={{ margin: '16px 0' }}>{KINDS.map((k) => <button key={k.id} className="chip" aria-pressed={kind === k.id} onClick={() => setKind(k.id)} title={k.hint}>{k.label}</button>)}</div>
        <label className="resume2-field full"><span>Tailor to a saved job, optional</span><select value={jobId} onChange={(e) => setJobId(e.target.value)}><option value="">General, no specific job</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}, {j.company}</option>)}</select></label>
        {kind === 'ANSWERS' && <label className="resume2-field full"><span>Application questions, one per line</span><textarea rows={5} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder={'Why do you want this role?\nDescribe a challenge you solved.'} /></label>}
        <div className="resume2-actions left"><button className="btn" onClick={generate} disabled={status === 'loading'}>{status === 'loading' ? 'Generating' : 'Generate'}</button><span className="muted">Costs 1 AI credit.</span></div>
      </div>
      {error && <div className="card" style={{ maxWidth: 860, borderColor: 'var(--danger-line)' }}><h2 style={{ fontSize: 17, color: 'var(--danger)' }}>{error.title}</h2><p className="muted" style={{ marginTop: 6 }}>{error.detail}</p></div>}
      {result && <div className="card" style={{ maxWidth: 860 }}><ReportBar report={result.report} version={result.version} />{result.id && <div className="resume2-actions left"><a className="btn secondary" href={`/api/documents/${result.id}/export?format=pdf`}>Download PDF</a><a className="btn secondary" href={`/api/documents/${result.id}/export?format=docx`}>Download DOCX</a></div>}<div style={{ marginTop: 16 }}><ContentRender kind={kind} content={result.content} /></div></div>}
      <RecentVersions recent={recent} />
    </div>
  );
}

function RecentVersions({ recent }: { recent: GenDoc[] }) {
  if (!recent.length) return null;
  return <section style={{ maxWidth: 860, marginTop: 28 }}><h2 style={{ fontSize: 18, margin: '0 0 12px' }}>Recent versions</h2><div className="document-list">{recent.map((d) => <div className="document-row card" key={d.id} style={{ padding: 16 }}><div><strong>{d.title}</strong><p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>v{d.version} | {new Date(d.created_at).toLocaleString()} | {d.kind}{d.source_facts?.templateName ? ` | ${d.source_facts.templateName}` : ''}</p></div><span className="badge" style={d.source_facts?.truthfulnessPassed === false ? { background: 'var(--danger-bg)', color: 'var(--danger)' } : { background: 'var(--success-bg)', color: 'var(--success)' }}>{d.source_facts?.truthfulnessPassed === false ? 'flagged' : 'verified'}</span></div>)}</div></section>;
}

function ReportBar({ report, version }: { report: Report; version?: number }) {
  return <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span className="badge" style={report.passed ? { background: 'var(--success-bg)', color: 'var(--success)' } : { background: 'var(--danger-bg)', color: 'var(--danger)' }}>{report.passed ? 'Truthful, saved' : 'Rejected'}</span>{version && <span className="muted" style={{ fontSize: 13 }}>Version {version}</span>}<span className="muted" style={{ fontSize: 13 }}>{report.summary}</span></div>;
}

function ContentRender({ kind, content }: { kind: Exclude<Kind, 'CV'>; content: string }) {
  if (kind === 'COVER_LETTER') return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 15, color: 'var(--ink-2)' }}>{content}</pre>;
  try {
    const data = JSON.parse(content);
    return <div style={{ display: 'grid', gap: 12 }}>{data.answers?.map((a: { question: string; answer: string }, i: number) => <div key={i}><strong style={{ fontSize: 14 }}>{a.question}</strong><p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>{a.answer}</p></div>)}</div>;
  } catch {
    return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{content}</pre>;
  }
}
