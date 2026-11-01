import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { employerRegistrationSchema } from '@/lib/talent-pool/schemas';
import {
  getEmployerContextForUser,
  registerEmployerOrganization,
} from '@/lib/talent-pool/recruiter-service';
import { TalentPoolError } from '@/lib/talent-pool/candidate-service';

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`emp-org-get:${ip}`, 60, '1 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const context = await getEmployerContextForUser(user.id);
  if (!context) {
    return NextResponse.json({ context: null });
  }

  const [shortlistsRes, vacanciesRes, pipelineRes, requestsRes] = await Promise.all([
    supabaseAdmin
      .from('employer_shortlists')
      .select('id,name,description,vacancy_id,created_at')
      .eq('organization_id', context.organization.id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('recruitment_vacancies')
      .select('id,title,career_category,seniority_level,location,status,created_at')
      .eq('organization_id', context.organization.id)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('recruitment_pipeline_entries')
      .select('id,candidate_user_id,vacancy_id,stage,notes,updated_at')
      .eq('organization_id', context.organization.id)
      .order('updated_at', { ascending: false }),
    supabaseAdmin
      .from('talent_contact_requests')
      .select('id,candidate_user_id,request_type,role_title,status,created_at')
      .eq('organization_id', context.organization.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    context,
    shortlists: shortlistsRes.data ?? [],
    vacancies: vacanciesRes.data ?? [],
    pipeline: pipelineRes.data ?? [],
    outreach: requestsRes.data ?? [],
  });
}

export async function POST(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`emp-org-reg:${ip}`, 8, '10 m', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let parsed;
  try {
    parsed = employerRegistrationSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (err as ZodError).flatten?.() ?? String(err) },
      { status: 400 },
    );
  }

  try {
    const context = await registerEmployerOrganization(user.id, parsed);
    return NextResponse.json({ ok: true, context }, { status: 201 });
  } catch (err) {
    if (err instanceof TalentPoolError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'EMPLOYER_REGISTER_FAILED' }, { status: 500 });
  }
}
