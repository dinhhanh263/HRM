# TODO: Employee Lifecycle Reminders — Probation & Contract Expiry (#017)

> Plan: `tasks/017-employee-lifecycle-reminders-plan.md`
> Spec: `docs/specs/017-employee-lifecycle-reminders.md`

## Phase 1: Foundation

### Task 1.1 — Schema + migration
- [x] 1.1.1 `Employee.probationEndDate DateTime? @map("probation_end_date")` + `contracts Contract[]`
- [x] 1.1.2 `enum ContractStatus { ACTIVE EXPIRED TERMINATED }`
- [x] 1.1.3 `model Contract` (tenant+employee FKs, type, startDate, endDate?, status, signedAt, note, 2 indexes)
- [x] 1.1.4 `model Notification` (tenant+user FKs, kind, title, body, entityType?, entityId?, dedupeKey, readAt?, `@@unique([userId, dedupeKey])`, index)
- [x] 1.1.5 Back-relations on `Tenant` + `User`
- [x] 1.1.6 `db:migrate` applies clean; `prisma generate`; api typecheck green

### Task 1.2 — Shared types + RBAC catalog + seed
- [x] 1.2.1 `PERMISSION_CATALOG`: add `contracts:[view,create,update,delete]` + `notifications:[view]`
- [x] 1.2.2 `DashboardEventKind` += `'probation_ending' | 'contract_expiring'`
- [x] 1.2.3 `ContractDto` / `CreateContractInput` / `UpdateContractInput`
- [x] 1.2.4 `NotificationDto` / `NotificationListDto` (with `unreadCount`); export from index
- [x] 1.2.5 `SYSTEM_ROLES`: HR_MANAGER += `contracts:*`+`notifications:view`; others += `notifications:view`
- [x] 1.2.6 `db:seed`; verify `RolePermission` has `contracts:create` for HR; shared build green

## Checkpoint A — Foundation complete
- [x] Migration applied, `prisma generate` clean
- [x] Shared builds; permission keys typed end-to-end
- [x] Seed grants correct per role
- [x] Full monorepo typecheck green

## Phase 2: Core capabilities

### Task 2.1 — HR sets probation end date
- [x] 2.1.1 BE: validator `probationEndDate` (>= joinDate), service write, repo select/return, read DTO
- [x] 2.1.2 FE: `EmployeeForm.tsx` date input (mirror `dateOfBirth`) + detail display
- [x] 2.1.3 Unit: validator rejects probation<join; Integration: PATCH round-trips
- [x] 2.1.4 Manual: edit employee, reload, value persists

### Task 2.2 — Contract CRUD (HR-only)
- [x] 2.2.1 BE: `contract.repository.ts`, `contract.service.ts` (one-ACTIVE invariant in `$transaction`)
- [x] 2.2.2 BE: `contract.controller.ts`, `contracts.routes.ts` (mount), `contract.validator.ts`, guards
- [x] 2.2.3 FE: Contracts tab on `EmployeeDetailPage.tsx` (introduce shadcn Tabs) + list + add/edit/end Sheet
- [x] 2.2.4 FE: hooks (`contractKeys`, list/create/update/delete) + `contracts.json` (vi+en)
- [x] 2.2.5 Integration: 403 matrix (MANAGER/EMPLOYEE denied), tenant isolation, one-ACTIVE invariant
- [x] 2.2.6 Manual: add 2 contracts → only latest ACTIVE

### Task 2.3 — Notification feed + header bell
- [x] 2.3.1 BE: `notification.repository.ts` (filter `userId=caller`), service (ownership re-check), controller
- [x] 2.3.2 BE: `notifications.routes.ts` — `GET /` (+unreadCount), `PATCH /:id/read`, `POST /read-all`; guard `notifications:view`
- [x] 2.3.3 FE: replace placeholder bell in `AppLayout.tsx` + unread badge (`tabular-nums`) + dropdown list
- [x] 2.3.4 FE: hooks (`useNotifications`, `useMarkRead`, `useMarkAllRead`) + `notifications.json` (vi+en)
- [x] 2.3.5 Integration: caller isolation, ownership on mark-read; empty state
- [x] 2.3.6 Manual: seed row → badge shows → click marks read

## Checkpoint B — Core complete
- [x] probationEndDate persists; Contract CRUD + one-ACTIVE works
- [x] Notification feed scoped & mark-read works; RBAC 403/ownership enforced
- [x] Contracts tab + bell dropdown render (dark mode, vi+en, a11y)
- [x] BE+FE tests 2.1–2.3 green; typecheck clean

## Phase 3: Reminders + dashboard

### Task 3.1 — Reminder engine (scan → in-app + email, HR-only, idempotent)
- [x] 3.1.1 `reminders.service.ts` — pure selection + dedupeKey logic (unit-testable, no Redis)
- [x] 3.1.2 Unit: window in GMT+7 `[today, today+N]`; dedupeKey `{kind}:{entityId}:{YYYY-MM-DD}`; boundary excl.
- [x] 3.1.3 Recipient repo helper: ACTIVE users with `employees:update` (system fast-path + custom role)
- [x] 3.1.4 `reminders.queue.ts` (repeatable `repeat:{pattern, tz:'Asia/Ho_Chi_Minh'}`) + `reminder-email` queue
- [x] 3.1.5 `reminders.scan.worker.ts` (scan → resolve → idempotent createMany skipDuplicates → fan-out email on new only)
- [x] 3.1.6 `reminder-email.worker.ts` + `sendProbationReminder`/`sendContractReminder` on EmailProvider
- [x] 3.1.7 Register + gracefully close workers in `server.ts`; internal manual-trigger fn for tests/ops
- [x] 3.1.8 Critical-path: probation today+5 → 1 notif HR, 0 MANAGER, email called once
- [x] 3.1.9 Critical-path: 2nd run same day → still exactly 1 (dedupe)
- [x] 3.1.10 Critical-path: contract today+20 → 1 contract_expiring; boundaries today+8 / today+31 → none; indefinite excluded

### Task 3.2 — Dashboard: two new event kinds (company scope)
- [x] 3.2.1 BE: `findEventSourceEmployees` select `probationEndDate` + ACTIVE contract `endDate`
- [x] 3.2.2 BE: `deriveUpcomingEvents` per-kind windows (7/30) + only when `scope.kind === 'company'`
- [x] 3.2.3 FE: `EVENT_STYLE` +2 (icons `UserCheck`/`FileClock`, token colors) + `dashboard.json` labels (vi+en)
- [x] 3.2.4 Unit: per-kind window + scope gate + indefinite excluded; Integration: kind visibility per role
- [x] 3.2.5 Manual: HR dashboard shows seeded items; MANAGER/EMPLOYEE see neither

## Checkpoint C — Feature complete
- [x] Scan idempotency + HR-only recipients asserted by tests
- [x] Email enqueue path works (no-op safe without key)
- [x] Dashboard shows new kinds for HR only
- [x] Workers start/stop cleanly with server

## Phase 4: Polish & verification
- [x] 4.1 Full `typecheck` + `test` (api + web + shared); fix regressions
- [x] 4.2 i18n vi/en parity (contracts + notifications); dark-mode + WCAG AA (bell aria-label announces unread count, focus-visible, `tabular-nums`)
- [x] 4.3 Manual preview golden path: probation set → dashboard event → scan → notification badge; screenshots
- [x] 4.4 `/review` five-axis before ship (APPROVE; fixed 2×🟡 TZ unification + worker error listeners, 2×🟢 shadow rename + defensive orderBy)
