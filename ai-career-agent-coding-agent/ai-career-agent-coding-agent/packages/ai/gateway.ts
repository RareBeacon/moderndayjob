import type { AIGatewayRunOptions, AITask, AIProvider, ChatResponse } from './types';

/** Stable gateway error codes (used by routes + logs). */
export type AIGatewayErrorCode =
  | 'AI_QUOTA_EXHAUSTED'
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
      let res: ChatResponse;
      try {
        res = await provider.chat(messages, { responseFormat: 'json', temperature: 0.2 });
      } catch (err) {
        attempts.push({ provider: provider.name, message: errMsg(err) });
        continue; // provider failure → fall back (§13)
      }

      // Parse + validate. A provider that returns non-JSON or schema-violating
      // output is treated as a failed attempt and we fall back to the next.
      const parsed = parseJsonContent(res.content);
      if (!parsed.ok) {
        attempts.push({ provider: provider.name, message: `Unparseable JSON: ${parsed.error}` });
        continue;
      }
      const result = task.schema.safeParse(parsed.value);
      if (!result.success) {
        attempts.push({
          provider: provider.name,
          message: `Schema validation failed: ${formatZodError(result.error)}`,
        });
        continue;
      }

      return { data: result.data, provider: res.provider };
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
