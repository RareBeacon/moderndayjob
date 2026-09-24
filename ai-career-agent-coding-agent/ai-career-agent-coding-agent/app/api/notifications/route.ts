import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    const rl = await enforceRateLimit(`notifications:${requestIp(req)}:${user.id}`, 60, '1 m');
    if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('id, title, body, deep_link, type, created_at, read')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      // No fabricated content: if the history cannot be read, the list is
      // simply empty (never invented notifications).
      return NextResponse.json({ notifications: [] });
    }

    return NextResponse.json({ notifications: notifications || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', details: message }, { status: 500 });
  }
}
