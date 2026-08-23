import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { profileSchema } from '@/lib/schemas/profile';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const user = await requireUser();
  const [profileRes, careerRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('full_name,email,application_email,target_roles,workspace_id,account_status')
      .eq('user_id', user.id)
      .single(),
    supabaseAdmin
      .from('career_profiles')
      .select('headline,summary,skills,experience,education,projects,links')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  return NextResponse.json({ profile: profileRes.data, career: careerRes.data });
}

export async function PUT(request: Request) {
  const user = await requireUser();

  let body;
  try {
    body = profileSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (error as ZodError).flatten() },
      { status: 400 },
    );
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      full_name: body.full_name,
      target_roles: body.target_roles,
      application_email: body.application_email ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);
  if (profileError) return NextResponse.json({ error: 'PROFILE_UPDATE_FAILED' }, { status: 500 });

  const { error: careerError } = await supabaseAdmin
    .from('career_profiles')
    .upsert(
      {
        user_id: user.id,
        headline: body.headline || null,
        summary: body.summary || null,
        skills: body.skills,
        experience: body.experience,
        education: body.education,
        links: body.links,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (careerError) return NextResponse.json({ error: 'CAREER_PROFILE_UPDATE_FAILED' }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * Clears the user's structured career profile (headline, summary, skills,
 * experience, education, projects, links). Does NOT delete the account or the
 * auth-tied `profiles` row — see DECISIONS.md D-003.
 */
export async function DELETE() {
  const user = await requireUser();
  const { error } = await supabaseAdmin.from('career_profiles').delete().eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'CAREER_PROFILE_DELETE_FAILED' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
