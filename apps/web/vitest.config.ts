import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, include: ['test/**/*.test.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@wealthplanner/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
      '@wealthplanner/jurisdictions': fileURLToPath(
        new URL('../../packages/jurisdictions/src/index.ts', import.meta.url),
      ),
    },
  },
});
