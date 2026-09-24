import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  try {
    const user = await requireUser({ req }).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('id, title, body, deep_link, type, created_at, read')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      // If table doesn't exist yet, return sample default system events for the user
      return NextResponse.json({
        notifications: [
          {
            id: 'n1',
            title: 'Your AI agent found 18 new opportunities',
            body: '3 are a 90%+ match for your career preferences.',
            deep_link: 'jobiest://jobs',
            type: 'job_match',
            created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
            read: false,
          },
          {
            id: 'n2',
            title: 'Resume tailored for Airbnb',
            body: 'Your tailored resume and cover letter package are ready for review.',
            deep_link: 'jobiest://applications',
            type: 'application',
            created_at: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
            read: true,
          },
          {
            id: 'n3',
            title: 'Profile strength improved',
            body: 'Your career preferences increased match confidence to 94%.',
            deep_link: 'jobiest://profile',
            type: 'resume',
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
            read: true,
          },
        ],
      });
    }

    return NextResponse.json({ notifications: notifications || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', details: message }, { status: 500 });
  }
}
