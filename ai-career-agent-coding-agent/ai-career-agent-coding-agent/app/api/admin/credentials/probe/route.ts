import { z } from 'zod';
import { requireAdminUser, adminErrorResponse } from '@/lib/admin';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import {
  DASHSCOPE_INTL_BASE_URL,
  DASHSCOPE_US_BASE_URL,
  QWENCLOUD_GLOBAL_BASE_URL,
  resolveQwenEndpoints,
} from '@packages/ai/qwen';

export const dynamic = 'force-dynamic';

const ALLOWED_QWEN_BASES = new Set<string>([
  QWENCLOUD_GLOBAL_BASE_URL,
  DASHSCOPE_INTL_BASE_URL,
  DASHSCOPE_US_BASE_URL,
]);

const probeSchema = z.object({
  apiKey: z.string().trim().min(10).max(500),
  baseUrl: z.string().trim().max(300).optional(),
});

const PROBE_MODELS = [
  { id: 'qwen3.8-max', tier: 'flagship', extra: { reasoning_effort: 'low' } },
  { id: 'qwen3.7-plus', tier: 'standard', extra: { enable_thinking: false } },
  { id: 'qwen3.8-flash', tier: 'fast', extra: { enable_thinking: false } },
  { id: 'deepseek-v4-pro-0813', tier: 'flagship-backup', extra: { enable_thinking: false } },
  { id: 'deepseek-v4.1-flash', tier: 'fast-backup', extra: { enable_thinking: false } },
] as const;

/**
 * POST /api/admin/credentials/probe
 *
 * Runs the live Alibaba QwenCloud / DashScope model discovery & latency probe
 * from the server (Vercel runtime) so the administrator never needs a CLI or
 * terminal. Strict security invariants:
 *   - Admin-gated (`requireAdminUser(req)`) and rate-limited (`10 / 10 m`).
 *   - SSRF-locked exclusively to the 3 official QwenCloud / DashScope HTTPS
 *     endpoints (`ALLOWED_QWEN_BASES`).
 *   - Never logs, echoes, or stores `apiKey`.
 */
export async function POST(req: Request) {
  const rl = await enforceRateLimit(`admin:credentials:probe:${requestIp(req)}`, 10, '10 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  try {
    await requireAdminUser(req);
    const parsed = probeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
    }

    const { apiKey, baseUrl } = parsed.data;
    const cleanExplicit = (baseUrl ?? '').trim().replace(/\/+$/, '');
    if (cleanExplicit && !ALLOWED_QWEN_BASES.has(cleanExplicit)) {
      return Response.json(
        { error: 'UNSUPPORTED_PROBE_ENDPOINT', allowed: Array.from(ALLOWED_QWEN_BASES) },
        { status: 422 },
      );
    }

    const candidates = resolveQwenEndpoints(apiKey, cleanExplicit || undefined).filter((u) =>
      ALLOWED_QWEN_BASES.has(u),
    );

    let winningBase: string | null = null;
    let catalogCount = 0;

    for (const candidate of candidates) {
      try {
        const res = await fetch(`${candidate}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8_000),
        });
        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> };
          winningBase = candidate;
          catalogCount = Array.isArray(json.data) ? json.data.length : 0;
          break;
        }
      } catch {
        // Try next regional endpoint.
      }
    }

    if (!winningBase) {
      return Response.json(
        {
          ok: false,
          error: 'AUTH_OR_REGION_MISMATCH',
          detail: 'Could not authenticate against QwenCloud or DashScope endpoints. Verify the API key is active.',
        },
        { status: 401 },
      );
    }

    const probes = await Promise.all(
      PROBE_MODELS.map(async (entry) => {
        const t0 = Date.now();
        const payload: Record<string, unknown> = {
          model: entry.id,
          messages: [{ role: 'user', content: 'Return JSON: {"ok":true}' }],
          response_format: { type: 'json_object' },
          max_tokens: 20,
          temperature: 0,
          ...entry.extra,
        };
        try {
          let res = await fetch(`${winningBase}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok && res.status === 400) {
            const plain = { ...payload };
            delete plain.enable_thinking;
            delete plain.reasoning_effort;
            res = await fetch(`${winningBase}/chat/completions`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(plain),
              signal: AbortSignal.timeout(15_000),
            });
          }
          const latencyMs = Date.now() - t0;
          if (!res.ok) {
            return { model: entry.id, tier: entry.tier, reachable: false, status: res.status, latencyMs };
          }
          const json = (await res.json().catch(() => ({}))) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const ok = Boolean(json?.choices?.[0]?.message?.content?.includes('true'));
          return { model: entry.id, tier: entry.tier, reachable: ok, status: 200, latencyMs };
        } catch {
          return { model: entry.id, tier: entry.tier, reachable: false, status: 0, latencyMs: Date.now() - t0 };
        }
      }),
    );

    const pick = (preferred: string, backup: string) =>
      probes.find((p) => p.model === preferred && p.reachable)?.model ??
      probes.find((p) => p.model === backup && p.reachable)?.model ??
      preferred;

    return Response.json({
      ok: true,
      endpoint: winningBase,
      catalogCount,
      recommended: {
        flagship: pick('qwen3.8-max', 'deepseek-v4-pro-0813'),
        standard: pick('qwen3.7-plus', 'qwen3.8-max'),
        fast: pick('qwen3.8-flash', 'deepseek-v4.1-flash'),
        asr: 'qwen3-asr-flash',
      },
      probes,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
