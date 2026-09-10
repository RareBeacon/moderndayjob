import type { AIGatewayRunOptions, AITask, AIProvider, ChatResponse } from './types';

/** Previous-output context budget for a repair retry (chars). */
const REPAIR_CONTEXT_CHARS = 2000;

/** Stable gateway error codes (used by routes + logs). */
export type AIGatewayErrorCode =
  | 'AI_QUOTA_EXHAUSTED'
  | 'TOOL_QUOTA_EXHAUSTED'
  | 'AI_OUTPUT_INVALID'
  | 'AI_ALL_PROVIDERS_FAILED'
  | 'AI_NO_PROVIDERS';

export class AIGatewayError extends Error {
  constructor(public readonly code: AIGatewayErrorCode, message: string) {
    super(message);
    this.name = 'AIGatewayError';
  }
}

interface ProviderAttemptError {
  provider: string;
  message: string;
}

/**
 * Central AI gateway (ARCHITECTURE §7, §13). Responsibilities:
 *  - try providers in priority order, falling back on failure (§13);
 *  - parse + validate model output against the task's Zod schema, rejecting
 *    malformed output (Phase 5 acceptance);
 *  - enforce per-run quota via an optional UsageMeter (reserve before, refund
 *    only if every provider fails).
 *
 * The gateway is pure: it imports no env, crypto, or supabase, so it is fully
 * unit-testable with mock providers and a mock meter.
 */
export class AIGateway {
  constructor(private readonly providers: AIProvider[]) {}

  async run<Input, Output>(
    task: AITask<Input, Output>,
    input: Input,
    opts: AIGatewayRunOptions = {},
  ): Promise<{ data: Output; provider: string }> {
    if (this.providers.length === 0) {
      throw new AIGatewayError('AI_NO_PROVIDERS', 'No AI providers are configured.');
    }

    // Reserve a credit up front (atomic check+increment). A quota exhaustion
    // here propagates immediately — no provider call is made.
    if (opts.meter) await opts.meter.reserve();

    const ordered = [...this.providers].sort((a, b) => a.priority - b.priority);
    const attempts: ProviderAttemptError[] = [];

    for (const provider of ordered) {
      const messages = task.buildMessages(input);
      const chatOpts = {
        responseFormat: 'json' as const,
        temperature: 0.2,
        maxTokens: task.maxTokens,
      };
      let res: ChatResponse;
      try {
        res = await provider.chat(messages, chatOpts);
      } catch (err) {
        attempts.push({ provider: provider.name, message: errMsg(err) });
        continue; // provider failure → fall back (§13)
      }

      // Parse + validate. A provider that returns non-JSON or schema-violating
      // output gets exactly one repair retry with the failure explained, then
      // we fall back to the next provider. Small local models usually fix
      // their own JSON when shown the error; without this, one malformed
      // response fails the whole run.
      const first = parseAndValidate(task, res.content);
      if (first.ok) return { data: first.data, provider: res.provider };
      attempts.push({ provider: provider.name, message: first.message });
      try {
        const repairRes = await provider.chat(
          [...messages, { role: 'user', content: repairPrompt(res.content, first.message) }],
          chatOpts,
        );
        const second = parseAndValidate(task, repairRes.content);
        if (second.ok) return { data: second.data, provider: repairRes.provider };
        attempts.push({ provider: `${provider.name}:repair`, message: second.message });
      } catch (err) {
        attempts.push({ provider: `${provider.name}:repair`, message: errMsg(err) });
      }
    }

    // Every provider failed — refund the reserved credit (best-effort).
    if (opts.meter) {
      try {
        await opts.meter.refund();
      } catch {
        /* refund is best-effort */
      }
    }
    throw new AIGatewayError(
      'AI_ALL_PROVIDERS_FAILED',
      `All providers failed: ${attempts.map((a) => `${a.provider}(${a.message})`).join('; ')}`,
    );
  }
}

/**
 * Extract a JSON object/array from a model response that may be raw JSON,
 * fenced in a code block, or wrapped in prose. Returns the first valid value.
 */
export function parseJsonContent(
  content: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const text = (content ?? '').trim();
  if (!text) return { ok: false, error: 'empty content' };

  // 1) Direct parse.
  const direct = tryJson(text);
  if (direct.ok) return direct;

  // 2) Fenced ```json ... ``` or ``` ... ```.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const f = tryJson(fence[1].trim());
    if (f.ok) return f;
  }

  // 3) First balanced {...} or [...] span (outermost match by last close).
  const start = text.search(/[{[]/);
  if (start !== -1) {
    const opener = text[start];
    const closer = opener === '{' ? '}' : ']';
    const end = text.lastIndexOf(closer);
    if (end > start) {
      const span = tryJson(text.slice(start, end + 1));
      if (span.ok) return span;
    }
  }
  return { ok: false, error: 'no JSON object found' };
}

function tryJson(s: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatZodError(e: {
  issues: { path: PropertyKey[]; message: string }[];
}): string {
  return e.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join(', ');
}

/** Parse + schema-validate one model response into a run-friendly result. */
function parseAndValidate<I, O>(
  task: AITask<I, O>,
  content: string,
): { ok: true; data: O } | { ok: false; message: string } {
  const parsed = parseJsonContent(content);
  if (!parsed.ok) return { ok: false, message: `Unparseable JSON: ${parsed.error}` };
  const result = task.schema.safeParse(parsed.value);
  if (!result.success) {
    return { ok: false, message: `Schema validation failed: ${formatZodError(result.error)}` };
  }
  return { ok: true, data: result.data };
}

/**
 * Repair prompt: show the model its broken output plus the exact failure so
 * the retry fixes the JSON instead of repeating the mistake.
 */
function repairPrompt(previousContent: string, failure: string): string {
  const prev = (previousContent ?? '').slice(0, REPAIR_CONTEXT_CHARS);
  return (
    `Your previous response could not be used (${failure}). ` +
    `Reply with ONLY the corrected JSON object matching the requested schema. ` +
    `No prose, no code fences. Previous response for reference: ${prev}`
  );
}
