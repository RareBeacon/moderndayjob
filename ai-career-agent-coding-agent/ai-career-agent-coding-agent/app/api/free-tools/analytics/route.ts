import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { auditEvent } from '@/lib/audit';
import { isFreeToolId } from '@/lib/free-tools/config';

export const dynamic = 'force-dynamic';

const eventNames = [
  'free_tool_viewed',
  'free_tool_started',
  'free_tool_question_answered',
  'free_tool_generation_started',
  'free_tool_generation_completed',
  'free_tool_copy_clicked',
  'free_tool_download_clicked',
  'free_tool_save_clicked',
  'free_tool_auth_gate_shown',
  'free_tool_signup_started',
  'free_tool_signup_completed',
  'free_tool_result_unlocked',
  'free_tool_abandoned',
] as const;

const body = z.object({
  eventName: z.enum(eventNames),
  toolId: z.string().min(2).max(80),
  anonymousId: z.string().max(120).optional(),
  step: z.string().max(80).optional(),
  completionRate: z.number().int().min(0).max(100).optional(),
  generationSuccess: z.boolean().optional(),
  timeToCompletionMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function safeString(value: unknown, max = 180) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().slice(0, max);
  return clean || null;
}

async function recordSeoToolAttribution(input: {
  eventName: (typeof eventNames)[number];
  toolId: string;
  anonymousId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const articleSlug = safeString(input.metadata?.sourceArticle);
  if (!articleSlug) return;
  const mappedEvent = input.eventName === 'free_tool_viewed'
    ? 'tool_view_from_article'
    : input.eventName === 'free_tool_started'
      ? 'tool_start_from_article'
      : input.eventName === 'free_tool_generation_completed'
        ? 'tool_completion_from_article'
        : null;
  if (!mappedEvent) return;
  try {
    const { data: project } = await supabaseAdmin.from('seo_projects').select('id').limit(1).maybeSingle();
    await supabaseAdmin.from('seo_conversion_events').insert({
      project_id: project?.id ?? null,
      user_id: input.userId ?? null,
      anonymous_id: input.anonymousId ?? null,
      event_name: mappedEvent,
      article_slug: articleSlug,
      source_url: safeString(input.metadata?.referrer, 500),
      target_url: null,
      tool_id: input.toolId,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Conversion attribution must not block the free tool experience.
  }
}

export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  if (!isFreeToolId(parsed.data.toolId)) return NextResponse.json({ ok: false }, { status: 404 });

  const payload = {
    user_id: user?.id ?? null,
    anonymous_id: parsed.data.anonymousId ?? null,
    tool_id: parsed.data.toolId,
    event_name: parsed.data.eventName,
    step: parsed.data.step ?? null,
    authenticated: Boolean(user),
    generation_success: parsed.data.generationSuccess ?? null,
    completion_rate: parsed.data.completionRate ?? null,
    time_to_completion_ms: parsed.data.timeToCompletionMs ?? null,
    metadata: parsed.data.metadata ?? {},
  };

  await supabaseAdmin.from('free_tool_events').insert(payload).then(undefined, () => undefined);
  void recordSeoToolAttribution({
    eventName: parsed.data.eventName,
    toolId: parsed.data.toolId,
    anonymousId: parsed.data.anonymousId,
    userId: user?.id ?? null,
    metadata: parsed.data.metadata,
  });
  void auditEvent({ action: parsed.data.eventName, resource: 'free_tool', userId: user?.id ?? null, meta: { toolId: parsed.data.toolId, step: parsed.data.step, authenticated: Boolean(user) } });
  return NextResponse.json({ ok: true });
}
