import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { isFreeToolId, getFreeToolConfig } from '@/lib/free-tools/config';
import { auditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const body = z.object({
  action: z.enum(['save', 'download', 'copy']),
  toolId: z.string().min(2).max(80),
  anonymousId: z.string().max(120).optional(),
  title: z.string().min(1).max(180),
  answers: z.record(z.string(), z.unknown()).default({}),
  result: z.record(z.string(), z.unknown()).default({}),
  resultText: z.string().min(1).max(120000),
});

function safeFilename(title: string) {
  return title.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'jobiest-free-tool-result';
}

async function saveResult(input: z.infer<typeof body>, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('free_tool_results')
    .insert({
      user_id: userId,
      anonymous_id: input.anonymousId ?? null,
      tool_id: input.toolId,
      title: input.title,
      answers: input.answers,
      result: input.result,
      result_text: input.resultText.replace(/[\u2013\u2014]/g, '-'),
    })
    .select('id, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED', message: 'Create a free Jobiest account to unlock this result.' }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  if (!isFreeToolId(parsed.data.toolId)) return NextResponse.json({ error: 'UNKNOWN_TOOL' }, { status: 404 });

  const rl = await enforceRateLimit(`free-tools:action:${requestIp(req)}:${user.id}`, 40, '1 h');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Too many actions right now. Try again soon.' }, { status: 429 });

  const eventName = parsed.data.action === 'save' ? 'free_tool_save_clicked' : parsed.data.action === 'download' ? 'free_tool_download_clicked' : 'free_tool_copy_clicked';
  void auditEvent({ action: eventName, resource: 'free_tool', userId: user.id, meta: { toolId: parsed.data.toolId, anonymousId: parsed.data.anonymousId } });

  if (parsed.data.action === 'copy') {
    return NextResponse.json({ ok: true, unlocked: true });
  }

  if (parsed.data.action === 'save') {
    try {
      const saved = await saveResult(parsed.data, user.id);
      void auditEvent({ action: 'free_tool_result_unlocked', resource: 'free_tool', resourceId: saved.id, userId: user.id, meta: { toolId: parsed.data.toolId, action: 'save' } });
      return NextResponse.json({ ok: true, saved });
    } catch (error) {
      return NextResponse.json({ error: 'SAVE_FAILED', message: 'Your result could not be saved just now. Try again.', detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }

  const config = getFreeToolConfig(parsed.data.toolId);
  const text = [`${parsed.data.title}`, `Generated with Jobiest ${config.name}`, '', parsed.data.resultText].join('\n').replace(/[\u2013\u2014]/g, '-');
  void auditEvent({ action: 'free_tool_result_unlocked', resource: 'free_tool', userId: user.id, meta: { toolId: parsed.data.toolId, action: 'download' } });
  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeFilename(parsed.data.title)}.txt"`,
    },
  });
}
