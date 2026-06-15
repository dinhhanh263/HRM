import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the admin SPA. Runs against the already-running dev servers
 * (web on 5173, api on 5000). Start them with `pnpm dev` from the repo root
 * before invoking `pnpm e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  // Import flows hit a real DB + BullMQ worker, so keep them serial and patient.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
