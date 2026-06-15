# PLAN-012: Payroll Approval Workflow (Maker-Checker)

> Spec: [docs/specs/012-payroll-approval-workflow.md](../docs/specs/012-payroll-approval-workflow.md)
> Strategy: 1 slice nền tảng (enum/permission/role không thể tránh) rồi các slice dọc theo từng hành động (gửi duyệt → duyệt/trả về → email → polish).

---

## Phân tích & điểm chạm (read-only survey)

**Backend**
- `apps/api/prisma/schema.prisma` — enum `UserRole`, `PayrollRunStatus`, model `PayrollRun` (thêm `submittedById`/`submittedAt`)
- `packages/shared/src/types/rbac.ts` — `PERMISSION_KEYS` (`payroll: ['view','process','export']` → +`approve`)
- `packages/shared/src/types/user.ts` — `UserRole` const (+`PAYROLL_APPROVER`)
- `packages/shared/src/types/payroll.ts` — `PayrollRunStatus` const (+`PENDING_APPROVAL`), `PayrollRunDto` (+`submittedById`/`submittedAt`)
- `apps/api/src/domain/rbac/catalog.ts` — `SYSTEM_ROLES` (HR bỏ approve; +role `payroll_approver`)
- `apps/api/src/app/routes/v1/payroll.routes.ts` — gate quyền + route mới `submit`/`reject`; mở `GET /runs`,`/runs/:id` cho approve
- `apps/api/src/app/controllers/payroll.controller.ts` — handler `submitRun`/`rejectRun`
- `apps/api/src/domain/services/payroll-run.service.ts` — transitions `submit`/`approve`(đổi)/`reject` + chặn self-approval
- `apps/api/src/domain/repositories/payroll-run.repository.ts` — `submit()`, `reject()`, `approve()` đổi guard `DRAFT`→`PENDING_APPROVAL`
- `apps/api/src/app/validators/payroll.validator.ts` — `listPayrollRunsSchema.status` enum +`PENDING_APPROVAL`; schema `reject` (note optional)
- `apps/api/src/domain/repositories/permission.repository.ts` + `user.repository.ts` — thêm tìm user theo permission key (cho email)
- `apps/api/src/infrastructure/email/email.provider.ts` — thêm `sendPayrollApprovalRequest`
- `apps/api/src/domain/payroll/mappers.ts` — map `submittedById`/`submittedAt`
- `apps/api/prisma/seed.ts` — (tùy chọn) seed 1 user approver demo

**Frontend**
- `apps/web/src/features/payroll/hooks/useRuns.ts` — `useSubmitRun`/`useRejectRun`; mở rộng `useRunAction`
- `apps/web/src/features/payroll/components/RunsSheet.tsx` — `ACTIONS_BY_STATUS` + lọc theo quyền (`payroll:process` vs `payroll:approve`)
- `apps/web/src/features/payroll/components/PayrollRunStatusBadge.tsx` — map `PENDING_APPROVAL` → badge `pending`
- `apps/web/src/i18n/locales/{vi,en}/payroll.json` — status/actions/confirm/toast cho submit/approve/reject + status PENDING_APPROVAL
- `apps/web/src/i18n/locales/{vi,en}/role.json` — tên/mô tả role `payroll_approver`

**Phụ thuộc:** permission resolve theo `roleId` (Role→RolePermission), không theo enum. Nhưng `SystemRoleDef.enum: UserRole` buộc role mới phải có giá trị enum `UserRole` → **migration bắt buộc**.

---

## Slice 0 — Nền tảng: enum, permission, role (foundation)

**Objective:** Có sẵn `payroll:approve`, role `PAYROLL_APPROVER`, trạng thái `PENDING_APPROVAL`, cột audit — type-check toàn repo pass, migration apply, seed idempotent.

**Files:**
- `packages/shared/src/types/rbac.ts`, `user.ts`, `payroll.ts`
- `apps/api/prisma/schema.prisma` + migration mới `add_payroll_approval`
- `apps/api/src/domain/rbac/catalog.ts`
- `apps/api/src/domain/payroll/mappers.ts`
- `apps/api/src/app/validators/payroll.validator.ts` (status enum)

**Acceptance Criteria:**
- [ ] `PERMISSION_KEYS.payroll` = `['view','process','approve','export']`
- [ ] `UserRole.PAYROLL_APPROVER`, `PayrollRunStatus.PENDING_APPROVAL` có ở Prisma + shared (đồng bộ)
- [ ] `PayrollRun` có `submittedById`/`submittedAt` (nullable); `PayrollRunDto` + mapper có 2 field này
- [ ] `catalog.ts`: HR_MANAGER **không** còn `payroll:approve` (giữ process/export); role mới `payroll_approver` = `['dashboard:view','payroll:view','payroll:approve']`
- [ ] `migrate deploy` chạy sạch; `pnpm --filter @hrm/api db:seed` idempotent, tenant cũ được sync role/permission mới
- [ ] `pnpm typecheck` toàn repo pass

**Verification:** unit test `rbac-catalog.test.ts` cập nhật (HR không có approve; role mới có approve); `prisma migrate status` sạch.

**Dependencies:** none.

---

## Checkpoint A — Nền tảng sẵn sàng
- [ ] Migration apply, seed idempotent (chạy 2 lần không lỗi/không nhân bản)
- [ ] typecheck pass toàn monorepo
- [ ] rbac-catalog unit test xanh

---

## Slice 1 — HR "Gửi duyệt" (DRAFT → PENDING_APPROVAL)

**Objective:** HR tạo draft rồi gửi duyệt; khi PENDING_APPROVAL thì khóa recompute; UI hiện action + badge.

**Files (BE):** `payroll-run.service.ts` (`submit`), `payroll-run.repository.ts` (`submit`), `payroll.controller.ts` (`submitRun`), `payroll.routes.ts` (`POST /runs/:id/submit` gate `payroll:process`), `payroll-run.service.ts` (`recompute` guard giữ DRAFT-only).
**Files (FE):** `useRuns.ts` (`useSubmitRun`), `RunsSheet.tsx` (action `submit` cho DRAFT, badge), `PayrollRunStatusBadge.tsx`, i18n vi.

**Acceptance Criteria:**
- [ ] `submit`: chỉ `DRAFT` && payslips>0 → `PENDING_APPROVAL`, set `submittedById`/`submittedAt`; status khác → 409; run rỗng → 400/409
- [ ] `recompute` trên `PENDING_APPROVAL` → 409
- [ ] `cancel` vẫn được trên `PENDING_APPROVAL`
- [ ] Route `submit` gate `payroll:process`; approver gọi `submit` → 403
- [ ] FE: DRAFT có menu [Tính lại, **Gửi duyệt**, Hủy]; PENDING_APPROVAL có badge "Chờ duyệt"; AlertDialog xác nhận gửi duyệt; toast

**Verification:** integration test (HR submit DRAFT → 200 PENDING; recompute PENDING → 409; approver submit → 403). Manual: tạo run → gửi duyệt → badge đổi.

**Dependencies:** Slice 0.

---

## Slice 2 — Approver "Duyệt / Trả về" (PENDING_APPROVAL → APPROVED | DRAFT)

**Objective:** Người có `payroll:approve` duyệt hoặc trả về; HR không duyệt được; chặn self-approval; approver xem được run/payslip.

**Files (BE):** `payroll-run.service.ts` (`approve` đổi guard `PENDING_APPROVAL`-only + chặn `actor==submittedById`; `reject`), `payroll-run.repository.ts` (`approve` guard đổi; `reject`), `payroll.controller.ts` (`rejectRun`), `payroll.routes.ts` (`approve`→`payroll:approve`; `POST /runs/:id/reject`→`payroll:approve`; `GET /runs`,`/runs/:id` cho cả process+approve), `payroll.validator.ts` (reject note optional).
**Files (FE):** `useRuns.ts` (`useApproveRun` giữ, `useRejectRun` mới), `RunsSheet.tsx` (PENDING_APPROVAL → [Duyệt, Trả về, Hủy] lọc theo `payroll:approve`; gate canApprove), i18n vi.

**Acceptance Criteria:**
- [ ] `approve`: chỉ `PENDING_APPROVAL` (DRAFT → 409); `actor==submittedById` → 403 (self-approval); freeze settingsSnapshot, set approvedById/At
- [ ] `reject`: chỉ `PENDING_APPROVAL` → `DRAFT`, clear `submitted*`, ghi note (log/audit)
- [ ] Route `approve`/`reject` gate `payroll:approve`; HR (process-only) gọi → 403
- [ ] `GET /runs`,`/runs/:id` truy cập được bằng `payroll:approve`
- [ ] FE: action approve/reject chỉ hiện khi `can('payroll:approve')`; AlertDialog + toast

**Verification:** integration test (approver approve PENDING → APPROVED; HR approve → 403; submitter==approver → 403; approver reject → DRAFT; approver GET runs → 200). Manual: login approver duyệt/trả về.

**Dependencies:** Slice 0, Slice 1.

---

## Checkpoint B — Maker-checker hoạt động (server-enforced)
- [ ] Toàn bộ vòng DRAFT→PENDING→APPROVED→PAID + reject→DRAFT chạy đúng
- [ ] HR không approve được (403); approver không submit được (403); không tự duyệt (403)
- [ ] Integration RBAC test xanh; payroll-run-lifecycle test cũ cập nhật pass

---

## Slice 3 — Email cho người duyệt khi gửi duyệt

**Objective:** Khi run → PENDING_APPROVAL, email tới mọi user có `payroll:approve` (trừ người gửi), best-effort.

**Files:** `permission.repository.ts` + `user.repository.ts` (tìm user theo permission key trong tenant), `email.provider.ts` (`sendPayrollApprovalRequest` + html), `payroll-run.service.ts` (`submit` gọi email sau commit, không chặn lỗi), `email.provider` interface.

**Acceptance Criteria:**
- [ ] Truy vấn user trong tenant có role chứa `payroll:approve`, loại trừ người gửi
- [ ] Email gồm period, headcount, totalNet, người gửi, link `APP_WEB_URL` tới payroll
- [ ] Không `RESEND_API_KEY` → log warn + no-op (không fail submit)
- [ ] Resend lỗi → log, **không** rollback transition (submit vẫn thành công)

**Verification:** unit test provider no-op khi không key; integration: submit vẫn 200 khi email lỗi (mock). Manual: kiểm log `email.payroll-approval.sent/skipped`.

**Dependencies:** Slice 0, Slice 1.

---

## Slice 4 — Polish: i18n EN, role i18n, badge, a11y, regression

**Objective:** Hoàn thiện đa ngôn ngữ, kiểm UI 2 theme, không regress.

**Files:** `i18n/locales/en/payroll.json`, `{vi,en}/role.json` (role `payroll_approver`), rà soát `RunsSheet` a11y (aria-label menu, focus), dark mode.

**Acceptance Criteria:**
- [ ] EN payroll: status/actions/confirm/toast cho submit/approve/reject + PENDING_APPROVAL
- [ ] role.json vi+en có name/description `payroll_approver`
- [ ] Badge PENDING_APPROVAL đúng màu+chữ ở light/dark; design token, không hardcode hex
- [ ] Empty/skeleton/error giữ nguyên; không có hardcoded text

**Verification:** Manual UI verify (preview) light+dark; chạy `pnpm --filter @hrm/web test:run`; toàn bộ api test xanh.

**Dependencies:** Slice 1–3.

---

## Checkpoint C — Ship-ready
- [ ] `pnpm typecheck` + api/web test xanh; coverage không giảm
- [ ] Manual: HR tạo→gửi duyệt; Approver duyệt/trả về; email log; light+dark; vi+en
- [ ] `/review` five-axis trước merge

## Rủi ro & lưu ý
- **Migration enum**: thêm value vào `UserRole`/`PayrollRunStatus` an toàn (Postgres `ALTER TYPE ADD VALUE`); không xóa value cũ.
- **Tenant cũ**: seed `syncSystemRolesForTenant` phải chạy để tạo role mới + gỡ `payroll:approve` khỏi HR (đã idempotent — kiểm `toRemove`).
- **Redis cache permission**: đổi permission của role → invalidate cache role (seed chạy ngoài request nên cache sẽ tự hết hạn 1h; cân nhắc flush khi deploy).
- **PDF/export**: không đổi; vẫn `payroll:export` (HR).
