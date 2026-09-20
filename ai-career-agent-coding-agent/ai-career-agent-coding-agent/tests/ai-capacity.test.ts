import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Capacity work (2026-09-20, owner mandate: 1000 users must not break the
 * backend). The AI layer is protected by BoundedProvider: at most
 * AI_MAX_CONCURRENCY provider calls run at once per instance; the rest queue
 * FIFO. This suite proves the 1000-request property at the unit level:
 * 1000 concurrent requests all complete, none are dropped or duplicated,
 * and the concurrency cap is never exceeded.
 */

const m = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: m.from } }));

import { BoundedProvider, AIConcurrencyTimeoutError } from '@/lib/ai/server';
import type { AIProvider, AIMessage, ChatResponse } from '@packages/ai/types';

function delayProvider(ms: number) {
  const state = { inFlight: 0, maxInFlight: 0, calls: 0 };
  const provider: AIProvider = {
    name: 'test-llm',
    model: 'test-model',
    priority: 0,
    async chat(messages: AIMessage[]): Promise<ChatResponse> {
      state.calls += 1;
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await new Promise((r) => setTimeout(r, ms));
      state.inFlight -= 1;
      return { content: JSON.stringify({ ok: true, echo: messages.length }), provider: 'test-llm' };
    },
  };
  return { provider, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  });
});

describe('BoundedProvider under 1000 concurrent requests', () => {
  it('processes 1000 concurrent calls with the cap never exceeded and none dropped', async () => {
    const { provider, state } = delayProvider(2);
    const bounded = new BoundedProvider(provider, 8);
    const N = 1000;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        bounded.chat([{ role: 'user', content: `request ${i}` }], { responseFormat: 'json' }),
      ),
    );
    expect(results).toHaveLength(N);
    for (const r of results) expect(r.provider).toBe('test-llm');
    expect(state.calls).toBe(N); // none duplicated, none dropped
    expect(state.maxInFlight).toBeLessThanOrEqual(8); // inner never overloaded
    expect(bounded.stats().active).toBe(0);
    expect(bounded.stats().queued).toBe(0);
  });

  it('keeps the wrapper transparent (name, model, priority, response payload)', async () => {
    const { provider } = delayProvider(1);
    const bounded = new BoundedProvider(provider, 4);
    expect(bounded.name).toBe('test-llm');
    expect(bounded.model).toBe('test-model');
    expect(bounded.priority).toBe(0);
    const res = await bounded.chat([{ role: 'user', content: 'x' }]);
    expect(JSON.parse(res.content)).toEqual({ ok: true, echo: 1 });
  });

  it('propagates provider errors so the gateway can fall back', async () => {
    const failing: AIProvider = {
      name: 'failing',
      priority: 0,
      chat: async () => {
        throw new Error('provider down');
      },
    };
    const bounded = new BoundedProvider(failing, 2);
    await expect(bounded.chat([{ role: 'user', content: 'x' }])).rejects.toThrow('provider down');
    // the slot must be released after a failure
    expect(bounded.stats().active).toBe(0);
  });

  it('rejects queued callers after the wait timeout (no infinite queueing)', async () => {
    const { provider } = delayProvider(80);
    const bounded = new BoundedProvider(provider, 1, 15);
    const first = bounded.chat([{ role: 'user', content: 'a' }]);
    await expect(bounded.chat([{ role: 'user', content: 'b' }])).rejects.toBeInstanceOf(AIConcurrencyTimeoutError);
    await first; // the in-flight call still completes
    expect(bounded.stats().active).toBe(0);
  });
});

describe('buildGatewayForUser platform fallback (disaster switch)', () => {
  // lib/env parses process.env at import time, so each scenario reloads the
  // server module with the env it needs (module mocks stay in effect).
  async function loadServer() {
    vi.resetModules();
    return await import('@/lib/ai/server');
  }

  it('throws AICredentialMissingError with no ollama, no user creds, no platform key', async () => {
    process.env.OPENROUTER_API_KEY = '';
    process.env.OLLAMA_BASE_URL = '';
    process.env.CLOUDFLARE_ACCOUNT_ID = '';
    process.env.CLOUDFLARE_API_TOKEN = '';
    try {
      const server = await loadServer();
      await expect(server.buildGatewayForUser('u1')).rejects.toBeInstanceOf(server.AICredentialMissingError);
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;
    }
  });

  it('builds a gateway from the platform OpenRouter key alone (VM down scenario)', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-platform-key';
    process.env.OLLAMA_BASE_URL = '';
    process.env.CLOUDFLARE_ACCOUNT_ID = '';
    process.env.CLOUDFLARE_API_TOKEN = '';
    try {
      const server = await loadServer();
      const gw = await server.buildGatewayForUser('u1');
      expect(gw).toBeTruthy();
    } finally {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;
    }
  });

  it('builds a gateway from Cloudflare Workers AI alone (no ollama, no openrouter)', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id';
    process.env.CLOUDFLARE_API_TOKEN = 'cfat-test-token';
    process.env.OLLAMA_BASE_URL = '';
    process.env.OPENROUTER_API_KEY = '';
    try {
      const server = await loadServer();
      expect(server.cloudflareConfigured()).toBe(true);
      const gw = await server.buildGatewayForUser('u1');
      const providers = (gw as unknown as { providers: { name: string; priority: number }[] }).providers;
      expect(providers.map((p) => p.name)).toEqual(['cloudflare-platform']);
    } finally {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it('is not configured when only one of account id / token is set', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id';
    process.env.CLOUDFLARE_API_TOKEN = '';
    process.env.OPENROUTER_API_KEY = '';
    process.env.OLLAMA_BASE_URL = '';
    try {
      const server = await loadServer();
      expect(server.cloudflareConfigured()).toBe(false);
      await expect(server.buildGatewayForUser('u1')).rejects.toBeInstanceOf(server.AICredentialMissingError);
    } finally {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it('orders the chain ollama -> cloudflare -> openrouter (platform tiers)', async () => {
    process.env.OLLAMA_BASE_URL = 'https://ollama.example.test';
    process.env.OLLAMA_MODEL = 'qwen2.5:7b';
    process.env.OLLAMA_FALLBACK_MODEL = 'llama3.2:3b';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id';
    process.env.CLOUDFLARE_API_TOKEN = 'cfat-test-token';
    process.env.CLOUDFLARE_MODEL = '@cf/openai/gpt-oss-120b';
    process.env.OPENROUTER_API_KEY = 'sk-test-platform-key';
    try {
      const server = await loadServer();
      const gw = await server.buildGatewayForUser('u1');
      const providers = (gw as unknown as { providers: { name: string; priority: number; model?: string }[] })
        .providers;
      expect(providers.map((p) => p.name)).toEqual([
        'ollama',
        'ollama-fallback',
        'cloudflare-platform',
        'openrouter-platform',
      ]);
      expect(providers.map((p) => p.priority)).toEqual([0, 1, 2, 3]);
      const cf = providers.find((p) => p.name === 'cloudflare-platform');
      expect(cf?.model).toBe('@cf/openai/gpt-oss-120b');
    } finally {
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.OLLAMA_MODEL;
      delete process.env.OLLAMA_FALLBACK_MODEL;
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;
      delete process.env.CLOUDFLARE_MODEL;
      delete process.env.OPENROUTER_API_KEY;
    }
  });
});
