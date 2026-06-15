# Plan — SPEC-017: Employee Lifecycle Reminders (Probation & Contract Expiry)

**Spec:** `docs/specs/017-employee-lifecycle-reminders.md`
**Created:** 2026-06-04
**Strategy:** Foundation first (shared schema/types touched by every slice), then
vertical slices (BE→FE per capability), risk-deferred reminder engine last but with
idempotency/recipient design pinned up front.

---

## Confirmed decisions (from spec discovery)
- Probation: explicit `Employee.probationEndDate` (HR-entered).
- Contract: full `Contract` model (one `ACTIVE` per employee; `endDate=null` = indefinite).
- Channels: Dashboard Upcoming Events **+ email + in-app**.
- Lead time: probation **7 days**, contract **30 days**.
- Recipients: **HR only** (users holding `employees:update`). No managers.
- Contract data + the two dashboard event kinds: **HR-only** (scope `company`).
- Deliver in one pass (no phasing).

---

## Codebase integration map (verified)

**Backend**
- Employee update: route `apps/api/src/app/routes/v1/employee.routes.ts` (PATCH /:id) →
  `controllers/employee.controller.ts` (`update`) → `services/employee.service.ts`
  (`UpdateEmployeeInput`) → `repositories/employee.repository.ts`. Validator:
  `app/validators/employee.validator.ts` (`updateEmployeeSchema`, date fields use a
  `dateInput` helper accepting ISO or `YYYY-MM-DD`).
- Routes aggregator: `app/routes/index.ts` (import + mount each `v1/*.routes.ts`).
- RBAC single source: `packages/shared/src/types/rbac.ts` `PERMISSION_CATALOG` →
  drives types + `PERMISSION_KEYS`. System-role grants: `domain/rbac/catalog.ts`
  `SYSTEM_ROLES`. Seeding: `prisma/seed.ts` `seedRbac()` calls `seedPermissionCatalog`
  + `syncSystemRolesForTenant` (idempotent). Guard: `app/middlewares/authorize.middleware.ts`
  `requirePermission('resource:action')`.
- Prisma: `prisma/schema.prisma` — `Employee` (239–294), `Tenant` (100–132, back-relations),
  `User` (150–180, has `role: UserRole` + `roleId` + `status`), `ContractType` enum (31–37).
  Migrate via `apps/api` script `db:migrate`; seed via `db:seed`.
- BullMQ pattern: `domain/employee-import/employee-import.invite.queue.ts` (lazy singleton
  queue, `attempts:3` + exponential backoff) + `.invite.worker.ts` (Worker, concurrency).
  Connection: `infrastructure/queue/connection.ts` (`maxRetriesPerRequest: null`). Workers
  started + gracefully closed in `server.ts`. **No repeatable job exists yet.**
- Email: `infrastructure/email/email.provider.ts` (`EmailProvider` interface, Resend-backed,
  no-ops when `RESEND_API_KEY` unset, `escapeHtml` for user values).
- "HR users": no helper yet. Resolve as users with `employees:update` — fast-path
  `role in (SUPER_ADMIN, HR_MANAGER)`, plus custom `roleId` whose permissions include the
  key (mirror `dashboard.service.ts resolveScope`). Filter `status = ACTIVE`.

**Frontend**
- Employees feature: `features/employees/`. Detail page `pages/EmployeeDetailPage.tsx`
  (flat cards, **no tabs yet** → add tabs for "Contracts"). Edit form
  `components/EmployeeForm.tsx` (RHF + zod; date fields use `<input type="date">` with
  `.split('T')[0]`).
- Header/bell: `components/layout/AppLayout.tsx` (sticky header ~line 90; a placeholder
  bell button ~line 121 with hardcoded red dot; shadcn `DropdownMenu` pattern used nearby).
- Dashboard: `features/dashboard/DashboardPage.tsx` `EVENT_STYLE` (64–71); reuse `EventItem`.
- i18n: `apps/web/src/i18n/locales/{en,vi}/` — namespaces incl. dashboard, employee, etc.
  Dashboard events in `dashboard.json`. Add `contracts.json` + `notifications.json` (vi+en).
- TanStack Query convention: `features/employees/hooks/useEmployees.ts` — key factory
  (`employeeKeys`), `useQuery`/`useMutation` with invalidate on success, `apiClient`.

---

## Vertical slices

### Phase 1 — Foundation (shared, low-risk, blocks everything)

#### Task 1.1 — Schema + migration
**Objective:** Persist the new data shapes.
**Files:** `apps/api/prisma/schema.prisma` (+ new migration under `prisma/migrations/`).
- Add `Employee.probationEndDate DateTime? @map("probation_end_date")` + relations
  `contracts Contract[]`, `notifications` (none on Employee — notifications attach to User).
- Add `enum ContractStatus { ACTIVE EXPIRED TERMINATED }`.
- Add `model Contract` (per spec): tenant+employee FKs, `type ContractType`, `startDate`,
  `endDate DateTime?`, `status`, `signedAt`, `note`, indexes `[tenantId, employeeId]` and
  `[tenantId, status, endDate]`.
- Add `model Notification`: tenant+user FKs, `kind`, `title`, `body`, `entityType?`,
  `entityId?`, `dedupeKey`, `readAt?`, `@@unique([userId, dedupeKey])`,
  `@@index([tenantId, userId, readAt])`.
- Back-relations: `Tenant.contracts/notifications`, `User.notifications`, `Employee.contracts`.
**Acceptance:** `db:migrate` applies cleanly; `prisma generate` types available.
**Verification:** `pnpm --filter @hrm/api typecheck`; migration file committed.

#### Task 1.2 — Shared types + RBAC catalog + seed
**Objective:** New permission keys + DTOs available to BE & FE.
**Files:** `packages/shared/src/types/rbac.ts`, `.../dashboard.ts`, new
`.../contract.ts` + `.../notification.ts` (export from package index);
`apps/api/src/domain/rbac/catalog.ts`; run `db:seed`.
- `PERMISSION_CATALOG`: add `contracts: ['view','create','update','delete']`,
  `notifications: ['view']`.
- `DashboardEventKind`: add `'probation_ending' | 'contract_expiring'`.
- Add `ContractDto`, `CreateContractInput`, `UpdateContractInput`, `NotificationDto`,
  `NotificationListDto` (with `unreadCount`).
- `SYSTEM_ROLES`: grant `contracts:*` + `notifications:view` to HR_MANAGER; add
  `notifications:view` to MANAGER + EMPLOYEE + PAYROLL_APPROVER (everyone can have a feed;
  reminders still target HR only). SUPER_ADMIN is implicit-all.
**Acceptance:** `db:seed` grants verified; shared package builds.
**Verification:** `pnpm --filter @hrm/shared build`; query `RolePermission` to confirm HR has `contracts:create`.

---
### Checkpoint A — Foundation complete
- [ ] Migration applied, `prisma generate` clean
- [ ] Shared package builds; new permission keys typed end-to-end
- [ ] `db:seed` grants `contracts:*`/`notifications:view` to the right roles
- [ ] Full monorepo typecheck green
---

### Phase 2 — Core capabilities

#### Task 2.1 — HR sets probation end date
**Objective:** HR can view/edit `probationEndDate` on an employee.
**Files (BE):** `employee.validator.ts` (add `probationEndDate: dateInput.optional()`),
`employee.service.ts` (`UpdateEmployeeInput` + write), `employee.repository.ts` (select/return),
employee read DTO in shared.
**Files (FE):** `EmployeeForm.tsx` (date input, mirror `dateOfBirth`), employee detail display.
**Acceptance:** PATCH employee persists `probationEndDate`; validation `>= joinDate`;
shows in form prefilled.
**Verification:** unit (validator rejects probation<join), integration (PATCH round-trips),
manual: edit an employee, reload, value persists.
**Depends on:** 1.1, 1.2.

#### Task 2.2 — Contract CRUD (HR-only)
**Objective:** HR lists/creates/edits/ends contracts on the employee profile.
**Files (BE):** new `repositories/contract.repository.ts`, `services/contract.service.ts`
(one-ACTIVE invariant in a `$transaction`), `controllers/contract.controller.ts`,
`routes/v1/contracts.routes.ts` (mount in `routes/index.ts`), Zod
`validators/contract.validator.ts`. Guards `requirePermission('contracts:view|create|update|delete')`.
**Files (FE):** `features/employees` (or new `features/contracts`): Contracts tab on
`EmployeeDetailPage.tsx` (introduce shadcn Tabs), list + add/edit/end Sheet, hooks
(`contractKeys`, `useContracts`, `useCreateContract`, `useUpdateContract`, `useDeleteContract`),
`i18n/locales/{vi,en}/contracts.json`.
**Acceptance:** create ACTIVE contract demotes previous ACTIVE→EXPIRED atomically;
`endDate` optional (indefinite); 403 for non-HR; tenant-isolated.
**Verification:** integration (403 matrix incl. MANAGER/EMPLOYEE denied, tenant isolation,
one-ACTIVE invariant), manual: add 2 contracts, confirm only latest ACTIVE.
**Depends on:** 1.1, 1.2.

#### Task 2.3 — Notification feed + header bell
**Objective:** A user sees their own notifications and can mark read.
**Files (BE):** `repositories/notification.repository.ts` (always filter `userId=caller`),
`services/notification.service.ts`, `controllers/notification.controller.ts`,
`routes/v1/notifications.routes.ts` (mount). Endpoints: `GET /notifications` (+`unreadCount`),
`PATCH /notifications/:id/read`, `POST /notifications/read-all`. Guard `notifications:view`;
ownership re-checked in service (can't read/mark another user's row).
**Files (FE):** `features/notifications/` — bell in `AppLayout.tsx` (replace placeholder),
unread badge (`tabular-nums`), dropdown list, hooks (`useNotifications`, `useMarkRead`,
`useMarkAllRead` with optimistic update), `i18n/locales/{vi,en}/notifications.json`.
**Acceptance:** feed scoped to caller; mark-read flips `readAt`; cross-user/tenant access
returns 404/empty; empty state present.
**Verification:** integration (caller isolation, ownership on mark-read), manual: seed a row,
bell badge shows, click marks read.
**Depends on:** 1.1, 1.2.

---
### Checkpoint B — Core complete
- [ ] probationEndDate persists; Contract CRUD + one-ACTIVE invariant works
- [ ] Notification feed scoped & mark-read works; RBAC 403/ownership enforced
- [ ] New UI: Contracts tab + bell dropdown render (dark mode, vi+en, a11y)
- [ ] BE+FE tests for 2.1–2.3 green; typecheck clean
---

### Phase 3 — Reminders + dashboard (highest risk: cron + idempotency)

#### Task 3.1 — Reminder engine (scan → in-app + email, HR-only, idempotent)
**Objective:** Daily job notifies HR of probation endings (≤7d) and contract expiries (≤30d).
**Design pins (de-risk before coding):**
- **Window** computed in **GMT+7** (reuse timesheet offset helper) — `[today, today+N]` inclusive.
- **Recipients** = `ACTIVE` users with `employees:update` in the tenant (new repo helper;
  fast-path system roles + custom-role permission check).
- **Idempotency:** `dedupeKey = '{kind}:{entityId}:{YYYY-MM-DD dueDate}'` per recipient;
  rely on `@@unique([userId, dedupeKey])` + upsert/`createMany skipDuplicates` so re-runs are no-ops.
  Only enqueue email when the notification row was *newly* created.
**Files:** `domain/reminders/reminders.queue.ts` (repeatable: `add(name, {}, { repeat: { pattern, tz:'Asia/Ho_Chi_Minh' } })` + a `reminder-email` queue with retry/backoff),
`reminders.scan.worker.ts` (scan + recipient resolve + idempotent create + fan-out email),
`reminder-email.worker.ts` (calls EmailProvider), `reminders.service.ts` (pure selection +
dedupeKey logic — unit-testable without Redis), email methods
`sendProbationReminder`/`sendContractReminder` on `EmailProvider`. Register + close workers in
`server.ts`. A manual trigger (internal function) so tests/ops can run a scan deterministically.
**Acceptance:** scan creates exactly one notification per (HR user × due item); 2nd run same
day creates none; email enqueued once per new notification; no email when `RESEND_API_KEY` unset
(logs warn); indefinite contracts (`endDate=null`) excluded; non-ACTIVE employees excluded.
**Verification (critical-path, asserts outcome — not coverage):**
- Seed employee `probationEndDate=today+5`, one HR user + one MANAGER → run scan →
  assert 1 `Notification(probation_ending)` for HR, **0 for MANAGER**, email provider called once.
- Run scan again → still exactly 1 (dedupe).
- Contract `endDate=today+20` → 1 `contract_expiring` for HR.
- Boundary: due `today+8` (probation) and `today+31` (contract) produce nothing.
**Depends on:** 2.2, 2.3.

#### Task 3.2 — Dashboard: two new event kinds (company scope)
**Objective:** HR dashboard "Upcoming Events" shows probation/contract reminders.
**Files (BE):** `dashboard.repository.ts findEventSourceEmployees` (select `probationEndDate`
+ ACTIVE contract `endDate`), `dashboard.service.ts deriveUpcomingEvents` (per-kind windows:
probation 7 / contract 30; **only include these two kinds when `scope.kind === 'company'`**).
**Files (FE):** `DashboardPage.tsx EVENT_STYLE` (+2 entries: icons e.g. `UserCheck`/`FileClock`,
token colors), `dashboard.json` (vi+en) event labels.
**Acceptance:** HR/SUPER_ADMIN see both kinds; MANAGER (team) + EMPLOYEE (self) see neither;
date windows correct; DD/MM no tz drift.
**Verification:** unit (`deriveUpcomingEvents` per-kind window + scope gate + indefinite excluded),
integration (payload kind visibility per role), manual: HR dashboard shows the seeded items.
**Depends on:** 2.1, 2.2 (data), 1.2 (kinds).

---
### Checkpoint C — Feature complete
- [ ] Scan idempotency + HR-only recipients asserted by tests
- [ ] Email enqueue path works (no-op safe without key)
- [ ] Dashboard shows new kinds for HR only
- [ ] Workers start/stop cleanly with the server
---

### Phase 4 — Polish & verification
#### Task 4.1 — Sweep
- Full `typecheck` + `test` (api + web); fix any regressions.
- i18n vi/en parity for new namespaces; dark-mode + WCAG AA pass on Contracts tab & bell
  (aria-label on bell, focus-visible, `tabular-nums`).
- Manual preview verification of golden paths (probation set → dashboard event → scan →
  notification badge); screenshots.
- `/review` (five-axis) before ship.

---

## Risk notes
- **Repeatable BullMQ job is new ground** — keep selection/dedupe logic in a pure service
  (`reminders.service.ts`) so it's unit-tested without Redis; the worker is a thin shell.
- **Recipient resolution** must match dashboard's `resolveScope` semantics (employees:update),
  not a hardcoded role string, so custom HR-equivalent roles still get reminders.
- **GMT+7 boundaries** — reuse the existing offset helper; off-by-one at midnight is the classic bug.
- **One-ACTIVE-contract invariant** must be transactional to avoid two ACTIVE under concurrency.

## Out of scope (per spec)
Manager/Employee visibility, auto-expire job, VN 2-fixed-term rule, real-time push, digest email,
tenant-configurable lead time, attachment upload, contractType↔contract sync.
