# Spec: Replace BullMQ/Redis with Cloud Tasks

**Date:** 2026-06-19
**Status:** Approved (design)
**Author:** godefroy@codecrush.asia + Claude
**Scope:** `apps/api` job subsystem + GCP deployment config. No changes to the Prisma data model except one additive migration (import staging table).

---

## 1. Motivation

The current production architecture runs background jobs on **BullMQ**, which requires **Redis (Memorystore)** and an **always-on `hrm-worker` Cloud Run service** (`min-instances=1`, no CPU throttling). Together those two pieces account for ~$90 of the ~$125/month GCP bill for a 100-employee deployment.

Replacing the queue with **Google Cloud Tasks** (a serverless push queue) removes Memorystore, the Serverless VPC connector, and the always-on worker. The API service scales to zero between jobs. Target monthly cost ≈ **$43/month**.

The relational data layer (Prisma + PostgreSQL) is **unchanged** — it is the correct fit for HRM data. Risk is contained to the job subsystem.

## 2. Goals / Non-goals

**Goals**
- Remove all runtime dependency on Redis and BullMQ.
- Run all background jobs via Cloud Tasks pushing to the existing `hrm-api` service.
- Preserve existing job behavior: retries, backoff, idempotency, graceful degradation.
- Keep local dev and the test suite working without any Cloud emulator.
- Update `cloudbuild.yaml` and `docs/deployment-gcp.md` to the new (cheaper) topology.

**Non-goals**
- No migration to MongoDB/Mongoose. Postgres stays.
- No change to job *business logic* (CV parsing, imports, invites, reminders) beyond unwrapping it from BullMQ.
- No new product features.

## 3. Current state (what exists today)

**Queue producers** (`Queue.add()`):
- `domain/recruitment/cv-parse.queue.ts` — `enqueueCvParse(data)`
- `domain/employee-import/employee-import.queue.ts` — import enqueue
- `domain/employee-import/employee-import.invite.queue.ts` — invite enqueue
- `domain/reminders/reminders.queue.ts` — `enqueueReminderEmails(jobs)` (bulk) + `scheduleDailyReminderScan()` (repeatable cron)

**Queue consumers** (`new Worker()`), all started in `worker.ts`:
- `cv-parse.worker.ts` → `handleCvParseJob`
- `employee-import.worker.ts` → `handleImportJob`
- `employee-import.invite.worker.ts` → `handleInviteJob`
- `reminders/reminder-email.worker.ts` → `handleReminderEmailJob`
- `reminders/reminders.scan.worker.ts` → `handleScanJob` (cron-triggered)

**Redis (non-queue) uses:**
- `infrastructure/cache/redis.ts` — shared ioredis client.
- `employee-import.staging.ts` + `asset-import.staging.ts` — `SET/GET/DEL` with TTL; stage validated import rows between `/validate` and `/import`.
- `domain/services/permission.service.ts` — cache-aside (1h TTL) for a role's permission keys; already falls back to DB on any Redis error.

**Queue connection plumbing:** `infrastructure/queue/connection.ts` (`createQueueConnection()`).

## 4. Target architecture

```
Producer code ──► Cloud Tasks queue ──(HTTPS POST + X-Tasks-Secret)──► hrm-api  POST /internal/tasks/<job>
Cloud Scheduler ──(daily cron POST + X-Tasks-Secret)───────────────► hrm-api  POST /internal/tasks/reminder-scan
```

A single Cloud Run service (`hrm-api`, `--allow-unauthenticated`, scale-to-zero) serves the public API **and** executes jobs via internal routes. No `hrm-worker`, no Redis, no VPC.

### 4.1 TaskDispatcher (new module: `infrastructure/tasks/`)

A driver-based dispatcher with a stable interface:

```ts
interface TaskDispatcher {
  enqueue(job: TaskName, payload: unknown, opts?: { delaySeconds?: number }): Promise<void>;
}
```

- **`cloud` driver** (production): wraps `@google-cloud/tasks` `CloudTasksClient.createTask()`. Builds an HTTP target task to `${APP_INTERNAL_URL}/internal/tasks/<job>`, sets the `X-Tasks-Secret` header from env, and JSON-encodes the payload. Queue selected per job name.
- **`inline` driver** (dev/test): invokes the registered handler in-process (via `setImmediate`, errors logged not thrown) so jobs "just run" with no Cloud dependency.

Driver chosen by `TASKS_DRIVER` env (`cloud` | `inline`). Default `inline` when unset (safe for local/test).

**Producer functions keep their existing names and signatures** (`enqueueCvParse`, `enqueueReminderEmails`, the import/invite enqueues). Only their bodies change: `queue.add(...)` → `dispatcher.enqueue(...)`. Call sites elsewhere in the app are untouched.

### 4.2 Handlers + internal router

- Each BullMQ worker's processor function becomes a plain `async (payload) => void | Result` handler. The business logic moves verbatim; only the `new Worker(name, fn, {connection})` envelope is removed.
- New `interfaces/http/internal-tasks.router.ts` mounts `POST /internal/tasks/<job>` for each job and dispatches the request body to the matching handler.
- A handler that throws → router responds **500** → Cloud Tasks retries per queue policy. A handler that completes → **200/204**. Known-permanent failures (e.g. record deleted) return **200** to avoid pointless retries (matches today's behavior where such cases resolve to `FAILED` without throwing).

### 4.3 Auth on internal routes — **shared-secret header** (decided)

Because `hrm-api` is public, `/internal/tasks/*` sits behind middleware verifying `X-Tasks-Secret` against `TASKS_SECRET` (Secret Manager, 32+ random bytes). Constant-time compare. Cloud Tasks and Cloud Scheduler both set this header on the task/job. (OIDC tokens considered; shared secret chosen as sufficient and simpler at this scale.)

### 4.4 Retries / backoff

Moved from BullMQ `defaultJobOptions` to **Cloud Tasks queue config**:

| Queue | maxAttempts | Backoff |
|---|---|---|
| `cv-parse` | 2 | min 2s, exponential |
| `employee-import` | 3 | min 2s, exponential |
| `employee-invite` | 3 | min 2s, exponential |
| `reminder-email` | 3 | min 2s, exponential |

Set once at provisioning via `gcloud tasks queues create/update`.

### 4.5 Daily cron

`scheduleDailyReminderScan()` (BullMQ repeatable) is removed. A **Cloud Scheduler** job (existing `REMINDER_SCAN_CRON` / `REMINDER_SCAN_TZ`) POSTs to `/internal/tasks/reminder-scan` with the secret header. The scan handler also purges expired `import_staging` rows.

### 4.6 Import staging → Postgres (decided)

New additive Prisma model (one migration):

```prisma
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
```

`stageImport` / `getStagedImport` / `discardStagedImport` (employee + asset) rewrite to this table. Reads treat `expiresAt < now()` as not-found (lazy expiry). The daily scan deletes expired rows. Cross-tenant guard preserved.

### 4.7 Permission cache → in-process TTL (decided)

`permission.service.ts` drops Redis for a per-instance `Map<roleId, {keys, expiresAt}>` with **60s TTL**. `invalidateRolePermissions` deletes the local entry. Cross-instance staleness is bounded by the 60s TTL; role/permission edits are rare. Same public interface; the DB remains source of truth.

### 4.8 Deletions

`worker.ts`, `infrastructure/cache/redis.ts`, `infrastructure/queue/connection.ts`, and the `bullmq` + `ioredis` dependencies from `apps/api/package.json`.

## 5. Deployment / infra changes

**`cloudbuild.yaml`:** remove the `deploy-worker` step; remove `--vpc-connector` / Redis env from `deploy-api` and the migrate job (Cloud SQL stays via `--add-cloudsql-instances`). Add `TASKS_DRIVER=cloud`, `TASKS_PROJECT`, `TASKS_LOCATION`, `APP_INTERNAL_URL`, and `TASKS_SECRET` (secret) to `deploy-api`. Assign the runtime service account.

**`docs/deployment-gcp.md`:** rewrite to the new topology. Provisioning now includes:
- `gcloud tasks queues create` ×4 (with retry config from §4.4).
- `gcloud scheduler jobs create http reminder-scan` (daily, secret header).
- `TASKS_SECRET` in Secret Manager.
- Remove Memorystore + VPC connector sections.

**Target footprint:** Cloud SQL (`db-g1-small`) + Cloud Run `hrm-api` (scale-to-zero) + Cloud Tasks + Cloud Scheduler + Firebase Hosting + GCS + Secret Manager ≈ $43/month.

## 6. Testing (TDD)

- **TaskDispatcher:** inline driver runs the handler; cloud driver builds the correct task (mock `CloudTasksClient`, assert URL/queue/header/body).
- **Internal auth middleware:** rejects missing/wrong secret (401), accepts correct.
- **Each handler:** existing behavior preserved (reuse current worker tests, calling the handler directly).
- **Import staging:** Postgres round-trip, expiry, cross-tenant guard.
- **Permission cache:** hit, expiry, invalidation.
- Full `pnpm --filter @hrm/api test` green before deploy.

## 7. Rollout

1. Land the refactor on a feature branch with all tests green (`TASKS_DRIVER=inline` in dev/test).
2. Provision Cloud Tasks queues, Scheduler job, `TASKS_SECRET` in project `gen-lang-client-0828439003` (region `asia-southeast1`).
3. Deploy via the updated `cloudbuild.yaml` (`TASKS_DRIVER=cloud`).
4. Smoke-test each job path (upload CV, bulk import, invite, trigger scan).
5. Map domain `hrm.codecrush.asia` (Firebase Hosting) + DNS in the `codecrush-asia` zone.

## 8. Risks

- **No official Cloud Tasks emulator** → mitigated by the inline driver for dev/test.
- **Permission staleness ≤ 60s** across instances → acceptable; documented.
- **Long jobs vs. Cloud Run request timeout** → set the `hrm-api` request timeout high enough (CV parse calls Anthropic); Cloud Run allows up to 60 min. Configure at deploy.
- **At-least-once delivery** → handlers must be idempotent; current handlers re-read state by id and are safe.
