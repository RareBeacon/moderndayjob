import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { completionForDraft, normalizeStudioDraft, scoreResumeDraft } from '@/lib/resume-studio/draft';

export const dynamic = 'force-dynamic';

const draftBody = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  selectedTemplate: z.string().trim().min(1).max(100).optional(),
  currentStep: z.string().trim().min(1).max(100).optional(),
  targetJobDescription: z.string().max(30000).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

function emptyProfile() {
  return {
    fullName: '',
    email: '',
    targetRoles: [] as string[],
    career: null,
  };
}

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const [{ data: draft, error: draftError }, { data: profile }, { data: career }] = await Promise.all([
    supabaseAdmin
      .from('resume_studio_drafts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin.from('profiles').select('full_name,email,target_roles').eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('career_profiles').select('headline,summary,skills,experience,education,projects,links').eq('user_id', user.id).maybeSingle(),
  ]);

  if (draftError && /resume_studio_drafts/i.test(draftError.message ?? '')) {
    return NextResponse.json({ error: 'RESUME_STUDIO_MIGRATION_REQUIRED' }, { status: 503 });
  }

  return NextResponse.json({
    draft: draft
      ? {
          id: draft.id,
          name: draft.name,
          selectedTemplate: draft.selected_template,
          currentStep: draft.current_step,
          targetJobDescription: draft.target_job_description ?? '',
          content: draft.content ?? {},
          score: draft.score ?? {},
          completion: draft.completion ?? 0,
          updatedAt: draft.updated_at,
        }
      : null,
    memory: {
      ...(profile ? { fullName: profile.full_name ?? '', email: profile.email ?? '', targetRoles: profile.target_roles ?? [] } : emptyProfile()),
      career,
    },
  });
}

export async function PUT(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const parsed = draftBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });

  const normalized = normalizeStudioDraft(parsed.data.content ?? {});
  const score = scoreResumeDraft(normalized);
  const completion = completionForDraft(normalized);
  const payload = {
    user_id: user.id,
    name: parsed.data.name ?? normalized.versionName,
    target_role: normalized.career.targetRole || null,
    target_job_description: (parsed.data.targetJobDescription ?? normalized.targetJobDescription) || null,
    selected_template: parsed.data.selectedTemplate ?? normalized.selectedTemplate,
    current_step: parsed.data.currentStep ?? normalized.currentStep,
    content: normalized,
    score,
    completion,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.id) {
    const { data, error } = await supabaseAdmin
      .from('resume_studio_drafts')
      .update(payload)
      .eq('id', parsed.data.id)
      .eq('user_id', user.id)
      .select('id, name, selected_template, current_step, completion, updated_at')
      .single();
    if (error) return NextResponse.json({ error: 'DRAFT_SAVE_FAILED', detail: error.message }, { status: 500 });
    return NextResponse.json({ draft: data, score, completion });
  }

  const { data, error } = await supabaseAdmin
    .from('resume_studio_drafts')
    .insert(payload)
    .select('id, name, selected_template, current_step, completion, updated_at')
    .single();
  if (error) return NextResponse.json({ error: 'DRAFT_SAVE_FAILED', detail: error.message }, { status: 500 });
  return NextResponse.json({ draft: data, score, completion }, { status: 201 });
}
