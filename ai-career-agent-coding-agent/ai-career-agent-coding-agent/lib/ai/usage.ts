import { createHash, createHmac } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { AIGateway, AIGatewayError } from '@packages/ai/gateway';
import type { AIRunLedger, AIGatewayRunOptions, AITask } from '@packages/ai/types';

/**
 * AI usage ledger (Master Implementation Package §98/§332, B-061).
 *
 * Every generation - provider-backed or deterministic - writes one ai_usage
 * row: feature, provider, model, tokens, latency, status. Never prompt
 * content or completion text; callers may pass a short content hash for
 * cache-hit analytics. Writes are best-effort: a ledger failure must never
 * fail a user's generation (enforcement lives in the quota RPCs, not here).
 */

/** Stable HMAC of a client IP. Raw IPs are never stored (§102). */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip || ip === 'unknown') return null;
  const key = (process.env.LOG_HASH_KEY || env.ENCRYPTION_MASTER_KEY).padEnd(32, '0');
  return createHmac('sha256', key).update(String(ip)).digest('hex');
}

/** Short hash of generation inputs for cache-hit analytics (never the content). */
export function contentHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input ?? '')).digest('hex').slice(0, 16);
}

export interface GenerationUsage {
  userId?: string | null;
  ipHash?: string | null;
  feature: string;
  provider: string;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs: number;
  status: 'ok' | 'error' | 'timeout' | 'blocked';
  errorCode?: string | null;
  promptVersion?: string | null;
  contentHashValue?: string | null;
}

/** Best-effort ledger write. Never throws. */
export async function recordGenerationUsage(e: GenerationUsage): Promise<void> {
  try {
    await supabaseAdmin.from('ai_usage').insert({
      user_id: e.userId ?? null,
      ip_hash: e.ipHash ?? null,
      feature: e.feature.slice(0, 80),
      provider: e.provider.slice(0, 80),
      model: e.model?.slice(0, 120) ?? null,
      input_tokens: e.inputTokens ?? null,
      output_tokens: e.outputTokens ?? null,
      latency_ms: Math.max(0, Math.round(e.latencyMs)),
      status: e.status,
      error_code: e.errorCode?.slice(0, 80) ?? null,
      prompt_version: e.promptVersion?.slice(0, 40) ?? null,
      content_hash: e.contentHashValue ?? null,
    });
  } catch {
    /* ledger must not break the request path */
  }
}

/** Extract a stable error code from any thrown error. */
function errorCodeOf(err: unknown): string {
  if (err instanceof AIGatewayError) return err.code;
  if (err instanceof Error) return err.message.slice(0, 80) || err.name;
  return 'UNKNOWN';
}

/**
 * Wrap one generation call so its outcome lands in the ledger. Returns
 * whatever `fn` returns (fn's result should carry the winning `provider`)
 * and rethrows any error after recording it.
 */
export async function trackGeneration<T extends { provider?: string }>(
  ctx: Pick<GenerationUsage, 'userId' | 'ipHash' | 'feature'> & { promptVersion?: string | null },
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    await recordGenerationUsage({
      ...ctx,
      provider: result.provider ?? 'unknown',
      latencyMs: Date.now() - t0,
      status: 'ok',
    });
    return result;
  } catch (err) {
    await recordGenerationUsage({
      ...ctx,
      provider: 'none',
      latencyMs: Date.now() - t0,
      status: 'error',
      errorCode: errorCodeOf(err),
    });
    throw err;
  }
}

/**
 * Wrap an AIGateway so every run() is ledgered with the run's task id as the
 * feature. Use at construction time in routes when provider-backed generation
 * is enabled. The gateway class has a single public method (`run`), so a
 * structural wrapper preserves its type without mutation.
 */
export function withUsageLedger(
  gateway: AIGateway,
  ctx: { userId?: string | null; ipHash?: string | null },
): AIGateway {
  const ledger: AIRunLedger = (event) =>
    recordGenerationUsage({
      userId: ctx.userId ?? null,
      ipHash: ctx.ipHash ?? null,
      feature: event.task,
      provider: event.provider,
      model: event.model ?? null,
      inputTokens: event.inputTokens ?? null,
      outputTokens: event.outputTokens ?? null,
      latencyMs: event.latencyMs,
      status: event.status,
      errorCode: event.errorCode ?? null,
      promptVersion: event.taskVersion ? `v${event.taskVersion}` : null,
    });
  const inner = gateway.run.bind(gateway);
  return {
    run: <Input, Output>(
      task: AITask<Input, Output>,
      input: Input,
      opts: AIGatewayRunOptions = {},
    ) => inner(task, input, { ...opts, ledger }),
  } as AIGateway;
}
