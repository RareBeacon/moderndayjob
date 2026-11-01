import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { assertEntitlement } from '@packages/security/entitlements';
import { AIGatewayError } from '@packages/ai/gateway';
import { createUsageMeter } from '@/lib/ai/server';
import { verifyDocument } from '@/lib/truthfulness/verify';
import { persistGeneratedDocument } from '@/lib/generation/persist';
import { localResumeAIProvider } from '@/lib/resume-studio/ai';
import {
  cleanText,
  normalizeStudioDraft,
  scoreResumeDraft,
  uniqueStrings,
  type DocumentMode,
} from '@/lib/resume-studio/draft';
import { getResumeTemplate } from '@/lib/resume-studio/templates';
import { recordGenerationUsage } from '@/lib/ai/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const body = z.object({
  draftId: z.union([z.guid(), z.literal(''), z.null()]).optional(),
  templateId: z.string().trim().min(1).max(100).optional(),
  documentMode: z.enum(['resume', 'cv']).optional(),
  draft: z.record(z.string(), z.unknown()),
});

function cleanArray(values: string[], max = 20) {
  return uniqueStrings(values.map((v) => cleanText(v, 260)).filter(Boolean), max);
}

async function buildResumeContent(
  rawDraft: Record<string, unknown>,
  templateId?: string,
  requestedMode?: DocumentMode,
) {
  const normalized = normalizeStudioDraft(rawDraft);
  const effectiveMode: DocumentMode =
    requestedMode === 'cv' || requestedMode === 'resume'
      ? requestedMode
      : normalized.documentMode === 'cv'
        ? 'cv'
        : 'resume';
  const draft = { ...normalized, documentMode: effectiveMode };
  const selectedTemplate = getResumeTemplate(templateId || draft.selectedTemplate);
  const summary = draft.career.summary || (await localResumeAIProvider.generateSummary(draft)).text;
  const maxBulletsPerRole = effectiveMode === 'cv' ? 8 : 6;
  const experiences = [];

  for (const exp of draft.experiences) {
    let bullets = cleanArray(exp.bullets, maxBulletsPerRole);
    if (!bullets.length && (exp.roughNotes || exp.impact || exp.tools.length)) {
      const generated = await localResumeAIProvider.generateExperience({
        experience: exp,
        seniority: draft.career.seniority,
      });
      bullets = cleanArray(generated.bullets, maxBulletsPerRole);
    }
    experiences.push({
      company: exp.company,
      title: exp.role,
      location: exp.location || '',
      start: exp.startDate || null,
      end: exp.current ? 'Present' : exp.endDate || null,
      bullets,
      tools: cleanArray(exp.tools ?? [], 20),
    });
  }

  const defaultHeadline = effectiveMode === 'cv' ? 'Curriculum Vitae' : 'Professional Resume';
  const skillItems = draft.skills
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((s) => ({
      name: cleanText(s.name, 80),
      category: cleanText(s.category || 'Core', 60) || 'Core',
    }))
    .filter((s) => s.name);

  const content = {
    templateId: selectedTemplate.id,
    templateName: selectedTemplate.name,
    documentMode: effectiveMode,
    photoDataUrl:
      (selectedTemplate.photoSupport ?? 'none') !== 'none' && draft.personal.photoDataUrl
        ? draft.personal.photoDataUrl
        : undefined,
    contact: draft.personal,
    headline: cleanText(draft.career.headline || draft.career.targetRole || defaultHeadline, 160),
    summary: cleanText(summary, 620),
    experiences,
    skills: cleanArray(
      draft.skills
        .map((s) => s.name)
        .concat(
          draft.experiences.flatMap((e) => e.tools),
          draft.projects.flatMap((p) => p.technologies),
        ),
      60,
    ),
    skillItems,
    education: draft.education.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      qualification: [e.degree, e.field].filter(Boolean).join(', '),
      start: e.startDate || null,
      end: e.endDate || null,
      achievements: e.achievements || '',
    })),
    projects: draft.projects.map((p) => ({
      name: p.name,
      description: p.description,
      technologies: p.technologies,
      url: p.url || '',
      achievements: p.achievements,
    })),
    certifications: draft.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer || '',
      date: c.date || '',
    })),
    languages: draft.languages?.length ? draft.languages : undefined,
    publications: draft.publications?.length ? draft.publications : undefined,
    volunteer: draft.volunteer?.length ? draft.volunteer : undefined,
    memberships: draft.memberships?.length ? draft.memberships : undefined,
    achievements: draft.achievements,
    additional: draft.additional,
    references: draft.references,
  };

  return { draft, selectedTemplate, content, score: scoreResumeDraft(draft) };
}

export async function POST(req: Request) {
  const user = await requireUser({ req: req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const rl = await enforceRateLimit(`resume-studio:generate:${requestIp(req)}:${user.id}`, 8, '1 m');
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Slow down for a moment, then try again.' },
      { status: 429 },
    );
  }

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  }

  const entitlement = await assertEntitlement(user.id, 'ai');
  if (Number(entitlement.ai_credits_remaining) <= 0) {
    return NextResponse.json(
      { error: 'DAILY_AI_CREDITS_EXHAUSTED', message: 'You have reached your plan document limit.' },
      { status: 429 },
    );
  }

  const studioT0 = Date.now();
  const { draft, selectedTemplate, content, score } = await buildResumeContent(
    parsed.data.draft,
    parsed.data.templateId,
    parsed.data.documentMode,
  );
  void recordGenerationUsage({
    userId: user.id,
    feature: 'resume-studio.cv',
    provider: 'jobiest_resume_studio_local_ai',
    latencyMs: Date.now() - studioT0,
    status: 'ok',
  });
  if (!content.contact.name || !content.contact.email) {
    return NextResponse.json(
      { error: 'CONTACT_REQUIRED', message: 'Add your name and email before generating.' },
      { status: 400 },
    );
  }
  if ((selectedTemplate.photoSupport ?? 'none') === 'required' && !draft.personal.photoDataUrl) {
    return NextResponse.json(
      {
        error: 'PHOTO_REQUIRED',
        message: 'This template requires a photo. Upload one on the template step before generating.',
      },
      { status: 400 },
    );
  }

  const generatedText = JSON.stringify(content, null, 2).replace(/[\u2013\u2014]/g, '-');
  const truthfulProfile = {
    summary: [draft.career.summary, draft.additional, ...draft.achievements].filter(Boolean).join(' '),
    skills: content.skills,
    employers: draft.experiences.map((e) => e.company).filter(Boolean),
    schools: draft.education.map((e) => e.institution).filter(Boolean),
    experienceText: [
      draft.personal.name,
      draft.personal.email,
      draft.personal.phone,
      draft.personal.location,
      draft.personal.website,
      draft.personal.linkedin,
      draft.personal.github,
      draft.career.summary,
      draft.career.yearsExperience,
      draft.additional,
      draft.references,
      ...draft.achievements,
      ...draft.skills.flatMap((s) => [s.name, s.category]),
      ...(draft.memberships ?? []),
      ...(draft.languages ?? []).flatMap((l) => [l.language, l.proficiency]),
      ...(draft.publications ?? []).flatMap((p) => [p.title, p.venue, p.date, p.url]),
      ...(draft.volunteer ?? []).flatMap((v) => [v.role, v.organization, v.dates, v.summary]),
      ...draft.education.flatMap((e) => [e.institution, e.degree, e.field, e.startDate, e.endDate, e.achievements]),
      ...draft.certifications.flatMap((c) => [c.name, c.issuer, c.date]),
      ...draft.experiences.flatMap((e) => [
        e.company,
        e.role,
        e.location,
        e.startDate,
        e.endDate,
        e.roughNotes,
        e.impact,
        ...e.tools,
        ...e.bullets,
      ]),
      ...draft.projects.flatMap((p) => [p.name, p.description, p.url, ...p.technologies, ...p.achievements]),
    ]
      .filter(Boolean)
      .join(' '),
  };
  const report = verifyDocument(
    {
      claimedEmployers: truthfulProfile.employers,
      claimedSchools: truthfulProfile.schools,
      claimedSkills: content.skills,
      text: generatedText,
    },
    truthfulProfile,
  );

  if (!report.passed) {
    return NextResponse.json(
      {
        error: 'TRUTHFULNESS_FAILED',
        report,
        draft: generatedText,
        message: 'I found unsupported facts. Nothing was saved.',
      },
      { status: 422 },
    );
  }

  const meter = createUsageMeter(user.id);
  try {
    await meter.reserve();
  } catch (err) {
    if (err instanceof AIGatewayError && err.code === 'AI_QUOTA_EXHAUSTED') {
      void recordGenerationUsage({
        userId: user.id,
        feature: 'resume-studio.cv',
        provider: 'none',
        latencyMs: Date.now() - studioT0,
        status: 'blocked',
        errorCode: 'AI_QUOTA_EXHAUSTED',
      });
      return NextResponse.json(
        { error: 'DAILY_AI_CREDITS_EXHAUSTED', message: 'You have reached your plan document limit.' },
        { status: 429 },
      );
    }
    throw err;
  }

  const validDraftId =
    typeof parsed.data.draftId === 'string' && parsed.data.draftId.length > 0 ? parsed.data.draftId : null;

  try {
    await Promise.allSettled([
      supabaseAdmin
        .from('profiles')
        .update({
          full_name: draft.personal.name,
          target_roles: draft.career.targetRole ? [draft.career.targetRole] : [],
        })
        .eq('user_id', user.id),
      supabaseAdmin.from('career_profiles').upsert(
        {
          user_id: user.id,
          headline: content.headline,
          summary: content.summary,
          skills: content.skills,
          experience: draft.experiences.map((e) => ({
            company: e.company,
            title: e.role,
            description: [e.roughNotes, e.impact, ...e.bullets].filter(Boolean).join('. '),
          })),
          education: draft.education.map((e) => ({
            institution: e.institution,
            qualification: [e.degree, e.field].filter(Boolean).join(', '),
          })),
          projects: draft.projects,
          links: {
            website: draft.personal.website,
            linkedin: draft.personal.linkedin,
            github: draft.personal.github,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      ),
      validDraftId
        ? supabaseAdmin
            .from('resume_studio_drafts')
            .update({
              content: draft,
              selected_template: selectedTemplate.id,
              score,
              completion: score.total,
              updated_at: new Date().toISOString(),
            })
            .eq('id', validDraftId)
            .eq('user_id', user.id)
        : Promise.resolve(null),
    ]);

    const docLabel = content.documentMode === 'cv' ? 'CV' : 'Resume';
    const titleName = draft.personal.name ? `${draft.personal.name} ${docLabel}` : docLabel;
    const role = draft.career.targetRole || draft.career.headline || 'General';
    const persisted = await persistGeneratedDocument({
      userId: user.id,
      kind: 'CV',
      title: `${titleName}, ${role}`,
      content: generatedText,
      report,
      provider: 'jobiest_resume_studio_local_ai',
      extraSourceFacts: {
        resumeStudio: true,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        documentMode: content.documentMode,
        resumeScore: score,
        draftId: validDraftId,
      },
    });

    await meter.commit();

    return NextResponse.json(
      {
        document: {
          id: persisted.id,
          version: persisted.version,
          contentHash: persisted.contentHash,
          kind: 'CV',
          documentMode: content.documentMode,
          title: `${titleName}, ${role}`,
          content: generatedText,
        },
        report,
        score,
        template: selectedTemplate,
      },
      { status: 201 },
    );
  } catch (error) {
    await meter.refund();
    void recordGenerationUsage({
      userId: user.id,
      feature: 'resume-studio.cv',
      provider: 'none',
      latencyMs: Date.now() - studioT0,
      status: 'error',
      errorCode: error instanceof Error ? error.message.slice(0, 80) : 'RESUME_GENERATION_FAILED',
    });
    return NextResponse.json(
      {
        error: 'RESUME_GENERATION_FAILED',
        message: "Looks like my writing assistant took a tiny coffee break. Let's try that again.",
      },
      { status: 500 },
    );
  }
}
