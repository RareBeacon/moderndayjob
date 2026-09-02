import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/auth/signup · create an account that works immediately.
 * The hosted Supabase project has "Confirm email" enabled, which parks
 * new users behind an email link. This route creates the user through
 * the admin API with email_confirm: true, so signup → sign-in → operate
 * happens in one motion, no email round-trip. The client signs in right
 * after and gets a real session; nothing is faked or bypassed client-side.
 */
export async function POST(req: Request) {
  let body: { name?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';

  if (!name) return NextResponse.json({ error: 'Please tell us your name.' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Your password needs at least 8 characters.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  if (error) {
    const already = error.status === 422 || /already (registered|exists)/i.test(error.message);
    if (already) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Sign in instead, or reset your password.' },
        { status: 409 },
      );
    }
    if (error.status === 429 || /rate/i.test(error.message)) {
      return NextResponse.json(
        { error: 'Too many sign-ups just now. Please try again in a minute.' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: 'We could not create your account just now. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user: { id: data.user?.id ?? null } });
}
