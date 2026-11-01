import { z } from 'zod';
import { AIGateway } from '@packages/ai/gateway';
import type { AITask } from '@packages/ai/types';
import { redactSecrets } from '@/lib/audit';
import {
  buildQwenPlatformProviders,
  qwenConfigured,
  qwenEndpointHost,
  qwenEnvVarsPresent,
  qwenModelConfig,
} from '@/lib/ai/server';
import { env } from '@/lib/env';
import { CORRELATION_HEADER, resolveRequestId } from '@/lib/observability';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Internal health endpoint (spec 52). Reports component status WITHOUT
 * exposing credentials, private hostnames, or internal diagnostics. Always
 * returns HTTP 200 so uptime monitors do not false-positive while components
 * degrade; `ok` reflects the critical path (database), and `degraded` flags
 * advisory components (AI gateway, email).
 *
 * When `?verify_qwen=1` is passed, executes a cached, rate-limited, fixed-prompt
 * live inference check through `AIGateway.run` against the configured Qwen
 * flagship, standard, and fast tiers (no caller-controlled prompt input).
 */

interface QwenTierLiveResult {
  ok: boolean;
  provider: string | null;
  latencyMs: number;
  response: string | null;
  error?: string;
}

interface QwenLiveVerification {
  verifiedAt: string;
  cached: boolean;
  endpointHost: string | null;
  flagship: QwenTierLiveResult;
  standard: QwenTierLiveResult;
  fast: QwenTierLiveResult;
}

const VERIFY_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedQwenVerification: { expiresAt: number; payload: Omit<QwenLiveVerification, 'cached'> } | null =
  null;

const HEALTH_CAREER_TIP_SCHEMA = z.object({
  tip: z.string().min(10).max(400),
});

function createHealthVerifyTask(tier: 'flagship' | 'standard' | 'fast', prompt: string): AITask<null, { tip: string }> {
  return {
    id: `health.verify.${tier}`,
    version: 1,
    schema: HEALTH_CAREER_TIP_SCHEMA,
    maxTokens: 120,
    buildMessages: () => [
      {
        role: 'system',
        content:
          'You are Jobiest Career Intelligence. Return valid JSON only with a single key {"tip": "..."} containing concise, actionable advice.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  };
}

async function checkDb(): Promise<'ok' | 'error'> {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('user_id', { count: 'exact', head: true })
      .limit(1);
    return error ? 'error' : 'ok';
  } catch {
    return 'error';
  }
}

async function checkAiGateway(): Promise<'ok' | 'error' | 'not_configured'> {
  const base = env.OLLAMA_BASE_URL.trim();
  if (!base) {
    return qwenConfigured() ? 'ok' : 'not_configured';
  }
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/healthz`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) return 'ok';
    return qwenConfigured() ? 'ok' : 'error';
  } catch {
    return qwenConfigured() ? 'ok' : 'error';
  }
}

async function runSingleTierCheck(
  tier: 'flagship' | 'standard' | 'fast',
  prompt: string,
): Promise<QwenTierLiveResult> {
  const started = Date.now();
  try {
    const providers = buildQwenPlatformProviders(tier, 0);
    if (providers.length === 0) {
      return {
        ok: false,
        provider: null,
        latencyMs: 0,
        response: null,
        error: 'QWEN_NOT_CONFIGURED',
      };
    }
    const gateway = new AIGateway(providers);
    const task = createHealthVerifyTask(tier, prompt);
    const out = await gateway.run(task, null);
    const text = out.data.tip.trim().slice(0, 320);
    return {
      ok: text.length > 0,
      provider: out.provider,
      latencyMs: Date.now() - started,
      response: text || null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'QWEN_CHECK_FAILED';
    return {
      ok: false,
      provider: null,
      latencyMs: Date.now() - started,
      response: null,
      error: redactSecrets(msg).slice(0, 180),
    };
  }
}

async function verifyLiveQwen(): Promise<QwenLiveVerification> {
  const now = Date.now();
  if (cachedQwenVerification && cachedQwenVerification.expiresAt > now) {
    return { ...cachedQwenVerification.payload, cached: true };
  }

  const [flagship, standard, fast] = await Promise.all([
    runSingleTierCheck(
      'flagship',
      'Give one two-sentence executive resume tailoring tip for a senior software engineer applying on Jobiest. Respond as JSON {"tip": "..."}.',
    ),
    runSingleTierCheck(
      'standard',
      'Give one practical cover-letter personalization tip in one sentence for a candidate applying to a product engineering role. Respond as JSON {"tip": "..."}.',
    ),
    runSingleTierCheck(
      'fast',
      'Give one concise interview preparation tip in one sentence for a Jobiest Talent Pool candidate. Respond as JSON {"tip": "..."}.',
    ),
  ]);

  const payload: Omit<QwenLiveVerification, 'cached'> = {
    verifiedAt: new Date().toISOString(),
    endpointHost: qwenEndpointHost(),
    flagship,
    standard,
    fast,
  };

  if (flagship.ok && standard.ok && fast.ok) {
    cachedQwenVerification = {
      expiresAt: now + VERIFY_CACHE_TTL_MS,
      payload,
    };
  }

  return { ...payload, cached: false };
}

export async function GET(req: Request) {
  const requestId = resolveRequestId(req);
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`health:${ip}`, 60, '1 m');
  if (!rl.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED', requestId },
      { status: 429, headers: { [CORRELATION_HEADER]: requestId } },
    );
  }

  const url = new URL(req.url);
  const wantsVerify = url.searchParams.get('verify_qwen') === '1';
  let qwenVerification: QwenLiveVerification | { error: string } | undefined;

  if (wantsVerify) {
    const verifyRl = await enforceRateLimit(`health:verify-qwen:${ip}`, 5, '10 m');
    if (!verifyRl.allowed) {
      qwenVerification = { error: 'VERIFY_RATE_LIMITED' };
    } else if (!qwenConfigured()) {
      qwenVerification = { error: 'QWEN_ENV_NOT_CONFIGURED' };
    } else {
      qwenVerification = await verifyLiveQwen();
    }
  }

  const [database, aiGateway] = await Promise.all([checkDb(), checkAiGateway()]);
  const email = env.RESEND_API_KEY ? 'configured' : 'not_configured';
  const qwen = qwenConfigured() ? 'configured' : 'not_configured';
  const degraded = database !== 'ok' || aiGateway === 'error' || email === 'not_configured';
  return Response.json(
    {
      ok: database === 'ok',
      degraded,
      service: 'ai-career-agent',
      requestId,
      // Public deploy marker (the git SHA is public): lets CI and uptime
      // checks confirm WHICH build is live before testing it. Null locally.
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      time: new Date().toISOString(),
      checks: { database, ai_gateway: aiGateway, qwen, email },
      ai: {
        qwenConfigured: qwenConfigured(),
        envVarsPresent: qwenEnvVarsPresent(),
        endpointHost: qwenEndpointHost(),
        models: qwenModelConfig(),
        ...(qwenVerification ? { liveVerification: qwenVerification } : {}),
      },
    },
    { headers: { [CORRELATION_HEADER]: requestId } },
  );
}
