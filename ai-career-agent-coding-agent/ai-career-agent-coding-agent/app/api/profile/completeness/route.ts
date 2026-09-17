import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getProfileCompleteness } from '@/lib/profile-completeness';

export async function GET(req: Request) {
  const u = await requireUser({ req: req }).catch(() => null);
  if (!u) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  return NextResponse.json(await getProfileCompleteness(u.id));
}
