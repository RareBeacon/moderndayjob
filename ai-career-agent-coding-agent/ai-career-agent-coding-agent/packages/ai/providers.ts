import type {
  AIProvider,
  AIMessage,
  ChatFn,
  ChatRequest,
  ChatResponse,
  ProviderConfig,
} from './types';

/**
 * Default transport: POSTs to an OpenAI-compatible /chat/completions endpoint
 * using the global fetch. The key is passed in already decrypted; this module
 * imports no env/crypto so it stays pure and unit-testable.
 *
 * SSRF note: baseUrl comes only from the ai_credentials.base_url stored for the
 * user (validated at credential-write time); the transport never accepts an
 * arbitrary URL from request input.
 */
export const httpChat: ChatFn = async (req) => {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.2,
  };
  if (req.maxTokens) body.max_tokens = req.maxTokens;
  if (req.responseFormat === 'json') body.response_format = { type: 'json_object' };

  const res = await fetch(`${trimSlash(req.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI_PROVIDER_${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
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
};

function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

/**
 * OpenAI-compatible provider bound to one credential. Both OpenRouter and
 * Hugging Face expose the same /chat/completions contract, so a single
 * transport serves both (ARCHITECTURE §7).
 */
export class OpenAICompatProvider implements AIProvider {
  readonly name: string;
  readonly priority: number;
  private readonly cfg: ProviderConfig;
  private readonly chatFn: ChatFn;

  constructor(config: ProviderConfig, chatFn: ChatFn = httpChat) {
    this.name = config.name;
    this.priority = config.priority;
    this.cfg = config;
    this.chatFn = chatFn;
  }

  async chat(
    messages: AIMessage[],
    opts?: { temperature?: number; responseFormat?: 'json' | 'text'; maxTokens?: number },
  ): Promise<ChatResponse> {
    const res = await this.chatFn({
      model: this.cfg.model,
      baseUrl: this.cfg.baseUrl,
      apiKey: this.cfg.apiKey,
      messages,
      temperature: opts?.temperature,
      responseFormat: opts?.responseFormat,
      maxTokens: opts?.maxTokens,
    });
    return { ...res, provider: this.name };
  }
}
