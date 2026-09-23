import { describe, expect, it, vi } from 'vitest';

/**
 * Gateway usage-ledger hook (Phase 2, B-061): one ledger event per run with
 * the final outcome; a throwing ledger never fails the run; the quota-block
 * path records 'blocked'.
 */
import { AIGateway, AIGatewayError } from '@packages/ai/gateway';
import type { AIRunLedgerEvent, AIProvider, AITask } from '@packages/ai/types';
import { z } from 'zod';

function json(body: unknown, usage?: { promptTokens?: number; completionTokens?: number }) {
  return {
    content: JSON.stringify(body),
    usage,
    provider: 'test',
  };
}

function mockProvider(opts: { name: string; priority?: number; model?: string; respond: () => unknown }): AIProvider {
  return {
    name: opts.name,
    priority: opts.priority ?? 0,
    model: opts.model,
    chat: async () => {
      const r = opts.respond();
      if (r instanceof Error) throw r;
      return r as { content: string; usage?: object; provider: string };
    },
  };
}

const task: AITask<unknown, { answer: string }> = {
  id: 'test.task',
  version: 3,
  schema: z.object({ answer: z.string() }),
  maxTokens: 100,
  buildMessages: () => [{ role: 'user', content: 'hi' }],
};

describe('AIGateway.run ledger', () => {
  it('emits an ok event with task, version, provider, model and tokens', async () => {
    const events: AIRunLedgerEvent[] = [];
    const gw = new AIGateway([
      mockProvider({ name: 'primary', priority: 0, model: 'llama3', respond: () => json({ answer: 'hello' }, { promptTokens: 11, completionTokens: 7 }) }),
    ]);
    await gw.run(task, {}, { ledger: (e) => { events.push(e); } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      task: 'test.task', taskVersion: 3, provider: 'test', model: 'llama3',
      status: 'ok', inputTokens: 11, outputTokens: 7,
    });
    expect(events[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('emits an error event when every provider fails', async () => {
    const events: AIRunLedgerEvent[] = [];
    const gw = new AIGateway([mockProvider({ name: 'only', respond: () => new Error('AI_PROVIDER_500') })]);
    await expect(gw.run(task, {}, { ledger: (e) => { events.push(e); } })).rejects.toThrow(AIGatewayError);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: 'error', errorCode: 'AI_ALL_PROVIDERS_FAILED', provider: 'only' });
  });

  it('emits a blocked event when the meter refuses the run', async () => {
    const events: AIRunLedgerEvent[] = [];
    const gw = new AIGateway([mockProvider({ name: 'p', respond: () => json({ answer: 'x' }) })]);
    const meter = {
      reserve: async () => { throw new AIGatewayError('AI_QUOTA_EXHAUSTED', 'no credits'); },
      refund: async () => undefined,
      commit: async () => undefined,
    };
    await expect(gw.run(task, {}, { meter, ledger: (e) => { events.push(e); } })).rejects.toThrow('no credits');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: 'blocked', errorCode: 'AI_QUOTA_EXHAUSTED', provider: 'none' });
  });

  it('swallows ledger exceptions so the run succeeds', async () => {
    const gw = new AIGateway([mockProvider({ name: 'p', respond: () => json({ answer: 'fine' }) })]);
    const boom = vi.fn(() => { throw new Error('ledger down'); });
    await expect(gw.run(task, {}, { ledger: boom })).resolves.toMatchObject({ data: { answer: 'fine' } });
    expect(boom).toHaveBeenCalledTimes(1);
  });

  it('emits an error event when no providers are configured', async () => {
    const events: AIRunLedgerEvent[] = [];
    const gw = new AIGateway([]);
    await expect(gw.run(task, {}, { ledger: (e) => { events.push(e); } })).rejects.toThrow('No AI providers are configured.');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: 'error', errorCode: 'AI_NO_PROVIDERS' });
  });
});
