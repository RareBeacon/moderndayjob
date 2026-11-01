import { env } from '@/lib/env';
import { AIGateway } from '@packages/ai/gateway';
import { OllamaProvider, OpenAICompatProvider, httpChat } from '@packages/ai/providers';
import type { AIProvider, AITask } from '@packages/ai/types';
import { buildSupportGateway, cloudflareConfigured, ollamaConfigured } from '@/lib/ai/server';
import { contentHash, recordGenerationUsage } from '@/lib/ai/usage';

export type IntelligenceModelTier = 'FAST_EXTRACTION' | 'STRONG_REASONING';

export interface IntelligenceCallTelemetry {
  taskId: string;
  promptVersion: string;
  tier: IntelligenceModelTier;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  usedFallback: boolean;
  cached: boolean;
}

export interface InterviewTelemetrySummary {
  calls: IntelligenceCallTelemetry[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLatencyMs: number;
  estimatedCostUsd: number;
  fallbackCount: number;
}

const COST_PER_MILLION_TOKENS_USD: Record<string, { input: number; output: number }> = {
  ollama: { input: 0, output: 0 },
  'ollama-fallback': { input: 0, output: 0 },
  'deterministic-rubric-engine': { input: 0, output: 0 },
  'cloudflare-support': { input: 0.05, output: 0.15 },
  'openrouter-platform': { input: 0.25, output: 0.85 },
  'openrouter-support': { input: 0.25, output: 0.85 },
  openai: { input: 0.15, output: 0.6 },
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateCallCostUsd(
  provider: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = COST_PER_MILLION_TOKENS_USD[provider] ?? { input: 0.2, output: 0.6 };
  const usd = (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
  return Number(usd.toFixed(6));
}

/**
 * Builds a zero-credit-charge AIGateway tuned for the requested intelligence tier:
 * - FAST_EXTRACTION: prefers smaller/faster models (llama3.2:3b / Cloudflare) for extraction & live turns.
 * - STRONG_REASONING: prefers stronger reasoning models (qwen2.5:7b / OpenRouter) for blueprint & evaluation.
 * Returns null when no external LLM credentials are configured so callers execute deterministic fallback cleanly.
 */
export function buildTieredIntelligenceGateway(tier: IntelligenceModelTier): AIGateway | null {
  if (tier === 'FAST_EXTRACTION') {
    try {
      const providers: AIProvider[] = [];
      if (ollamaConfigured() && env.OLLAMA_FALLBACK_MODEL) {
        providers.push(
          new OllamaProvider({
            name: 'ollama-fallback',
            model: env.OLLAMA_FALLBACK_MODEL,
            baseUrl: env.OLLAMA_BASE_URL,
            apiKey: env.OLLAMA_API_KEY,
            priority: 0,
          }),
        );
      }
      if (ollamaConfigured()) {
        providers.push(
          new OllamaProvider({
            name: 'ollama',
            model: env.OLLAMA_MODEL,
            baseUrl: env.OLLAMA_BASE_URL,
            apiKey: env.OLLAMA_API_KEY,
            priority: providers.length,
          }),
        );
      }
      if (env.OPENROUTER_API_KEY) {
        providers.push(
          new OpenAICompatProvider(
            {
              name: 'openrouter-platform',
              model: env.OPENROUTER_MODEL || 'openrouter/auto',
              baseUrl: env.OPENROUTER_BASE_URL,
              apiKey: env.OPENROUTER_API_KEY,
              priority: providers.length,
            },
            httpChat,
          ),
        );
      }
      if (providers.length > 0) return new AIGateway(providers);
      if (cloudflareConfigured()) return buildSupportGateway();
      return null;
    } catch {
      return null;
    }
  }

  try {
    const providers: AIProvider[] = [];
    if (ollamaConfigured()) {
      providers.push(
        new OllamaProvider({
          name: 'ollama',
          model: env.OLLAMA_MODEL,
          baseUrl: env.OLLAMA_BASE_URL,
          apiKey: env.OLLAMA_API_KEY,
          priority: 0,
        }),
      );
    }
    if (env.OPENROUTER_API_KEY) {
      providers.push(
        new OpenAICompatProvider(
          {
            name: 'openrouter-platform',
            model: env.OPENROUTER_MODEL || 'openrouter/auto',
            baseUrl: env.OPENROUTER_BASE_URL,
            apiKey: env.OPENROUTER_API_KEY,
            priority: providers.length,
          },
          httpChat,
        ),
      );
    }
    if (providers.length > 0) return new AIGateway(providers);
    if (cloudflareConfigured()) return buildSupportGateway();
    return null;
  } catch {
    return null;
  }
}

export async function runTrackedIntelligenceTask<TIn, TOut>(params: {
  userId: string;
  tier: IntelligenceModelTier;
  promptVersion: string;
  task: AITask<TIn, TOut>;
  input: TIn;
  timeoutMs?: number;
  deterministicFallback: () => TOut;
}): Promise<{ data: TOut; telemetry: IntelligenceCallTelemetry }> {
  const started = Date.now();
  const inputSerialized = JSON.stringify(params.input ?? '');
  const approxInputTokens = estimateTokens(inputSerialized);
  const hashVal = contentHash(params.input);
  const gateway = buildTieredIntelligenceGateway(params.tier);

  if (gateway) {
    try {
      const timeoutMs = params.timeoutMs ?? (params.tier === 'FAST_EXTRACTION' ? 14_000 : 24_000);
      const res = await Promise.race([
        gateway.run(params.task, params.input),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('INTELLIGENCE_LLM_TIMEOUT')), timeoutMs),
        ),
      ]);
      const latencyMs = Math.max(1, Date.now() - started);
      const outTokens = estimateTokens(JSON.stringify(res.data ?? ''));
      const costUsd = estimateCallCostUsd(res.provider, approxInputTokens, outTokens);

      await recordGenerationUsage({
        userId: params.userId,
        feature: params.task.id,
        provider: res.provider,
        model: params.tier === 'FAST_EXTRACTION' ? env.OLLAMA_FALLBACK_MODEL || 'fast' : env.OLLAMA_MODEL || 'strong',
        inputTokens: approxInputTokens,
        outputTokens: outTokens,
        latencyMs,
        status: 'ok',
        promptVersion: params.promptVersion,
        contentHashValue: hashVal,
      });

      return {
        data: res.data,
        telemetry: {
          taskId: params.task.id,
          promptVersion: params.promptVersion,
          tier: params.tier,
          provider: res.provider,
          model: params.tier === 'FAST_EXTRACTION' ? env.OLLAMA_FALLBACK_MODEL || 'fast' : env.OLLAMA_MODEL || 'strong',
          latencyMs,
          inputTokens: approxInputTokens,
          outputTokens: outTokens,
          estimatedCostUsd: costUsd,
          usedFallback: false,
          cached: false,
        },
      };
    } catch (err) {
      const latencyMs = Math.max(1, Date.now() - started);
      await recordGenerationUsage({
        userId: params.userId,
        feature: params.task.id,
        provider: 'deterministic-rubric-engine',
        model: 'rubric-fallback-v1',
        inputTokens: approxInputTokens,
        outputTokens: 0,
        latencyMs,
        status: err instanceof Error && err.message.includes('TIMEOUT') ? 'timeout' : 'error',
        errorCode: err instanceof Error ? err.message.slice(0, 64) : 'LLM_UNAVAILABLE',
        promptVersion: params.promptVersion,
        contentHashValue: hashVal,
      });
    }
  }

  const fallbackData = params.deterministicFallback();
  const latencyMs = Math.max(1, Date.now() - started);
  const outTokens = estimateTokens(JSON.stringify(fallbackData ?? ''));

  return {
    data: fallbackData,
    telemetry: {
      taskId: params.task.id,
      promptVersion: params.promptVersion,
      tier: params.tier,
      provider: 'deterministic-rubric-engine',
      model: 'rubric-fallback-v1',
      latencyMs,
      inputTokens: approxInputTokens,
      outputTokens: outTokens,
      estimatedCostUsd: 0,
      usedFallback: true,
      cached: false,
    },
  };
}

export function summarizeTelemetry(calls: IntelligenceCallTelemetry[]): InterviewTelemetrySummary {
  return calls.reduce<InterviewTelemetrySummary>(
    (acc, c) => ({
      calls: [...acc.calls, c],
      totalInputTokens: acc.totalInputTokens + c.inputTokens,
      totalOutputTokens: acc.totalOutputTokens + c.outputTokens,
      totalLatencyMs: acc.totalLatencyMs + c.latencyMs,
      estimatedCostUsd: Number((acc.estimatedCostUsd + c.estimatedCostUsd).toFixed(6)),
      fallbackCount: acc.fallbackCount + (c.usedFallback ? 1 : 0),
    }),
    {
      calls: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalLatencyMs: 0,
      estimatedCostUsd: 0,
      fallbackCount: 0,
    },
  );
}
