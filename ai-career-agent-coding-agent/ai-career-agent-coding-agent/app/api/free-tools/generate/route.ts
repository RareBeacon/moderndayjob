import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { generateFreeToolResult } from '@/lib/free-tools/generator';
import { getFreeToolConfig, isFreeToolId } from '@/lib/free-tools/config';
import { auditEvent } from '@/lib/audit';
import { hashIp, trackGeneration } from '@/lib/ai/usage';
import { budgetDecision, countBudgetUsage, logSecuritySignal } from '@/lib/security/abuse';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const body = z.object({
  toolId: z.string().min(2).max(80),
  anonymousId: z.string().max(120).optional(),
  answers: z.record(z.string(), z.unknown()).default({}),
  startedAt: z.number().optional(),
});

function answerText(value: unknown) {
  if (Array.isArray(value)) return value.join(', ').trim();
  if (value == null) return '';
  return String(value).trim();
}

function validateRequired(toolId: string, answers: Record<string, unknown>) {
  if (!isFreeToolId(toolId)) return ['Unknown tool.'];
  const config = getFreeToolConfig(toolId);
  const missing: string[] = [];
  for (const q of config.questions) {
    if (!q.required) continue;
    const value = answerText(answers[q.id]);
    if (!value || (q.minLength && value.length < q.minLength)) missing.push(q.label);
  }
  return missing;
}

export async function POST(req: Request) {
  const user = await requireUser().catch(() => null);
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY', issues: parsed.error.issues }, { status: 400 });
  const toolId = parsed.data.toolId;
  if (!isFreeToolId(toolId)) return NextResponse.json({ error: 'UNKNOWN_TOOL' }, { status: 404 });

  const ip = requestIp(req);
  const rl = await enforceRateLimit(`free-tools:generate:${ip}:${toolId}`, user ? 30 : 12, '1 h', ip);
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Too many free-tool runs right now. Your answers are safe, try again soon.' }, { status: 429 });

  // Abuse ladder steps 2-3 (B-073): daily per-IP and global-anonymous budgets
  // backed by the ai_usage ledger. Reset daily; env-tunable; appealable.
  const ipHash = hashIp(ip);
  const budgets = await countBudgetUsage(ipHash);
  const decision = budgetDecision(budgets);
  if (decision.blocked) {
    await logSecuritySignal('ABUSE_BUDGET_BLOCKED', 'WARN', {
      reason: decision.reason,
      toolId,
      ipToday: budgets.ipToday,
      anonymousGlobalToday: budgets.anonymousGlobalToday,
    }, ipHash, user?.id ?? null);
    return NextResponse.json(
      {
        error: 'DAILY_BUDGET_REACHED',
        message: `I have hit my daily limit for this tool${decision.reason === 'IP_DAILY_BUDGET' ? ' from your network' : ''} and need to pause for about ${decision.retryAfterHours}h so the service stays fair and available to everyone. If you believe this is a mistake, email support@jobiest.com and I will sort it out.`,
      },
      { status: 429, headers: { 'Retry-After': String(decision.retryAfterHours * 3600) } },
    );
  }

  const missing = validateRequired(toolId, parsed.data.answers);
  if (missing.length) return NextResponse.json({ error: 'MORE_CONTEXT_REQUIRED', missing, message: `I need a bit more context first: ${missing.join(', ')}.` }, { status: 400 });

  try {
    void auditEvent({ action: 'free_tool_generation_started', resource: 'free_tool', userId: user?.id ?? null, ipHash, meta: { toolId, anonymousId: parsed.data.anonymousId, authenticated: Boolean(user) } });
    const result = await trackGeneration(
      { userId: user?.id ?? null, ipHash, feature: `free-tool.${toolId}` },
      () => generateFreeToolResult(toolId, parsed.data.answers),
    );
    void auditEvent({ action: 'free_tool_generation_completed', resource: 'free_tool', userId: user?.id ?? null, meta: { toolId, anonymousId: parsed.data.anonymousId, authenticated: Boolean(user), success: true, timeToCompletionMs: parsed.data.startedAt ? Date.now() - parsed.data.startedAt : null } });
    return NextResponse.json({ ...result, authenticated: Boolean(user) });
  } catch (error) {
    void auditEvent({ action: 'free_tool_generation_completed', resource: 'free_tool', userId: user?.id ?? null, meta: { toolId, anonymousId: parsed.data.anonymousId, authenticated: Boolean(user), success: false } });
    return NextResponse.json({ error: 'FREE_TOOL_GENERATION_FAILED', message: "Something went wrong while I was working on that. Your answers are safe. Let's try again.", detail: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300) }, { status: 500 });
  }
}
