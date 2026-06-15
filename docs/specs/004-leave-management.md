# SPEC-004: Leave Management Module

**Status:** Draft
**Created:** 2026-05-31
**Author:** Claude + Hạnh
**Depends on:** SPEC-002 (Employee Management), SPEC-003 (Authorization/RBAC)

---

## Objective

Build a complete, self-service leave (nghỉ phép) module: employees submit leave
requests against per-tenant configurable leave types, managers/HR review them,
and the system tracks each employee's yearly leave balance. The experience is
role-adaptive — an EMPLOYEE lands on "my requests + my balance", a reviewer
(MANAGER/HR) lands on "requests awaiting my approval".

Benchmarked against BambooHR, Workday, and Personio: configurable leave types
with yearly quotas, a request → approve/reject flow, and a visible remaining
balance are the table-stakes that make the feature genuinely useful.

## Target Users

| User | Actions |
|------|---------|
| **Super Admin** | Everything, incl. configure leave types |
| **HR Manager** | Configure leave types, view/approve/reject all requests, submit own |
| **Manager** | View + approve/reject team requests, submit own |
| **Employee** | Submit/cancel own requests, view own balance |

---

## Core Features

### 1. Leave Types (configurable, per-tenant)
**Acceptance Criteria:**
- [ ] List leave types for the tenant
- [ ] Create/edit/delete a leave type (`leave:configure`)
- [ ] Fields: name, code (stable), color, default annual days, paid flag, requires-attachment flag, active flag
- [ ] Cannot delete a type that has requests; deactivate instead
- [ ] Seed 5 defaults: Phép năm, Nghỉ ốm, Việc riêng, Không lương, Thai sản

### 2. Leave Balance
**Acceptance Criteria:**
- [ ] Per employee, per year, per leave type: `allocated`, `used`, `pending`, `remaining`
- [ ] Auto-provisioned from `LeaveType.defaultDays` on first access in a year
- [ ] `remaining = allocated − used`; `pending` = sum of PENDING request days (informational)
- [ ] Unpaid / zero-quota types are tracked but never block submission

### 3. Submit Leave Request
**Acceptance Criteria:**
- [ ] Fields: leave type, start date, end date, half-day flag (single-day only), reason, optional attachment URL
- [ ] `totalDays` computed server-side over working days (Mon–Fri), inclusive; half-day = 0.5
- [ ] Reject overlapping requests for the same employee
- [ ] Reject end-before-start; reject quota overrun for paid types with a finite quota
- [ ] New request starts `PENDING`

### 4. Review (approve / reject)
**Acceptance Criteria:**
- [ ] Reviewer sees requests they can act on (MANAGER: team; HR/Admin: all)
- [ ] Approve (`leave:approve`) → status APPROVED, `used += totalDays`
- [ ] Reject (`leave:reject`) → status REJECTED with a note; balance untouched
- [ ] Cannot review own request; cannot review a non-PENDING request

### 5. Cancel
**Acceptance Criteria:**
- [ ] Owner cancels own request while PENDING (ownership, no extra permission)
- [ ] Owner cancels own APPROVED request only if start date is in the future → restores `used`
- [ ] Cancelled requests are immutable afterwards

### 6. Leave List (role-adaptive UI)
**Acceptance Criteria:**
- [ ] EMPLOYEE: balance cards on top + "Đơn của tôi" table
- [ ] Reviewer: extra "Chờ duyệt" tab defaulting to PENDING team/all requests
- [ ] Filters: status, leave type, year; search by employee (reviewer only)
- [ ] Skeleton on load, empty state with CTA, status badges (color + label)

---

## Data Model

```
LeaveType   (id, tenantId, name, code, colorHex, defaultDays, paid,
             requiresAttachment, active, timestamps)   @@unique([tenantId, code])
LeaveRequest(id, tenantId, employeeId, leaveTypeId, startDate, endDate,
             halfDay, totalDays, reason, attachmentUrl, status,
             reviewedById, reviewedAt, reviewNote, timestamps)
LeaveBalance(id, tenantId, employeeId, leaveTypeId, year, allocated, used,
             timestamps)   @@unique([tenantId, employeeId, leaveTypeId, year])
enum LeaveStatus { PENDING APPROVED REJECTED CANCELLED }
```

## API (all under `/api/v1/leave`, `authenticate` first)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/types` | `leave:view` | list tenant leave types |
| POST | `/types` | `leave:configure` | create |
| PATCH | `/types/:id` | `leave:configure` | update |
| DELETE | `/types/:id` | `leave:configure` | delete (blocked if used) |
| GET | `/balances` | `leave:view` | own; reviewer may pass `employeeId` |
| GET | `/requests` | `leave:view` | role-scoped; filters |
| POST | `/requests` | `leave:create` | submit own |
| GET | `/requests/:id` | `leave:view` | own or reviewer |
| POST | `/requests/:id/approve` | `leave:approve` | |
| POST | `/requests/:id/reject` | `leave:reject` | body: note |
| POST | `/requests/:id/cancel` | (ownership) | owner only |

## Permissions added to catalog

`leave: ['view','create','update','approve','reject','configure']` (adds
`reject`, `configure`). Role grants: HR_MANAGER gets all leave perms; MANAGER
gets view/create/approve/reject; EMPLOYEE keeps view/create.

## Out of scope (future)

- Approval chains beyond a single reviewer; delegation
- Accrual policies / carry-over; pro-rata on join date
- File upload service (we store an attachment URL only)
- Calendar/team absence heatmap; export to Excel/PDF
- Email/notification on status change

## Non-functional

- Tenant-scoped everywhere; RBAC enforced server-side (`requirePermission`)
- Balance mutations inside Prisma transactions
- WCAG AA, dark mode, i18n (vi + en), skeleton loading, optimistic-free but invalidating
