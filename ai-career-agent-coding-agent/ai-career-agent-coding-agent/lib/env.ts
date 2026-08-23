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
});
