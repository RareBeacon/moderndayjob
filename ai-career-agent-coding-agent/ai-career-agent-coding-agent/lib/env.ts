import { z } from 'zod';
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  FLW_SECRET_KEY: z.string().default(''),
  FLW_CLIENT_ID: z.string().default(''),
  FLW_CLIENT_SECRET: z.string().default(''),
  FLW_SECRET_HASH: z.string().default(''),
  ENCRYPTION_MASTER_KEY: z.string().min(32).default('development-only-key-must-be-replaced'),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  HUGGINGFACE_BASE_URL: z.string().url().default('https://router.huggingface.co/v1'),
  // Ollama-first self-hosted AI (Oracle VM). Empty base URL disables Ollama
  // and the gateway falls back to user-stored credentials only.
  OLLAMA_BASE_URL: z.string().default(''),
  OLLAMA_MODEL: z.string().default('qwen2.5:7b'),
  OLLAMA_FALLBACK_MODEL: z.string().default('llama3.2:3b'),
  OLLAMA_API_KEY: z.string().default(''),
  // Platform fallback provider (disaster switch): when the self-hosted Ollama
  // VM is unavailable, setting OPENROUTER_API_KEY keeps every AI feature alive
  // through OpenRouter. Empty (default) changes nothing.
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_MODEL: z.string().default(''),
  // Cloudflare Workers AI fallback (2026-09-20): serves inference when the
  // self-hosted Ollama VM is unavailable, ahead of the OpenRouter disaster
  // switch. Activated only when both account id and API token are set; empty
  // (default) changes nothing. Uses Cloudflare's OpenAI-compatible endpoint.
  CLOUDFLARE_ACCOUNT_ID: z.string().default(''),
  CLOUDFLARE_API_TOKEN: z.string().default(''),
  CLOUDFLARE_MODEL: z.string().default('@cf/openai/gpt-oss-120b'),
  // Max concurrent AI provider calls per server instance. Extra requests
  // queue instead of overloading the model host (see lib/ai/server.ts).
  AI_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(128).default(8),
  // Resend transactional email.
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM: z.string().default('hello@jobiest.com'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://jobiest.com'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().url().or(z.literal('')).default(''),
});
export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  FLW_SECRET_KEY: process.env.FLW_SECRET_KEY,
  FLW_CLIENT_ID: process.env.FLW_CLIENT_ID,
  FLW_CLIENT_SECRET: process.env.FLW_CLIENT_SECRET,
  FLW_SECRET_HASH: process.env.FLW_SECRET_HASH,
  ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY,
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
  HUGGINGFACE_BASE_URL: process.env.HUGGINGFACE_BASE_URL,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  OLLAMA_FALLBACK_MODEL: process.env.OLLAMA_FALLBACK_MODEL,
  OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_MODEL: process.env.CLOUDFLARE_MODEL,
  AI_MAX_CONCURRENCY: process.env.AI_MAX_CONCURRENCY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
});
