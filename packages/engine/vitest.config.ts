import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/*
 * engine-fixtures depends on engine for its types, so declaring the reverse dependency in
 * package.json would create a workspace cycle that Turborepo refuses. Tests resolve the
 * fixtures by path instead — the dependency exists only in test code, never in the shipped
 * engine, which keeps `packages/engine` genuinely dependency-free.
 */
export default defineConfig({
  test: { globals: true, include: ['test/**/*.test.ts'] },
  resolve: {
    alias: {
      '@wealthplanner/engine-fixtures': fileURLToPath(
        new URL('../engine-fixtures/src/index.ts', import.meta.url),
      ),
      '@wealthplanner/engine': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      '@wealthplanner/jurisdictions': fileURLToPath(
        new URL('../jurisdictions/src/index.ts', import.meta.url),
      ),
    },
  },
});
