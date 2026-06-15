# PLAN-006: Employee Bulk Import — Task Breakdown

**Spec:** `docs/specs/006-employee-bulk-import.md`
**Created:** 2026-05-31
**Author:** Claude + Hạnh
**Strategy:** Vertical slices, foundation + risk first, TDD throughout.

---

## Resolved open questions (decided for this plan)

1. **Staging:** `/validate` returns an `importId`; validated rows are staged in
   **Redis** under that id (TTL ~30 min). `/import` references `importId` so HR
   does not re-upload. Commit re-checks duplicates against DB (cheap) before write.
2. **Invite email:** queued as **separate jobs** (queue `hrm.employee.invite`)
   after each employee is created, throttled — never blocks the import worker.
3. **Progress:** **poll** `GET /employees/import/:jobId` (no socket infra needed).
4. **Permission:** dedicated **`employees:import`**, granted to `SUPER_ADMIN` +
   `HR_MANAGER` in the seed/role map.

---

## Dependency map

```
T1 (perm) ─┐
T2 (User invite schema + set-password) ─┐
T3 (parser+validator core) ─┐           │
        │                   │           │
        ▼                   ▼           ▼
T4 /validate API ◄──────────┘     T5 import service (codes block,
        │                              two-pass manager, org auto-create)
        ▼                                   │
T6 BullMQ import worker + progress ◄────────┘
        │
        ▼
T7 invite email queue
        │
        ▼
T8 template download (xlsx/csv)
        │
        ▼
T9 frontend wizard + i18n
        │
        ▼
T10 E2E + 5k scale check
```

---

## Phase 1 — Foundation (risk-first: auth + parsing)

### Task 1.1 — Add `employees:import` permission
**Objective:** RBAC primitive exists end-to-end before any endpoint.
**Files:** permission constants (shared + api), role→permission seed/map, RBAC tests.
**Acceptance:**
- [ ] `employees:import` defined; granted to `SUPER_ADMIN`, `HR_MANAGER`
- [ ] `EMPLOYEE`/`MANAGER` do NOT have it
- [ ] Unit test asserts the grant matrix
**Dependencies:** none.

### Task 1.2 — `User` invite/set-password mechanism (⚠️ migration, Ask First)
**Objective:** Create users with no password at import; they set it via emailed token.
**Files:** `prisma/schema.prisma` (User: `inviteToken`, `inviteTokenExpiresAt`, `passwordSetAt`, status `INVITED`), migration, `auth.service` (`issueInvite`, `setPasswordFromToken`), `POST /auth/set-password`, validator, tests.
**Acceptance:**
- [ ] User can be created in `INVITED` state with a hashed-random/empty password (cannot log in)
- [ ] `POST /auth/set-password` with valid token sets bcrypt hash + activates; expired/invalid token → 400
- [ ] Token single-use; `passwordSetAt` recorded
- [ ] Unit + integration tests (valid, expired, reused, wrong token)
**Dependencies:** none. **Ask First:** confirm schema change before migrating.

### Task 1.3 — File parser + row validator (pure, no DB writes)
**Objective:** Deterministic, well-tested parsing/validation core (the riskiest logic).
**Files:** `employee-import.parser.ts` (xlsx/csv → rows), `employee-import.validator.ts` (Zod + cross-row checks), error-code constants, unit tests.
**Acceptance:**
- [ ] Parses `.xlsx` and `.csv` into normalized row objects (trim, lowercase email)
- [ ] Per-row Zod: required fields, email format, `YYYY-MM-DD` dates, enum values
- [ ] Cross-row: duplicate email **within file** → `IMPORT_EMAIL_DUPLICATE_IN_FILE`
- [ ] Returns `{ row, column, code, message }[]` with stable codes
- [ ] Unit tests cover every error code + a clean file
**Dependencies:** none (lib add = Ask First per tech-stack).

---

## Checkpoint A — Foundation
- [ ] Permission grant matrix tested
- [ ] Invite/set-password flow works (tests green) + migration applied locally
- [ ] Parser/validator unit tests green for all codes
- [ ] `pnpm typecheck` + API tests pass

---

## Phase 2 — Validate endpoint (dry-run)

### Task 2.1 — `POST /employees/import/validate`
**Objective:** HR uploads a file and sees errors before committing; nothing is written.
**Files:** route (`requirePermission('employees:import')`), multipart middleware, controller, service that runs parser+validator + DB-uniqueness checks (email/idNumber) + manager resolvability + new-org-unit detection, Redis staging (`importId`, TTL), shared response types, integration tests.
**Acceptance:**
- [ ] Returns `{ importId, totalRows, validCount, errorCount, errors[], newDepartments[], newPositions[] }`
- [ ] Email/idNumber checked against DB (tenant-scoped); duplicates flagged
- [ ] Manager ref resolvable in-file (email/code) or in-DB, else `IMPORT_MANAGER_NOT_FOUND`
- [ ] File guards: max rows (5,000), max size, mime type → typed errors
- [ ] **No** User/Employee/Department/Position rows created (asserted in test)
- [ ] Validated rows staged in Redis under `importId`
- [ ] RBAC: 403 for EMPLOYEE/MANAGER; tenant isolation
**Dependencies:** 1.1, 1.3.

---

## Checkpoint B — Validation
- [ ] Dry-run returns correct summary, writes nothing
- [ ] RBAC + tenant isolation tested

---

## Phase 3 — Import (background, the core)

### Task 3.1 — Import service: code-block + two-pass + auto-create
**Objective:** Pure-ish service that turns staged rows into employees correctly.
**Files:** `employee-import.service.ts`, employee-code block allocator, reuse `wouldCreateManagerCycle`, `departmentRepository`/`positionRepository` upserts-by-name, unit + integration tests.
**Acceptance:**
- [ ] EMP code start read once; assigned contiguously in memory (no per-row max+1)
- [ ] Pass 1 creates User(INVITED)+Employee per row in chunks (~200/tx)
- [ ] Pass 2 links managers (forward refs resolved by email/code) + cycle guard rejects per-row (recorded, not fatal)
- [ ] `autoCreateOrgUnits=true` creates missing departments/positions by name; off → row error
- [ ] `duplicateMode=skip`: emails existing in DB skipped + recorded
- [ ] Idempotent: re-run same file → 0 new rows
- [ ] No bcrypt at import (users INVITED)
- [ ] Unit: code allocation, two-pass; Integration: 5k-shaped happy path, skip, cycle
**Dependencies:** 1.2, 1.3, 2.1.

### Task 3.2 — BullMQ worker + progress + result report
**Objective:** Run import off the request thread with live progress + downloadable report.
**Files:** queue `hrm.employee.import`, worker, progress writer (Redis), `POST /employees/import` (enqueue → `jobId`), `GET /employees/import/:jobId`, report generation, integration tests.
**Acceptance:**
- [ ] `POST /import` validates `importId` ownership/tenant, enqueues, returns `jobId` immediately
- [ ] Worker chunks rows; a bad chunk/row never rolls back committed chunks (partial success)
- [ ] `GET :jobId` → `{ status, processed, total, created, skipped, failed, reportUrl? }`
- [ ] Final report lists every row outcome (created/skipped/failed+reason)
- [ ] RBAC + tenant-scope at enqueue and status fetch
**Dependencies:** 3.1.

### Task 3.3 — Invite email queue
**Objective:** New employees receive set-password links without blocking import.
**Files:** queue `hrm.employee.invite`, worker (Resend through existing pattern), throttle, template (vi/en), tests (mock provider).
**Acceptance:**
- [ ] Invite enqueued per created employee; worker sends set-password link (token from 1.2)
- [ ] Throttled; failures retried (BullMQ backoff), logged without leaking token/PII
- [ ] Unit/integration with mocked email provider
**Dependencies:** 1.2, 3.2. **Ask First:** Resend config/keys.

---

## Checkpoint C — Backend complete
- [ ] 5,000-row file imports in background; partial success + report correct
- [ ] Idempotent re-run; managers linked; org units auto-created
- [ ] Invite emails enqueued; RBAC + tenant isolation across all endpoints
- [ ] API `tsc` clean; all API tests green; coverage ≥ 80%

---

## Phase 4 — Frontend

### Task 4.1 — Template download
**Objective:** HR gets a correct, localized template.
**Files:** `GET /employees/import/template`, web hook, "Download template" action.
**Acceptance:**
- [ ] `.xlsx` (dropdowns for gender/contractType/role) + `.csv` variants download
- [ ] Headers localized vi/en; example rows + format notes included
**Dependencies:** 1.3 (column contract).

### Task 4.2 — Import wizard UI
**Objective:** End-to-end self-service flow on the Employees page.
**Files:** `EmployeeImportWizard` (Sheet/stepped), hooks (`useValidateImport`, `useStartImport`, `useImportStatus` polling), toolbar "Import" button (`<Can permission="employees:import">`), i18n vi+en, states.
**Acceptance:**
- [ ] Steps: template → upload → review (error table, "Valid N / Errors M") → options (autoCreate, duplicateMode) → confirm → progress bar → done + download report
- [ ] Button hidden without `employees:import`
- [ ] Light+dark, vi+en, skeleton/empty/error states, design tokens only
- [ ] Web typecheck + component tests pass
**Dependencies:** 2.1, 3.2, 4.1.

---

## Checkpoint D — Frontend complete
- [ ] Full wizard works against real API in browser (light + dark)
- [ ] Web tests + typecheck green

---

## Phase 5 — Hardening

### Task 5.1 — E2E + scale check
**Acceptance:**
- [ ] Playwright: upload → validate (with deliberate errors) → fix → confirm → progress → report
- [ ] Seed a 5,000-row file; job completes within target; memory bounded (chunked/streamed)
- [ ] `/review` five-axis pass

---

## Verification (every task)
- TDD: RED → GREEN → REFACTOR
- `pnpm typecheck` (web) / `tsc --noEmit` (api) clean
- Affected unit + integration tests green
- Browser screenshot light + dark for any UI
- No git commit (local-only) unless user explicitly asks

## Ask-First gates (do not proceed silently)
- 1.2 `User` schema migration
- Adding xlsx parser dependency (tech-stack decision template)
- 3.3 Resend email provider configuration
- Final caps: max rows / file size / token TTL
