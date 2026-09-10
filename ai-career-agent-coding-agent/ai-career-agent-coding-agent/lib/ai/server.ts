import { supabaseAdmin } from '@/lib/supabase';
import { env } from '@/lib/env';
import { decryptSecret } from '@packages/security/crypto';
import { AIGateway, AIGatewayError } from '@packages/ai/gateway';
import { OpenAICompatProvider, OllamaProvider, httpChat } from '@packages/ai/providers';
import type { AIProvider, UsageMeter } from '@packages/ai/types';

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

/**
 * Build a gateway for a user. Provider order (ARCHITECTURE §13):
 *   1. Ollama strong model (env-configured, when present)
 *   2. Ollama fallback model (env-configured, when different)
 *   3. the user's active ai_credentials rows, newest key first
 *
 * Credentials are decrypted here (server-only) and never logged.
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
  if ((!creds || creds.length === 0) && ollama.length === 0) throw new AICredentialMissingError();

  const providers: AIProvider[] = [...ollama];
  let priority = ollama.length;
  for (const c of (creds ?? []) as CredentialRow[]) {
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
  return new AIGateway(providers);
}

/**
 * Daily-AI-credit meter backed by the consume_ai_credit RPC (atomic
 * check+increment with FOR UPDATE locking) and a best-effort refund.
 */
export function createUsageMeter(userId: string): UsageMeter {
  return {
    async reserve() {
      const { error } = await supabaseAdmin.rpc('consume_ai_credit', { p_user_id: userId });
      if (error) {
        if (error.message.includes('AI_QUOTA_EXHAUSTED')) {
          throw new AIGatewayError('AI_QUOTA_EXHAUSTED', 'Daily AI credit limit reached.');
        }
        throw error;
      }
    },
    async refund() {
      // Best-effort decrement; never throws (callers ignore refund failures).
      try {
        const today = new Date().toISOString().slice(0, 10);
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
    },
  };
}

/**
 * Daily free-career-tool meter backed by the consume_tool_use RPC (atomic,
 * FOR UPDATE). Tools are free for everyone: FREE gets 10 uses/day, BASIC 50,
 * PREMIUM/MAX unlimited (enforced in SQL). Used by the 10 career-tool routes
 * instead of the document-credit meter, so the free tier's 3 daily documents
 * stay reserved for resumes, cover letters and answers.
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
