'use client';

import Link from 'next/link';
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';
import {
  buildDocumentExportUrl,
  downloadExportedDocument,
} from '@/lib/documents/client-download';
import {
  normalizeStudioDraft,
  scoreResumeDraft,
  type DocumentMode,
  type ResumeScore,
  type StudioDraft,
  type StudioEducation,
  type StudioExperience,
  type StudioProject,
} from '@/lib/resume-studio/draft';
import { draftFromMemory, freshDraft, firstIncompleteStep } from '@/lib/resume-studio/prefill';
import {
  CURATED_TEMPLATES,
  TEMPLATE_CATEGORIES,
  getResumeTemplate,
  recommendResumeTemplates,
  templatePhotoSupport,
  type ResumeTemplate,
  type ResumeTemplateCategory,
} from '@/lib/resume-studio/templates';
import {
  consumePendingTemplateSelection,
  requestedDocumentMode,
  requestedTemplateId,
  withRequestedTemplate,
} from '@/lib/resume-studio/selection';
import { SAMPLE_PREVIEW_DRAFT } from '@/lib/resume-studio/sample';
import { ResumeDocumentPreview } from '@/components/resume/ResumeDocumentPreview';

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
  source_facts?: {
    truthfulnessPassed?: boolean;
    resumeStudio?: boolean;
    templateId?: string;
    templateName?: string;
    documentMode?: DocumentMode;
    resumeScore?: ResumeScore;
  };
}
interface GeneratedResume {
  id: string;
  version: number;
  title: string;
  content: string;
  documentMode?: DocumentMode;
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
type StepId = (typeof STEPS)[number]['id'];

const KINDS: { id: Exclude<Kind, 'CV'>; label: string; hint: string }[] = [
  { id: 'COVER_LETTER', label: 'Cover letter', hint: 'Concise and specific' },
  { id: 'ANSWERS', label: 'Application answers', hint: 'Question by question' },
];

function newId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const [jobMatch, setJobMatch] = useState<{
    match: number;
    matchingSkills: string[];
    missingKeywords: string[];
    recommendations: string[];
  } | null>(null);
  const [finalReview, setFinalReview] = useState<{
    ready: boolean;
    summary: string;
    checks: { label: string; ok: boolean; detail: string }[];
  } | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [mobileZoom, setMobileZoom] = useState<number>(1);
  const [booted, setBooted] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipInitialAutosave = useRef(false);
  const deferredDraft = useDeferredValue(draft);

  const activeDocMode: DocumentMode = draft.documentMode === 'cv' ? 'cv' : 'resume';
  const score = useMemo(() => scoreResumeDraft(deferredDraft), [deferredDraft]);
  const template = useMemo(() => getResumeTemplate(draft.selectedTemplate), [draft.selectedTemplate]);
  const recommended = useMemo(
    () =>
      recommendResumeTemplates({
        role: deferredDraft.career.targetRole || deferredDraft.career.headline,
        yearsExperience: Number(deferredDraft.career.yearsExperience || 0),
        skills: deferredDraft.skills.map((s) => s.name),
      }),
    [deferredDraft],
  );
  const stepIndex = STEPS.findIndex((s) => s.id === activeStep);

  useEffect(() => {
    fetch('/api/applications')
      .then((r) => (r.ok ? r.json() : { applications: [] }))
      .then((d) => {
        const seen = new Set<string>();
        const mine: Job[] = [];
        for (const a of (d.applications ?? []) as { job?: { id: string; title: string; company: string } | null }[]) {
          const j = a.job;
          if (j?.id && !seen.has(j.id)) {
            seen.add(j.id);
            mine.push({ id: j.id, title: j.title, company: j.company } as Job);
          }
        }
        setJobs(mine);
      })
      .catch(() => {});
    loadRecent();

    const urlTemplate = requestedTemplateId(window.location.search);
    const urlDocMode = requestedDocumentMode(window.location.search);
    const pendingSelection = consumePendingTemplateSelection();
    const effectiveRequestedTemplate = urlTemplate ?? pendingSelection?.templateId ?? null;
    const effectiveRequestedMode = urlDocMode ?? pendingSelection?.documentMode ?? null;

    if (!effectiveRequestedTemplate && !effectiveRequestedMode) {
      skipInitialAutosave.current = true;
    }
    if (effectiveRequestedTemplate) {
      setSelectedCategory(getResumeTemplate(effectiveRequestedTemplate).category);
    }

    const local = window.localStorage.getItem('jobiest.resumeStudio.draft');
    const hasLocalDraft = Boolean(local);
    if (local) {
      try {
        const parsed = normalizeStudioDraft(JSON.parse(local));
        setDraft(withRequestedTemplate(parsed, effectiveRequestedTemplate, effectiveRequestedMode));
        setActiveStep(effectiveRequestedTemplate ? 'templates' : (parsed.currentStep as StepId) || 'welcome');
      } catch {}
    }

    fetch('/api/resume-studio/draft')
      .then(async (r) => {
        if (!r.ok) throw new Error('draft unavailable');
        return (await r.json()) as DraftApiResponse;
      })
      .then((data) => {
        if (data.draft?.content) {
          const loaded = normalizeStudioDraft({
            ...data.draft.content,
            selectedTemplate: data.draft.selectedTemplate,
            currentStep: data.draft.currentStep,
            targetJobDescription: data.draft.targetJobDescription,
          });
          setDraft(withRequestedTemplate(loaded, effectiveRequestedTemplate, effectiveRequestedMode));
          setDraftId(data.draft.id);
          setActiveStep(effectiveRequestedTemplate ? 'templates' : (loaded.currentStep as StepId) || 'welcome');
        } else {
          const remembered = draftFromMemory(data.memory);
          if (!hasLocalDraft) {
            setDraft(withRequestedTemplate(remembered, effectiveRequestedTemplate, effectiveRequestedMode));
            setActiveStep(effectiveRequestedTemplate ? 'templates' : firstIncompleteStep(remembered));
          }
          setDraft((current) => {
            if (!hasLocalDraft) {
              return withRequestedTemplate(remembered, effectiveRequestedTemplate, effectiveRequestedMode);
            }
            return withRequestedTemplate(
              normalizeStudioDraft({
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
              }),
              effectiveRequestedTemplate,
              effectiveRequestedMode,
            );
          });
        }
      })
      .catch(() => setSaveState('local'))
      .finally(() => setBooted(true));
  }, []);

  useEffect(() => {
    if (!booted) return;
    if (skipInitialAutosave.current) {
      skipInitialAutosave.current = false;
      return;
    }
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('jobiest.resumeStudio.draft', JSON.stringify(draft));
        } catch {}
      }
      fetch('/api/resume-studio/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftId,
          name: draft.versionName,
          selectedTemplate: draft.selectedTemplate,
          currentStep: activeStep,
          targetJobDescription: draft.targetJobDescription,
          content: { ...draft, currentStep: activeStep },
        }),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data?.message ?? data?.error ?? 'save failed');
          const resolvedId = data?.draft?.id ?? data?.id;
          if (resolvedId && !draftId) setDraftId(resolvedId);
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
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((d) => setRecent(d.documents ?? []))
      .catch(() => {});
  }

  function patchDraft(patch: Partial<StudioDraft>) {
    setDraft((current) => normalizeStudioDraft({ ...current, ...patch }));
  }

  function setDocumentMode(nextMode: DocumentMode) {
    setDraft((current) => withRequestedTemplate(current, current.selectedTemplate, nextMode));
  }

  function patchPersonal(key: keyof StudioDraft['personal'], value: string) {
    setDraft((current) =>
      normalizeStudioDraft({ ...current, personal: { ...current.personal, [key]: value } }),
    );
  }

  function patchCareer(key: keyof StudioDraft['career'], value: string) {
    setDraft((current) =>
      normalizeStudioDraft({ ...current, career: { ...current.career, [key]: value } }),
    );
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
      if (!res.ok) {
        throw new Error(
          json?.message ?? "Looks like my writing assistant took a tiny coffee break. Let's try that again.",
        );
      }
      return json as T;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Looks like my writing assistant took a tiny coffee break. Let's try that again.",
      );
      return null;
    } finally {
      setAiBusy(null);
    }
  }

  async function suggestSkills() {
    const result = await callAi<{ suggestions: string[]; note: string }>('suggestSkills', {
      role: draft.career.targetRole || draft.career.headline,
      existing: draft.skills.map((s) => s.name),
    });
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
    const result = await callAi<{ extracted: Partial<StudioDraft>; questions: string[] }>('extractProfile', {
      text,
    });
    if (!result) return;
    setDraft((current) =>
      normalizeStudioDraft({
        ...current,
        ...result.extracted,
        personal: { ...current.personal, ...(result.extracted.personal ?? {}) },
        career: { ...current.career, ...(result.extracted.career ?? {}) },
        skills: result.extracted.skills?.length ? [...current.skills, ...result.extracted.skills] : current.skills,
        additional: [current.additional, result.extracted.additional].filter(Boolean).join(' '),
      }),
    );
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
    setDraft((current) =>
      normalizeStudioDraft({ ...current, skills: current.skills.filter((s) => s.name !== name) }),
    );
  }

  function upsertExperience(id: string, patch: Partial<StudioExperience>) {
    setDraft((current) =>
      normalizeStudioDraft({
        ...current,
        experiences: current.experiences.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }),
    );
  }

  function addExperience() {
    setDraft((current) =>
      normalizeStudioDraft({
        ...current,
        experiences: [
          ...current.experiences,
          {
            id: newId('exp'),
            company: '',
            role: draft.career.targetRole || '',
            roughNotes: '',
            tools: [],
            impact: '',
            bullets: [],
          },
        ],
      }),
    );
  }

  function removeExperience(id: string) {
    setDraft((current) =>
      normalizeStudioDraft({ ...current, experiences: current.experiences.filter((e) => e.id !== id) }),
    );
  }

  async function buildExperience(exp: StudioExperience) {
    const result = await callAi<{ bullets: string[]; followUpQuestions: string[]; note: string }>(
      'generateExperience',
      { experience: exp, seniority: draft.career.seniority },
    );
    if (!result) return;
    upsertExperience(exp.id, { bullets: result.bullets });
    setMessage([result.note, ...result.followUpQuestions].join(' '));
  }

  async function improveExperience(exp: StudioExperience, modeArg: AiMode) {
    const result = await callAi<{ bullets: string[]; note: string }>('improveExperience', {
      experience: exp,
      bullets: exp.bullets,
      mode: modeArg,
      seniority: draft.career.seniority,
    });
    if (!result) return;
    upsertExperience(exp.id, { bullets: result.bullets });
    setMessage(result.note);
  }

  function upsertEducation(id: string, patch: Partial<StudioEducation>) {
    setDraft((current) =>
      normalizeStudioDraft({
        ...current,
        education: current.education.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }),
    );
  }

  function addEducation() {
    setDraft((current) =>
      normalizeStudioDraft({
        ...current,
        education: [...current.education, { id: newId('edu'), institution: '', degree: '', field: '' }],
      }),
    );
  }

  function removeEducation(id: string) {
    setDraft((current) =>
      normalizeStudioDraft({
        ...current,
        education: current.education.filter((e) => e.id !== id),
      }),
    );
  }

  function upsertProject(id: string, patch: Partial<StudioProject>) {
    setDraft((current) =>
      normalizeStudioDraft({
        ...current,
        projects: current.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }),
    );
  }

  function addProject() {
    setDraft((current) =>
      normalizeStudioDraft({
        ...current,
        projects: [
          ...current.projects,
          { id: newId('project'), name: '', description: '', technologies: [], achievements: [] },
        ],
      }),
    );
  }

  function removeProject(id: string) {
    setDraft((current) =>
      normalizeStudioDraft({
        ...current,
        projects: current.projects.filter((p) => p.id !== id),
      }),
    );
  }

  async function optimizeForJob() {
    const result = await callAi<typeof jobMatch>('optimizeForJob', {
      draft,
      jobDescription: draft.targetJobDescription,
    });
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
        body: JSON.stringify({
          draftId: draftId || undefined,
          templateId: draft.selectedTemplate,
          documentMode: activeDocMode,
          draft,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.message ?? 'Document generation failed. You can continue manually and try again.',
        );
      }
      setGenerated(json.document);
      const label = activeDocMode === 'cv' ? 'CV' : 'resume';
      setMessage(
        `Your ${label} is ready. Download it as PDF or DOCX, switch between Resume and CV formats, or try any of the 30 templates without using another credit.`,
      );
      loadRecent();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Looks like my writing assistant took a tiny coffee break. Let's try that again.",
      );
    } finally {
      setAiBusy(null);
    }
  }

  return (
    <AppShell
      active="generate"
      title={activeStep === 'templates' ? 'Resume Studio' : 'Generate'}
      variant={activeStep === 'templates' ? 'dashboard' : 'default'}
      userName={draft.personal.name.trim().split(/\s+/)[0] || 'Profile'}
    >
      {(mode !== 'builder' || activeStep !== 'templates') && <div className="resume2-hero">
        <div>
          <p className="eyebrow">Resume Studio 2.0</p>
          <h1>Build your resume or CV with an AI career assistant, not a boring form.</h1>
          <p>
            Answer naturally, turn rough notes into truthful bullet points, preview across 30 ISO A4 designs live,
            and export your document as either a concise <strong>Resume</strong> or a comprehensive{' '}
            <strong>Curriculum Vitae (CV)</strong> in PDF and Word DOCX.
          </p>
          <div className="resume2-mode-switch" role="tablist" aria-label="Resume Studio mode">
            <button className={mode === 'builder' ? 'active' : ''} onClick={() => setMode('builder')}>
              AI Resume Builder Journey
            </button>
            <button className={mode === 'classic' ? 'active' : ''} onClick={() => setMode('classic')}>
              Cover letters and answers
            </button>
          </div>
        </div>
        <div className="resume2-headline-features" aria-label="Headline Resume Studio features">
          <FeatureCard
            title="Resume + Full CV Modes"
            body="Create a focused 1 to 2 page Resume or a multi-page Curriculum Vitae with publications, memberships, volunteer work, and references."
          />
          <FeatureCard
            title="30-template A4 library"
            body="Browse 30 unique ISO A4 designs, each with its own layout, palette, typography, and honest ATS classification."
          />
          <FeatureCard
            title="Live preview"
            body="Watch your document update while you build. Desktop gets side-by-side preview. Mobile gets a focused preview button."
          />
        </div>
      </div>}

      {mode === 'builder' ? (
        <>
          <div className={`resume2-shell${activeStep === 'templates' ? ' resume2-template-mode' : ''}`}>
            <aside className="resume2-left">
              <div className="resume2-docformat-bar" role="region" aria-label="Document output format">
                <div>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#475569' }}>
                    Document format
                  </span>
                  <span style={{ fontSize: 13, color: '#334155' }}>
                    {activeDocMode === 'cv'
                      ? 'Curriculum Vitae (multi-page full credentials)'
                      : 'Resume (concise, recruiter-focused layout)'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div className="resume2-docformat-seg" role="group" aria-label="Choose Resume or CV">
                    <button
                      type="button"
                      className={activeDocMode === 'resume' ? 'active' : ''}
                      aria-pressed={activeDocMode === 'resume'}
                      onClick={() => setDocumentMode('resume')}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      className={activeDocMode === 'cv' ? 'active' : ''}
                      aria-pressed={activeDocMode === 'cv'}
                      onClick={() => setDocumentMode('cv')}
                    >
                      CV (Curriculum Vitae)
                    </button>
                  </div>
                  <Link className="btn secondary" href="/templates" style={{ fontSize: 12, padding: '7px 12px' }}>
                    30-Template Gallery
                  </Link>
                </div>
              </div>

              <Progress
                steps={STEPS}
                activeStep={activeStep}
                goStep={goStep}
                score={score.total}
                saveState={saveState}
              />
              {activeStep !== 'templates' && <AssistantBubble step={activeStep} draft={draft} />}
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
                  setDocumentMode={setDocumentMode}
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
                  removeEducation={removeEducation}
                  addProject={addProject}
                  upsertProject={upsertProject}
                  removeProject={removeProject}
                  optimizeForJob={optimizeForJob}
                  runFinalReview={runFinalReview}
                  generateFinalResume={generateFinalResume}
                  onNotify={setMessage}
                />
              </div>

              <div className="resume2-mobile-preview-trigger">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setMobileZoom(1);
                    setMobilePreviewOpen(true);
                  }}
                >
                  Preview Live A4 {activeDocMode === 'cv' ? 'CV' : 'Resume'} ({template.name})
                </button>
              </div>
            </aside>

            <aside className="resume2-preview-wrap">
              <div className="resume2-preview-sticky">
                <div className="resume2-preview-head">
                  <div>
                    <p className="eyebrow">
                      Live preview &middot; {activeDocMode === 'cv' ? 'Curriculum Vitae' : 'Resume'}
                    </p>
                    <strong>{template.name}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setDocumentMode(activeDocMode === 'cv' ? 'resume' : 'cv')}
                    >
                      Switch to {activeDocMode === 'cv' ? 'Resume' : 'CV'}
                    </button>
                    <button className="btn secondary" onClick={() => goStep('templates')}>
                      Change template
                    </button>
                  </div>
                </div>
                <ResumeDocumentPreview draft={deferredDraft} template={template} />
              </div>
            </aside>
          </div>

          {recent.length > 0 && (
            <div style={{ maxWidth: 1280, margin: '28px auto 0' }}>
              <RecentVersions
                recent={recent}
                selectedTemplateId={draft.selectedTemplate}
                onNotify={setMessage}
              />
            </div>
          )}

          {mobilePreviewOpen && (
            <div
              className="resume2-preview-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label="Focused live A4 preview"
              onClick={(e) => {
                if (e.target === e.currentTarget) setMobilePreviewOpen(false);
              }}
            >
              <div className="resume2-preview-modal-dialog">
                <div className="resume2-preview-modal-head">
                  <div>
                    <strong style={{ display: 'block', fontSize: 15 }}>{template.name}</strong>
                    <span style={{ fontSize: 12, color: '#475569' }}>
                      {activeDocMode === 'cv' ? 'Curriculum Vitae (CV)' : 'Resume'} &middot; ISO A4 Live Preview
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: 12, padding: '6px 10px' }}
                      onClick={() => setDocumentMode(activeDocMode === 'cv' ? 'resume' : 'cv')}
                    >
                      {activeDocMode === 'cv' ? 'Switch to Resume' : 'Switch to CV'}
                    </button>
                    {[
                      { label: '75%', v: 0.75 },
                      { label: '100%', v: 1 },
                      { label: '125%', v: 1.2 },
                    ].map((z) => (
                      <button
                        key={z.label}
                        type="button"
                        className={mobileZoom === z.v ? 'btn' : 'btn secondary'}
                        style={{ fontSize: 12, padding: '6px 10px' }}
                        onClick={() => setMobileZoom(z.v)}
                      >
                        {z.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: 12, padding: '6px 12px' }}
                      onClick={() => {
                        setMobilePreviewOpen(false);
                        goStep('templates');
                      }}
                    >
                      Templates
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: 12, padding: '6px 12px' }}
                      onClick={() => setMobilePreviewOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="resume2-preview-modal-scroll">
                  <ResumeDocumentPreview draft={deferredDraft} template={template} size="full" zoom={mobileZoom} />
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <ClassicGenerator
          jobs={jobs}
          recent={recent}
          loadRecent={loadRecent}
          selectedTemplateId={draft.selectedTemplate}
          onNotify={setMessage}
        />
      )}
    </AppShell>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function Progress({
  steps,
  activeStep,
  goStep,
  score,
  saveState,
}: {
  steps: typeof STEPS;
  activeStep: StepId;
  goStep: (step: StepId) => void;
  score: number;
  saveState: string;
}) {
  const index = steps.findIndex((s) => s.id === activeStep);
  return (
    <div className="resume2-progress-card">
      <div className="resume2-progress-top">
        <span>
          Step {index + 1} of {steps.length}
        </span>
        <span>Resume strength {score}/100</span>
        <span>
          {saveState === 'saved'
            ? 'Autosaved'
            : saveState === 'saving'
              ? 'Saving'
              : saveState === 'local'
                ? 'Saved locally'
                : 'Draft ready'}
        </span>
      </div>
      <div className="resume2-progress-bar">
        <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>
      <div className="resume2-step-tabs">
        {steps.map((step, i) => (
          <button
            key={step.id}
            className={step.id === activeStep ? 'active' : i < index ? 'done' : ''}
            onClick={() => goStep(step.id)}
          >
            {step.short}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantBubble({ step, draft }: { step: StepId; draft: StudioDraft }) {
  const firstName = draft.personal.name.split(' ')[0] || 'there';
  const docWord = draft.documentMode === 'cv' ? 'CV' : 'resume';
  const copy: Record<StepId, string> = {
    welcome: `Let's build your ${docWord} together. Give me the rough version. Making it clear and professional is my job.`,
    about: `Nice to meet you${draft.personal.name ? `, ${firstName}` : ''}. I need the contact details employers should use, and only the ones you want on your ${docWord}.`,
    career: 'Tell me what you do or what role you are targeting. I will keep the wording strong without inflating your seniority.',
    experience: 'Tell me what you actually did. If it is messy, that is fine. I will ask one more question when it helps.',
    skills: 'Select skills you actually have. Suggestions are not claims until you choose them.',
    education:
      draft.documentMode === 'cv'
        ? 'CV mode renders your full credential record: education, publications, projects, certifications, memberships, volunteer leadership, languages, and references.'
        : 'Add education, projects, certifications and achievements where they strengthen your story.',
    optimize: `Now we polish. I can write a summary, check ATS basics, and compare your ${docWord} to a target job description.`,
    templates: 'Based on your profile, I recommend a few templates, or you can search all 30 ISO A4 designs.',
    review: `Final check. Generate your truthful ${docWord}, then export as either Resume or CV in PDF and DOCX.`,
  };
  return (
    <div className="resume2-assistant">
      <span>AI assistant</span>
      <p>{copy[step]}</p>
    </div>
  );
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
  jobMatch: {
    match: number;
    matchingSkills: string[];
    missingKeywords: string[];
    recommendations: string[];
  } | null;
  finalReview: {
    ready: boolean;
    summary: string;
    checks: { label: string; ok: boolean; detail: string }[];
  } | null;
  generated: GeneratedResume | null;
  patchDraft: (patch: Partial<StudioDraft>) => void;
  setDocumentMode: (mode: DocumentMode) => void;
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
  removeEducation: (id: string) => void;
  addProject: () => void;
  upsertProject: (id: string, patch: Partial<StudioProject>) => void;
  removeProject: (id: string) => void;
  optimizeForJob: () => void;
  runFinalReview: () => void;
  generateFinalResume: () => void;
  onNotify: (msg: string) => void;
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

function StepActions({
  prevStep,
  nextStep,
  nextLabel = 'Continue',
}: {
  prevStep: () => void;
  nextStep: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="resume2-actions">
      <button className="btn secondary" onClick={prevStep}>
        Back
      </button>
      <button className="btn" onClick={nextStep}>
        {nextLabel}
      </button>
    </div>
  );
}

function WelcomeStep({ draft, patchDraft, setDocumentMode, nextStep, extractMessy, aiBusy }: StepContentProps) {
  const [messy, setMessy] = useState('');
  const isCv = draft.documentMode === 'cv';
  return (
    <div className="resume2-step">
      <p className="eyebrow">Welcome</p>
      <h2>{isCv ? 'Build your Curriculum Vitae step by step.' : 'Generate My Resume starts a guided journey.'}</h2>
      <p className="resume2-copy">
        Paste messy notes or start step by step. Choose <strong>Resume</strong> for concise 1 to 2 page industry
        applications or <strong>CV (Curriculum Vitae)</strong> for comprehensive multi-page academic, medical, and
        international credentials. The assistant never invents experience.
      </p>
      <div className="resume2-inline-card" style={{ marginBottom: 14 }}>
        <strong>Selected format: {isCv ? 'CV (Curriculum Vitae)' : 'Resume'}</strong>
        <p style={{ margin: '4px 0 10px' }}>
          {isCv
            ? 'Includes full multi-page sections for publications, certifications, memberships, volunteer leadership, languages, and references.'
            : 'Prioritizes concise impact bullets, core skills, and targeted role alignment. You can switch to CV at any time.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={!isCv ? 'btn' : 'btn secondary'}
            onClick={() => setDocumentMode('resume')}
          >
            Build a Resume
          </button>
          <button
            type="button"
            className={isCv ? 'btn' : 'btn secondary'}
            onClick={() => setDocumentMode('cv')}
          >
            Build a CV
          </button>
        </div>
      </div>
      <label className="resume2-field full">
        <span>Paste messy career notes, optional</span>
        <textarea
          rows={7}
          value={messy}
          onChange={(e) => setMessy(e.target.value)}
          placeholder="I worked at XYZ from 2023 to 2025, mostly building automation with Python and AI. I also worked on a customer support bot."
        />
      </label>
      <div className="resume2-actions left">
        <button
          className="btn"
          disabled={!messy.trim() || aiBusy === 'extractProfile'}
          onClick={() => extractMessy(messy)}
        >
          {aiBusy === 'extractProfile' ? 'Reading notes' : 'Extract with AI'}
        </button>
        <button className="btn secondary" onClick={nextStep}>
          Start step by step
        </button>
        <button
          className="btn secondary"
          onClick={() => patchDraft(withRequestedTemplate(freshDraft(), draft.selectedTemplate, draft.documentMode))}
        >
          Create from scratch
        </button>
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
        <label className="resume2-field">
          <span>Seniority</span>
          <select value={draft.career.seniority} onChange={(e) => patchCareer('seniority', e.target.value)}>
            <option value="">Select</option>
            <option value="student">Student or graduate</option>
            <option value="early">1 to 2 years</option>
            <option value="mid">2 to 5 years</option>
            <option value="senior">5+ years</option>
            <option value="executive">Executive</option>
          </select>
        </label>
      </div>
      <div className="resume2-inline-card">
        <strong>AI suggestions</strong>
        <p>Based on your role, I can suggest skills. Keep only the ones you genuinely have.</p>
        <button className="btn secondary" onClick={suggestSkills} disabled={aiBusy === 'suggestSkills'}>
          {aiBusy === 'suggestSkills' ? 'Suggesting' : 'Suggest relevant skills'}
        </button>
      </div>
      <label className="resume2-field full">
        <span>Version name</span>
        <input
          value={draft.versionName}
          onChange={(e) => patchDraft({ versionName: e.target.value })}
          placeholder={draft.documentMode === 'cv' ? 'AI Engineer CV' : 'AI Engineer Resume'}
        />
      </label>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function ExperienceStep({
  draft,
  addExperience,
  upsertExperience,
  removeExperience,
  buildExperience,
  improveExperience,
  prevStep,
  nextStep,
  aiBusy,
}: StepContentProps) {
  return (
    <div className="resume2-step">
      <p className="eyebrow">AI Experience Builder</p>
      <h2>Turn rough work notes into strong {draft.documentMode === 'cv' ? 'CV' : 'resume'} bullets.</h2>
      <p className="resume2-copy">
        Do not worry about grammar. Add what you did, tools you used, who it helped, and any outcome you can honestly support.
      </p>
      <div className="resume2-list">
        {draft.experiences.map((exp) => (
          <div className="resume2-item" key={exp.id}>
            <div className="resume2-item-head">
              <strong>
                {exp.role || 'New role'} {exp.company ? `| ${exp.company}` : ''}
              </strong>
              <button className="link-button" onClick={() => removeExperience(exp.id)}>
                Remove
              </button>
            </div>
            <div className="resume2-form-grid">
              <Field label="Company, client or project" value={exp.company} onChange={(v) => upsertExperience(exp.id, { company: v })} placeholder="ABC Technologies" />
              <Field label="Role" value={exp.role} onChange={(v) => upsertExperience(exp.id, { role: v })} placeholder="AI Engineer" />
              <Field label="Location" value={exp.location ?? ''} onChange={(v) => upsertExperience(exp.id, { location: v })} placeholder="Remote or Lagos" />
              <Field label="Start" value={exp.startDate ?? ''} onChange={(v) => upsertExperience(exp.id, { startDate: v })} placeholder="2023" />
              <Field label="End" value={exp.endDate ?? ''} onChange={(v) => upsertExperience(exp.id, { endDate: v })} placeholder="2025 or Present" />
              <label className="resume2-field checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(exp.current)}
                  onChange={(e) => upsertExperience(exp.id, { current: e.target.checked })}
                />{' '}
                Current role
              </label>
            </div>
            <label className="resume2-field full">
              <span>Tell me what you actually did</span>
              <textarea
                rows={4}
                value={exp.roughNotes}
                onChange={(e) => upsertExperience(exp.id, { roughNotes: e.target.value })}
                placeholder="I built AI agents and automation systems for companies."
              />
            </label>
            <CommaSeparatedField
              label="Tools, comma separated"
              values={exp.tools}
              onChange={(v) => upsertExperience(exp.id, { tools: v })}
              placeholder="Python, LangChain, APIs, n8n"
            />
            <label className="resume2-field full">
              <span>Impact or outcome, only if true</span>
              <textarea
                rows={2}
                value={exp.impact}
                onChange={(e) => upsertExperience(exp.id, { impact: e.target.value })}
                placeholder="Reduced repetitive manual work for the operations team. Add numbers only if you have them."
              />
            </label>
            <div className="resume2-ai-row">
              <button className="btn" disabled={Boolean(aiBusy)} onClick={() => buildExperience(exp)}>
                Write with AI
              </button>
              <button className="btn secondary" disabled={!exp.bullets.length || Boolean(aiBusy)} onClick={() => improveExperience(exp, 'stronger')}>
                Make stronger
              </button>
              <button className="btn secondary" disabled={!exp.bullets.length || Boolean(aiBusy)} onClick={() => improveExperience(exp, 'technical')}>
                More technical
              </button>
              <button className="btn secondary" disabled={!exp.bullets.length || Boolean(aiBusy)} onClick={() => improveExperience(exp, 'ats')}>
                ATS-friendly
              </button>
            </div>
            <label className="resume2-field full">
              <span>Bullets</span>
              <textarea
                rows={Math.max(3, exp.bullets.length + 1)}
                value={exp.bullets.join('\n')}
                onChange={(e) =>
                  upsertExperience(exp.id, {
                    bullets: e.target.value
                      .split('\n')
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Built and integrated AI agents to streamline repetitive business processes."
              />
            </label>
          </div>
        ))}
      </div>
      <button className="btn secondary" onClick={addExperience}>
        Add experience
      </button>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function SkillsStep({ draft, addSkills, removeSkill, suggestSkills, aiBusy, prevStep, nextStep }: StepContentProps) {
  const [skill, setSkill] = useState('');
  const [category, setCategory] = useState('Core');
  return (
    <div className="resume2-step">
      <p className="eyebrow">Skills</p>
      <h2>Select what you actually know.</h2>
      <div className="resume2-add-row">
        <input
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          placeholder="Add a skill (e.g. TypeScript, Financial Modeling)"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSkills([skill], category);
              setSkill('');
            }
          }}
        />
        <button
          className="btn secondary"
          onClick={() => {
            addSkills([skill], category);
            setSkill('');
          }}
        >
          Add
        </button>
        <button className="btn secondary" disabled={aiBusy === 'suggestSkills'} onClick={suggestSkills}>
          Suggest skills
        </button>
      </div>
      <label className="resume2-field" style={{ maxWidth: 280 }}>
        <span>Skill group (optional)</span>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Core, Languages, Cloud, Leadership..."
        />
      </label>
      <div className="resume2-skill-cloud">
        {draft.skills.length === 0 && (
          <p className="muted">No skills yet. Add a few or let the assistant suggest options.</p>
        )}
        {draft.skills.map((s) => (
          <button key={s.name} onClick={() => removeSkill(s.name)}>
            {s.name}
            <span>&times;</span>
          </button>
        ))}
      </div>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function EducationStep({
  draft,
  addEducation,
  upsertEducation,
  removeEducation,
  addProject,
  upsertProject,
  removeProject,
  patchDraft,
  setDocumentMode,
  prevStep,
  nextStep,
}: StepContentProps) {
  const isCv = draft.documentMode === 'cv';
  return (
    <div className="resume2-step">
      <p className="eyebrow">Education, projects and credentials</p>
      <h2>Add the details that support your target role.</h2>
      {isCv ? (
        <div className="resume2-inline-card">
          <strong>CV (Curriculum Vitae) Full-Credential Mode Active</strong>
          <p>
            Every populated section below (education, publications, projects, certifications, volunteer leadership,
            memberships, languages, and references) will be included in your live preview and multi-page A4 export.
          </p>
        </div>
      ) : (
        <div className="resume2-inline-card">
          <strong>Need publications, memberships, volunteer work, and references on every template?</strong>
          <p style={{ marginBottom: 8 }}>
            Switch to CV mode to include your complete academic and international credential history across any of the 30 templates.
          </p>
          <button type="button" className="btn secondary" onClick={() => setDocumentMode('cv')}>
            Switch to CV Mode
          </button>
        </div>
      )}
      <div className="resume2-subhead">
        <strong>Education</strong>
        <button className="btn secondary" onClick={addEducation}>
          Add education
        </button>
      </div>
      {draft.education.map((edu) => (
        <div className="resume2-item" key={edu.id}>
          <div className="resume2-item-head">
            <strong>
              {edu.degree || edu.institution || 'New education'} {edu.institution && edu.degree ? `| ${edu.institution}` : ''}
            </strong>
            <button type="button" className="link-button" onClick={() => removeEducation(edu.id)} aria-label="Remove education">
              Remove
            </button>
          </div>
          <div className="resume2-form-grid">
            <Field label="Institution" value={edu.institution} onChange={(v) => upsertEducation(edu.id, { institution: v })} placeholder="University of Lagos" />
            <Field label="Degree or qualification" value={edu.degree} onChange={(v) => upsertEducation(edu.id, { degree: v })} placeholder="B.Sc. Computer Science" />
            <Field label="Field" value={edu.field ?? ''} onChange={(v) => upsertEducation(edu.id, { field: v })} placeholder="Software Engineering" />
            <Field label="Start" value={edu.startDate ?? ''} onChange={(v) => upsertEducation(edu.id, { startDate: v })} placeholder="2019" />
            <Field label="End" value={edu.endDate ?? ''} onChange={(v) => upsertEducation(edu.id, { endDate: v })} placeholder="2023" />
          </div>
          <label className="resume2-field full">
            <span>Education notes or achievements</span>
            <textarea rows={2} value={edu.achievements ?? ''} onChange={(e) => upsertEducation(edu.id, { achievements: e.target.value })} placeholder="First Class Honours, Dean's List" />
          </label>
        </div>
      ))}
      <div className="resume2-subhead">
        <strong>Projects</strong>
        <button className="btn secondary" onClick={addProject}>
          Add project
        </button>
      </div>
      {draft.projects.map((project) => (
        <div className="resume2-item" key={project.id}>
          <div className="resume2-item-head">
            <strong>{project.name || 'New project'}</strong>
            <button type="button" className="link-button" onClick={() => removeProject(project.id)} aria-label="Remove project">
              Remove
            </button>
          </div>
          <div className="resume2-form-grid">
            <Field label="Project name" value={project.name} onChange={(v) => upsertProject(project.id, { name: v })} placeholder="AI Career Agent" />
            <Field label="Project URL" value={project.url ?? ''} onChange={(v) => upsertProject(project.id, { url: v })} placeholder="https://github.com/..." />
            <CommaSeparatedField
              label="Technologies"
              values={project.technologies}
              onChange={(v) => upsertProject(project.id, { technologies: v })}
              placeholder="Next.js, TypeScript, Supabase"
            />
          </div>
          <label className="resume2-field full">
            <span>Description</span>
            <textarea rows={3} value={project.description} onChange={(e) => upsertProject(project.id, { description: e.target.value })} placeholder="Autonomous job search and application preparation platform." />
          </label>
          <MultilineField
            label="Project achievements, one per line"
            values={project.achievements}
            onChange={(v) => upsertProject(project.id, { achievements: v })}
            rows={3}
            placeholder="Built MVP in 2 weeks&#10;Onboarded first 100 active candidates"
          />
        </div>
      ))}
      <MultilineField
        label="Achievements & awards, one per line"
        values={draft.achievements}
        onChange={(v) => patchDraft({ achievements: v })}
        rows={3}
        placeholder="National Hackathon Winner 2024&#10;Dean's List for Academic Excellence"
      />
      <TextareaLineItemsField
        label="Certifications, one per line"
        rows={3}
        placeholder="AWS Certified Solutions Architect - Amazon - 2024"
        serialized={draft.certifications.map((c) => [c.name, c.issuer, c.date].filter(Boolean).join(' - ')).join('\n')}
        onParsedChange={(lines) => {
          const parsed = lines
            .map((line) => {
              const parts = line.split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
              return { id: newId('cert'), name: parts[0] ?? '', issuer: parts[1], date: parts[2] };
            })
            .filter((c) => c.name);
          patchDraft({ certifications: parsed });
        }}
      />
      <TextareaLineItemsField
        label="Languages, optional (one per line, e.g. English - Native)"
        rows={2}
        placeholder={'English - Native\nFrench - Conversational'}
        serialized={(draft.languages ?? []).map((l) => [l.language, l.proficiency].filter(Boolean).join(' - ')).join('\n')}
        onParsedChange={(lines) => {
          const parsed = lines
            .map((line) => {
              const parts = line.split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
              return { language: parts[0] ?? '', proficiency: parts[1] ?? '' };
            })
            .filter((l) => l.language);
          patchDraft({ languages: parsed });
        }}
      />
      <TextareaLineItemsField
        label="Publications, optional (one per line: Title - Venue - Year)"
        rows={2}
        placeholder="Evaluating Agentic AI Systems - IEEE Conference - 2025"
        serialized={(draft.publications ?? []).map((p) => [p.title, p.venue, p.date].filter(Boolean).join(' - ')).join('\n')}
        onParsedChange={(lines) => {
          const parsed = lines
            .map((line) => {
              const parts = line.split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
              return { id: newId('pub'), title: parts[0] ?? '', venue: parts[1] ?? '', date: parts[2] ?? '', url: parts[3] ?? '' };
            })
            .filter((p) => p.title);
          patchDraft({ publications: parsed });
        }}
      />
      <TextareaLineItemsField
        label="Volunteer leadership, optional (one per line: Role - Organization - Dates - Summary)"
        rows={2}
        placeholder="Youth Mentor - Code For All - 2023-Present - Mentored 30 junior developers"
        serialized={(draft.volunteer ?? []).map((v) => [v.role, v.organization, v.dates, v.summary].filter(Boolean).join(' - ')).join('\n')}
        onParsedChange={(lines) => {
          const parsed = lines
            .map((line) => {
              const parts = line.split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
              return {
                id: newId('vol'),
                role: parts[0] ?? '',
                organization: parts[1] ?? '',
                dates: parts[2] ?? '',
                summary: parts[3] ?? '',
              };
            })
            .filter((v) => v.role || v.organization);
          patchDraft({ volunteer: parsed });
        }}
      />
      <MultilineField
        label="Professional memberships, optional (one per line)"
        values={draft.memberships ?? []}
        onChange={(v) => patchDraft({ memberships: v })}
        rows={2}
        placeholder="IEEE Computer Society&#10;Association for Computing Machinery"
      />
      <label className="resume2-field full">
        <span>References</span>
        <textarea
          rows={2}
          value={draft.references}
          onChange={(e) => patchDraft({ references: e.target.value })}
          placeholder="Available on request, or add named references only if you have permission."
        />
      </label>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function OptimizeStep({
  draft,
  jobs,
  patchDraft,
  patchCareer,
  writeSummary,
  optimizeForJob,
  score,
  jobMatch,
  aiBusy,
  prevStep,
  nextStep,
}: StepContentProps) {
  return (
    <div className="resume2-step">
      <p className="eyebrow">Document optimization</p>
      <h2>Polish your {draft.documentMode === 'cv' ? 'CV' : 'resume'} without adding fake facts.</h2>
      <label className="resume2-field full">
        <span>Professional summary</span>
        <textarea
          rows={5}
          value={draft.career.summary}
          onChange={(e) => patchCareer('summary', e.target.value)}
          placeholder="A concise summary based on your real experience."
        />
      </label>
      <div className="resume2-ai-row">
        <button className="btn" onClick={writeSummary} disabled={aiBusy === 'writeSummary'}>
          {aiBusy === 'writeSummary' ? 'Writing' : 'Write with AI'}
        </button>
        <span className="muted">Uses only the facts already in this draft.</span>
      </div>
      <label className="resume2-field full">
        <span>Paste target job description, optional</span>
        <textarea
          rows={6}
          value={draft.targetJobDescription}
          onChange={(e) => patchDraft({ targetJobDescription: e.target.value })}
          placeholder="Paste the job you are applying for. I will compare keywords without treating the job post as facts about you."
        />
      </label>
      {jobs.length > 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          Jobs you started applications for also appear when generating cover letters and answers.
        </p>
      )}
      <div className="resume2-ai-row">
        <button
          className="btn secondary"
          onClick={optimizeForJob}
          disabled={aiBusy === 'optimizeForJob' || draft.targetJobDescription.length < 30}
        >
          Check target job match
        </button>
      </div>
      {jobMatch && (
        <div className="resume2-inline-card">
          <strong>Job Match: {jobMatch.match}%</strong>
          <ul>
            {jobMatch.recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <ScoreCard score={score} />
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function TemplatesStep({
  draft,
  recommended,
  selectedCategory,
  setSelectedCategory,
  patchDraft,
  prevStep,
  nextStep,
}: StepContentProps) {
  const [tplSearch, setTplSearch] = useState('');
  const [showAllCats, setShowAllCats] = useState(true);
  const [browseAll, setBrowseAll] = useState(false);
  const allVisible = CURATED_TEMPLATES.filter((t) => {
    if (!showAllCats && t.category !== selectedCategory) return false;
    if (!tplSearch.trim()) return true;
    const q = tplSearch.trim().toLowerCase();
    const hay = [
      t.code,
      t.name,
      t.description,
      t.groupName,
      t.intendedUse,
      ...(t.bestFor ?? []),
      ...(t.libraryCategories ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return q.split(/\s+/).every((part) => hay.includes(part));
  });
  const [showCount, setShowCount] = useState(8);
  const [pageSize, setPageSize] = useState(8);
  useEffect(() => {
    const s = typeof window !== 'undefined' && window.innerWidth <= 480 ? 4 : 8;
    setPageSize(s);
    setShowCount(s);
  }, [selectedCategory, showAllCats]);
  const visible = tplSearch.trim() ? allVisible : allVisible.slice(0, showCount);
  const selectedTemplate = getResumeTemplate(draft.selectedTemplate);
  const photoCapable = templatePhotoSupport(selectedTemplate) !== 'none';
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');

  async function onPhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/resume-studio/photo', { method: 'POST', body: form });
      const data = (await res.json()) as { dataUrl?: string; error?: string };
      if (!res.ok || !data.dataUrl) {
        throw new Error(
          data.error === 'PHOTO_TOO_LARGE'
            ? 'Photo must be 2 MB or smaller.'
            : data.error === 'PHOTO_UNSUPPORTED_TYPE'
              ? 'Photos must be JPEG or PNG. WebP cannot be embedded in PDF exports.'
              : 'Upload failed. Please try again.',
        );
      }
      patchDraft({ personal: { ...draft.personal, photoDataUrl: data.dataUrl } });
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setPhotoBusy(false);
      event.target.value = '';
    }
  }

  return (
    <div className="resume2-step">
      <div className="resume2-template-heading">
        <div>
          <p className="eyebrow">STEP 8 OF 9 · TEMPLATES</p>
          <h2>Choose your resume template</h2>
          <p className="resume2-copy">Select a layout that fits your story. Your profile details stay yours and update in the live preview.</p>
          <Link className="resume2-full-gallery" href="/templates">Open full 30-template gallery <span aria-hidden="true">→</span></Link>
        </div>
        <div className="resume2-docformat-seg resume2-template-format" role="group" aria-label="Choose Resume or CV">
          <button type="button" className={draft.documentMode !== 'cv' ? 'active' : ''} aria-pressed={draft.documentMode !== 'cv'} onClick={() => patchDraft({ documentMode: 'resume' })}>Resume</button>
          <button type="button" className={draft.documentMode === 'cv' ? 'active' : ''} aria-pressed={draft.documentMode === 'cv'} onClick={() => patchDraft({ documentMode: 'cv' })}>Full CV</button>
        </div>
      </div>
      <div className="resume2-template-recommendations-head">
        <strong>Recommended for you</strong>
        <label className="resume2-template-search">
          <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.7" cy="8.7" r="5.7"/><path d="m13 13 4 4"/></svg>
          <input type="search" value={tplSearch} onChange={(e) => { setTplSearch(e.target.value); if (e.target.value) setBrowseAll(true); }} placeholder="Search templates" aria-label="Search Resume Studio templates" />
        </label>
      </div>
      <div className="resume2-template-grid recommended">
        {recommended.map((templateItem) => (
          <TemplateCard
            key={templateItem.id}
            template={templateItem}
            selected={draft.selectedTemplate === templateItem.id}
            onSelect={() => patchDraft({ selectedTemplate: templateItem.id })}
          />
        ))}
      </div>
      <div className="resume2-category-row">
        <button className={showAllCats ? 'active' : ''} onClick={() => { setShowAllCats(true); setBrowseAll(false); setTplSearch(''); }}>
          All <span>{CURATED_TEMPLATES.length}</span>
        </button>
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={!showAllCats && selectedCategory === cat ? 'active' : ''}
            onClick={() => {
              setShowAllCats(false);
              setBrowseAll(true);
              setSelectedCategory(cat);
            }}
          >
            {cat} <span>{CURATED_TEMPLATES.filter((t) => t.category === cat).length}</span>
          </button>
        ))}
      </div>
      {browseAll && <div className="resume2-template-grid">
        {visible.map((templateItem) => (
          <TemplateCard
            key={templateItem.id}
            template={templateItem}
            selected={draft.selectedTemplate === templateItem.id}
            onSelect={() => patchDraft({ selectedTemplate: templateItem.id })}
          />
        ))}
      </div>}
      {!browseAll && <button className="resume2-browse-all" type="button" onClick={() => { setBrowseAll(true); setShowCount(pageSize); }}>Browse all 30 templates <span aria-hidden="true">→</span></button>}
      {browseAll && allVisible.length > visible.length && (
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 16 }}>
          <button
            className="btn secondary"
            onClick={() => setShowCount((c) => Math.min(c + pageSize, allVisible.length))}
          >
            Show {pageSize} more ({allVisible.length - visible.length} remaining)
          </button>
        </div>
      )}
      {browseAll && allVisible.length > 6 && visible.length === allVisible.length && (
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 16 }}>
          <button className="btn secondary" onClick={() => setShowCount(pageSize)}>
            Show less
          </button>
        </div>
      )}
      {photoCapable && (
        <div className="resume2-photo-row">
          <strong>
            {templatePhotoSupport(selectedTemplate) === 'required'
              ? 'Photo required for this template'
              : 'Photo optional for this template'}
          </strong>
          <p>
            Upload a headshot (JPEG or PNG, 2 MB max). It appears in the preview and is embedded in PDF and Word exports.
            Server-side validation applies.
          </p>
          {draft.personal.photoDataUrl ? (
            <div className="resume2-photo-edit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.personal.photoDataUrl} alt="Your resume photo" />
              <button
                className="btn secondary"
                type="button"
                onClick={() => patchDraft({ personal: { ...draft.personal, photoDataUrl: '' } })}
              >
                Remove photo
              </button>
            </div>
          ) : (
            <label className={`btn secondary resume2-photo-label${photoBusy ? ' disabled' : ''}`}>
              {photoBusy ? 'Validating...' : 'Upload photo'}
              <input
                type="file"
                accept="image/jpeg,image/png"
                className="resume2-photo-input"
                onChange={(event) => {
                  void onPhotoChange(event);
                }}
                disabled={photoBusy}
              />
            </label>
          )}
          {photoError && <p className="resume2-photo-error">{photoError}</p>}
        </div>
      )}
      <div className="resume2-template-trust">
        <span aria-hidden="true">✓</span>
        <p>Built from your profile facts. Nothing is sent without your approval.</p>
      </div>
      <StepActions prevStep={prevStep} nextStep={nextStep} />
    </div>
  );
}

function ReviewStep({
  draft,
  score,
  finalReview,
  generated,
  patchDraft,
  setDocumentMode,
  runFinalReview,
  generateFinalResume,
  aiBusy,
  prevStep,
  onNotify,
}: StepContentProps) {
  const activeTemplate = getResumeTemplate(draft.selectedTemplate);
  const activeDocMode: DocumentMode = draft.documentMode === 'cv' ? 'cv' : 'resume';
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  async function handleExport(format: 'pdf' | 'docx', modeOverride: DocumentMode = activeDocMode) {
    if (!generated) return;
    const key = `${format}:${modeOverride}`;
    setDownloadBusy(key);
    const result = await downloadExportedDocument({
      documentId: generated.id,
      format,
      templateId: draft.selectedTemplate,
      documentMode: modeOverride,
      returnPath: '/generate',
    });
    setDownloadBusy(null);
    if (!result.ok) {
      onNotify(result.message);
    } else {
      onNotify(`Downloaded ${result.filename}`);
    }
  }

  return (
    <div className="resume2-step">
      <p className="eyebrow">Final review</p>
      <h2>Your {activeDocMode === 'cv' ? 'Curriculum Vitae' : 'resume'} is almost ready.</h2>
      <p className="resume2-copy">
        We built a {activeDocMode === 'cv' ? 'comprehensive CV' : 'concise resume'} around{' '}
        {draft.career.targetRole || draft.career.headline || 'your target role'} using your actual information. Run one
        final check, then generate and export in PDF or DOCX.
      </p>
      <ScoreCard score={score} />
      <div className="resume2-ai-row">
        <button className="btn secondary" onClick={runFinalReview} disabled={aiBusy === 'finalReview'}>
          Run final AI review
        </button>
        <button className="btn" onClick={generateFinalResume} disabled={Boolean(aiBusy)}>
          {aiBusy === 'generateFinalResume'
            ? 'Generating'
            : activeDocMode === 'cv'
              ? 'Generate final CV'
              : 'Generate final resume'}
        </button>
      </div>
      {finalReview && (
        <div className="resume2-checks">
          <strong>{finalReview.summary}</strong>
          {finalReview.checks.map((c) => (
            <p key={c.label} className={c.ok ? 'ok' : 'warn'}>
              {c.ok ? 'OK' : '!'} {c.label}: {c.detail}
            </p>
          ))}
        </div>
      )}
      {generated && (
        <div className="resume2-ready">
          <h3>Your A4 {activeDocMode === 'cv' ? 'CV' : 'resume'} is ready</h3>
          <p>
            Switch between <strong>Resume</strong> and <strong>CV (Curriculum Vitae)</strong> or pick any of the 30 A4
            templates below and re-download in PDF or DOCX without using another credit.
          </p>
          <strong>
            Strength: {score.total}/100 &middot; Format: {activeDocMode === 'cv' ? 'CV' : 'Resume'} &middot; Template:{' '}
            {activeTemplate.name}
          </strong>
          <div style={{ display: 'grid', gap: 10, margin: '12px 0' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Export document format:
              </label>
              <div className="resume2-docformat-seg" role="group" aria-label="Export document format">
                <button
                  type="button"
                  className={activeDocMode === 'resume' ? 'active' : ''}
                  onClick={() => setDocumentMode('resume')}
                >
                  Resume (Concise)
                </button>
                <button
                  type="button"
                  className={activeDocMode === 'cv' ? 'active' : ''}
                  onClick={() => setDocumentMode('cv')}
                >
                  CV (Full Curriculum Vitae)
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Export template (30 A4 designs):
              </label>
              <select
                aria-label="Export template selector"
                value={draft.selectedTemplate}
                onChange={(e) => patchDraft({ selectedTemplate: e.target.value })}
                style={{
                  width: '100%',
                  maxWidth: 440,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                }}
              >
                {CURATED_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.code} {t.name} ({t.atsCompatibility === 'verified' ? 'ATS-Verified 1-Col' : '2-Col Visual'})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="resume2-actions left" style={{ flexWrap: 'wrap' }}>
            <a
              className="btn"
              href={buildDocumentExportUrl({
                documentId: generated.id,
                format: 'pdf',
                templateId: draft.selectedTemplate,
                documentMode: activeDocMode,
              })}
              onClick={(e) => {
                e.preventDefault();
                void handleExport('pdf', activeDocMode);
              }}
            >
              {downloadBusy === `pdf:${activeDocMode}`
                ? 'Preparing PDF...'
                : `Download ${activeDocMode === 'cv' ? 'CV' : 'Resume'} PDF`}
            </a>
            <a
              className="btn secondary"
              href={buildDocumentExportUrl({
                documentId: generated.id,
                format: 'docx',
                templateId: draft.selectedTemplate,
                documentMode: activeDocMode,
              })}
              onClick={(e) => {
                e.preventDefault();
                void handleExport('docx', activeDocMode);
              }}
            >
              {downloadBusy === `docx:${activeDocMode}`
                ? 'Preparing DOCX...'
                : `Download ${activeDocMode === 'cv' ? 'CV' : 'Resume'} DOCX`}
            </a>
            <Link className="btn secondary" href="/documents">
              View in Documents
            </Link>
            <button className="btn secondary" onClick={prevStep}>
              Edit Draft
            </button>
          </div>
        </div>
      )}
      <div className="resume2-actions">
        <button className="btn secondary" onClick={prevStep}>
          Back
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="resume2-field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function CommaSeparatedField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const serialized = values.join(', ');
  const [text, setText] = useState(serialized);

  useEffect(() => {
    setText(serialized);
  }, [serialized]);

  return (
    <label className="resume2-field">
      <span>{label}</span>
      <input
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const val = e.target.value;
          setText(val);
          const parsed = val.split(',').map((x) => x.trim()).filter(Boolean);
          onChange(parsed);
        }}
        onBlur={() => {
          setText(serialized);
        }}
      />
    </label>
  );
}

function MultilineField({
  label,
  values,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  rows?: number;
  placeholder?: string;
}) {
  const serialized = values.join('\n');
  const [text, setText] = useState(serialized);

  useEffect(() => {
    setText(serialized);
  }, [serialized]);

  return (
    <label className="resume2-field full">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const val = e.target.value;
          setText(val);
          const parsed = val.split('\n').map((x) => x.trim()).filter(Boolean);
          onChange(parsed);
        }}
        onBlur={() => {
          setText(serialized);
        }}
      />
    </label>
  );
}

function TextareaLineItemsField({
  label,
  serialized,
  placeholder,
  rows = 2,
  onParsedChange,
}: {
  label: string;
  serialized: string;
  placeholder?: string;
  rows?: number;
  onParsedChange: (lines: string[]) => void;
}) {
  const [text, setText] = useState(serialized);

  useEffect(() => {
    setText(serialized);
  }, [serialized]);

  return (
    <label className="resume2-field full">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const val = e.target.value;
          setText(val);
          const lines = val.split('\n');
          onParsedChange(lines);
        }}
        onBlur={() => {
          setText(serialized);
        }}
      />
    </label>
  );
}

function ScoreCard({ score }: { score: ResumeScore }) {
  return (
    <div className="resume2-score-card">
      <div>
        <span>Resume Strength</span>
        <strong>{score.total}/100</strong>
      </div>
      <div className="resume2-score-bars">
        <ScoreLine label="Content" value={score.content} />
        <ScoreLine label="Experience" value={score.experience} />
        <ScoreLine label="Skills" value={score.skills} />
        <ScoreLine label="ATS" value={score.ats} />
        <ScoreLine label="Formatting" value={score.formatting} />
      </div>
      {score.fixes.length > 0 && (
        <ul>
          {score.fixes.slice(0, 3).map((fix) => (
            <li key={fix.message}>{fix.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreLine({ label, value }: { label: number | string; value: number }) {
  return (
    <p>
      <span>{label}</span>
      <b>{value}</b>
      <i>
        <em style={{ width: `${value}%` }} />
      </i>
    </p>
  );
}

const TemplateCard = memo(function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: ResumeTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={`resume2-template-card ${selected ? 'selected' : ''}`}>
      <div className="resume2-template-preview" aria-hidden="true">
        <ResumeDocumentPreview template={template} draft={SAMPLE_PREVIEW_DRAFT} size="mini" demo />
      </div>
      <div className="resume2-template-body">
        <strong className="resume2-template-title">
          {template.code ? `#${template.code} ` : ''}
          {template.name}
        </strong>
        <span className="resume2-template-meta">
          {template.atsCompatibility === 'verified' ? 'ATS-Verified' : '2-Col Visual'} |{' '}
          {template.columns === 2 ? '2-Col' : '1-Col'} | Group {template.group ?? 'A'}
        </span>
        <p className="resume2-template-desc">{template.description}</p>
      </div>
      <button type="button" className="resume2-template-select" onClick={onSelect} aria-pressed={selected}>
        {selected ? 'Selected' : `Use ${template.name}`}
      </button>
    </div>
  );
});

function ClassicGenerator({
  jobs,
  recent,
  loadRecent,
  selectedTemplateId,
  onNotify,
}: {
  jobs: Job[];
  recent: GenDoc[];
  loadRecent: () => void;
  selectedTemplateId: string;
  onNotify: (msg: string) => void;
}) {
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
      if (kind === 'ANSWERS') {
        payload.questions = questions
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        const map: Record<string, { title: string; detail: string }> = {
          AI_QUOTA_EXHAUSTED: {
            title: 'Out of AI generations',
            detail: 'You have reached your plan generation limit for today.',
          },
          DAILY_AI_CREDITS_EXHAUSTED: {
            title: 'Out of AI generations',
            detail: 'You have reached your plan generation limit for today.',
          },
          CAREER_PROFILE_REQUIRED: {
            title: 'Complete your profile',
            detail: 'Generation needs your career profile first.',
          },
          RATE_LIMITED: { title: 'Slow down', detail: 'Too many requests. Wait a moment.' },
          ONBOARDING_REQUIRED: {
            title: 'Finish your profile setup',
            detail: 'Answer the remaining setup questions on your dashboard to unlock generation.',
          },
          TRUTHFULNESS_FAILED: {
            title: 'Unsupported facts found',
            detail: 'The draft contained claims not in your profile, so it was not saved.',
          },
          ANSWERS_REQUIRES_QUESTIONS: {
            title: 'Add questions',
            detail: 'Enter at least one application question.',
          },
        };
        if (json?.error === 'TRUTHFULNESS_FAILED') {
          setResult({ content: json.draft ?? '', report: json.report });
          setStatus('error');
          setError(map.TRUTHFULNESS_FAILED);
          return;
        }
        setError(
          map[json?.error] ?? {
            title: 'Writing assistant paused',
            detail: "Looks like my writing assistant took a tiny coffee break. Let's try that again, or continue manually.",
          },
        );
        setStatus('error');
        return;
      }
      setResult({
        content: json.document.content,
        report: json.report,
        version: json.document.version,
        id: json.document.id,
      });
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
        <p className="muted">
          Resume and CV generation uses the guided AI Builder Journey. This mode keeps cover letter and application
          answer generation one click away.
        </p>
        <div className="chip-group" style={{ margin: '16px 0' }}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              className="chip"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              title={k.hint}
            >
              {k.label}
            </button>
          ))}
        </div>
        <label className="resume2-field full">
          <span>Tailor to a job you are applying to, optional</span>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">General, no specific job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}, {j.company}
              </option>
            ))}
          </select>
        </label>
        {kind === 'ANSWERS' && (
          <label className="resume2-field full">
            <span>Application questions, one per line</span>
            <textarea
              rows={5}
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              placeholder={'Why do you want this role?\nDescribe a challenge you solved.'}
            />
          </label>
        )}
        <div className="resume2-actions left">
          <button className="btn" onClick={generate} disabled={status === 'loading'}>
            {status === 'loading' ? 'Generating' : 'Generate'}
          </button>
          <span className="muted">
            Costs 1 AI credit. Editing and re-downloading your resume or CV never uses a credit; only a fresh generation does.
          </span>
        </div>
      </div>
      {error && (
        <div className="card" style={{ maxWidth: 860, borderColor: 'var(--danger-line)' }}>
          <h2 style={{ fontSize: 17, color: 'var(--danger)' }}>{error.title}</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            {error.detail}
          </p>
        </div>
      )}
      {result && (
        <div className="card" style={{ maxWidth: 860 }}>
          <ReportBar report={result.report} version={result.version} />
          {result.id && (
            <div className="resume2-actions left">
              <a
                className="btn secondary"
                href={buildDocumentExportUrl({ documentId: result.id, format: 'pdf' })}
                onClick={(e) => {
                  e.preventDefault();
                  void downloadExportedDocument({ documentId: result.id!, format: 'pdf', returnPath: '/generate' });
                }}
              >
                Download PDF
              </a>
              <a
                className="btn secondary"
                href={buildDocumentExportUrl({ documentId: result.id, format: 'docx' })}
                onClick={(e) => {
                  e.preventDefault();
                  void downloadExportedDocument({ documentId: result.id!, format: 'docx', returnPath: '/generate' });
                }}
              >
                Download DOCX
              </a>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <ContentRender kind={kind} content={result.content} />
          </div>
        </div>
      )}
      <RecentVersions recent={recent} selectedTemplateId={selectedTemplateId} onNotify={onNotify} />
    </div>
  );
}

function RecentVersions({
  recent,
  selectedTemplateId,
  onNotify,
}: {
  recent: GenDoc[];
  selectedTemplateId: string;
  onNotify: (msg: string) => void;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  if (!recent.length) return null;

  async function quickDownload(doc: GenDoc, format: 'pdf' | 'docx', docMode?: DocumentMode) {
    const key = `${doc.id}:${format}:${docMode ?? 'default'}`;
    setBusyKey(key);
    const result = await downloadExportedDocument({
      documentId: doc.id,
      format,
      templateId: doc.kind === 'CV' ? doc.source_facts?.templateId || selectedTemplateId : undefined,
      documentMode: doc.kind === 'CV' ? docMode : undefined,
      returnPath: '/generate',
    });
    setBusyKey(null);
    if (!result.ok) onNotify(result.message);
    else onNotify(`Downloaded ${result.filename}`);
  }

  return (
    <section style={{ maxWidth: 960, marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Recent versions</h2>
        <Link href="/documents" style={{ fontSize: 13, fontWeight: 700, color: '#111d35' }}>
          Manage &amp; switch templates in Documents &rarr;
        </Link>
      </div>
      <div className="document-list">
        {recent.slice(0, 6).map((d) => (
          <div className="document-row card" key={d.id} style={{ padding: 16 }}>
            <div>
              <strong>{d.title}</strong>
              <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                v{d.version} | {new Date(d.created_at).toLocaleString()} |{' '}
                {d.kind === 'CV'
                  ? d.source_facts?.documentMode === 'cv'
                    ? 'CV'
                    : 'Resume'
                  : d.kind}
                {d.source_facts?.templateName ? ` | ${d.source_facts.templateName}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                className="badge"
                style={
                  d.source_facts?.truthfulnessPassed === false
                    ? { background: 'var(--danger-bg)', color: 'var(--danger)' }
                    : { background: 'var(--success-bg)', color: 'var(--success)' }
                }
              >
                {d.source_facts?.truthfulnessPassed === false ? 'flagged' : 'verified'}
              </span>
              {d.kind === 'CV' ? (
                <>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busyKey === `${d.id}:pdf:resume`}
                    onClick={() => void quickDownload(d, 'pdf', 'resume')}
                  >
                    {busyKey === `${d.id}:pdf:resume` ? 'PDF...' : 'Resume PDF'}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busyKey === `${d.id}:pdf:cv`}
                    onClick={() => void quickDownload(d, 'pdf', 'cv')}
                  >
                    {busyKey === `${d.id}:pdf:cv` ? 'PDF...' : 'CV PDF'}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busyKey === `${d.id}:docx:${d.source_facts?.documentMode ?? 'resume'}`}
                    onClick={() => void quickDownload(d, 'docx', d.source_facts?.documentMode ?? 'resume')}
                  >
                    DOCX
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busyKey === `${d.id}:pdf:default`}
                    onClick={() => void quickDownload(d, 'pdf')}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busyKey === `${d.id}:docx:default`}
                    onClick={() => void quickDownload(d, 'docx')}
                  >
                    DOCX
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportBar({ report, version }: { report: Report; version?: number }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span
        className="badge"
        style={
          report.passed
            ? { background: 'var(--success-bg)', color: 'var(--success)' }
            : { background: 'var(--danger-bg)', color: 'var(--danger)' }
        }
      >
        {report.passed ? 'Truthful, saved' : 'Rejected'}
      </span>
      {version && (
        <span className="muted" style={{ fontSize: 13 }}>
          Version {version}
        </span>
      )}
      <span className="muted" style={{ fontSize: 13 }}>
        {report.summary}
      </span>
    </div>
  );
}

function ContentRender({ kind, content }: { kind: Exclude<Kind, 'CV'>; content: string }) {
  if (kind === 'COVER_LETTER') {
    return (
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 15, color: 'var(--ink-2)' }}>
        {content}
      </pre>
    );
  }
  try {
    const data = JSON.parse(content);
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {data.answers?.map((a: { question: string; answer: string }, i: number) => (
          <div key={i}>
            <strong style={{ fontSize: 14 }}>{a.question}</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
              {a.answer}
            </p>
          </div>
        ))}
      </div>
    );
  } catch {
    return (
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>
        {content}
      </pre>
    );
  }
}
