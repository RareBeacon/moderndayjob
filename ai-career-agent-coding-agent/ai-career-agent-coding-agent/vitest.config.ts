import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vitest alias config — mirrors tsconfig `paths` so value imports of `@/...`
 * and `@packages/...` resolve under the test runner (type-only imports are
 * already stripped by esbuild). Additive; does not affect `next build`.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: '@packages', replacement: fileURLToPath(new URL('./packages', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./', import.meta.url)) },
    ],
  },
});
