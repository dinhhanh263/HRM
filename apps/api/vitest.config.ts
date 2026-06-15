import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Minimal .env parser — vite's loadEnv is not directly importable here (vite
// is only a transitive dependency of vitest in this workspace) and adding
// dotenv just for this would be a new dependency for 10 lines of parsing.
function parseEnvFile(url: URL): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(fileURLToPath(url), 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return env;
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10000,
    // Tests must never touch the dev database: .env.test (DATABASE_URL →
    // hrm_test) is injected into process.env before any test module loads,
    // which beats Prisma's own .env autoload (dotenv never overwrites
    // existing vars). Vars absent from .env.test still resolve from .env.
    env: parseEnvFile(new URL('.env.test', import.meta.url)),
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/**/*.d.ts'],
    },
  },
});
