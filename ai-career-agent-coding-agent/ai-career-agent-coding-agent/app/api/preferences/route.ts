import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { preferencesSchema } from '@/lib/schemas/preferences';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const user = await requireUser();
  const { data } = await supabaseAdmin
    .from('job_preferences')
    .select('remote_types,locations,employment_types,salary_min,currency,application_mode,daily_target,active')
    .eq('user_id', user.id)
    .maybeSingle();
  return NextResponse.json({ preferences: data });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  let body;
  try {
    body = preferencesSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', issues: (error as ZodError).flatten() },
      { status: 400 },
    );
  }
  const { error } = await supabaseAdmin.from('job_preferences').upsert(
    {
      user_id: user.id,
      remote_types: body.remote_types,
      locations: body.locations,
      employment_types: body.employment_types,
      salary_min: body.salary_min,
      currency: body.currency,
      application_mode: body.application_mode,
      daily_target: body.daily_target,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return NextResponse.json({ error: 'PREFERENCES_UPDATE_FAILED' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
