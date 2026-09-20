import { supabaseAdmin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { decryptSecret } from '@packages/security/crypto';
import { AIGateway, AIGatewayError } from '@packages/ai/gateway';
import { OpenAICompatProvider, OllamaProvider, httpChat } from '@packages/ai/providers';
import type { AIProvider, AIMessage, ChatResponse, UsageMeter } from '@packages/ai/types';
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
function buildOllamaProviders(): AIProvider[] {
  if (!ollamaConfigured()) return [];
  const providers: AIProvider[] = [
    new OllamaProvider({
      name: 'ollama',
      model: env.OLLAMA_MODEL,
      baseUrl: env.OLLAMA_BASE_URL,
      apiKey: env.OLLAMA_API_KEY,
      priority: 0,
    }),
  ];
  if (env.OLLAMA_FALLBACK_MODEL && env.OLLAMA_FALLBACK_MODEL !== env.OLLAMA_MODEL) {
    providers.push(
      new OllamaProvider({
        name: 'ollama-fallback',
        model: env.OLLAMA_FALLBACK_MODEL,
        baseUrl: env.OLLAMA_BASE_URL,
        apiKey: env.OLLAMA_API_KEY,
        priority: 1,
      }),
    );
  }
  return providers;
}

/** True when the Cloudflare Workers AI fallback is configured. */
export function cloudflareConfigured(): boolean {
  return env.CLOUDFLARE_ACCOUNT_ID.trim().length > 0 && env.CLOUDFLARE_API_TOKEN.trim().length > 0;
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
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(
    private readonly inner: AIProvider,
    private readonly limit: number,
    private readonly waitTimeoutMs = 120_000,
  ) {
    this.name = inner.name;
    this.model = inner.model;
    this.priority = inner.priority;
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(wakeup);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new AIConcurrencyTimeoutError());
      }, this.waitTimeoutMs);
      const wakeup = () => {
        clearTimeout(timer);
        resolve();
      };
      this.waiters.push(wakeup);
    });
  }

  private release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active -= 1;
  }

  /** Snapshot for tests: current in-flight calls and queued waiters. */
  stats(): { active: number; queued: number } {
    return { active: this.active, queued: this.waiters.length };
  }

  async chat(
    messages: AIMessage[],
    opts?: { temperature?: number; responseFormat?: 'json' | 'text'; maxTokens?: number },
  ): Promise<ChatResponse> {
    await this.acquire();
    try {
      return await this.inner.chat(messages, opts);
    } finally {
      this.release();
    }
  }
}

/** Wrap each provider with the global concurrency bound (env-tunable). */
function boundProviders(providers: AIProvider[]): AIProvider[] {
  const limit = env.AI_MAX_CONCURRENCY;
  return providers.map((p) => new BoundedProvider(p, limit));
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
export async function buildGatewayForUser(userId: string): Promise<AIGateway> {
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
    !cloudflareConfigured() &&
    !env.OPENROUTER_API_KEY
  ) {
    throw new AICredentialMissingError();
  }

  const providers: AIProvider[] = [...ollama];
  let priority = ollama.length;
  let skipped = 0;

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
      assertPublicHttpsUrl(c.base_url);
    } catch {
      // Egress policy violation: never fetch this target, never log the URL.
      skipped += 1;
      continue;
    }
    const apiKey = decryptSecret(c.ciphertext);
    providers.push(
      new OpenAICompatProvider(
        {
          name: c.provider,
          model: c.model,
          baseUrl: c.base_url,
          apiKey,
          priority: priority++,
        },
        httpChat,
      ),
    );
  }
  if (providers.length === 0) throw new AICredentialMissingError();
  if (
    skipped > 0 &&
    providers.length === ollama.length &&
    skipped === (creds?.length ?? 0) &&
    !cloudflareConfigured() &&
    !env.OPENROUTER_API_KEY
  ) {
    throw new AICredentialMissingError();
  }
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
  return {
    async reserve() {
      const { error } = await supabaseAdmin.rpc('consume_ai_credit', { p_user_id: userId });
      if (error) {
        if (error.message.includes('AI_QUOTA_EXHAUSTED')) {
          throw new AIGatewayError('AI_QUOTA_EXHAUSTED', 'AI document limit reached for your plan.');
        }
        throw error;
      }
    },
    async refund() {
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
  return {
    async reserve() {
      const { error } = await supabaseAdmin.rpc('consume_tool_use', { p_user_id: userId });
      if (error) {
        if (error.message.includes('TOOL_QUOTA_EXHAUSTED')) {
          throw new AIGatewayError('TOOL_QUOTA_EXHAUSTED', 'Daily free-tool limit reached.');
        }
        throw error;
      }
    },
    async refund() {
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
  };
}
