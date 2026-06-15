# SPEC-012: Payroll Approval Workflow (Maker-Checker)

**Status:** Draft (discovery resolved 2026-06-03)
**Created:** 2026-06-03
**Author:** Claude + Hạnh
**Depends on:** SPEC-003 (Authorization/RBAC), SPEC-011 (Payroll)

---

## Objective

Tách bạch trách nhiệm **lập bảng lương** và **phê duyệt bảng lương** (segregation
of duties / maker-checker). Người tính lương (HR Manager) chỉ được **tạo, tính lại
và gửi duyệt** kỳ lương; việc **phê duyệt** thuộc về một vai trò cấp cao mới (Giám
đốc / Kế toán trưởng). Một kỳ lương phải đi qua bước **chờ duyệt** trước khi được
chốt, và người gửi không được tự duyệt.

## Vấn đề với hiện trạng (SPEC-011)

- Mọi transition của pay run (`recompute`, `approve`, `mark-paid`, `cancel`) đều
  gate cùng một quyền `payroll:process` ([payroll.routes.ts:36-39](../../apps/api/src/app/routes/v1/payroll.routes.ts)).
- `HR_MANAGER` nắm `payroll:process` ([catalog.ts:41](../../apps/api/src/domain/rbac/catalog.ts)),
  nên **vừa tạo vừa tự duyệt** → maker = checker, xung đột trách nhiệm.
- `PayrollRunStatus` chỉ có `DRAFT → APPROVED → PAID / CANCELLED`, **không có bước
  "chờ duyệt"** tường minh để chuyển giao giữa người lập và người duyệt.
- Hệ thống chưa có vai trò cấp duyệt lương (chỉ 4 role: SUPER_ADMIN, HR_MANAGER,
  MANAGER, EMPLOYEE).

## Target Users

| User | Actions |
|------|---------|
| **Super Admin** | Toàn quyền; có thể duyệt (fallback) — *xem Boundaries* |
| **HR Manager (maker)** | Tạo / tính lại / **gửi duyệt**; KHÔNG được duyệt |
| **Phê duyệt lương (checker)** — role mới | Xem run + payslip; **duyệt** hoặc **trả về**; KHÔNG tạo/tính lại |
| **Employee / Manager** | Không đổi (chỉ self-service payslip qua `payroll:view`) |

---

## Core Features

### 1. Quyền mới `payroll:approve` + tách quyền HR
**Acceptance Criteria:**
- [ ] Thêm permission key `payroll:approve` vào catalog (`packages/shared` PERMISSION_KEYS + `catalog.ts`)
- [ ] `HR_MANAGER` giữ `payroll:process` + `payroll:export`, **KHÔNG** có `payroll:approve`
- [ ] Route `approve` đổi gate từ `payroll:process` → `payroll:approve`
- [ ] `submit-for-approval` gate `payroll:process`; `recompute`/`cancel` vẫn `payroll:process`; `mark-paid` xem mục Boundaries
- [ ] Seed idempotent: chạy lại không nhân bản; tenant cũ được sync quyền mới

### 2. Vai trò hệ thống mới "Phê duyệt lương"
**Acceptance Criteria:**
- [ ] Thêm giá trị enum `UserRole.PAYROLL_APPROVER` (Prisma + `packages/shared` UserRole)
- [ ] Thêm `SystemRoleDef` mới: key `payroll_approver`, name "Phê duyệt lương",
      permissions `['dashboard:view', 'payroll:view', 'payroll:approve']`
- [ ] Seed role mới cho mọi tenant (qua `syncSystemRolesForTenant`); gán user vào role này được qua màn Người dùng sẵn có
- [ ] i18n tên/mô tả role (vi + en)

### 3. Trạng thái `PENDING_APPROVAL` + luồng chuyển
**Acceptance Criteria:**
- [ ] Thêm `PayrollRunStatus.PENDING_APPROVAL` (Prisma enum + `packages/shared`)
- [ ] Luồng: `DRAFT →(submit, payroll:process)→ PENDING_APPROVAL →(approve, payroll:approve)→ APPROVED`
- [ ] `PENDING_APPROVAL →(reject, payroll:approve)→ DRAFT` (note tùy chọn, ghi audit)
- [ ] Khi `PENDING_APPROVAL`: **không** `recompute` (409); HR không sửa được; vẫn `cancel` được (payroll:process)
- [ ] `submit` chỉ áp dụng run `DRAFT` có ≥ 1 payslip (không cho gửi run rỗng); status khác → 409
- [ ] `approve` chỉ áp dụng `PENDING_APPROVAL` (không còn duyệt thẳng từ DRAFT); DRAFT → 409
- [ ] Ghi `submittedById` / `submittedAt` trên run (audit người gửi)
- [ ] Người **submit** không được là người **approve** chính run đó (chặn self-approval ở service, kể cả nếu một user có cả 2 quyền)

### 4. Email cho người duyệt khi gửi duyệt
**Acceptance Criteria:**
- [ ] Khi run chuyển sang `PENDING_APPROVAL`, gửi email tới **mọi user trong tenant
      có quyền `payroll:approve`** (trừ chính người gửi)
- [ ] Dùng `emailProvider` (Resend) sẵn có; thêm method `sendPayrollApprovalRequest`
- [ ] Email gồm: kỳ lương, headcount, tổng thực nhận, người gửi, link tới màn payroll
- [ ] Không có `RESEND_API_KEY` (local) → no-op + log warn (như invite/reset hiện tại), không làm fail transition
- [ ] Gửi email không chặn/không rollback transition nếu Resend lỗi (best-effort, log)

### 5. UI — RunsSheet theo trạng thái + quyền
**Acceptance Criteria:**
- [ ] Action theo trạng thái: `DRAFT` → [recompute, **submit**, cancel]; `PENDING_APPROVAL` → [**approve**, **reject**, cancel]; `APPROVED` → [mark-paid, cancel]; `PAID`/`CANCELLED` → []
- [ ] Action lọc theo quyền client: `submit`/`recompute`/`cancel`/`mark-paid` cần `payroll:process`; `approve`/`reject` cần `payroll:approve` (ẩn nếu không có — UX, server vẫn chốt)
- [ ] Nút "Tạo kỳ lương" + ô tháng vẫn chỉ hiện với `payroll:process`
- [ ] Badge trạng thái mới `PENDING_APPROVAL` (màu + chữ, vd amber "Chờ duyệt")
- [ ] AlertDialog xác nhận cho `submit`/`approve`/`reject` (title/body/confirm theo i18n)
- [ ] Skeleton/empty/error đủ; dark mode; i18n vi + en; design token (không hardcode hex)

---

## Data Model (bổ sung / sửa)

```prisma
enum UserRole {
  SUPER_ADMIN
  HR_MANAGER
  MANAGER
  EMPLOYEE
  PAYROLL_APPROVER   // + mới
}

enum PayrollRunStatus {
  DRAFT
  PENDING_APPROVAL   // + mới (giữa DRAFT và APPROVED)
  APPROVED
  PAID
  CANCELLED
}

model PayrollRun {
  // + thêm
  submittedById String?   @map("submitted_by_id")
  submittedAt   DateTime? @map("submitted_at")
  // (giữ nguyên runById / approvedById / approvedAt / paidAt)
}
```

> Run cũ ở `DRAFT`/`APPROVED`/`PAID` không bị ảnh hưởng (enum chỉ thêm giá trị,
> không đổi giá trị cũ). `submittedById`/`submittedAt` nullable cho dữ liệu cũ.

## API (sửa dưới `/api/v1/payroll/runs`)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| POST | `/runs/:id/submit` | `payroll:process` | **mới** — `DRAFT → PENDING_APPROVAL`, gửi email |
| POST | `/runs/:id/approve` | `payroll:approve` | **đổi** — chỉ `PENDING_APPROVAL → APPROVED`; chặn self-approval |
| POST | `/runs/:id/reject` | `payroll:approve` | **mới** — `PENDING_APPROVAL → DRAFT` (note tùy chọn) |
| POST | `/runs/:id/recompute` | `payroll:process` | giữ — DRAFT-only (PENDING → 409) |
| POST | `/runs/:id/mark-paid` | `payroll:process` | giữ — APPROVED-only (HR khép vòng chi trả) |
| POST | `/runs/:id/cancel` | `payroll:process` | giữ — DRAFT/PENDING/APPROVED → CANCELLED |

- `POST /runs` giữ `payroll:process` (chỉ HR tạo run).
- `GET /runs` và `GET /runs/:id` cho **cả** `payroll:process` **và** `payroll:approve`
  (CHỐT): approver phải xem được danh sách run và chi tiết payslip từng NV để duyệt.
- `mark-paid` giữ `payroll:process` (CHỐT): HR khép vòng vận hành chi trả sau khi đã duyệt.

## Logic chuyển trạng thái (service)

```
submit(run):     require status==DRAFT && payslips>0  else 409
                 set status=PENDING_APPROVAL, submittedById=actor, submittedAt=now
                 best-effort: email mọi approver != actor
approve(run):    require status==PENDING_APPROVAL      else 409
                 require actor != submittedById          else 403 (self-approval)
                 freeze settingsSnapshot, set status=APPROVED, approvedById/At
reject(run):     require status==PENDING_APPROVAL      else 409
                 set status=DRAFT, clear submitted*, ghi note (audit/log)
recompute(run):  require status==DRAFT                  else 409  (không đổi)
cancel(run):     require status in {DRAFT,PENDING_APPROVAL,APPROVED} else 409
```

## Permissions (tóm tắt thay đổi)

| Permission | SUPER_ADMIN | HR_MANAGER | PAYROLL_APPROVER | MANAGER | EMPLOYEE |
|-----------|:-:|:-:|:-:|:-:|:-:|
| `payroll:view` | ✓ (*) | ✓ | ✓ | ✓ | ✓ |
| `payroll:process` | ✓ (*) | ✓ | — | — | — |
| `payroll:approve` (mới) | ✓ (*) | **—** | ✓ | — | — |
| `payroll:export` | ✓ (*) | ✓ | — | — | — |

(*) SUPER_ADMIN có wildcard `*` → vẫn duyệt được (fallback hợp lệ).

## Out of scope (iteration sau)

- Duyệt **nhiều cấp** cho payroll (vd Kế toán trưởng → Giám đốc tuần tự) — hiện 1 cấp
- Ủy quyền khi vắng (delegation), nhắc hạn SLA/escalation
- Thông báo **in-app** (chỉ làm email lần này)
- Chỉnh sửa từng dòng payslip thủ công trước khi duyệt
- Lịch sử/audit trail dạng timeline trên UI (chỉ lưu submittedBy/approvedBy + log)

## Non-functional

- Tenant-scoped tuyệt đối; RBAC server-side; mọi đổi trạng thái trong transaction
- Migration **không phá** dữ liệu SPEC-011 (chỉ thêm enum value + cột nullable)
- TDD cho service transitions (submit/approve/reject + self-approval + status guards);
  integration test RBAC từng route (HR không approve được → 403; approver không submit được → 403)
- WCAG AA, dark mode, i18n vi + en, design token

## Boundaries

### Always Do
- Enforce maker ≠ checker ở **server** (chặn self-approval theo `submittedById`), không chỉ ẩn UI
- `approve` chỉ từ `PENDING_APPROVAL` (bỏ duyệt thẳng từ DRAFT) — buộc đi qua bước gửi duyệt
- Seed/sync role + permission **idempotent**; tenant hiện hữu được cập nhật khi chạy seed
- Email gửi duyệt là **best-effort**: lỗi/no-key không được làm fail hay rollback transition

### Đã chốt trong discovery
- **Người duyệt:** tạo role hệ thống mới "Phê duyệt lương" — *không* chỉ dùng SUPER_ADMIN
- **Bước chờ duyệt:** có `PENDING_APPROVAL` + "Gửi duyệt" tường minh
- **Thông báo:** gửi email cho người duyệt khi gửi duyệt
- **`mark-paid`:** giữ `payroll:process` (HR khép vòng chi trả sau khi đã duyệt)
- **`GET /runs` + `GET /runs/:id`:** mở cho cả `payroll:approve` (approver xem run + payslip để duyệt)

### Never Do
- Không cho người gửi tự duyệt run của chính mình (kể cả khi có cả 2 quyền)
- Không đổi nghĩa/giá trị enum trạng thái cũ; không phá run đã PAID
- Không hardcode hex màu badge; không gate RBAC chỉ ở client
