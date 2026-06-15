# SPEC-006: Employee Bulk Import (Mass Onboarding)

**Status:** Draft
**Created:** 2026-05-31
**Author:** Claude + Hạnh
**Depends on:** SPEC-001 (Auth), SPEC-002 (Employee Management), SPEC-003 (RBAC)

---

## Objective

Let an HR Manager onboard a large workforce (up to ~5,000 employees) into a tenant
in a single, self-service operation by uploading an Excel/CSV file — with a
**validate-before-commit** step, **background processing**, and a **per-row error
report**, so a one-time data migration needs no engineer and never half-writes a
broken batch.

## Target Users

| User | Actions |
|------|---------|
| **Super Admin** | Import employees into any tenant |
| **HR Manager** | Import employees within their own tenant |
| **Manager** | ❌ No access |
| **Employee** | ❌ No access |

Gated server-side by `employees:create` (a new `employees:import` permission may be
split out later; for v1 reuse `employees:create`). All operations tenant-scoped.

---

## Product Decisions (confirmed)

| Decision | Choice |
|----------|--------|
| **Login provisioning** | **Invite email** — each new employee gets a one-time set-password link (token, 7-day expiry). No password in the file. |
| **File formats** | **Both `.xlsx` and `.csv`.** Template is `.xlsx` with dropdowns (gender, contract type, role) + a CSV variant. |
| **Missing department/position** | **Auto-create**, gated by an HR confirmation checkbox ("Create missing departments/positions"). |
| **Duplicate email (vs DB)** | **Skip & report** — create-only. Existing employees are never modified by import. |

---

## Core Features

### 1. Download Template
**Acceptance Criteria:**
- [ ] `GET /employees/import/template?format=xlsx|csv` returns a localized template (vi/en headers)
- [ ] `.xlsx` template has: header row, 1–2 example rows, and data-validation dropdowns for `gender`, `contractType`, `role`
- [ ] Template documents required vs optional columns and accepted formats (date = `YYYY-MM-DD`)

**Columns:**

| Column | Required | Notes |
|--------|----------|-------|
| `fullName` | ✅ | |
| `email` | ✅ | Unique per tenant; becomes the login |
| `dateOfBirth` | ❌ | `YYYY-MM-DD` |
| `gender` | ❌ | `MALE` / `FEMALE` / `OTHER` |
| `idNumber` | ❌ | Unique per tenant if present |
| `phone` | ❌ | |
| `department` | ❌ | **By name** (e.g. "Engineering"), not id |
| `position` | ❌ | **By name** |
| `manager` | ❌ | By manager's **email or employeeCode** |
| `joinDate` | ❌ | `YYYY-MM-DD`, defaults to today |
| `contractType` | ❌ | `FULL_TIME`/`PART_TIME`/`CONTRACT`/`INTERN`/`PROBATION`, default `FULL_TIME` |
| `role` | ❌ | `EMPLOYEE`/`MANAGER`/`HR_MANAGER`, default `EMPLOYEE` |

### 2. Upload + Dry-Run Validation (no DB writes)
**Acceptance Criteria:**
- [ ] `POST /employees/import/validate` accepts a multipart file, parses all rows
- [ ] Returns a summary: `{ totalRows, validCount, errorCount, errors: [{ row, column, code, message }] }`
- [ ] Validates per row: required fields present, email format, date format, enum values, email unique **within file** and **against DB**, idNumber unique, manager reference resolvable (by email/code in-file or in-DB)
- [ ] Validates referential intent: lists which departments/positions are new (would be auto-created)
- [ ] File-level guards: max rows (configurable, default 5,000), max size (e.g. 5 MB), allowed mime types
- [ ] No `User`/`Employee`/`Department`/`Position` rows are created during validation
- [ ] Errors use stable machine codes (e.g. `IMPORT_EMAIL_DUPLICATE_IN_FILE`, `IMPORT_INVALID_DATE`, `IMPORT_MANAGER_NOT_FOUND`) with i18n messages vi/en

### 3. Confirm + Background Import
**Acceptance Criteria:**
- [ ] `POST /employees/import` enqueues a **BullMQ** job (Redis) and returns a `jobId` immediately (non-blocking)
- [ ] Payload carries the parsed/validated rows (or a server-side staged reference) + options (`autoCreateOrgUnits`, `duplicateMode=skip`)
- [ ] Worker processes rows in **chunks** (e.g. 200/transaction) — a failing row never rolls back already-imported chunks (partial success)
- [ ] **Two-pass manager linking:** Pass 1 creates all employees; Pass 2 resolves `manager` references (handles forward refs within the file) and applies `wouldCreateManagerCycle` guard
- [ ] **Employee code:** the start number is read **once** per import; codes are assigned sequentially in memory (no per-row "max+1" query, no race)
- [ ] **No password hashing at import time** — `User` is created in an "invited / pending" state; an invite token is generated and an invite email is queued (Resend)
- [ ] Duplicate emails (vs DB) are skipped and recorded in the result report
- [ ] Idempotent: re-running the same file creates no duplicates (skips existing emails)
- [ ] Job is tenant-scoped and authorized at enqueue time

### 4. Progress + Result Report
**Acceptance Criteria:**
- [ ] `GET /employees/import/:jobId` returns `{ status, processed, total, created, skipped, failed }`
- [ ] On completion, a downloadable report lists every row's outcome (created / skipped-duplicate / failed + reason)
- [ ] UI shows a live progress bar (poll `GET :jobId`, or reuse an existing realtime channel if present) and a final summary with a "Download report" button

### 5. Frontend (Employees page)
**Acceptance Criteria:**
- [ ] "Import" button on the employee list toolbar (visible only with `employees:create` via `<Can>`)
- [ ] Wizard in a `Sheet`/stepped dialog: (1) Download template → (2) Upload → (3) Review validation result → (4) Confirm → (5) Progress → (6) Done + report
- [ ] Validation step renders the error table (row, column, message), with a clear "Valid: N / Errors: M" header
- [ ] Light + dark mode, vi + en i18n, skeleton/empty/error states, design tokens only
- [ ] Auth/Invite: new employees land in "invited" status until they set a password

---

## Out of Scope (this iteration)

- API / SCIM / external HRIS sync (future SPEC)
- Self-service registration links (employee self-onboarding)
- Bulk **update/termination** via file (this spec is create-only onboarding)
- Importing leave balances, payroll, or attendance history
- Photo/avatar bulk upload
- Scheduled/recurring imports

---

## Technical Approach

### New / changed pieces (grounded in current code)

- **Auth model change:** `User` needs an "invited / pending password" state.
  Today `employee.service.create()` requires `password` and hashes with bcrypt.
  Add an invited path: create `User` with no usable password + an invite token
  (new table or columns: `inviteToken`, `inviteTokenExpiresAt`, `passwordSetAt`),
  plus `POST /auth/set-password` (token → set bcrypt hash → activate). This removes
  the bcrypt bottleneck from the import hot path.
- **Employee code:** refactor `generateEmployeeCode` usage so bulk assigns a
  contiguous block computed once (consider a Postgres sequence per tenant later;
  not required for v1).
- **Parsing:** add an xlsx/csv reader (e.g. a maintained, MIT-licensed lib —
  evaluate per `tech-stack.md` decision process before adding).
- **Queue:** BullMQ queue `hrm.employee.import` with chunked worker; progress in Redis.
- **Email:** invite email via the approved provider (Resend) through the existing
  queue pattern.

### API contracts

```
GET    /api/v1/employees/import/template?format=xlsx|csv   -> file download
POST   /api/v1/employees/import/validate  (multipart)      -> { totalRows, validCount, errorCount, errors[] }
POST   /api/v1/employees/import           (json/staged)    -> { jobId }
GET    /api/v1/employees/import/:jobId                      -> { status, processed, total, created, skipped, failed, reportUrl? }
```

All under existing auth + `requirePermission('employees:create')`, tenant-scoped.

### Data flow

```
Template ─► HR fills ─► /validate (parse, dry-run) ─► error table
                                   │ valid
                                   ▼
        /import ─► BullMQ enqueue ─► worker (chunked):
            pass1: create User(invited)+Employee, assign EMP codes, auto-create org units
            pass2: link managers (cycle guard)
            queue invite emails
                                   ▼
        /import/:jobId ◄─ progress ─► UI bar ─► result report
```

### Validation codes (i18n vi/en)

`IMPORT_FILE_TOO_LARGE`, `IMPORT_TOO_MANY_ROWS`, `IMPORT_MISSING_REQUIRED`,
`IMPORT_INVALID_EMAIL`, `IMPORT_EMAIL_DUPLICATE_IN_FILE`, `IMPORT_EMAIL_EXISTS`,
`IMPORT_INVALID_DATE`, `IMPORT_INVALID_ENUM`, `IMPORT_IDNUMBER_DUPLICATE`,
`IMPORT_MANAGER_NOT_FOUND`, `IMPORT_MANAGER_CYCLE`.

---

## Code Style

- Follow all rules in `.claude/rules/` (error-handling, security, naming, api-conventions, database, testing).
- Design tokens only; Tailwind v4; dark mode via `.dark`; i18n vi+en (no hardcoded text).
- Reuse existing primitives: `employeeService`, `departmentRepository`,
  `positionRepository`, `wouldCreateManagerCycle`, `<Can>`, `usePermission`, toast wrapper.

---

## Testing Strategy

- **Unit:**
  - Row validator (each error code), enum/date parsing, in-file email dedupe
  - Manager two-pass resolution incl. forward refs + cycle rejection
  - Employee-code block allocation (no duplicates, correct padding)
- **Integration:**
  - `/validate` returns correct summary + never writes DB
  - `/import` happy path: N rows → N users(invited)+employees, M skipped duplicates, codes contiguous, org units auto-created when flag on
  - Idempotency: re-run same file → 0 new rows
  - RBAC: 403 for `EMPLOYEE`/`MANAGER`; tenant isolation (cannot import into another tenant)
  - `/auth/set-password` token flow activates the account
- **E2E (Playwright):** upload → validate (with deliberate errors) → fix → confirm → progress → report download
- **Scale check:** seed a 5,000-row file; assert job completes within target and memory stays bounded (chunked, streamed parse)

---

## Boundaries

### Always Do
- Enforce `requirePermission('employees:create')` server-side; tenant-scope every query/write
- Validate fully before any write (dry-run); partial-success with per-row report on commit
- Hash passwords with bcrypt **only** when the employee sets it (not at import)
- Keep imports idempotent (skip existing emails)
- Stream/parse in chunks; never load 5,000 hashes synchronously

### Ask First
- Adding any new dependency (xlsx parser, email provider config) — run the
  `tech-stack.md` decision template
- Changing the `User` schema / adding the invite-token mechanism (migration)
- Final caps (max rows, file size, token TTL)

### Never Do
- Never put plaintext passwords in the file or logs
- Never let one bad row abort an entire committed batch
- Never bypass tenant scoping or write across tenants
- Never block the request thread on the full import (must be background)

---

## Open Questions (for /plan)

1. Stage parsed rows server-side (temp table / Redis) between `/validate` and
   `/import`, or re-upload the file on confirm? (Affects payload size for 5k rows.)
2. Invite email: send immediately per row, or batch after the job completes?
3. Realtime progress: poll `GET :jobId`, or is there an existing socket channel to reuse?
4. Split a dedicated `employees:import` permission now, or reuse `employees:create`?

---

## Next Step

After approval, run `/plan` to decompose into vertical slices (auth invite-token →
parser+validator → queue worker → API → frontend wizard → i18n → tests).
