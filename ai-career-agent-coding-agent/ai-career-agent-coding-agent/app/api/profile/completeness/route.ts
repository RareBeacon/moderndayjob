import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getProfileCompleteness } from '@/lib/profile-completeness';

export async function GET() {
  const u = await requireUser();
  return NextResponse.json(await getProfileCompleteness(u.id));
}
