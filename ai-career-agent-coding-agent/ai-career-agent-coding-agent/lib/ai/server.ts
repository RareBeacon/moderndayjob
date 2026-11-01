import { supabaseAdmin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { decryptSecret } from '@packages/security/crypto';
import { AIGateway, AIGatewayError } from '@packages/ai/gateway';
import { OpenAICompatProvider, OllamaProvider, httpChat } from '@packages/ai/providers';
import {
  buildQwenTierProviders,
  createQwenChatTransport,
  getResolvedQwenEndpointHost,
  type QwenWorkloadTier,
} from '@packages/ai/qwen';
import type { AIProvider, AIMessage, ChatResponse, UsageMeter } from '@packages/ai/types';
import { consumeCredit, CreditExhaustedError, ensurePeriodGrants, ledgerEnabled, releaseCredit, reserveCredit } from '@/lib/credits';
import { assertPublicHttpsUrl } from '@/lib/agent/egress';

/** Thrown when the user has no active AI credential configured. */
export class AICredentialMissingError extends Error {
  constructor() {
    super('AI_CREDENTIAL_NOT_CONFIGURED');
    this.name = 'AICredentialMissingError';
  }
}

interface CredentialRow {
  provider: string;
  model: string;
  base_url: string;
  ciphertext: string;
  key_version: number;
}

/** True when a self-hosted Ollama endpoint is configured (Ollama-first mode). */
export function ollamaConfigured(): boolean {
  return env.OLLAMA_BASE_URL.trim().length > 0;
}

/**
 * The local provider chain: the strongest practical model first, the lighter
 * local fallback second (spec §4). Both hit the same secret-gated gateway.
 */
function buildOllamaProviders(basePriority = 0): AIProvider[] {
  if (!ollamaConfigured()) return [];
  const providers: AIProvider[] = [
    new OllamaProvider({
      name: 'ollama',
      model: env.OLLAMA_MODEL,
      baseUrl: env.OLLAMA_BASE_URL,
      apiKey: env.OLLAMA_API_KEY,
      priority: basePriority,
    }),
  ];
  if (env.OLLAMA_FALLBACK_MODEL && env.OLLAMA_FALLBACK_MODEL !== env.OLLAMA_MODEL) {
    providers.push(
      new OllamaProvider({
        name: 'ollama-fallback',
        model: env.OLLAMA_FALLBACK_MODEL,
        baseUrl: env.OLLAMA_BASE_URL,
        apiKey: env.OLLAMA_API_KEY,
        priority: basePriority + 1,
      }),
    );
  }
  return providers;
}

/** True when the Cloudflare Workers AI fallback is configured. */
export function cloudflareConfigured(): boolean {
  return env.CLOUDFLARE_ACCOUNT_ID.trim().length > 0 && env.CLOUDFLARE_API_TOKEN.trim().length > 0;
}

const QWEN_ALLOWED_ENV_NAMES = [
  'QWENCLOUD_API_KEY',
  'DASHSCOPE_API_KEY',
  'QWEN_API_KEY',
  'QWENCLOUD_BASE_URL',
  'DASHSCOPE_BASE_URL',
  'QWEN_BASE_URL',
  'QWEN_MODEL_FLAGSHIP',
  'QWEN_FLAGSHIP_MODEL',
  'QWEN_MODEL_STANDARD',
  'QWEN_STANDARD_MODEL',
  'QWEN_MODEL_FAST',
  'QWEN_FAST_MODEL',
  'QWEN_MODEL_ASR',
  'QWEN_ASR_MODEL',
] as const;

/** Active Alibaba QwenCloud / DashScope API key, if configured. */
export function qwenApiKey(): string {
  return (env.QWENCLOUD_API_KEY || env.DASHSCOPE_API_KEY || env.QWEN_API_KEY).trim();
}

/** Explicit QwenCloud / DashScope base URL override, if configured. */
export function qwenBaseUrl(): string {
  return (env.QWENCLOUD_BASE_URL || env.DASHSCOPE_BASE_URL || env.QWEN_BASE_URL).trim();
}

/** Resolved Qwen model IDs across flagship, standard, fast, and ASR tiers. */
export function qwenModelConfig(): {
  flagship: string;
  standard: string;
  fast: string;
  asr: string;
} {
  return {
    flagship: (env.QWEN_MODEL_FLAGSHIP || env.QWEN_FLAGSHIP_MODEL || 'qwen3.8-max').trim(),
    standard: (env.QWEN_MODEL_STANDARD || env.QWEN_STANDARD_MODEL || 'qwen3.7-plus').trim(),
    fast: (env.QWEN_MODEL_FAST || env.QWEN_FAST_MODEL || 'qwen3.8-flash').trim(),
    asr: (env.QWEN_MODEL_ASR || env.QWEN_ASR_MODEL || 'qwen3-asr-flash').trim(),
  };
}

/**
 * Returns ONLY the allowlisted Qwen environment variable NAMES (never values)
 * that are currently non-empty in `process.env`.
 */
export function qwenEnvVarsPresent(): string[] {
  return QWEN_ALLOWED_ENV_NAMES.filter((name) => Boolean(process.env[name]?.trim()));
}

/** Active Qwen endpoint hostname (e.g. `maas.qwencloudapi.com`) without secrets. */
export function qwenEndpointHost(): string | null {
  const key = qwenApiKey();
  if (!key) return null;
  return getResolvedQwenEndpointHost(key, qwenBaseUrl());
}

/** True when Alibaba Model Studio / QwenCloud is configured via env. */
export function qwenConfigured(): boolean {
  return qwenApiKey().length > 0;
}

export function buildQwenPlatformProviders(
  tier: QwenWorkloadTier,
  basePriority = 0,
): AIProvider[] {
  const key = qwenApiKey();
  if (!key) return [];
  const models = qwenModelConfig();
  return buildQwenTierProviders({
    apiKey: key,
    explicitBaseUrl: qwenBaseUrl(),
    tier,
    basePriority,
    modelOverrides: {
      flagship: models.flagship,
      standard: models.standard,
      fast: models.fast,
    },
  });
}

/**
 * Base URL of Cloudflare Workers AI's OpenAI-compatible endpoint. The account
 * id is embedded in the path (not a secret); the token authenticates as a
 * Bearer header via the standard httpChat transport.
 */
function cloudflareBaseUrl(): string {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID.trim()}/ai/v1`;
}

/** Thrown when a caller waits too long in the concurrency queue. */
export class AIConcurrencyTimeoutError extends Error {
  constructor() {
    super('AI_CONCURRENCY_TIMEOUT');
    this.name = 'AIConcurrencyTimeoutError';
  }
}

class ProviderSemaphore {
  active = 0;
  readonly waiters: (() => void)[] = [];

  constructor(readonly limit: number) {}

  acquire(waitTimeoutMs: number): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(wakeup);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new AIConcurrencyTimeoutError());
      }, waitTimeoutMs);
      const wakeup = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(wakeup);
    });
  }

  release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active -= 1;
  }
}

const providerSemaphores = new Map<string, ProviderSemaphore>();

function getSharedSemaphore(key: string, limit: number): ProviderSemaphore {
  const existing = providerSemaphores.get(key);
  if (existing && existing.limit === limit) return existing;
  const created = new ProviderSemaphore(limit);
  providerSemaphores.set(key, created);
  return created;
}

/**
 * Concurrency-bounded provider wrapper (2026-09-20 capacity work). At most
 * `limit` provider calls run at once per server instance; the rest queue in
 * FIFO order. This keeps a burst of users from overloading the self-hosted
 * model host (the single Oracle VM) with parallel inferences: requests wait
 * their turn instead of failing or degrading the host. A provider error
 * (including queue timeout) propagates so the gateway falls back to the
 * next provider in the chain.
 */
export class BoundedProvider implements AIProvider {
  readonly name: string;
  readonly model?: string;
  readonly priority: number;
  private readonly sem: ProviderSemaphore;

  constructor(
    private readonly inner: AIProvider,
    limit: number,
    private readonly waitTimeoutMs = 120_000,
    sharedSemaphore?: ProviderSemaphore,
  ) {
    this.name = inner.name;
    this.model = inner.model;
    this.priority = inner.priority;
    this.sem = sharedSemaphore ?? new ProviderSemaphore(limit);
  }

  /** Snapshot for tests: current in-flight calls and queued waiters. */
  stats(): { active: number; queued: number } {
    return { active: this.sem.active, queued: this.sem.waiters.length };
  }

  async chat(
    messages: AIMessage[],
    opts?: { temperature?: number; responseFormat?: 'json' | 'text'; maxTokens?: number },
  ): Promise<ChatResponse> {
    await this.sem.acquire(this.waitTimeoutMs);
    try {
      return await this.inner.chat(messages, opts);
    } finally {
      this.sem.release();
    }
  }
}

/** Wrap each provider with the shared server-wide concurrency bound (env-tunable). */
function boundProviders(providers: AIProvider[]): AIProvider[] {
  const limit = env.AI_MAX_CONCURRENCY;
  return providers.map((p) => {
    const key = `${p.name}:${p.model ?? ''}:${limit}`;
    return new BoundedProvider(p, limit, 120_000, getSharedSemaphore(key, limit));
  });
}

/**
 * Build a gateway for a user. Provider order (ARCHITECTURE §13):
 *   1. Ollama strong model (env-configured, when present)
 *   2. Ollama fallback model (env-configured, when different)
 *   3. the Cloudflare Workers AI platform fallback (env CLOUDFLARE_ACCOUNT_ID
 *      + CLOUDFLARE_API_TOKEN, when both are set)
 *   4. the platform OpenRouter fallback (env OPENROUTER_API_KEY, when set)
 *   5. the user's active ai_credentials rows, newest key first
 *
 * Credentials are decrypted here (server-only) and never logged.
 * Every base URL (env Ollama AND user-supplied credentials) passes the
 * egress guard (B-223): a private/loopback/metadata target fails closed.
 */
export async function buildGatewayForUser(
  userId: string,
  opts?: { tier?: QwenWorkloadTier },
): Promise<AIGateway> {
  const { data: creds, error } = await supabaseAdmin
    .from('ai_credentials')
    .select('provider, model, base_url, ciphertext, key_version')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('key_version', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  const ollama = buildOllamaProviders();
  if (
    (!creds || creds.length === 0) &&
    ollama.length === 0 &&
    !qwenConfigured() &&
    !cloudflareConfigured() &&
    !env.OPENROUTER_API_KEY
  ) {
    throw new AICredentialMissingError();
  }

  const providers: AIProvider[] = [];
  let priority = 0;
  let skipped = 0;

  // Alibaba Cloud Model Studio / QwenCloud multi-model cascade runs FIRST when
  // configured so flagship (`qwen3.8-max`), standard (`qwen3.7-plus`), and fast
  // (`qwen3.8-flash`) tiers outperform slow 7B self-hosted fallbacks while
  // keeping Ollama, Cloudflare, and OpenRouter intact behind them.
  if (qwenConfigured()) {
    const qwenProviders = buildQwenPlatformProviders(opts?.tier ?? 'standard', priority);
    providers.push(...qwenProviders);
    priority += qwenProviders.length;
  }

  for (const p of buildOllamaProviders(priority)) {
    providers.push(p);
    priority += 1;
  }

  // Cloudflare Workers AI platform fallback: serves inference when the
  // self-hosted Ollama VM is unavailable, ahead of the OpenRouter disaster
  // switch. OpenAI-compatible transport, so it reuses httpChat unchanged.
  if (cloudflareConfigured()) {
    providers.push(
      new OpenAICompatProvider(
        {
          name: 'cloudflare-platform',
          model: env.CLOUDFLARE_MODEL,
          baseUrl: cloudflareBaseUrl(),
          apiKey: env.CLOUDFLARE_API_TOKEN,
          priority: priority++,
        },
        httpChat,
      ),
    );
  }

  // Platform fallback (disaster switch): keeps AI alive if the Ollama VM is
  // unreachable (e.g. host expiry). Last in the chain so self-hosted wins.
  if (env.OPENROUTER_API_KEY) {
    providers.push(
      new OpenAICompatProvider(
        {
          name: 'openrouter-platform',
          model: env.OPENROUTER_MODEL || 'openrouter/auto',
          baseUrl: env.OPENROUTER_BASE_URL,
          apiKey: env.OPENROUTER_API_KEY,
          priority: priority++,
        },
        httpChat,
      ),
    );
  }

  for (const c of (creds ?? []) as CredentialRow[]) {
    try {
      assertPublicHttpsUrl(c.base_url, { requireHttps: true });
    } catch {
      // Egress policy violation: never fetch this target, never log the URL.
      skipped += 1;
      continue;
    }
    const apiKey = decryptSecret(c.ciphertext);
    const isQwenCred = c.provider === 'qwencloud' || c.provider === 'dashscope';
    providers.push(
      new OpenAICompatProvider(
        {
          name: c.provider,
          model: c.model,
          baseUrl: c.base_url,
          apiKey,
          priority: priority++,
        },
        isQwenCred
          ? createQwenChatTransport({
              endpoints: [c.base_url],
              reasoningMode: opts?.tier === 'flagship' ? 'low' : 'off',
            })
          : httpChat,
      ),
    );
  }
  if (providers.length === 0) throw new AICredentialMissingError();
  if (
    skipped > 0 &&
    providers.length === ollama.length &&
    skipped === (creds?.length ?? 0) &&
    !qwenConfigured() &&
    !cloudflareConfigured() &&
    !env.OPENROUTER_API_KEY
  ) {
    throw new AICredentialMissingError();
  }
  return new AIGateway(boundProviders(providers));
}

/**
 * Gateway for the live support chat. Chat needs fast replies: the self-hosted
 * Ollama chain can take over a minute per turn, which reads as broken in a
 * chat window. Cloudflare Workers AI goes first when configured, then the
 * standard Ollama -> OpenRouter platform chain as fallback. Support never
 * uses visitor AI credentials.
 */
export function buildSupportGateway(): AIGateway {
  const providers: AIProvider[] = [];
  if (qwenConfigured()) {
    providers.push(...buildQwenPlatformProviders('fast', providers.length));
  }
  if (cloudflareConfigured()) {
    providers.push(
      new OpenAICompatProvider(
        {
          name: 'cloudflare-support',
          model: env.CLOUDFLARE_MODEL,
          baseUrl: cloudflareBaseUrl(),
          apiKey: env.CLOUDFLARE_API_TOKEN,
          priority: providers.length,
        },
        httpChat,
      ),
    );
  }
  providers.push(...buildOllamaProviders(providers.length));
  if (env.OPENROUTER_API_KEY) {
    providers.push(
      new OpenAICompatProvider(
        {
          name: 'openrouter-support',
          model: env.OPENROUTER_MODEL || 'openrouter/auto',
          baseUrl: env.OPENROUTER_BASE_URL,
          apiKey: env.OPENROUTER_API_KEY,
          priority: providers.length,
        },
        httpChat,
      ),
    );
  }
  if (providers.length === 0) throw new AICredentialMissingError();
  return new AIGateway(boundProviders(providers));
}

/**
 * AI-document meter backed by the consume_ai_credit RPC (atomic check+increment
 * with FOR UPDATE locking) and a best-effort refund. Quota model v2: FREE gets
 * 3 documents LIFETIME (usage_lifetime.docs_used); paid plans get a DAILY
 * allowance (usage_daily.ai_used). The RPC enforces both; the refund below
 * restores whichever counter was consumed.
 */
export function createUsageMeter(userId: string): UsageMeter {
  // Milestone 2 credit ledger: one reference per meter (per request). The
  // ledger HOLDS a DOCUMENT credit at reserve, CONSUMES at commit (the
  // generation succeeded and persisted), RELEASES at refund. All ledger
  // calls are inert until ENTITLEMENTS_LEDGER=true, so the parallel-run
  // phase changes nothing for users.
  const ledgerRef = `doc:${crypto.randomUUID()}`;
  let legacyRefunded = false;

  const legacyReserve = async (): Promise<void> => {
    const { error } = await supabaseAdmin.rpc('consume_ai_credit', { p_user_id: userId });
    if (error) {
      legacyRefunded = true;
      if (error.message.includes('AI_QUOTA_EXHAUSTED')) {
        throw new AIGatewayError('AI_QUOTA_EXHAUSTED', 'AI document limit reached for your plan.');
      }
      throw error;
    }
    legacyRefunded = false;
  };

  const legacyRefund = async (): Promise<void> => {
    if (legacyRefunded) return;
    legacyRefunded = true;
    // Best-effort decrement of both counters; never throws (callers ignore
    // refund failures). Each block is independent and clamped at zero, so a
    // missing row (e.g. lifetime row for a paid user) is a harmless no-op.
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { data } = await supabaseAdmin
        .from('usage_daily')
        .select('ai_used')
        .eq('user_id', userId)
        .eq('day', today)
        .single();
      const used = Math.max(0, (data?.ai_used ?? 1) - 1);
      await supabaseAdmin
        .from('usage_daily')
        .update({ ai_used: used })
        .eq('user_id', userId)
        .eq('day', today);
    } catch {
      /* refund is best-effort */
    }
    try {
      const { data } = await supabaseAdmin
        .from('usage_lifetime')
        .select('docs_used')
        .eq('user_id', userId)
        .single();
      if (data) {
        const used = Math.max(0, ((data as { docs_used?: number }).docs_used ?? 1) - 1);
        await supabaseAdmin.from('usage_lifetime').update({ docs_used: used }).eq('user_id', userId);
      }
    } catch {
      /* refund is best-effort */
    }
  };

  return {
    async reserve() {
      await legacyReserve();
      if (ledgerEnabled()) {
        try {
          await reserveCredit(userId, 'DOCUMENT', ledgerRef);
        } catch (err) {
          if (err instanceof CreditExhaustedError) {
            const granted = await ensurePeriodGrants(userId).catch(() => 0);
            if (typeof granted === 'number' && granted > 0) {
              try {
                await reserveCredit(userId, 'DOCUMENT', ledgerRef);
                return;
              } catch (retryErr) {
                await legacyRefund();
                if (retryErr instanceof CreditExhaustedError) {
                  throw new AIGatewayError('AI_QUOTA_EXHAUSTED', 'Document credit limit reached for your plan.');
                }
                throw retryErr;
              }
            }
          }
          await legacyRefund();
          if (err instanceof CreditExhaustedError) {
            throw new AIGatewayError('AI_QUOTA_EXHAUSTED', 'Document credit limit reached for your plan.');
          }
          throw err;
        }
      }
    },
    async commit() {
      if (!ledgerEnabled()) return;
      // Best-effort like refund: a failure here must not turn a persisted,
      // successful generation into a 500. Logged loudly for follow-up.
      try {
        await consumeCredit(userId, 'DOCUMENT', ledgerRef);
      } catch (err) {
        console.error('ledger commit failed', { userId, ledgerRef, err: String(err).slice(0, 200) });
      }
    },
    async refund() {
      await legacyRefund();
      if (ledgerEnabled()) {
        await releaseCredit(userId, 'DOCUMENT', ledgerRef).catch(() => {});
      }
    },
  };
}

/**
 * Daily free-career-tool meter backed by the consume_tool_use RPC (atomic,
 * FOR UPDATE). Tools are free for everyone: FREE gets 10 uses/day, BASIC 50,
 * PREMIUM/MAX unlimited (enforced in SQL). Used by the 10 career-tool routes
 * instead of the document-credit meter, so the free tier's 3 lifetime
 * documents stay reserved for resumes, cover letters and answers.
 */
export function createToolMeter(userId: string): UsageMeter {
  let toolRefunded = false;
  return {
    async reserve() {
      const { error } = await supabaseAdmin.rpc('consume_tool_use', { p_user_id: userId });
      if (error) {
        toolRefunded = true;
        if (error.message.includes('TOOL_QUOTA_EXHAUSTED')) {
          throw new AIGatewayError('TOOL_QUOTA_EXHAUSTED', 'Daily free-tool limit reached.');
        }
        throw error;
      }
      toolRefunded = false;
    },
    async refund() {
      if (toolRefunded) return;
      toolRefunded = true;
      // Best-effort decrement; never throws.
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data } = await supabaseAdmin
          .from('usage_daily')
          .select('tools_used')
          .eq('user_id', userId)
          .eq('day', today)
          .single();
        const used = Math.max(0, (data?.tools_used ?? 1) - 1);
        await supabaseAdmin
          .from('usage_daily')
          .update({ tools_used: used })
          .eq('user_id', userId)
          .eq('day', today);
      } catch {
        /* refund is best-effort */
      }
    },
    async commit() {
      // Free-tool uses are not ledger document credits; nothing to commit.
    },
  };
}
