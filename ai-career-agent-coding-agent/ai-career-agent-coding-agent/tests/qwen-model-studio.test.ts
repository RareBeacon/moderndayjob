import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: dbMock.from } }));

import { AIGateway } from '@packages/ai/gateway';
import {
  DASHSCOPE_INTL_BASE_URL,
  QWENCLOUD_GLOBAL_BASE_URL,
  buildQwenTierProviders,
  createQwenChatTransport,
  resetQwenEndpointCacheForTests,
  resolveQwenEndpoints,
  resolveQwenTierModels,
  transcribeWithQwenAsr,
} from '@packages/ai/qwen';
import { redactSecrets } from '@/lib/audit';

beforeEach(() => {
  vi.clearAllMocks();
  resetQwenEndpointCacheForTests();
  dbMock.from.mockReturnValue({
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

describe('Alibaba QwenCloud & DashScope Multi-Model Routing', () => {
  it('routes sk-ws- workspace keys to maas.qwencloudapi.com first with automatic DashScope fallback', () => {
    const wsEndpoints = resolveQwenEndpoints('sk-ws-SYNTHETIC.EXAMPLE.WORKSPACE_KEY_0001');
    expect(wsEndpoints[0]).toBe(QWENCLOUD_GLOBAL_BASE_URL);
    expect(wsEndpoints[1]).toBe(DASHSCOPE_INTL_BASE_URL);

    const stdEndpoints = resolveQwenEndpoints('sk-synthetic00000000000000000000');
    expect(stdEndpoints[0]).toBe(DASHSCOPE_INTL_BASE_URL);
    expect(stdEndpoints[1]).toBe(QWENCLOUD_GLOBAL_BASE_URL);
  });

  it('assigns distinct Qwen models across flagship, standard, and fast tiers to maximize separate 1M free quotas', () => {
    expect(resolveQwenTierModels('flagship')).toEqual([
      'qwen3.8-max',
      'qwen3.7-plus',
      'deepseek-v4-pro-0813',
      'qwen3.8-flash',
    ]);
    expect(resolveQwenTierModels('standard')).toEqual([
      'qwen3.7-plus',
      'qwen3.8-max',
      'qwen3.8-flash',
      'deepseek-v4.1-flash',
    ]);
    expect(resolveQwenTierModels('fast')).toEqual([
      'qwen3.8-flash',
      'deepseek-v4.1-flash',
      'qwen3.7-plus',
    ]);
  });

  it('cascades seamlessly from qwen3.8-max to qwen3.7-plus when flagship free quota is exhausted', async () => {
    const attemptedModels: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const parsed = JSON.parse(String(init?.body ?? '{}')) as { model: string };
      attemptedModels.push(parsed.model);
      if (parsed.model === 'qwen3.8-max') {
        return new Response(JSON.stringify({ error: { code: 'AllocationQuota.FreeTierOnly' } }), {
          status: 429,
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ verdict: 'strong_hire_signal' }) } }],
          usage: { prompt_tokens: 120, completion_tokens: 45 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const providers = buildQwenTierProviders({
      apiKey: 'sk-ws-SYNTHETIC.QUOTA.TEST_KEY_0002',
      tier: 'flagship',
      fetchFn: fetchMock,
    });
    const gateway = new AIGateway(providers);

    const out = await gateway.run(
      {
        id: 'rubric-eval',
        version: 1,
        schema: z.object({ verdict: z.string() }),
        buildMessages: (prompt: string) => [{ role: 'user', content: prompt }],
      },
      'Score candidate response',
    );

    expect(out.data.verdict).toBe('strong_hire_signal');
    expect(out.provider).toBe('qwen-qwen3.7-plus');
    expect(attemptedModels).toEqual(['qwen3.8-max', 'qwen3.7-plus']);
  });

  it('auto-fails over across regional endpoints on 401 and retries plain body if enable_thinking is rejected', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push({ url: u, body });

      // 1st endpoint returns 401 (key belongs to Singapore DashScope instead of QwenCloud global)
      if (u.startsWith(QWENCLOUD_GLOBAL_BASE_URL)) {
        return new Response('Unauthorized', { status: 401 });
      }
      // 2nd endpoint rejects enable_thinking on a thinking-mandatory model
      if ('enable_thinking' in body) {
        return new Response('The value of the enable_thinking parameter is restricted to True.', {
          status: 400,
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 4 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const transport = createQwenChatTransport({
      reasoningMode: 'off',
      fetchFn: fetchMock,
    });

    const res = await transport({
      model: 'kimi-k3',
      baseUrl: '',
      apiKey: 'sk-ws-SYNTHETIC.FAILOVER.TEST_KEY_0003',
      messages: [{ role: 'user', content: 'ping' }],
      responseFormat: 'json',
    });

    expect(res.content).toBe('{"ok":true}');
    expect(calls[0].url).toContain('maas.qwencloudapi.com');
    expect(calls[1].url).toContain('dashscope-intl.aliyuncs.com');
    expect(calls[1].body.enable_thinking).toBe(false);
    expect(calls[2].url).toContain('dashscope-intl.aliyuncs.com');
    expect(calls[2].body.enable_thinking).toBeUndefined();
  });

  it('transcribes candidate interview audio via qwen3-asr-flash input_audio Data URI', async () => {
    let capturedBody: { model?: string } = {};
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'I architected the settlement ledger for high throughput in Lagos.',
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await transcribeWithQwenAsr({
      apiKey: 'sk-ws-SYNTHETIC.ASR.TEST_KEY_0004',
      audioBytes: Buffer.from('RIFF-synthetic-audio'),
      mimeType: 'audio/webm',
      fetchFn: fetchMock,
    });

    expect(result).toEqual({
      supported: true,
      transcript: 'I architected the settlement ledger for high throughput in Lagos.',
      confidence: 0.91,
      provider: 'qwen-qwen3-asr-flash',
    });
    expect(capturedBody?.model).toBe('qwen3-asr-flash');
    expect(JSON.stringify(capturedBody)).toContain('data:audio/webm;base64,');
  });

  it('wires QWENCLOUD_API_KEY into buildGatewayForUser (flagship vs standard) and buildSupportGateway (fast)', async () => {
    vi.resetModules();
    process.env.QWENCLOUD_API_KEY = 'sk-ws-SYNTHETIC.GATEWAY.TEST_KEY_0005';
    process.env.OLLAMA_BASE_URL = '';
    process.env.CLOUDFLARE_ACCOUNT_ID = '';
    process.env.CLOUDFLARE_API_TOKEN = '';
    process.env.OPENROUTER_API_KEY = '';
    try {
      const server = await import('@/lib/ai/server');
      expect(server.qwenConfigured()).toBe(true);

      const standardGw = await server.buildGatewayForUser('u1');
      const stdProviders = (standardGw as unknown as { providers: { name: string }[] }).providers;
      expect(stdProviders[0].name).toBe('qwen-qwen3.7-plus');

      const flagshipGw = await server.buildGatewayForUser('u1', { tier: 'flagship' });
      const flagProviders = (flagshipGw as unknown as { providers: { name: string }[] }).providers;
      expect(flagProviders[0].name).toBe('qwen-qwen3.8-max');

      const supportGw = server.buildSupportGateway();
      const supProviders = (supportGw as unknown as { providers: { name: string }[] }).providers;
      expect(supProviders[0].name).toBe('qwen-qwen3.8-flash');
    } finally {
      delete process.env.QWENCLOUD_API_KEY;
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it('prioritizes Qwen ahead of self-hosted Ollama when both are configured and supports QWEN_MODEL_* aliases', async () => {
    vi.resetModules();
    process.env.QWENCLOUD_API_KEY = 'sk-ws-SYNTHETIC.PRIORITY.TEST_KEY_0006';
    process.env.QWEN_MODEL_FLAGSHIP = 'qwen3.8-max';
    process.env.OLLAMA_BASE_URL = 'https://ollama.example.test';
    process.env.OLLAMA_MODEL = 'qwen2.5:7b';
    try {
      const server = await import('@/lib/ai/server');
      expect(server.qwenEnvVarsPresent()).toContain('QWENCLOUD_API_KEY');
      expect(server.qwenEnvVarsPresent()).toContain('QWEN_MODEL_FLAGSHIP');
      expect(server.qwenEndpointHost()).toBe('maas.qwencloudapi.com');

      const gw = await server.buildGatewayForUser('u1', { tier: 'flagship' });
      const providers = (gw as unknown as { providers: { name: string }[] }).providers;
      expect(providers[0].name).toBe('qwen-qwen3.8-max');
      expect(providers.some((p) => p.name === 'ollama')).toBe(true);
      expect(providers.findIndex((p) => p.name === 'qwen-qwen3.8-max')).toBeLessThan(
        providers.findIndex((p) => p.name === 'ollama'),
      );
    } finally {
      delete process.env.QWENCLOUD_API_KEY;
      delete process.env.QWEN_MODEL_FLAGSHIP;
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.OLLAMA_MODEL;
    }
  });

  it('redacts dotted sk-ws- workspace keys in audit logs so secrets never persist', () => {
    const sample = 'failed call with sk-ws-SYNTHETIC.DOT.SEGMENT_KEY_1234567890abcdef in trace';
    const scrubbed = redactSecrets(sample);
    expect(scrubbed).not.toContain('SYNTHETIC.DOT.SEGMENT_KEY');
    expect(scrubbed).toContain('<redacted>');
  });
});
