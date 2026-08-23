import { supabaseAdmin } from '@/lib/supabase';
import { decryptSecret } from '@packages/security/crypto';
import { AIGateway, AIGatewayError } from '@packages/ai/gateway';
import { OpenAICompatProvider, httpChat } from '@packages/ai/providers';
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

/**
 * Build a gateway for a user from their active ai_credentials rows. Credentials
 * are decrypted here (server-only) and never logged. Rows are ordered by
 * key_version desc then created_at desc, so the newest/most-trusted key is the
 * primary and older keys form the fallback chain (ARCHITECTURE §13).
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
  if (!creds || creds.length === 0) throw new AICredentialMissingError();

  const providers: AIProvider[] = (creds as CredentialRow[]).map((c, idx) => {
    const apiKey = decryptSecret(c.ciphertext);
    return new OpenAICompatProvider(
      {
        name: c.provider,
        model: c.model,
        baseUrl: c.base_url,
        apiKey,
        priority: idx,
      },
      httpChat,
    );
  });
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
