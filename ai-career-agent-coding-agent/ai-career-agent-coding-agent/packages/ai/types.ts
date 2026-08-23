import type { ZodType, ZodTypeDef } from 'zod';

/** Chat message in the OpenAI-compatible roles we use. */
export interface AIMessage {
  role: 'system' | 'user';
  content: string;
}

/** Transport-level request to an OpenAI-compatible /chat/completions endpoint. */
export interface ChatRequest {
  model: string;
  baseUrl: string;
  /** Already-decrypted API key (decryption happens in the server wrapper). */
  apiKey: string;
  messages: AIMessage[];
  temperature?: number;
  /** Ask the provider to return strict JSON. */
  responseFormat?: 'json' | 'text';
  maxTokens?: number;
}

/** Normalized transport response. `content` is the assistant message text. */
export interface ChatResponse {
  content: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  /** Name of the provider that produced this response. */
  provider: string;
  raw?: unknown;
}

/** Injectable transport so providers are deterministic and SSRF-controlled. */
export type ChatFn = (req: ChatRequest) => Promise<ChatResponse>;

/** Static configuration bound to one credential row (ai_credentials). */
export interface ProviderConfig {
  /** 'openrouter' | 'huggingface' | any OpenAI-compatible source name. */
  name: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  /** Lower number = tried first (primary). */
  priority: number;
}

/** A provider is a transport bound to a credential. */
export interface AIProvider {
  readonly name: string;
  readonly priority: number;
  chat(
    messages: AIMessage[],
    opts?: { temperature?: number; responseFormat?: 'json' | 'text'; maxTokens?: number },
  ): Promise<ChatResponse>;
}

/**
 * A versioned AI task: a named capability with a JSON schema (Zod) and a prompt
 * builder. ARCHITECTURE §7 — "Each task has a versioned prompt and JSON schema."
 */
export interface AITask<Input, Output> {
  readonly id: string;
  readonly version: number;
  readonly schema: ZodType<Output, ZodTypeDef, unknown>;
  buildMessages(input: Input): AIMessage[];
}

/**
 * Quota meter. `reserve()` performs an atomic check+increment of the user's
 * daily AI credits (backs onto the consume_ai_credit RPC); `refund()` is a
 * best-effort decrement when an entire run fails so users are not charged for
 * provider outages.
 */
export interface UsageMeter {
  reserve(): Promise<void>;
  refund(): Promise<void>;
}

export interface AIGatewayRunOptions {
  meter?: UsageMeter;
}
