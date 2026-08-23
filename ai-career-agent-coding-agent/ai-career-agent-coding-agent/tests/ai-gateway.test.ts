import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AIGateway, AIGatewayError, parseJsonContent } from '../packages/ai/gateway';
import type { AIProvider, AIMessage, AITask, ChatResponse, UsageMeter } from '../packages/ai/types';

/* ---------- helpers ---------- */

type Responder = ChatResponse | Error;

function mockProvider(opts: {
  name: string;
  priority: number;
  respond: (msgs: AIMessage[]) => Responder | Promise<Responder>;
  seen?: { opts?: unknown };
}): AIProvider {
  return {
    name: opts.name,
    priority: opts.priority,
    async chat(messages, callOpts) {
      if (opts.seen) opts.seen.opts = callOpts;
      const r = await opts.respond(messages);
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

const task: AITask<unknown, { answer: string }> = {
  id: 'echo',
  version: 1,
  schema: z.object({ answer: z.string().min(1) }),
  buildMessages: () => [{ role: 'user', content: 'reply' }],
};

function json(content: string): ChatResponse {
  return { content, provider: 'p' };
}

function mockMeter() {
  const counts = { reserved: 0, refunded: 0 };
  const meter: UsageMeter = {
    reserve: async () => {
      counts.reserved++;
    },
    refund: async () => {
      counts.refunded++;
    },
  };
  return { meter, counts };
}

/* ---------- fallback + validation ---------- */

describe('AIGateway', () => {
  it('uses the primary provider when it returns valid output', async () => {
    const gw = new AIGateway([
      mockProvider({ name: 'primary', priority: 0, respond: () => json('{"answer":"hello"}') }),
      mockProvider({ name: 'backup', priority: 1, respond: () => json('{"answer":"backup"}') }),
    ]);
    const out = await gw.run(task, null);
    expect(out.data).toEqual({ answer: 'hello' });
    expect(out.provider).toBe('p');
  });

  it('falls back to the next provider when the primary throws', async () => {
    const gw = new AIGateway([
      mockProvider({ name: 'primary', priority: 0, respond: () => new Error('AI_PROVIDER_500') }),
      mockProvider({ name: 'backup', priority: 1, respond: () => json('{"answer":"recovered"}') }),
    ]);
    const out = await gw.run(task, null);
    expect(out.data.answer).toBe('recovered');
  });

  it('falls back when the primary returns malformed JSON', async () => {
    const gw = new AIGateway([
      mockProvider({ name: 'primary', priority: 0, respond: () => json('not json at all') }),
      mockProvider({ name: 'backup', priority: 1, respond: () => json('{"answer":"ok"}') }),
    ]);
    const out = await gw.run(task, null);
    expect(out.data.answer).toBe('ok');
  });

  it('falls back when the primary returns schema-violating output', async () => {
    const gw = new AIGateway([
      mockProvider({ name: 'primary', priority: 0, respond: () => json('{"answer":42}') }),
      mockProvider({ name: 'backup', priority: 1, respond: () => json('{"answer":"ok"}') }),
    ]);
    const out = await gw.run(task, null);
    expect(out.data.answer).toBe('ok');
  });

  it('throws AI_ALL_PROVIDERS_FAILED when every provider fails', async () => {
    const gw = new AIGateway([
      mockProvider({ name: 'a', priority: 0, respond: () => new Error('boom') }),
      mockProvider({ name: 'b', priority: 1, respond: () => json('{nope') }),
    ]);
    await expect(gw.run(task, null)).rejects.toMatchObject({ code: 'AI_ALL_PROVIDERS_FAILED' });
  });

  it('throws AI_NO_PROVIDERS when no providers are configured', async () => {
    const gw = new AIGateway([]);
    await expect(gw.run(task, null)).rejects.toMatchObject({ code: 'AI_NO_PROVIDERS' });
  });

  it('requests JSON response format from each provider attempt', async () => {
    const seen = { opts: undefined as unknown };
    const gw = new AIGateway([
      mockProvider({ name: 'p', priority: 0, respond: () => json('{"answer":"x"}'), seen }),
    ]);
    await gw.run(task, null);
    expect(seen.opts).toMatchObject({ responseFormat: 'json' });
  });
});

/* ---------- quota metering ---------- */

describe('AIGateway metering', () => {
  it('reserves a credit before the run and does not refund on success', async () => {
    const { meter, counts } = mockMeter();
    const gw = new AIGateway([
      mockProvider({ name: 'p', priority: 0, respond: () => json('{"answer":"x"}') }),
    ]);
    await gw.run(task, null, { meter });
    expect(counts.reserved).toBe(1);
    expect(counts.refunded).toBe(0);
  });

  it('refunds the credit when all providers fail', async () => {
    const { meter, counts } = mockMeter();
    const gw = new AIGateway([
      mockProvider({ name: 'p', priority: 0, respond: () => new Error('down') }),
    ]);
    await expect(gw.run(task, null, { meter })).rejects.toBeInstanceOf(AIGatewayError);
    expect(counts.reserved).toBe(1);
    expect(counts.refunded).toBe(1);
  });

  it('propagates a quota-exhaustion error and skips the providers entirely', async () => {
    let providerCalled = false;
    const meter: UsageMeter = {
      reserve: async () => {
        throw new AIGatewayError('AI_QUOTA_EXHAUSTED', 'limit');
      },
      refund: async () => {},
    };
    const gw = new AIGateway([
      mockProvider({
        name: 'p',
        priority: 0,
        respond: () => {
          providerCalled = true;
          return json('{"answer":"x"}');
        },
      }),
    ]);
    await expect(gw.run(task, null, { meter })).rejects.toMatchObject({
      code: 'AI_QUOTA_EXHAUSTED',
    });
    expect(providerCalled).toBe(false);
  });
});

/* ---------- JSON extraction ---------- */

describe('parseJsonContent', () => {
  it('parses raw JSON', () => {
    expect(parseJsonContent('{"answer":"hi"}')).toEqual({ ok: true, value: { answer: 'hi' } });
  });
  it('parses a fenced ```json block', () => {
    expect(parseJsonContent('sure\n```json\n{"answer":"hi"}\n```')).toEqual({
      ok: true,
      value: { answer: 'hi' },
    });
  });
  it('parses JSON wrapped in prose', () => {
    expect(parseJsonContent('Here you go: {"answer":"hi"} thanks')).toEqual({
      ok: true,
      value: { answer: 'hi' },
    });
  });
  it('fails on empty / non-JSON content', () => {
    expect(parseJsonContent('').ok).toBe(false);
    expect(parseJsonContent('totally not json').ok).toBe(false);
  });
});
