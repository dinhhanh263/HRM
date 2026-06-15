import { beforeAll, afterAll } from 'vitest';
import { db } from '../src/infrastructure/database/client.js';

// Hard guard: suites wipe data per-tenant, so a misconfigured DATABASE_URL
// would let tests mutate the dev database (hrm_dev) — that already happened
// once and flooded the dashboard with junk employees. vitest.config.ts
// injects .env.test (DATABASE_URL → hrm_test); refuse to run otherwise.
if (!(process.env.DATABASE_URL ?? '').includes('hrm_test')) {
  throw new Error(
    `Tests must run against the hrm_test database, got: ${process.env.DATABASE_URL}. ` +
      'Run `npm run test:db:setup` once, then run tests via `npm test` so vitest loads apps/api/.env.test.'
  );
}

// Vitest loads .env (which carries a live RESEND_API_KEY) into process.env, so
// without this every email-sending path exercised by a test — invites, password
// resets, payroll-approval notifications — would hit the real Resend API. Force
// the key empty at module load (before the email provider singleton is built) so
// the provider takes its warn-and-skip no-op path. Tests that need to assert on
// email behaviour spy on emailProvider directly.
process.env.RESEND_API_KEY = '';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key';
});

afterAll(async () => {
  await db.$disconnect();
});
