import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Pin the dev-auth flag so a developer's local `.env.local` (which may set
    // VITE_DISABLE_DEV_AUTH=true to test the real login flow) can't leak into
    // the suite — component tests rely on the full-permission dev mock user.
    env: {
      VITE_DISABLE_DEV_AUTH: 'false',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Measure our own application logic. Exclude generated shadcn primitives,
      // app entry/wiring, type decls, and barrel re-exports — none carry logic
      // worth unit-testing and they only distort the denominator.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'src/test/',
        'src/components/ui/**',
        'src/main.tsx',
        'src/App.tsx',
        'src/router.tsx',
        'src/vite-env.d.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/*.config.*',
      ],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
