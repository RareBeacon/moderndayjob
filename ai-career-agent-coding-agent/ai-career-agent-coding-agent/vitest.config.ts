import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vitest alias config — mirrors tsconfig `paths` so value imports of `@/...`
 * and `@packages/...` resolve under the test runner (type-only imports are
 * already stripped by esbuild). Additive; does not affect `next build`.
 */
export default defineConfig({
  test: {
    // dummy envs — lib/env.ts validates at import time; tests never touch real services
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
      ENCRYPTION_MASTER_KEY: 'development-only-key-must-be-replaced',
    },
  },
  resolve: {
    alias: [
      { find: '@packages', replacement: fileURLToPath(new URL('./packages', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./', import.meta.url)) },
    ],
  },
});
