import type { AIProvider, ChatFn, ChatRequest, ChatResponse } from './types';
import { OpenAICompatProvider } from './providers';

export const QWENCLOUD_GLOBAL_BASE_URL = 'https://maas.qwencloudapi.com/compatible-mode/v1';
export const DASHSCOPE_INTL_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export const DASHSCOPE_US_BASE_URL = 'https://dashscope-us.aliyuncs.com/compatible-mode/v1';

export type QwenWorkloadTier = 'flagship' | 'standard' | 'fast';
export type QwenReasoningMode = 'off' | 'low' | 'default';

export const QWEN_DEFAULT_MODELS = {
  flagship: 'qwen3.8-max',
  standard: 'qwen3.7-plus',
  fast: 'qwen3.8-flash',
  asr: 'qwen3-asr-flash',
  omniFallback: 'qwen3.8-omni-flash',
  reasoningBackup: 'deepseek-v4-pro-0813',
  fastBackup: 'deepseek-v4.1-flash',
} as const;

let cachedResolvedBaseUrl: { keyFingerprint: string; baseUrl: string } | null = null;

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

function fingerprintKey(apiKey: string): string {
  return `${apiKey.slice(0, 6)}:${apiKey.length}`;
}

/**
 * Resolves the ordered list of OpenAI-compatible endpoints to probe for an
 * Alibaba Model Studio / QwenCloud API key:
 *   - Explicit `baseUrl` wins exclusively when configured.
 *   - `sk-ws-...` Workspace / QwenCloud keys target `maas.qwencloudapi.com`
 *     first, then `dashscope-intl` (Singapore) and `dashscope-us` (Virginia).
 *   - Standard `sk-...` DashScope keys target `dashscope-intl` first, then
 *     `maas.qwencloudapi.com` and `dashscope-us`.
 */
export function resolveQwenEndpoints(apiKey: string, explicitBaseUrl?: string): string[] {
  const cleanExplicit = (explicitBaseUrl ?? '').trim();
  if (cleanExplicit) return [trimSlash(cleanExplicit)];

  const fp = fingerprintKey(apiKey);
  const candidates = apiKey.trim().startsWith('sk-ws-')
    ? [QWENCLOUD_GLOBAL_BASE_URL, DASHSCOPE_INTL_BASE_URL, DASHSCOPE_US_BASE_URL]
    : [DASHSCOPE_INTL_BASE_URL, QWENCLOUD_GLOBAL_BASE_URL, DASHSCOPE_US_BASE_URL];

  if (cachedResolvedBaseUrl && cachedResolvedBaseUrl.keyFingerprint === fp) {
    return [
      cachedResolvedBaseUrl.baseUrl,
      ...candidates.filter((u) => u !== cachedResolvedBaseUrl!.baseUrl),
    ];
  }
  return candidates;
}

/**
 * Returns the ordered model fallback cascade for a Jobiest workload tier so
 * each tier draws from its own separate 1,000,000-token free quota pool and
 * seamlessly cascades if any single model's free quota is exhausted:
 *   - `flagship`: Talent Pool Blueprint (Prompt B), Rubric Evaluation (Prompt D),
 *     and Master CV / Resume Tailoring -> `qwen3.8-max` first.
 *   - `standard`: Job Match Analysis, Cover Letters, Career Paths, Interview
 *     Prep, Follow-Up Emails -> `qwen3.7-plus` first.
 *   - `fast`: Live Candidate Interview Turns (Prompt C), Intake Extraction
 *     (Prompt A), Public Free SEO Tools, Support Chat -> `qwen3.8-flash` first.
 */
export function resolveQwenTierModels(
  tier: QwenWorkloadTier,
  overrides?: { flagship?: string; standard?: string; fast?: string },
): string[] {
  const flagship = overrides?.flagship?.trim() || QWEN_DEFAULT_MODELS.flagship;
  const standard = overrides?.standard?.trim() || QWEN_DEFAULT_MODELS.standard;
  const fast = overrides?.fast?.trim() || QWEN_DEFAULT_MODELS.fast;

  const raw =
    tier === 'flagship'
      ? [flagship, standard, QWEN_DEFAULT_MODELS.reasoningBackup, fast]
      : tier === 'standard'
        ? [standard, flagship, fast, QWEN_DEFAULT_MODELS.fastBackup]
        : [fast, QWEN_DEFAULT_MODELS.fastBackup, standard];

  return Array.from(new Set(raw.filter(Boolean)));
}

function buildReasoningKnobs(model: string, mode: QwenReasoningMode): Record<string, unknown> {
  if (mode === 'default') return {};
  if (mode === 'low' && /^qwen3\.8-(?:max|flash)/i.test(model)) {
    return { reasoning_effort: 'low' };
  }
  if (mode === 'off') {
    return { enable_thinking: false };
  }
  return {};
}

function isThinkingKnobRejection(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return /enable_thinking|reasoning_effort|thinking_budget|does not support|parameter is restricted/i.test(
    bodyText,
  );
}

/**
 * OpenAI-compatible QwenCloud / DashScope chat transport with:
 *   1. Automatic regional endpoint discovery on 401/404 (`maas.qwencloudapi.com`
 *      <-> `dashscope-intl.aliyuncs.com` <-> `dashscope-us.aliyuncs.com`).
 *   2. Token-saving `enable_thinking: false` / `reasoning_effort: 'low'` with
 *      automatic plain-body retry if a thinking-mandatory model rejects the flag.
 */
export function createQwenChatTransport(opts?: {
  endpoints?: string[];
  reasoningMode?: QwenReasoningMode;
  fetchFn?: typeof fetch;
}): ChatFn {
  const fetchImpl = opts?.fetchFn ?? fetch;
  const reasoningMode = opts?.reasoningMode ?? 'off';

  return async (req: ChatRequest): Promise<ChatResponse> => {
    const endpoints =
      opts?.endpoints && opts.endpoints.length > 0
        ? opts.endpoints.map(trimSlash)
        : resolveQwenEndpoints(req.apiKey, req.baseUrl);

    const baseBody: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
    };
    if (req.maxTokens) baseBody.max_tokens = req.maxTokens;
    if (req.responseFormat === 'json') baseBody.response_format = { type: 'json_object' };

    const knobs = buildReasoningKnobs(req.model, reasoningMode);
    let lastError: Error | null = null;

    for (let i = 0; i < endpoints.length; i += 1) {
      const endpoint = endpoints[i];
      const url = `${endpoint}/chat/completions`;

      const sendOnce = async (extra: Record<string, unknown>) =>
        fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${req.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...baseBody, ...extra }),
        });

      let res = await sendOnce(knobs);

      if (!res.ok && Object.keys(knobs).length > 0) {
        const errText = await res.text().catch(() => '');
        if (isThinkingKnobRejection(res.status, errText)) {
          res = await sendOnce({});
        } else if ((res.status === 401 || res.status === 404) && i < endpoints.length - 1) {
          lastError = new Error(`AI_PROVIDER_${res.status}`);
          continue;
        } else {
          throw new Error(`AI_PROVIDER_${res.status}`);
        }
      }

      if (!res.ok) {
        if ((res.status === 401 || res.status === 404) && i < endpoints.length - 1) {
          lastError = new Error(`AI_PROVIDER_${res.status}`);
          continue;
        }
        throw new Error(`AI_PROVIDER_${res.status}`);
      }

      cachedResolvedBaseUrl = {
        keyFingerprint: fingerprintKey(req.apiKey),
        baseUrl: endpoint,
      };

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const usage = json?.usage;
      return {
        content: json?.choices?.[0]?.message?.content ?? '',
        usage: {
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
        },
        provider: req.model,
        raw: json,
      };
    }

    throw lastError ?? new Error('AI_PROVIDER_UNAVAILABLE');
  };
}

export function buildQwenTierProviders(params: {
  apiKey: string;
  explicitBaseUrl?: string;
  tier: QwenWorkloadTier;
  basePriority?: number;
  modelOverrides?: { flagship?: string; standard?: string; fast?: string };
  fetchFn?: typeof fetch;
}): AIProvider[] {
  const cleanKey = params.apiKey.trim();
  if (!cleanKey) return [];

  const endpoints = resolveQwenEndpoints(cleanKey, params.explicitBaseUrl);
  const models = resolveQwenTierModels(params.tier, params.modelOverrides);
  const reasoningMode: QwenReasoningMode = params.tier === 'flagship' ? 'low' : 'off';
  const transport = createQwenChatTransport({
    endpoints,
    reasoningMode,
    fetchFn: params.fetchFn,
  });

  const startPriority = params.basePriority ?? 0;
  return models.map(
    (model, idx) =>
      new OpenAICompatProvider(
        {
          name: `qwen-${model}`,
          model,
          baseUrl: endpoints[0],
          apiKey: cleanKey,
          priority: startPriority + idx,
        },
        transport,
      ),
  );
}

/**
 * Multimodal Speech-to-Text via Alibaba Model Studio / QwenCloud
 * (`qwen3-asr-flash` with fallback to `qwen3.8-omni-flash`) over the
 * OpenAI-compatible `/chat/completions` `input_audio` Data-URI contract.
 */
export async function transcribeWithQwenAsr(params: {
  apiKey: string;
  audioBytes: Buffer;
  mimeType?: string;
  explicitBaseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
}): Promise<{ supported: boolean; transcript: string; confidence: number; provider: string } | null> {
  const cleanKey = params.apiKey.trim();
  if (!cleanKey || params.audioBytes.length === 0) return null;

  const fetchImpl = params.fetchFn ?? fetch;
  const endpoints = resolveQwenEndpoints(cleanKey, params.explicitBaseUrl);
  const mime = params.mimeType && params.mimeType.startsWith('audio/') ? params.mimeType : 'audio/wav';
  const dataUri = `data:${mime};base64,${params.audioBytes.toString('base64')}`;
  const models = Array.from(
    new Set([params.model?.trim() || QWEN_DEFAULT_MODELS.asr, QWEN_DEFAULT_MODELS.omniFallback]),
  );

  for (const endpoint of endpoints) {
    for (const model of models) {
      const body =
        model.includes('asr')
          ? {
              model,
              stream: false,
              messages: [
                {
                  role: 'user',
                  content: [{ type: 'input_audio', input_audio: { data: dataUri } }],
                },
              ],
            }
          : {
              model,
              stream: false,
              enable_thinking: false,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'input_audio', input_audio: { data: dataUri } },
                    {
                      type: 'text',
                      text: 'Transcribe the spoken audio verbatim in English. Output only the spoken words with no commentary.',
                    },
                  ],
                },
              ],
            };

      try {
        const res = await fetchImpl(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) {
          if (res.status === 401) break; // Try next regional endpoint
          continue; // Try fallback model on same endpoint
        }
        const json = (await res.json()) as {
          choices?: Array<{
            message?: {
              content?: string | Array<{ type?: string; text?: string }>;
            };
          }>;
        };
        const rawContent = json?.choices?.[0]?.message?.content;
        const transcript =
          typeof rawContent === 'string'
            ? rawContent.trim()
            : Array.isArray(rawContent)
              ? rawContent
                  .map((p) => (typeof p?.text === 'string' ? p.text : ''))
                  .join(' ')
                  .trim()
              : '';
        if (transcript) {
          cachedResolvedBaseUrl = {
            keyFingerprint: fingerprintKey(cleanKey),
            baseUrl: endpoint,
          };
          return {
            supported: true,
            transcript,
            confidence: 0.91,
            provider: `qwen-${model}`,
          };
        }
      } catch {
        // Fall through to next model/endpoint cleanly.
      }
    }
  }
  return null;
}

export function resetQwenEndpointCacheForTests(): void {
  cachedResolvedBaseUrl = null;
}
