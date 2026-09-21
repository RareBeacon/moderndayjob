import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { buildGatewayForUser } from '@/lib/ai/server';
import { SUPPORT_CHAT_TASK, kbContextFor, detectEscalationTriggers, shouldEscalateAfterFailedResolutions } from '@/lib/support/agent';

export const dynamic = 'force-dynamic';

/** Anonymous support runs on the platform model chain, not user credits. */
const SUPPORT_SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: Request) {
  try {
    const ip = requestIp(request);
    const rl = await enforceRateLimit('support-chat', 15, '1 m', ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'RATE_LIMITED', message: 'Too many messages. Please wait a moment.' }, { status: 429 });
    }

    const body = (await request.json()) as { message?: string; conversationId?: string; history?: ChatTurn[]; route?: string };
    const message = String(body.message ?? '').slice(0, 3000).trim();
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    if (!message) return NextResponse.json({ error: 'MESSAGE_REQUIRED' }, { status: 400 });

    const user = await getUser();

    // Conversation persistence: reuse when the id belongs to this visitor.
    let conversationId = typeof body.conversationId === 'string' && body.conversationId.length > 10 ? body.conversationId : null;
    if (conversationId) {
      const { data: existing } = await supabaseAdmin
        .from('support_conversations')
        .select('id, user_id')
        .eq('id', conversationId)
        .maybeSingle();
      if (!existing || (user && existing.user_id && existing.user_id !== user.id)) conversationId = null;
    }
    if (!conversationId) {
      const { data: created, error } = await supabaseAdmin
        .from('support_conversations')
        .insert({ user_id: user?.id ?? null, route: typeof body.route === 'string' ? body.route.slice(0, 200) : null })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      conversationId = String(created.id);
    }

    await supabaseAdmin.from('support_chat_messages').insert({ conversation_id: conversationId, role: 'user', content: message });
    void supabaseAdmin.from('support_analytics_events').insert({ event_type: 'MESSAGE_SENT', conversation_id: conversationId });

    // Deterministic escalation check runs before and after the model.
    const trigger = detectEscalationTriggers(message);
    const userTurns = history.filter((turn) => turn.role === 'user').length + 1;
    const failedResolutions = shouldEscalateAfterFailedResolutions(userTurns);

    const kb = kbContextFor(message);
    let answer: string;
    let escalate: boolean;
    let escalateReason: string | null;

    try {
      const gateway = await buildGatewayForUser(user?.id ?? SUPPORT_SYSTEM_USER);
      const result = await gateway.run(SUPPORT_CHAT_TASK, { message, history, kb });
      answer = result.data.answer;
      escalate = result.data.escalate || Boolean(trigger) || failedResolutions;
      escalateReason = trigger ?? (failedResolutions ? 'THREE_FAILED_RESOLUTIONS' : result.data.escalateReason);
    } catch {
      // Model unavailable: be honest and route to a human. Never fake an answer.
      answer = 'I could not reach the assistant right now. I can create a support ticket so a human follows up with you, or you can use the Contact Support page.';
      escalate = true;
      escalateReason = 'MODEL_UNAVAILABLE';
    }

    await supabaseAdmin.from('support_chat_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: answer,
      escalated: escalate,
      kb_used: kb.map((entry) => entry.id),
    });
    if (escalate) {
      void supabaseAdmin.from('support_analytics_events').insert({ event_type: 'ESCALATED', conversation_id: conversationId, metadata: { reason: escalateReason } });
      await supabaseAdmin.from('support_conversations').update({ status: 'ESCALATED', updated_at: new Date().toISOString() }).eq('id', conversationId);
    } else {
      void supabaseAdmin.from('support_analytics_events').insert({ event_type: 'DEFLECTED', conversation_id: conversationId });
    }

    return NextResponse.json({
      conversationId,
      answer,
      escalate,
      escalateReason,
      promptVersion: SUPPORT_CHAT_TASK.version,
    });
  } catch (error) {
    console.error('support chat error', error);
    return NextResponse.json({ error: 'CHAT_FAILED', message: 'Something went wrong. Please try again or use the Contact Support page.' }, { status: 500 });
  }
}
