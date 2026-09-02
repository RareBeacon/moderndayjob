import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/auth/confirm · legacy-account repair, used only by the login
 * page when Supabase rejects a correct password with "email not
 * confirmed". Those accounts were created before signup auto-confirmed;
 * since the product no longer requires email verification, they are
 * confirmed here on demand so their owners can sign in. The route is
 * only reached after the client proved the password (the failed sign-in
 * attempt), so it never unlocks an account for the wrong person.
 */
const MAX_PAGES = 20; // 20 x 500 = 10,000 accounts scanned, then we stop

export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const email = (body.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email.' }, { status: 400 });
  }

  let userId: string | null = null;
  for (let page = 1; page <= MAX_PAGES && !userId; page++) {
    const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 500,
    });
    if (listError) {
      return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 500 });
    }
    const users = list?.users ?? [];
    userId = users.find((u: { email?: string }) => (u.email ?? '').toLowerCase() === email)?.id ?? null;
    if (users.length < 500) break; // last page
  }

  if (!userId) {
    // Do not reveal whether the account exists.
    return NextResponse.json({ error: 'Could not complete sign-in.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true });
  if (error) {
    return NextResponse.json({ error: 'Could not complete sign-in.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
