# Cloud Tasks Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BullMQ/Redis job subsystem in `apps/api` with Google Cloud Tasks pushing to internal HTTP routes on the existing `hrm-api` Cloud Run service, removing Memorystore and the always-on worker.

**Architecture:** A driver-based `TaskDispatcher` replaces `Queue.add()`. In production the `cloud` driver creates Cloud Tasks targeting `POST /internal/tasks/<job>`; in dev/test the `inline` driver runs the handler in-process. BullMQ `Worker` processors become plain async handlers registered in a central registry, invoked by both the internal router (cloud) and the inline driver. Redis's non-queue uses (import staging, permission cache) move to Postgres and an in-process TTL cache. Prisma/Postgres data layer is otherwise unchanged.

**Tech Stack:** Node 20, TypeScript (ESM, `.js` import specifiers), Express, Prisma/PostgreSQL, `@google-cloud/tasks`, Vitest, pnpm workspaces, Turbo.

**Branch:** `feature/cloud-tasks-migration` (already created).

**Spec:** `docs/superpowers/specs/2026-06-19-cloud-tasks-migration-design.md`

---

## Conventions for every task

- Run commands from the repo root unless stated. API filter: `pnpm --filter @hrm/api`.
- All `apps/api` imports use ESM `.js` specifiers (e.g. `from './x.js'`) even for `.ts` files.
- Run a single test file: `pnpm --filter @hrm/api exec vitest run <path>`.
- Tests live under `apps/api/tests/`. Mirror existing structure (`tests/unit/...`, `tests/integration/...`). Use Vitest (`describe/it/expect/vi`).
- Commit after each task with the message shown.

---

## File structure (what each new/changed file is responsible for)

**New:**
- `apps/api/src/infrastructure/tasks/task-names.ts` — the `TaskName` union + per-job queue/route config.
- `apps/api/src/infrastructure/tasks/task-registry.ts` — `registerHandler` / `getHandler` map (breaks import cycles).
- `apps/api/src/infrastructure/tasks/inline-driver.ts` — in-process driver (dev/test).
- `apps/api/src/infrastructure/tasks/cloud-driver.ts` — Cloud Tasks driver (production).
- `apps/api/src/infrastructure/tasks/dispatcher.ts` — driver selection + `enqueue()` public API.
- `apps/api/src/infrastructure/tasks/register-handlers.ts` — imports every handler and registers it; imported once at startup.
- `apps/api/src/app/middlewares/tasks-auth.middleware.ts` — verifies `X-Tasks-Secret`.
- `apps/api/src/app/routes/internal-tasks.router.ts` — `POST /internal/tasks/:name` → handler.
- `apps/api/src/domain/employee-import/import-job.repository.ts` — Postgres-backed import job status.
- `apps/api/src/infrastructure/cache/permission-cache.ts` — in-process TTL cache.

**Modified:**
- `apps/api/prisma/schema.prisma` — add `ImportStaging`, `ImportJob` models (+ migration).
- `apps/api/src/domain/recruitment/cv-parse.queue.ts` / `cv-parse.worker.ts` — dispatcher + exported handler.
- `apps/api/src/domain/employee-import/employee-import.queue.ts` / `employee-import.worker.ts` — dispatcher, handler, DB job status.
- `apps/api/src/domain/employee-import/employee-import.invite.queue.ts` / `employee-import.invite.worker.ts`.
- `apps/api/src/domain/reminders/reminders.queue.ts` / `reminder-email.worker.ts` / `reminders.scan.worker.ts`.
- `apps/api/src/domain/employee-import/employee-import.staging.ts` / `asset-import/asset-import.staging.ts` — Postgres.
- `apps/api/src/domain/services/permission.service.ts` — in-process cache.
- `apps/api/src/shared/configs/{cv-parse,email,import,asset-import}.config.ts` — drop Redis keys; keep cron + names.
- `apps/api/src/app.ts` — mount internal router; import `register-handlers`.
- `apps/api/package.json` — add `@google-cloud/tasks`; remove `bullmq`, `ioredis`.
- `cloudbuild.yaml`, `docs/deployment-gcp.md`.

**Deleted:**
- `apps/api/src/worker.ts`
- `apps/api/src/infrastructure/cache/redis.ts`
- `apps/api/src/infrastructure/queue/connection.ts`

---

## Task 1: Add the Cloud Tasks dependency

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add the dependency**

Run:
```bash
pnpm --filter @hrm/api add @google-cloud/tasks@^5
```
Expected: `@google-cloud/tasks` appears under `dependencies` in `apps/api/package.json`; lockfile updates.

- [ ] **Step 2: Verify install**

Run: `pnpm --filter @hrm/api exec node -e "require('@google-cloud/tasks'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add @google-cloud/tasks dependency"
```

---

## Task 2: Prisma models for staging + import job status

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create (generated): `apps/api/prisma/migrations/*/migration.sql`

- [ ] **Step 1: Add the two models**

Append to `apps/api/prisma/schema.prisma`:

```prisma
/// Staged bulk-import rows held between /validate and /import. Replaces Redis
/// staging. Lazily expired on read; expired rows purged by the daily scan.
model ImportStaging {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  kind      String   // 'employee' | 'asset'
  payload   Json
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([expiresAt])
  @@map("import_staging")
}

/// Background employee-import job status. Replaces BullMQ job state/progress/
/// returnvalue (which lived in Redis) for the import wizard's polling endpoint.
model ImportJob {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  state     String   @default("waiting") // waiting | active | completed | failed
  progress  Json?    // { done: number, total: number }
  result    Json?    // ImportJobResult
  error     String?
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([tenantId])
  @@map("import_job")
}
```

- [ ] **Step 2: Create the migration (against a local dev DB)**

Run: `pnpm --filter @hrm/api exec prisma migrate dev --name add_import_staging_and_job`
Expected: creates `prisma/migrations/<ts>_add_import_staging_and_job/migration.sql` with `CREATE TABLE "import_staging"` and `CREATE TABLE "import_job"`, and regenerates the Prisma client.

> If no local Postgres is running: `cd docker && docker compose up -d postgres && cd ..` first, with `DATABASE_URL` pointing at it.

- [ ] **Step 3: Verify the client has the new models**

Run: `pnpm --filter @hrm/api exec node -e "const{db}=require('./dist/infrastructure/database/client.js')||{}; console.log('schema ok')" 2>/dev/null || echo "check via tsc in later tasks"`
Expected: no crash (client regeneration already succeeded in Step 2).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): add import_staging and import_job tables"
```

---

## Task 3: Task names + per-job config

**Files:**
- Create: `apps/api/src/infrastructure/tasks/task-names.ts`
- Test: `apps/api/tests/unit/tasks/task-names.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { TASK_CONFIG, TASK_NAMES } from '../../../src/infrastructure/tasks/task-names.js';

describe('task-names', () => {
  it('exposes the five job names', () => {
    expect([...TASK_NAMES].sort()).toEqual(
      ['cv-parse', 'employee-import', 'employee-invite', 'reminder-email', 'reminder-scan'].sort(),
    );
  });

  it('maps every name to a queue id and route path', () => {
    for (const name of TASK_NAMES) {
      expect(TASK_CONFIG[name].queue).toBe(`hrm-${name}`);
      expect(TASK_CONFIG[name].path).toBe(`/internal/tasks/${name}`);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/task-names.test.ts`
Expected: FAIL — cannot find module `task-names.js`.

- [ ] **Step 3: Implement**

`apps/api/src/infrastructure/tasks/task-names.ts`:
```ts
/** Canonical names for every background job. Used as the Cloud Tasks queue id
 * (prefixed `hrm-`), the internal route segment, and the registry key. */
export const TASK_NAMES = [
  'cv-parse',
  'employee-import',
  'employee-invite',
  'reminder-email',
  'reminder-scan',
] as const;

export type TaskName = (typeof TASK_NAMES)[number];

export interface TaskConfig {
  /** Cloud Tasks queue id. */
  queue: string;
  /** Internal route the task POSTs to. */
  path: string;
}

export const TASK_CONFIG: Record<TaskName, TaskConfig> = Object.fromEntries(
  TASK_NAMES.map((name) => [name, { queue: `hrm-${name}`, path: `/internal/tasks/${name}` }]),
) as Record<TaskName, TaskConfig>;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/task-names.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/infrastructure/tasks/task-names.ts apps/api/tests/unit/tasks/task-names.test.ts
git commit -m "feat(api): add task name + queue/route config"
```

---

## Task 4: Handler registry

**Files:**
- Create: `apps/api/src/infrastructure/tasks/task-registry.ts`
- Test: `apps/api/tests/unit/tasks/task-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { registerHandler, getHandler, _clearHandlers } from '../../../src/infrastructure/tasks/task-registry.js';

describe('task-registry', () => {
  beforeEach(() => _clearHandlers());

  it('returns a registered handler', async () => {
    const fn = async () => undefined;
    registerHandler('cv-parse', fn);
    expect(getHandler('cv-parse')).toBe(fn);
  });

  it('throws for an unregistered name', () => {
    expect(() => getHandler('reminder-scan')).toThrow(/no handler/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/task-registry.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`apps/api/src/infrastructure/tasks/task-registry.ts`:
```ts
import type { TaskName } from './task-names.js';

/** A job handler takes the decoded JSON payload and runs the work. */
export type TaskHandler = (payload: unknown) => Promise<void>;

const handlers = new Map<TaskName, TaskHandler>();

export function registerHandler(name: TaskName, handler: TaskHandler): void {
  handlers.set(name, handler);
}

export function getHandler(name: TaskName): TaskHandler {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`No handler registered for task "${name}"`);
  return handler;
}

/** Test-only: reset the registry between cases. */
export function _clearHandlers(): void {
  handlers.clear();
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/task-registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/infrastructure/tasks/task-registry.ts apps/api/tests/unit/tasks/task-registry.test.ts
git commit -m "feat(api): add task handler registry"
```

---

## Task 5: Inline driver

**Files:**
- Create: `apps/api/src/infrastructure/tasks/inline-driver.ts`
- Test: `apps/api/tests/unit/tasks/inline-driver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inlineDriver } from '../../../src/infrastructure/tasks/inline-driver.js';
import { registerHandler, _clearHandlers } from '../../../src/infrastructure/tasks/task-registry.js';

describe('inlineDriver', () => {
  beforeEach(() => _clearHandlers());

  it('invokes the registered handler with the payload', async () => {
    const seen: unknown[] = [];
    registerHandler('cv-parse', async (p) => { seen.push(p); });
    await inlineDriver.enqueue('cv-parse', { kind: 'attachment', attachmentId: 'a1' });
    await new Promise((r) => setImmediate(r)); // let the deferred run flush
    expect(seen).toEqual([{ kind: 'attachment', attachmentId: 'a1' }]);
  });

  it('does not reject when the handler throws (logged, not propagated)', async () => {
    registerHandler('reminder-scan', async () => { throw new Error('boom'); });
    await expect(inlineDriver.enqueue('reminder-scan', {})).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/inline-driver.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`apps/api/src/infrastructure/tasks/inline-driver.ts`:
```ts
import type { TaskName } from './task-names.js';
import { getHandler } from './task-registry.js';
import { logger } from '../../shared/utils/logger.js';

export interface TaskDriver {
  enqueue(name: TaskName, payload: unknown, opts?: { delaySeconds?: number }): Promise<void>;
}

/**
 * Dev/test driver: runs the handler in-process on the next tick so enqueue()
 * stays non-blocking, mirroring real async dispatch. Handler errors are logged,
 * never thrown back to the producer (a failed background job must not fail the
 * request that scheduled it) — same contract as the cloud driver's fire-and-forget.
 */
export const inlineDriver: TaskDriver = {
  async enqueue(name, payload) {
    setImmediate(() => {
      void getHandler(name)(payload).catch((err) => {
        logger.error({ err, task: name }, 'inline task handler failed');
      });
    });
  },
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/inline-driver.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/infrastructure/tasks/inline-driver.ts apps/api/tests/unit/tasks/inline-driver.test.ts
git commit -m "feat(api): add inline task driver for dev/test"
```

---

## Task 6: Cloud driver

**Files:**
- Create: `apps/api/src/infrastructure/tasks/cloud-driver.ts`
- Test: `apps/api/tests/unit/tasks/cloud-driver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';

const createTask = vi.fn().mockResolvedValue([{ name: 'projects/p/locations/l/queues/q/tasks/t' }]);
const queuePath = vi.fn((p: string, l: string, q: string) => `projects/${p}/locations/${l}/queues/${q}`);
vi.mock('@google-cloud/tasks', () => ({
  CloudTasksClient: vi.fn(() => ({ createTask, queuePath })),
}));

import { makeCloudDriver } from '../../../src/infrastructure/tasks/cloud-driver.js';

describe('cloudDriver', () => {
  it('creates an HTTP task with the secret header and JSON body', async () => {
    const driver = makeCloudDriver({
      project: 'proj', location: 'asia-southeast1',
      serviceUrl: 'https://hrm-api.run.app', secret: 's3cr3t',
    });
    await driver.enqueue('cv-parse', { kind: 'attachment', attachmentId: 'a1' });

    expect(queuePath).toHaveBeenCalledWith('proj', 'asia-southeast1', 'hrm-cv-parse');
    const arg = createTask.mock.calls[0][0];
    expect(arg.parent).toBe('projects/proj/locations/asia-southeast1/queues/hrm-cv-parse');
    expect(arg.task.httpRequest.url).toBe('https://hrm-api.run.app/internal/tasks/cv-parse');
    expect(arg.task.httpRequest.httpMethod).toBe('POST');
    expect(arg.task.httpRequest.headers['X-Tasks-Secret']).toBe('s3cr3t');
    expect(arg.task.httpRequest.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(Buffer.from(arg.task.httpRequest.body, 'base64').toString())).toEqual({
      kind: 'attachment', attachmentId: 'a1',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/cloud-driver.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`apps/api/src/infrastructure/tasks/cloud-driver.ts`:
```ts
import { CloudTasksClient } from '@google-cloud/tasks';
import type { TaskDriver } from './inline-driver.js';
import { TASK_CONFIG, type TaskName } from './task-names.js';

export interface CloudDriverConfig {
  project: string;
  location: string;
  /** Base URL of the hrm-api Cloud Run service (no trailing slash). */
  serviceUrl: string;
  /** Shared secret sent as X-Tasks-Secret. */
  secret: string;
}

/** Production driver: enqueues an HTTP-target Cloud Task per job. */
export function makeCloudDriver(config: CloudDriverConfig): TaskDriver {
  const client = new CloudTasksClient();
  return {
    async enqueue(name: TaskName, payload: unknown, opts) {
      const { queue, path } = TASK_CONFIG[name];
      const parent = client.queuePath(config.project, config.location, queue);
      await client.createTask({
        parent,
        task: {
          ...(opts?.delaySeconds
            ? { scheduleTime: { seconds: Math.floor(Date.now() / 1000) + opts.delaySeconds } }
            : {}),
          httpRequest: {
            httpMethod: 'POST',
            url: `${config.serviceUrl}${path}`,
            headers: { 'Content-Type': 'application/json', 'X-Tasks-Secret': config.secret },
            body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          },
        },
      });
    },
  };
}
```

> Note: `Date.now()` here runs only in production at enqueue time (not in the scripted workflow runner), so it is fine.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/cloud-driver.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/infrastructure/tasks/cloud-driver.ts apps/api/tests/unit/tasks/cloud-driver.test.ts
git commit -m "feat(api): add cloud tasks driver"
```

---

## Task 7: Dispatcher (driver selection + public enqueue)

**Files:**
- Create: `apps/api/src/infrastructure/tasks/dispatcher.ts`
- Test: `apps/api/tests/unit/tasks/dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('dispatcher', () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; vi.resetModules(); });
  beforeEach(() => vi.resetModules());

  it('defaults to the inline driver when TASKS_DRIVER is unset', async () => {
    delete process.env.TASKS_DRIVER;
    const { _clearHandlers, registerHandler } = await import('../../../src/infrastructure/tasks/task-registry.js');
    const { enqueueTask } = await import('../../../src/infrastructure/tasks/dispatcher.js');
    _clearHandlers();
    const seen: unknown[] = [];
    registerHandler('cv-parse', async (p) => { seen.push(p); });
    await enqueueTask('cv-parse', { a: 1 });
    await new Promise((r) => setImmediate(r));
    expect(seen).toEqual([{ a: 1 }]);
  });

  it('throws if TASKS_DRIVER=cloud but config env is missing', async () => {
    process.env.TASKS_DRIVER = 'cloud';
    delete process.env.TASKS_PROJECT;
    const { enqueueTask } = await import('../../../src/infrastructure/tasks/dispatcher.js');
    await expect(enqueueTask('cv-parse', {})).rejects.toThrow(/TASKS_/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/dispatcher.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`apps/api/src/infrastructure/tasks/dispatcher.ts`:
```ts
import type { TaskDriver } from './inline-driver.js';
import { inlineDriver } from './inline-driver.js';
import { makeCloudDriver } from './cloud-driver.js';
import type { TaskName } from './task-names.js';

let cached: TaskDriver | null = null;

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is required when TASKS_DRIVER=cloud`);
  return v;
}

function selectDriver(): TaskDriver {
  if (process.env.TASKS_DRIVER === 'cloud') {
    return makeCloudDriver({
      project: requireEnv('TASKS_PROJECT'),
      location: requireEnv('TASKS_LOCATION'),
      serviceUrl: requireEnv('APP_INTERNAL_URL').replace(/\/$/, ''),
      secret: requireEnv('TASKS_SECRET'),
    });
  }
  return inlineDriver;
}

/** Public enqueue API used by every producer. Lazily resolves the driver so
 * tests can swap TASKS_DRIVER before the first call. */
export async function enqueueTask(
  name: TaskName,
  payload: unknown,
  opts?: { delaySeconds?: number },
): Promise<void> {
  if (!cached) cached = selectDriver();
  await cached.enqueue(name, payload, opts);
}

/** Test-only: drop the memoized driver so a new TASKS_DRIVER takes effect. */
export function _resetDriver(): void {
  cached = null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/dispatcher.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/infrastructure/tasks/dispatcher.ts apps/api/tests/unit/tasks/dispatcher.test.ts
git commit -m "feat(api): add task dispatcher with driver selection"
```

---

## Task 8: Tasks-auth middleware

**Files:**
- Create: `apps/api/src/app/middlewares/tasks-auth.middleware.ts`
- Test: `apps/api/tests/unit/tasks/tasks-auth.middleware.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { tasksAuth } from '../../../src/app/middlewares/tasks-auth.middleware.js';

function res() {
  const r: Partial<Response> = {};
  r.status = vi.fn(() => r as Response);
  r.json = vi.fn(() => r as Response);
  return r as Response;
}

describe('tasksAuth', () => {
  const ENV = { ...process.env };
  beforeEach(() => { process.env.TASKS_SECRET = 'right'; });
  afterEach(() => { process.env = { ...ENV }; });

  it('calls next when the header matches', () => {
    const next = vi.fn();
    tasksAuth({ header: (h: string) => (h === 'X-Tasks-Secret' ? 'right' : undefined) } as unknown as Request, res(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('401s when the header is wrong or missing', () => {
    const next = vi.fn();
    const r = res();
    tasksAuth({ header: () => 'wrong' } as unknown as Request, r, next);
    expect(next).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(401);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/tasks-auth.middleware.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`apps/api/src/app/middlewares/tasks-auth.middleware.ts`:
```ts
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Guards /internal/tasks/* on the public hrm-api service. Cloud Tasks and Cloud
 * Scheduler attach `X-Tasks-Secret`; anything else is rejected. The secret lives
 * in Secret Manager (TASKS_SECRET). A missing server-side secret fails closed.
 */
export function tasksAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.TASKS_SECRET ?? '';
  const provided = req.header('X-Tasks-Secret') ?? '';
  if (expected && safeEqual(provided, expected)) {
    next();
    return;
  }
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid task secret' } });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/tasks/tasks-auth.middleware.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/middlewares/tasks-auth.middleware.ts apps/api/tests/unit/tasks/tasks-auth.middleware.test.ts
git commit -m "feat(api): add internal tasks auth middleware"
```

---

## Task 9: Convert the CV-parse producer + handler

**Files:**
- Modify: `apps/api/src/domain/recruitment/cv-parse.queue.ts`
- Modify: `apps/api/src/domain/recruitment/cv-parse.worker.ts`
- Modify: `apps/api/src/shared/configs/cv-parse.config.ts`

- [ ] **Step 1: Simplify the config (drop BullMQ-specific names)**

Replace `apps/api/src/shared/configs/cv-parse.config.ts` body with:
```ts
// Config for the background CV-parsing feature. The Cloud Tasks queue id and
// route are derived from the task name 'cv-parse' (see infrastructure/tasks).

/** Logical job name. */
export const CV_PARSE_JOB_NAME = 'parse-cv';
```
(Removes `CV_PARSE_QUEUE_NAME`, `CV_PARSE_JOB_RETENTION_SECONDS` — retention now lives in queue config.)

- [ ] **Step 2: Rewrite the producer to use the dispatcher (signature unchanged)**

Replace `apps/api/src/domain/recruitment/cv-parse.queue.ts` with:
```ts
import { randomUUID } from 'node:crypto';
import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';

export interface CvParseAttachmentJob {
  kind: 'attachment';
  attachmentId: string;
  candidateId: string;
  tenantId: string;
}

export interface CvParseBulkItemJob {
  kind: 'bulk_item';
  itemId: string;
  batchId: string;
  tenantId: string;
}

export type CvParseJobData = CvParseAttachmentJob | CvParseBulkItemJob;

export interface CvParseJobResult {
  status: 'DONE' | 'FAILED';
  provider: string | null;
}

/**
 * Enqueue a CV for background parsing via Cloud Tasks. Returns a generated id
 * (kept for call-site compatibility). Failures here must never block the upload
 * flow, so callers wrap this in try/catch and only log on error.
 */
export async function enqueueCvParse(data: CvParseJobData): Promise<string> {
  const id = randomUUID();
  await enqueueTask('cv-parse', data);
  return id;
}
```

- [ ] **Step 3: Convert the worker into an exported handler**

In `apps/api/src/domain/recruitment/cv-parse.worker.ts`:
- Remove the `import { Worker, type Job } from 'bullmq';` and the `createQueueConnection` + `CV_PARSE_QUEUE_NAME` imports.
- Change `handleCvParseJob(job: Job<CvParseJobData>)` to `export async function cvParseHandler(payload: unknown): Promise<void>`, casting `const job = payload as CvParseJobData;` and replacing `job.data` with `job` throughout (both `handleAttachmentJob(job.data)` → `handleAttachmentJob(job)` and the `job.data.kind`/`job.data.itemId`/`job.data.tenantId` reads → `job.kind`/`job.itemId`/`job.tenantId`).
- Delete the `createCvParseWorker` export entirely.

Result (handler tail):
```ts
export async function cvParseHandler(payload: unknown): Promise<void> {
  const job = payload as CvParseJobData;
  if (job.kind === 'bulk_item') {
    await bulkImportService.parseItem(job.itemId, job.tenantId);
    return;
  }
  await handleAttachmentJob(job);
}
```
(`handleAttachmentJob` keeps its existing body; its return value is now ignored — change its callers/return to `Promise<void>` or keep returning the result and ignore it. Keep the result type internal; just don't return from `cvParseHandler`.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @hrm/api exec tsc --noEmit`
Expected: PASS (no references to removed BullMQ symbols in cv-parse files; other files still reference BullMQ and are fixed in later tasks — if so, restrict check to compile after Task 14. If errors are only in not-yet-migrated files, that is expected; proceed.)

> Because the whole app won't typecheck until every queue/worker is migrated (and the scan handler in Task 12 imports `purgeExpiredStaging`, created in Task 13), run the full `tsc --noEmit` only at Task 16. For Tasks 9–15, rely on the per-file unit/integration tests and scoped review.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/recruitment/cv-parse.queue.ts apps/api/src/domain/recruitment/cv-parse.worker.ts apps/api/src/shared/configs/cv-parse.config.ts
git commit -m "refactor(api): cv-parse producer+handler on Cloud Tasks"
```

---

## Task 10: Import job status repository (Postgres)

**Files:**
- Create: `apps/api/src/domain/employee-import/import-job.repository.ts`
- Test: `apps/api/tests/integration/employee-import/import-job.repository.test.ts`

> Integration test — needs the dev Postgres (`docker compose up -d postgres`) with migrations applied.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { importJobRepository } from '../../../src/domain/employee-import/import-job.repository.js';

describe('importJobRepository', () => {
  it('creates, updates, and reads back a job scoped by tenant', async () => {
    const id = await importJobRepository.create('tenant-A');
    expect(await importJobRepository.get(id, 'tenant-B')).toBeNull(); // cross-tenant guard

    await importJobRepository.markActive(id);
    await importJobRepository.setProgress(id, { done: 5, total: 10 });
    let status = await importJobRepository.get(id, 'tenant-A');
    expect(status).toMatchObject({ jobId: id, state: 'active', progress: { done: 5, total: 10 } });

    await importJobRepository.markCompleted(id, { total: 10, created: 9, skipped: 1, failed: 0, errors: [] });
    status = await importJobRepository.get(id, 'tenant-A');
    expect(status?.state).toBe('completed');
    expect(status?.result).toMatchObject({ created: 9 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hrm/api exec vitest run tests/integration/employee-import/import-job.repository.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

`apps/api/src/domain/employee-import/import-job.repository.ts`:
```ts
import type { ImportJobProgress, ImportJobResult, ImportJobStatus } from '@hrm/shared';
import { db } from '../../infrastructure/database/client.js';

/** Postgres-backed import job status (replaces BullMQ job state in Redis). */
export const importJobRepository = {
  async create(tenantId: string): Promise<string> {
    const row = await db.importJob.create({ data: { tenantId, state: 'waiting' } });
    return row.id;
  },

  async markActive(id: string): Promise<void> {
    await db.importJob.update({ where: { id }, data: { state: 'active' } });
  },

  async setProgress(id: string, progress: ImportJobProgress): Promise<void> {
    await db.importJob.update({ where: { id }, data: { progress } });
  },

  async markCompleted(id: string, result: ImportJobResult): Promise<void> {
    await db.importJob.update({ where: { id }, data: { state: 'completed', result } });
  },

  async markFailed(id: string, error: string): Promise<void> {
    await db.importJob.update({ where: { id }, data: { state: 'failed', error } });
  },

  /** Tenant-scoped read for the polling endpoint; null if unknown or cross-tenant. */
  async get(id: string, tenantId: string): Promise<ImportJobStatus | null> {
    const row = await db.importJob.findUnique({ where: { id } });
    if (!row || row.tenantId !== tenantId) return null;
    return {
      jobId: row.id,
      state: row.state as ImportJobStatus['state'],
      progress: row.state === 'active' ? (row.progress as ImportJobProgress | null) : null,
      result: row.state === 'completed' ? (row.result as ImportJobResult | null) : null,
    };
  },
};
```

> If `ImportJobStatus['state']` in `@hrm/shared` does not include all of `waiting|active|completed|failed`, widen that union in `packages/shared` to match (it previously came from `normalizeState`, which produced exactly these plus `unknown`; keep `unknown` if present).

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @hrm/api exec vitest run tests/integration/employee-import/import-job.repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/employee-import/import-job.repository.ts apps/api/tests/integration/employee-import/import-job.repository.test.ts
git commit -m "feat(api): postgres-backed import job status"
```

---

## Task 11: Convert the employee-import producer + handler

**Files:**
- Modify: `apps/api/src/domain/employee-import/employee-import.queue.ts`
- Modify: `apps/api/src/domain/employee-import/employee-import.worker.ts`
- Modify: `apps/api/src/shared/configs/import.config.ts`

- [ ] **Step 1: Trim the config**

In `apps/api/src/shared/configs/import.config.ts`, remove `IMPORT_STAGING_PREFIX`, `importStagingKey`, `IMPORT_QUEUE_NAME`, `IMPORT_JOB_NAME`, `IMPORT_JOB_RETENTION_SECONDS`. Keep `IMPORT_MAX_ROWS`, `IMPORT_MAX_FILE_BYTES`, `IMPORT_STAGING_TTL_SECONDS`, `IMPORT_WORKER_CHUNK_SIZE`.

- [ ] **Step 2: Rewrite the producer (`enqueueImport` keeps signature, returns the new DB job id)**

Replace `apps/api/src/domain/employee-import/employee-import.queue.ts` with:
```ts
import type { ImportJobStatus } from '@hrm/shared';
import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';
import { importJobRepository } from './import-job.repository.js';

/** Payload carried on every import task. The validated rows live in the
 * import_staging table under `importId` (staged by /validate). */
export interface ImportJobData {
  jobId: string;
  importId: string;
  tenantId: string;
}

/** Create the job-status row, enqueue the task, and return the job id the
 * wizard polls. Signature unchanged from the BullMQ version. */
export async function enqueueImport(data: { importId: string; tenantId: string }): Promise<string> {
  const jobId = await importJobRepository.create(data.tenantId);
  await enqueueTask('employee-import', { jobId, importId: data.importId, tenantId: data.tenantId });
  return jobId;
}

/** Read a job's status for the polling endpoint (tenant-scoped; null if unknown). */
export async function getImportJobStatus(
  jobId: string,
  tenantId: string,
): Promise<ImportJobStatus | null> {
  return importJobRepository.get(jobId, tenantId);
}
```

- [ ] **Step 3: Convert the worker into an exported handler that writes DB status**

Replace `apps/api/src/domain/employee-import/employee-import.worker.ts` with:
```ts
import { getStagedImport, discardStagedImport } from './employee-import.staging.js';
import { processImport, type CreatedUser } from './employee-import.processor.js';
import { importJobRepository } from './import-job.repository.js';
import { IMPORT_WORKER_CHUNK_SIZE } from '../../shared/configs/import.config.js';
import type { ImportJobData } from './employee-import.queue.js';
import { enqueueInvites, type InviteJobData } from './employee-import.invite.queue.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Process one import task: mark active, load staged rows, run the two-pass
 * import while persisting progress, store the result, discard staging, then fan
 * out invite emails. Failures are recorded as `failed` (no retry — import is
 * not idempotent at the row level; BullMQ used attempts:1 for the same reason).
 */
export async function employeeImportHandler(payload: unknown): Promise<void> {
  const { jobId, importId, tenantId } = payload as ImportJobData;
  await importJobRepository.markActive(jobId);

  try {
    const staged = await getStagedImport(importId, tenantId);
    if (!staged) {
      await importJobRepository.markCompleted(jobId, { total: 0, created: 0, skipped: 0, failed: 0, errors: [] });
      return;
    }

    const onProgress = (done: number, total: number): void => {
      if (done === total || done % IMPORT_WORKER_CHUNK_SIZE === 0) {
        void importJobRepository.setProgress(jobId, { done, total });
      }
    };

    const created: CreatedUser[] = [];
    const onUserCreated = (user: CreatedUser): void => { created.push(user); };

    const result = await processImport(tenantId, staged.rows, staged.options, onProgress, onUserCreated);
    await discardStagedImport(importId);
    await importJobRepository.markCompleted(jobId, result);

    const invites: InviteJobData[] = created.map((u) => ({
      userId: u.userId, tenantId, email: u.email, fullName: u.fullName,
    }));
    await enqueueInvites(invites);
  } catch (err) {
    logger.error({ err, jobId }, 'employee import failed');
    await importJobRepository.markFailed(jobId, err instanceof Error ? err.message : 'import failed');
  }
}
```

- [ ] **Step 4: Confirm the controller is unchanged**

Open `apps/api/src/app/controllers/employee-import.controller.ts` and verify lines ~93/105 still compile: `enqueueImport({ importId, tenantId })` and `getImportJobStatus(jobId, tenantId)`. No edit expected (signatures preserved).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/employee-import/employee-import.queue.ts apps/api/src/domain/employee-import/employee-import.worker.ts apps/api/src/shared/configs/import.config.ts
git commit -m "refactor(api): employee-import producer+handler on Cloud Tasks"
```

---

## Task 12: Convert invite + reminder producers and handlers

**Files:**
- Modify: `apps/api/src/domain/employee-import/employee-import.invite.queue.ts`
- Modify: `apps/api/src/domain/employee-import/employee-import.invite.worker.ts`
- Modify: `apps/api/src/domain/reminders/reminders.queue.ts`
- Modify: `apps/api/src/domain/reminders/reminder-email.worker.ts`
- Modify: `apps/api/src/domain/reminders/reminders.scan.worker.ts`
- Modify: `apps/api/src/shared/configs/email.config.ts`

- [ ] **Step 1: Trim `email.config.ts`**

Remove the BullMQ queue/job-name/retention consts: `INVITE_QUEUE_NAME`, `INVITE_JOB_NAME`, `INVITE_JOB_RETENTION_SECONDS`, `REMINDER_SCAN_QUEUE_NAME`, `REMINDER_SCAN_JOB_NAME`, `REMINDER_EMAIL_QUEUE_NAME`, `REMINDER_EMAIL_JOB_NAME`, `REMINDER_JOB_RETENTION_SECONDS`. **Keep** `REMINDER_SCAN_CRON`, `REMINDER_SCAN_TZ` (now consumed by Cloud Scheduler provisioning + docs), `RESEND_API_KEY`, `EMAIL_FROM`, `APP_WEB_URL`, and all `build*Link` functions.

- [ ] **Step 2: Rewrite the invite producer**

Replace `apps/api/src/domain/employee-import/employee-import.invite.queue.ts` with:
```ts
import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';

export interface InviteJobData {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
}

/** Enqueue one invite-email task per freshly-created user. */
export async function enqueueInvites(jobs: InviteJobData[]): Promise<void> {
  await Promise.all(jobs.map((data) => enqueueTask('employee-invite', data)));
}
```

- [ ] **Step 3: Convert the invite worker to a handler**

Replace `apps/api/src/domain/employee-import/employee-import.invite.worker.ts` with:
```ts
import { buildSetPasswordLink } from '../../shared/configs/email.config.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';
import { authService } from '../services/auth.service.js';
import type { InviteJobData } from './employee-import.invite.queue.js';

/** Mint a one-time invite token, build the set-password link, send the email.
 * Throwing → router 500 → Cloud Tasks retry (queue maxAttempts=3). */
export async function inviteHandler(payload: unknown): Promise<void> {
  const { userId, email, fullName } = payload as InviteJobData;
  const { token } = await authService.issueInvite(userId);
  await emailProvider.sendInvite({ to: email, fullName, link: buildSetPasswordLink(token) });
}
```

- [ ] **Step 4: Rewrite the reminders producer**

Replace `apps/api/src/domain/reminders/reminders.queue.ts` with:
```ts
import { enqueueTask } from '../../infrastructure/tasks/dispatcher.js';
import type { ReminderEmailJob } from './reminders.service.js';

/** Enqueue one reminder-email task per HR recipient for genuinely-new notifications. */
export async function enqueueReminderEmails(jobs: ReminderEmailJob[]): Promise<void> {
  await Promise.all(jobs.map((data) => enqueueTask('reminder-email', data)));
}
```
(The daily cron is no longer registered in code — `scheduleDailyReminderScan` is removed; Cloud Scheduler triggers `reminder-scan` directly. See Task 16.)

- [ ] **Step 5: Convert the reminder-email worker to a handler**

Replace `apps/api/src/domain/reminders/reminder-email.worker.ts` with:
```ts
import { buildDashboardLink } from '../../shared/configs/email.config.js';
import { emailProvider } from '../../infrastructure/email/email.provider.js';
import type { ReminderEmailJob } from './reminders.service.js';

/** Dispatch one reminder email by kind. Throwing → 500 → Cloud Tasks retry. */
export async function reminderEmailHandler(payload: unknown): Promise<void> {
  const { kind, to, recipientName, employeeName, dueDate, daysUntil } = payload as ReminderEmailJob;
  const input = { to, recipientName, employeeName, dueDate, daysUntil, link: buildDashboardLink() };
  if (kind === 'probation_ending') {
    await emailProvider.sendProbationReminder(input);
  } else {
    await emailProvider.sendContractReminder(input);
  }
}
```

- [ ] **Step 6: Convert the reminder-scan worker to a handler (+ purge expired staging)**

Replace `apps/api/src/domain/reminders/reminders.scan.worker.ts` with:
```ts
import { runReminderScan } from './reminders.scan.js';
import { enqueueReminderEmails } from './reminders.queue.js';
import { purgeExpiredStaging } from '../employee-import/employee-import.staging.js';

/** Daily scan (triggered by Cloud Scheduler): create notifications idempotently,
 * fan out email tasks, and purge expired import_staging rows. */
export async function reminderScanHandler(_payload: unknown): Promise<void> {
  const { emailJobs } = await runReminderScan();
  await enqueueReminderEmails(emailJobs);
  await purgeExpiredStaging();
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/domain/employee-import/employee-import.invite.queue.ts apps/api/src/domain/employee-import/employee-import.invite.worker.ts apps/api/src/domain/reminders/reminders.queue.ts apps/api/src/domain/reminders/reminder-email.worker.ts apps/api/src/domain/reminders/reminders.scan.worker.ts apps/api/src/shared/configs/email.config.ts
git commit -m "refactor(api): invite + reminder producers/handlers on Cloud Tasks"
```

---

## Task 13: Move import staging to Postgres (employee + asset)

**Files:**
- Modify: `apps/api/src/domain/employee-import/employee-import.staging.ts`
- Modify: `apps/api/src/domain/asset-import/asset-import.staging.ts`
- Modify: `apps/api/src/shared/configs/asset-import.config.ts`
- Test: `apps/api/tests/integration/employee-import/employee-import.staging.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { stageImport, getStagedImport, discardStagedImport, purgeExpiredStaging } from '../../../src/domain/employee-import/employee-import.staging.js';

const sample = { tenantId: 'tenant-A', rows: [{ email: 'a@x.com' }], options: {} } as any;

describe('employee import staging (postgres)', () => {
  it('stages, reads (tenant-scoped), and discards', async () => {
    const id = await stageImport(sample);
    expect(await getStagedImport(id, 'tenant-B')).toBeNull();
    const got = await getStagedImport(id, 'tenant-A');
    expect(got?.rows[0].email).toBe('a@x.com');
    await discardStagedImport(id);
    expect(await getStagedImport(id, 'tenant-A')).toBeNull();
  });

  it('purges expired rows', async () => {
    await purgeExpiredStaging(); // smoke: returns a number, no throw
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hrm/api exec vitest run tests/integration/employee-import/employee-import.staging.test.ts`
Expected: FAIL (functions still Redis-based / `purgeExpiredStaging` missing).

- [ ] **Step 3: Rewrite employee staging on Postgres**

Replace `apps/api/src/domain/employee-import/employee-import.staging.ts` with:
```ts
import type { StagedImport } from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import { IMPORT_STAGING_TTL_SECONDS } from '../../shared/configs/import.config.js';

/** Stage validated rows in Postgres between /validate and /import. */
export async function stageImport(payload: StagedImport): Promise<string> {
  const expiresAt = new Date(Date.now() + IMPORT_STAGING_TTL_SECONDS * 1000);
  const row = await db.importStaging.create({
    data: {
      tenantId: payload.tenantId,
      kind: 'employee',
      payload: payload as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
  });
  return row.id;
}

/** Fetch a staged import; null if missing, expired (lazy), or cross-tenant. */
export async function getStagedImport(importId: string, tenantId: string): Promise<StagedImport | null> {
  const row = await db.importStaging.findUnique({ where: { id: importId } });
  if (!row || row.kind !== 'employee' || row.expiresAt < new Date()) return null;
  const parsed = row.payload as unknown as StagedImport;
  if (parsed.tenantId !== tenantId) return null;
  return parsed;
}

/** Remove a staged import after a successful enqueue. */
export async function discardStagedImport(importId: string): Promise<void> {
  await db.importStaging.deleteMany({ where: { id: importId } });
}

/** Delete all expired staging rows (employee + asset). Called by the daily scan. */
export async function purgeExpiredStaging(): Promise<number> {
  const { count } = await db.importStaging.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}
```

- [ ] **Step 4: Rewrite asset staging on Postgres**

Replace `apps/api/src/domain/asset-import/asset-import.staging.ts` with:
```ts
import type { StagedAssetImport } from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';
import { IMPORT_STAGING_TTL_SECONDS } from '../../shared/configs/import.config.js';

export async function stageAssetImport(payload: StagedAssetImport): Promise<string> {
  const expiresAt = new Date(Date.now() + IMPORT_STAGING_TTL_SECONDS * 1000);
  const row = await db.importStaging.create({
    data: {
      tenantId: payload.tenantId,
      kind: 'asset',
      payload: payload as unknown as Prisma.InputJsonValue,
      expiresAt,
    },
  });
  return row.id;
}

export async function getStagedAssetImport(importId: string, tenantId: string): Promise<StagedAssetImport | null> {
  const row = await db.importStaging.findUnique({ where: { id: importId } });
  if (!row || row.kind !== 'asset' || row.expiresAt < new Date()) return null;
  const parsed = row.payload as unknown as StagedAssetImport;
  if (parsed.tenantId !== tenantId) return null;
  return parsed;
}

export async function discardStagedAssetImport(importId: string): Promise<void> {
  await db.importStaging.deleteMany({ where: { id: importId } });
}
```

> `IMPORT_STAGING_TTL_SECONDS` now lives only in `import.config.ts`. In `asset-import.config.ts`, remove `assetImportStagingKey` and the re-export of `IMPORT_STAGING_TTL_SECONDS`; update the asset staging import (above) to pull TTL from `import.config.js`. Leave the rest of `asset-import.config.ts` intact.

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter @hrm/api exec vitest run tests/integration/employee-import/employee-import.staging.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domain/employee-import/employee-import.staging.ts apps/api/src/domain/asset-import/asset-import.staging.ts apps/api/src/shared/configs/asset-import.config.ts apps/api/tests/integration/employee-import/employee-import.staging.test.ts
git commit -m "refactor(api): move import staging from Redis to Postgres"
```

---

## Task 14: Permission cache → in-process TTL

**Files:**
- Create: `apps/api/src/infrastructure/cache/permission-cache.ts`
- Modify: `apps/api/src/domain/services/permission.service.ts`
- Test: `apps/api/tests/unit/services/permission-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { permissionService } from '../../../src/domain/services/permission.service.js';
import { permissionRepository } from '../../../src/domain/repositories/permission.repository.js';

describe('permissionService in-process cache', () => {
  beforeEach(() => permissionService.invalidateRolePermissions('role-1'));

  it('caches the DB result and serves the second call from memory', async () => {
    const spy = vi.spyOn(permissionRepository, 'findKeysByRoleId').mockResolvedValue(['a', 'b']);
    const first = await permissionService.getPermissionsForRole('role-1');
    const second = await permissionService.getPermissionsForRole('role-1');
    expect([...first].sort()).toEqual(['a', 'b']);
    expect(second.has('a')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1); // second served from cache
    spy.mockRestore();
  });

  it('re-reads the DB after invalidation', async () => {
    const spy = vi.spyOn(permissionRepository, 'findKeysByRoleId').mockResolvedValue(['x']);
    await permissionService.getPermissionsForRole('role-1');
    permissionService.invalidateRolePermissions('role-1');
    await permissionService.getPermissionsForRole('role-1');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/services/permission-cache.test.ts`
Expected: FAIL (current service uses Redis import that may error / no in-process caching).

- [ ] **Step 3: Implement the cache helper**

`apps/api/src/infrastructure/cache/permission-cache.ts`:
```ts
/** Per-instance TTL cache keyed by string. Bounded staleness replaces Redis for
 * role-permission lookups (role edits are rare; default TTL 60s). */
interface Entry<V> { value: V; expiresAt: number; }

export class TtlCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) { this.store.delete(key); return undefined; }
    return hit.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void { this.store.delete(key); }
}
```

- [ ] **Step 4: Rewrite the permission service**

Replace `apps/api/src/domain/services/permission.service.ts` with:
```ts
import { permissionRepository } from '../repositories/permission.repository.js';
import { TtlCache } from '../../infrastructure/cache/permission-cache.js';

const CACHE_TTL_MS = 60_000; // 60s; bounds cross-instance staleness
const cache = new TtlCache<string[]>(CACHE_TTL_MS);

export const permissionService = {
  /** Resolve a role's permission keys; in-process TTL cache over the DB. */
  async getPermissionsForRole(roleId: string): Promise<Set<string>> {
    const cached = cache.get(roleId);
    if (cached) return new Set(cached);
    const keys = await permissionRepository.findKeysByRoleId(roleId);
    cache.set(roleId, keys);
    return new Set(keys);
  },

  invalidateRolePermissions(roleId: string): void {
    cache.delete(roleId);
  },
};
```

> `invalidateRolePermissions` is now synchronous. Check its call sites (`grep -rn invalidateRolePermissions apps/api/src`) — if any `await` it, the `await` is harmless on a non-promise, but update obvious cases. If a caller relies on `Promise<void>`, keep the `await`; TypeScript allows awaiting a `void`.

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm --filter @hrm/api exec vitest run tests/unit/services/permission-cache.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/infrastructure/cache/permission-cache.ts apps/api/src/domain/services/permission.service.ts apps/api/tests/unit/services/permission-cache.test.ts
git commit -m "refactor(api): permission cache to in-process TTL (no Redis)"
```

---

## Task 15: Register handlers, internal router, wire into the app

**Files:**
- Create: `apps/api/src/infrastructure/tasks/register-handlers.ts`
- Create: `apps/api/src/app/routes/internal-tasks.router.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/tests/integration/tasks/internal-router.test.ts`

- [ ] **Step 1: Implement the handler registration module**

`apps/api/src/infrastructure/tasks/register-handlers.ts`:
```ts
import { registerHandler } from './task-registry.js';
import { cvParseHandler } from '../../domain/recruitment/cv-parse.worker.js';
import { employeeImportHandler } from '../../domain/employee-import/employee-import.worker.js';
import { inviteHandler } from '../../domain/employee-import/employee-import.invite.worker.js';
import { reminderEmailHandler } from '../../domain/reminders/reminder-email.worker.js';
import { reminderScanHandler } from '../../domain/reminders/reminders.scan.worker.js';

let registered = false;

/** Register every task handler exactly once. Imported at app startup so both the
 * inline driver and the internal router can resolve handlers by name. */
export function registerAllHandlers(): void {
  if (registered) return;
  registerHandler('cv-parse', cvParseHandler);
  registerHandler('employee-import', employeeImportHandler);
  registerHandler('employee-invite', inviteHandler);
  registerHandler('reminder-email', reminderEmailHandler);
  registerHandler('reminder-scan', reminderScanHandler);
  registered = true;
}
```

- [ ] **Step 2: Implement the internal router**

`apps/api/src/app/routes/internal-tasks.router.ts`:
```ts
import { Router, type Request, type Response } from 'express';
import { tasksAuth } from '../middlewares/tasks-auth.middleware.js';
import { getHandler } from '../../infrastructure/tasks/task-registry.js';
import { TASK_NAMES, type TaskName } from '../../infrastructure/tasks/task-names.js';
import { logger } from '../../shared/utils/logger.js';

const VALID = new Set<string>(TASK_NAMES);

export const internalTasksRouter: Router = Router();

internalTasksRouter.post('/internal/tasks/:name', tasksAuth, async (req: Request, res: Response) => {
  const name = req.params.name;
  if (!VALID.has(name)) {
    res.status(404).json({ success: false, error: { code: 'UNKNOWN_TASK', message: name } });
    return;
  }
  try {
    await getHandler(name as TaskName)(req.body);
    res.status(200).json({ success: true });
  } catch (err) {
    // 5xx tells Cloud Tasks to retry per the queue's policy.
    logger.error({ err, task: name }, 'task handler failed');
    res.status(500).json({ success: false, error: { code: 'TASK_FAILED', message: name } });
  }
});
```

- [ ] **Step 3: Wire into `app.ts`**

In `apps/api/src/app.ts`:
- Add imports near the others:
  ```ts
  import { internalTasksRouter } from './app/routes/internal-tasks.router.js';
  import { registerAllHandlers } from './infrastructure/tasks/register-handlers.js';
  ```
- After `const app: Express = express();` (and after `express.json()` is registered, since the router needs parsed JSON), register handlers and mount the router **before** `app.use('/api/v1', routes);`:
  ```ts
  registerAllHandlers();
  app.use(internalTasksRouter);
  ```

- [ ] **Step 4: Write the integration test**

`apps/api/tests/integration/tasks/internal-router.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../../src/app.js';

describe('POST /internal/tasks/:name', () => {
  beforeEach(() => { process.env.TASKS_SECRET = 'test-secret'; });

  it('401s without the secret', async () => {
    const res = await request(app).post('/internal/tasks/reminder-scan').send({});
    expect(res.status).toBe(401);
  });

  it('404s for an unknown task name', async () => {
    const res = await request(app)
      .post('/internal/tasks/nope').set('X-Tasks-Secret', 'test-secret').send({});
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter @hrm/api exec vitest run tests/integration/tasks/internal-router.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/infrastructure/tasks/register-handlers.ts apps/api/src/app/routes/internal-tasks.router.ts apps/api/src/app.ts apps/api/tests/integration/tasks/internal-router.test.ts
git commit -m "feat(api): internal tasks router + handler registration"
```

---

## Task 16: Delete the worker process + Redis plumbing, drop deps

**Files:**
- Delete: `apps/api/src/worker.ts`
- Delete: `apps/api/src/infrastructure/cache/redis.ts`
- Delete: `apps/api/src/infrastructure/queue/connection.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Delete the files**

Run:
```bash
git rm apps/api/src/worker.ts apps/api/src/infrastructure/cache/redis.ts apps/api/src/infrastructure/queue/connection.ts
```

- [ ] **Step 2: Remove dead deps**

Run:
```bash
pnpm --filter @hrm/api remove bullmq ioredis
```
Expected: both leave `apps/api/package.json` dependencies; lockfile updates.

- [ ] **Step 3: Confirm no lingering references**

Run:
```bash
grep -rn -e "bullmq" -e "ioredis" -e "from '.*cache/redis" -e "queue/connection" apps/api/src | grep -v node_modules || echo "clean"
```
Expected: prints `clean`.

- [ ] **Step 4: Full typecheck**

Run: `pnpm --filter @hrm/api exec tsc --noEmit`
Expected: PASS. Fix any stragglers (commonly: a leftover `createXWorker` import, the `scheduleDailyReminderScan` import in a deleted file, or a `Job`/`Worker` type reference). Re-run until clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(api): remove worker process, redis plumbing, bullmq/ioredis deps"
```

---

## Task 17: Full API test + build green

**Files:** none (verification)

- [ ] **Step 1: Run the whole API suite**

Run: `pnpm --filter @hrm/api test`
Expected: all tests pass. Investigate and fix any test that still assumes BullMQ (e.g. tests importing `createXWorker` or mocking ioredis) — update them to call the exported handler directly or drop the Redis mock.

- [ ] **Step 2: Build**

Run: `pnpm --filter @hrm/api build`
Expected: `tsc` emits `dist/` with no errors.

- [ ] **Step 3: Commit any test fixups**

```bash
git add -A
git commit -m "test(api): align job tests with Cloud Tasks handlers"
```

---

## Task 18: Update cloudbuild.yaml

**Files:**
- Modify: `cloudbuild.yaml`

- [ ] **Step 1: Edit substitutions + steps**

In `cloudbuild.yaml`:
- Remove `_VPC_CONNECTOR` and `_REDIS_IP` from `substitutions`. Add `_TASKS_SECRET_SET` is **not** needed (secret read from Secret Manager).
- In the **migrate** step (`hrm-migrate`): remove `--vpc-connector=${_VPC_CONNECTOR}`. Keep `--set-cloudsql-instances` and `--set-secrets=DATABASE_URL=...`.
- In the **deploy-api** step: remove `--vpc-connector=${_VPC_CONNECTOR}` and the `REDIS_URL=redis://${_REDIS_IP}:6379,` fragment from `--set-env-vars`. Append to `--set-env-vars`: `TASKS_DRIVER=cloud,TASKS_PROJECT=$PROJECT_ID,TASKS_LOCATION=${_REGION},APP_INTERNAL_URL=${_WEB_URL%/}`. Add `TASKS_SECRET=TASKS_SECRET:latest` to `--set-secrets`. Add `--timeout=900` (15 min request cap for long CV parses).
  > `APP_INTERNAL_URL` must be the **Cloud Run service URL** (where Cloud Tasks POST), not the public web domain. Set it to the `hrm-api` run.app URL. Simplest: after first deploy, capture the service URL and pass it as a new substitution `_API_URL`; use `APP_INTERNAL_URL=${_API_URL}`. Document this two-phase bootstrap in the deploy doc (Task 19).
- Delete the entire **deploy-worker** step.

- [ ] **Step 2: Sanity-lint the YAML**

Run: `pnpm dlx js-yaml cloudbuild.yaml >/dev/null && echo "yaml ok"` (or any YAML linter available)
Expected: `yaml ok`.

- [ ] **Step 3: Commit**

```bash
git add cloudbuild.yaml
git commit -m "ci: cloudbuild on Cloud Tasks (drop worker, redis, vpc)"
```

---

## Task 19: Rewrite the deployment doc

**Files:**
- Modify: `docs/deployment-gcp.md`

- [ ] **Step 1: Replace the architecture + infra sections**

Rewrite `docs/deployment-gcp.md` so it reflects:
- **Architecture line:** Cloud Run (`hrm-api` only) · Cloud SQL · **Cloud Tasks** · **Cloud Scheduler** · Cloud Storage · Secret Manager · Firebase Hosting. Remove Memorystore, VPC connector, and `hrm-worker`.
- **Project/region:** `PROJECT_ID=gen-lang-client-0828439003`, `REGION=asia-southeast1`.
- **Enable APIs:** add `cloudtasks.googleapis.com cloudscheduler.googleapis.com`; remove `redis.googleapis.com vpcaccess.googleapis.com`.
- **Remove** the Memorystore + VPC connector section.
- **Add a Cloud Tasks section:**
  ```bash
  for Q in cv-parse employee-import employee-invite reminder-email reminder-scan; do
    gcloud tasks queues create hrm-$Q --location=$REGION
  done
  # Retry policy (cv-parse 2 attempts, others 3):
  gcloud tasks queues update hrm-cv-parse --location=$REGION \
    --max-attempts=2 --min-backoff=2s --max-backoff=60s
  for Q in employee-import employee-invite reminder-email reminder-scan; do
    gcloud tasks queues update hrm-$Q --location=$REGION \
      --max-attempts=3 --min-backoff=2s --max-backoff=60s
  done
  ```
- **Add the `TASKS_SECRET`** to the Secret Manager section:
  ```bash
  openssl rand -hex 32 | tr -d '\n' | gcloud secrets create TASKS_SECRET --data-file=-
  ```
  and add `TASKS_SECRET` to the runtime-SA `secretAccessor` loop.
- **Add a Cloud Scheduler section** (daily scan; uses `REMINDER_SCAN_CRON='0 7 * * *'`, `REMINDER_SCAN_TZ='Asia/Ho_Chi_Minh'`):
  ```bash
  API_URL=$(gcloud run services describe hrm-api --region=$REGION --format='value(status.url)')
  SECRET=$(gcloud secrets versions access latest --secret=TASKS_SECRET)
  gcloud scheduler jobs create http hrm-reminder-scan \
    --location=$REGION --schedule='0 7 * * *' --time-zone='Asia/Ho_Chi_Minh' \
    --uri="$API_URL/internal/tasks/reminder-scan" --http-method=POST \
    --headers="X-Tasks-Secret=$SECRET" --message-body='{}'
  ```
- **Two-phase deploy note:** `APP_INTERNAL_URL` must equal the `hrm-api` Cloud Run URL. First run `gcloud builds submit` (deploy-api creates the service), capture `API_URL`, then re-run passing `--substitutions=...,_API_URL=$API_URL` (and the same `_WEB_URL`, `_GCS_BUCKET`). Document that the first deploy's enqueues are no-ops until `_API_URL` is set — acceptable for the initial bring-up.
- **Cost line:** ≈ $43/month (Cloud SQL db-g1-small + scale-to-zero Cloud Run + Cloud Tasks + Scheduler + Hosting + GCS + Secret Manager).
- **Domain:** map `hrm.codecrush.asia` in Firebase Hosting; add the DNS record in the `codecrush-asia` managed zone (project `gen-lang-client-0828439003`).

- [ ] **Step 2: Commit**

```bash
git add docs/deployment-gcp.md
git commit -m "docs: deployment guide for Cloud Tasks architecture"
```

---

## Task 20: Final verification

**Files:** none

- [ ] **Step 1: Lint + typecheck + test + build, repo-wide for the API**

Run:
```bash
pnpm --filter @hrm/api lint && pnpm --filter @hrm/api exec tsc --noEmit && pnpm --filter @hrm/api test && pnpm --filter @hrm/api build
```
Expected: all four succeed.

- [ ] **Step 2: Grep for any missed Redis/BullMQ references repo-wide (excluding node_modules and historical docs)**

Run:
```bash
grep -rn -e "bullmq" -e "ioredis" -e "Memorystore" -e "vpc-connector" apps cloudbuild.yaml | grep -v node_modules || echo "clean"
```
Expected: `clean` (the only allowed hits are in the spec/plan under `docs/superpowers/`, which describe the migration).

- [ ] **Step 3: Confirm inline driver is the default for local dev**

Run: `grep -n "TASKS_DRIVER" apps/api/.env.example || echo "add TASKS_DRIVER doc"`
Expected: add a commented `# TASKS_DRIVER=inline (default); set 'cloud' in production` line to `apps/api/.env.example` if absent, then commit.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(api): document TASKS_DRIVER default; final cleanup" --allow-empty
```

---

## Done criteria

- `pnpm --filter @hrm/api test` and `build` are green.
- No `bullmq`/`ioredis`/Memorystore/VPC references remain in `apps/` or `cloudbuild.yaml`.
- `cloudbuild.yaml` deploys only `hrm-api` (+ migrate job), with `TASKS_*` env and `TASKS_SECRET`.
- `docs/deployment-gcp.md` documents Cloud Tasks queues, Cloud Scheduler, `TASKS_SECRET`, the two-phase deploy, and `hrm.codecrush.asia`.
- The five job paths work end-to-end via `/internal/tasks/*` (verified after deploy in the rollout step).
