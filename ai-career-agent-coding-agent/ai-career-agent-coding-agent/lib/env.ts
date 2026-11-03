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
  // Alibaba Cloud Model Studio / QwenCloud (OpenAI-compatible multi-model tiering):
  // Accepts QWENCLOUD_API_KEY (`sk-ws-...` / `sk-...`), DASHSCOPE_API_KEY, or QWEN_API_KEY,
  // plus both QWEN_MODEL_* and QWEN_*_MODEL naming conventions.
  // Empty by default so existing deployments and unit tests remain unchanged.
  QWENCLOUD_API_KEY: z.string().default(''),
  DASHSCOPE_API_KEY: z.string().default(''),
  QWEN_API_KEY: z.string().default(''),
  QWENCLOUD_BASE_URL: z.string().default(''),
  DASHSCOPE_BASE_URL: z.string().default(''),
  QWEN_BASE_URL: z.string().default(''),
  QWEN_MODEL_FLAGSHIP: z.string().default(''),
  QWEN_FLAGSHIP_MODEL: z.string().default('qwen3.8-max'),
  QWEN_MODEL_STANDARD: z.string().default(''),
  QWEN_STANDARD_MODEL: z.string().default('qwen3.7-plus'),
  QWEN_MODEL_FAST: z.string().default(''),
  QWEN_FAST_MODEL: z.string().default('qwen3.8-flash'),
  QWEN_MODEL_ASR: z.string().default(''),
  QWEN_ASR_MODEL: z.string().default('qwen3-asr-flash'),
  // Max concurrent AI provider calls per server instance. Extra requests
  // queue instead of overloading the model host (see lib/ai/server.ts).
  AI_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(128).default(8),
  // Transactional email providers ($0 multi-transport: Self-Hosted SMTP + Brevo Free + Resend Free).
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM: z.string().default('hello@jobiest.com'),
  BREVO_API_KEY: z.string().default(''),
  BREVO_FROM: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.string().default('587'),
  SMTP_SECURE: z.string().default(''),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  EMAIL_FROM: z.string().default('Jobiest <no-reply@jobiest.com>'),
  TRANSACTIONAL_STRATEGY: z.string().default('auto'),
  EMAIL_PROVIDER_ORDER: z.string().default('smtp,brevo,resend'),
  SMTP_FALLBACK: z.string().default('resend'),
  // Optional Stalwart REST Admin API for 1-click @jobiest.com staff mailbox provisioning from /admin/email.
  STALWART_API_URL: z.string().default(''),
  STALWART_ADMIN_USER: z.string().default('postmaster'),
  STALWART_ADMIN_PASSWORD: z.string().default(''),
  NEXT_PUBLIC_APP_URL: z.string().url().default('https://jobiest.com'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().url().or(z.literal('')).default(''),
  GOOGLE_SEO_SERVICE_ACCOUNT_JSON: z.string().default(''),
});
/**
 * `env` validates lazily: the Zod parse runs on first property access, not at
 * import time. `next build` imports every route module during page-data
 * collection, and builds in environments without runtime secrets (Vercel
 * preview deployments with Production-only env vars) used to crash with a
 * ZodError before a single page rendered. With the lazy parse, such builds
 * succeed and any request that actually needs a missing variable still fails
 * loudly at runtime with the original error.
 */
let envCache: z.infer<typeof schema> | null = null;

function parseEnv(): z.infer<typeof schema> {
  if (!envCache) envCache = schema.parse({
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
  QWENCLOUD_API_KEY: process.env.QWENCLOUD_API_KEY,
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
  QWEN_API_KEY: process.env.QWEN_API_KEY,
  QWENCLOUD_BASE_URL: process.env.QWENCLOUD_BASE_URL,
  DASHSCOPE_BASE_URL: process.env.DASHSCOPE_BASE_URL,
  QWEN_BASE_URL: process.env.QWEN_BASE_URL,
  QWEN_MODEL_FLAGSHIP: process.env.QWEN_MODEL_FLAGSHIP,
  QWEN_FLAGSHIP_MODEL: process.env.QWEN_FLAGSHIP_MODEL,
  QWEN_MODEL_STANDARD: process.env.QWEN_MODEL_STANDARD,
  QWEN_STANDARD_MODEL: process.env.QWEN_STANDARD_MODEL,
  QWEN_MODEL_FAST: process.env.QWEN_MODEL_FAST,
  QWEN_FAST_MODEL: process.env.QWEN_FAST_MODEL,
  QWEN_MODEL_ASR: process.env.QWEN_MODEL_ASR,
  QWEN_ASR_MODEL: process.env.QWEN_ASR_MODEL,
  AI_MAX_CONCURRENCY: process.env.AI_MAX_CONCURRENCY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  BREVO_FROM: process.env.BREVO_FROM,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  EMAIL_FROM: process.env.EMAIL_FROM,
  TRANSACTIONAL_STRATEGY: process.env.TRANSACTIONAL_STRATEGY,
  EMAIL_PROVIDER_ORDER: process.env.EMAIL_PROVIDER_ORDER,
  SMTP_FALLBACK: process.env.SMTP_FALLBACK,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  GOOGLE_SEO_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SEO_SERVICE_ACCOUNT_JSON,
});
  return envCache;
}

export const env: z.infer<typeof schema> = new Proxy({} as z.infer<typeof schema>, {
  get(_target, prop) {
    return parseEnv()[prop as keyof z.infer<typeof schema>];
  },
});
