# SPEC-005: Leave Approval Flow (Line Approval)

**Status:** Approved (discovery resolved 2026-05-31)
**Created:** 2026-05-31
**Author:** Claude + Hạnh
**Depends on:** SPEC-002 (Employee Management), SPEC-003 (Authorization/RBAC), SPEC-004 (Leave Management)

---

## Objective

Thay luồng duyệt một-bước hiện tại bằng **luồng duyệt nhiều cấp cấu hình được**
("line approval"): mỗi đơn nghỉ phép đi qua một chuỗi bước duyệt có thứ tự
(Quản lý trực tiếp → Trưởng phòng → HR …), cấu hình **theo phòng ban**, có
fallback luồng mặc định toàn tenant. Đơn chỉ được duyệt khi qua **hết** các cấp;
một cấp từ chối sẽ **trả đơn về nhân viên** để chỉnh sửa và gửi lại. Số ngày phép
chỉ bị trừ (`used`) khi cấp cuối phê duyệt.

Benchmark theo BambooHR / Workday / Personio: cấu hình chuỗi duyệt theo
phòng ban, người duyệt theo nhiều kiểu (quản lý trực tiếp, vai trò, người cụ thể),
timeline duyệt minh bạch, và chỉ người đúng-cấp mới hành động được.

## Vấn đề với hiện trạng (SPEC-004)

- `LeaveRequest` chỉ có 1 `reviewedById` → một người duyệt là xong, không có chuỗi.
- `requireReviewCapability` cho **bất kỳ** ai có `leave:approve/reject` duyệt **mọi**
  đơn trong tenant — không theo phòng ban, không theo cấp.
- `Employee` không có `managerId`; `Department` không có trưởng phòng → hệ thống
  chưa biết đường báo cáo để định tuyến duyệt.

## Target Users

| User | Actions mới |
|------|-------------|
| **Super Admin** | Cấu hình luồng duyệt cho mọi phòng ban + luồng mặc định |
| **HR Manager** | Cấu hình luồng duyệt; thường là cấp cuối; xem mọi đơn |
| **Manager / Trưởng phòng** | Duyệt/từ-chối ở **cấp của mình**; chỉ thấy đơn đang chờ mình |
| **Employee** | Gửi đơn; khi bị trả về thì **sửa & gửi lại**; xem timeline duyệt |

---

## Core Features

### 1. Đường báo cáo (reporting line) — tiền đề
**Acceptance Criteria:**
- [ ] `Employee.managerId` (self-relation, nullable) — quản lý trực tiếp; gán ở form Nhân viên
- [ ] `Department.managerId` (nullable) — trưởng phòng ban; gán ở form Phòng ban
- [ ] Chặn vòng lặp quản lý (A→B→A) khi gán managerId
- [ ] Cả hai tenant-scoped; người được gán phải cùng tenant

### 2. Cấu hình luồng duyệt (per-department + fallback)
**Acceptance Criteria:**
- [ ] `ApprovalFlow` gắn `departmentId` (null = luồng mặc định toàn tenant)
- [ ] Mỗi flow có danh sách `ApprovalStep` **có thứ tự** (`stepOrder` 1..N)
- [ ] Mỗi step chọn `approverType`: `MANAGER` (quản lý trực tiếp) · `DEPARTMENT_HEAD`
      (trưởng phòng) · `ROLE` (theo vai trò, kèm `roleKey`) · `SPECIFIC_USER` (kèm `approverId`)
- [ ] CRUD flow + reorder step, quyền `leave:configure`
- [ ] Một phòng ban tối đa 1 flow active; có đúng 1 flow mặc định (departmentId null) / tenant
- [ ] Validate: step ROLE phải có roleKey hợp lệ; SPECIFIC_USER phải có approverId cùng tenant

### 3. Định tuyến khi gửi đơn
**Acceptance Criteria:**
- [ ] Khi tạo đơn: chọn flow theo `employee.departmentId`; không có → flow mặc định tenant; không có nữa → **single-step legacy** (giữ tương thích: ai có `leave:approve` duyệt là xong)
- [ ] **Snapshot** các step vào `LeaveApproval` (lưu lịch sử, không vỡ khi sau này sửa flow)
- [ ] Đặt `currentStep = 1`, tính người duyệt mong đợi của bước 1
- [ ] **Bỏ qua tự động** một bước nếu người duyệt mong đợi không giải được (vd MANAGER nhưng NV chưa có manager) hoặc trùng chính người nộp → ghi note hệ thống "auto-skipped"

### 4. Hành động duyệt theo cấp
**Acceptance Criteria:**
- [ ] `approve` chỉ áp dụng cho **bước hiện tại**; người gọi phải đúng là người duyệt mong đợi của bước đó **và** có `leave:approve` (SUPER_ADMIN implicit-all)
- [ ] Duyệt bước k < N → ghi `LeaveApproval`, `currentStep++`, tính người duyệt kế; đơn vẫn `PENDING`
- [ ] Duyệt bước cuối → `APPROVED`, **`used += totalDays`** (trong transaction)
- [ ] `reject` (bất kỳ cấp) → trạng thái **`RETURNED`** + note bắt buộc; dừng luồng, không trừ phép
- [ ] Không thể hành động trên đơn không ở `PENDING`; không tự duyệt đơn của mình

### 5. Trả về & gửi lại
**Acceptance Criteria:**
- [ ] Đơn `RETURNED`: chủ đơn xem được note của người duyệt
- [ ] Chủ đơn **sửa** (loại nghỉ/ngày/lý do/đính kèm) và **gửi lại** → reset `currentStep = 1`, trạng thái `PENDING`, mở **vòng duyệt mới** (LeaveApproval round +1, giữ lịch sử vòng cũ)
- [ ] Re-validate trùng lịch / quota khi gửi lại
- [ ] Chủ đơn có thể **hủy** đơn `RETURNED` nếu không muốn theo tiếp

### 6. Cân đối số ngày phép
**Acceptance Criteria:**
- [ ] `pending` = tổng ngày của đơn đang `PENDING` (đang trong vòng duyệt). `RETURNED` **không** tính pending
- [ ] `used` chỉ tăng khi đơn đạt `APPROVED` (cấp cuối)
- [ ] Hủy đơn `APPROVED` (ngày bắt đầu ở tương lai) → hoàn lại `used` (giữ như SPEC-004)

### 7. UI
**Acceptance Criteria:**
- [ ] **Cấu hình luồng** (tab Cài đặt nghỉ phép): chọn phòng ban → danh sách bước, thêm/sửa/xóa/đổi thứ tự, chọn loại người duyệt
- [ ] **Tab Duyệt đơn**: chỉ hiện đơn đang chờ **chính người đăng nhập** ở bước hiện tại (thay cho "toàn tenant")
- [ ] **Chi tiết đơn**: timeline các bước (✓ ai duyệt/lúc nào · ⏳ bước hiện tại · ↩ bị trả về)
- [ ] **Màn của NV**: badge `RETURNED` + note; nút "Sửa & gửi lại"
- [ ] Skeleton/empty/error đầy đủ; status badge có màu + chữ; dark mode; i18n vi+en

---

## Data Model (bổ sung / sửa)

```prisma
model Employee {
  // + thêm
  managerId String?   @map("manager_id")
  manager   Employee? @relation("EmployeeManager", fields: [managerId], references: [id])
  reports   Employee[] @relation("EmployeeManager")
}

model Department {
  // + thêm
  managerId String?   @map("manager_id")   // trưởng phòng
  manager   Employee? @relation("DepartmentHead", fields: [managerId], references: [id])
}

model ApprovalFlow {
  id           String   @id @default(cuid())
  tenantId     String   @map("tenant_id")
  departmentId String?  @map("department_id")   // null = mặc định toàn tenant
  name         String
  isDefault    Boolean  @default(false) @map("is_default")
  active       Boolean  @default(true)
  steps        ApprovalStep[]
  // @@unique([tenantId, departmentId]) (1 flow / phòng ban)
}

model ApprovalStep {
  id          String       @id @default(cuid())
  flowId      String       @map("flow_id")
  stepOrder   Int          @map("step_order")
  approverType ApproverType
  roleKey     String?      @map("role_key")     // khi ROLE
  approverId  String?      @map("approver_id")  // khi SPECIFIC_USER (Employee.id)
  // @@unique([flowId, stepOrder])
}

model LeaveApproval {      // audit trail theo từng bước, theo vòng
  id                String    @id @default(cuid())
  requestId         String    @map("request_id")
  round             Int       @default(1)        // tăng mỗi lần gửi lại
  stepOrder         Int       @map("step_order")
  approverType      ApproverType
  expectedApproverId String?  @map("expected_approver_id")
  decision          ApprovalDecision?            // null = đang chờ
  decidedById       String?   @map("decided_by_id")
  decidedAt         DateTime? @map("decided_at")
  note              String?
}

model LeaveRequest {
  // + thêm
  flowId      String?  @map("flow_id")
  currentStep Int      @default(0) @map("current_step")  // 0 = chưa vào flow / xong
}

enum ApproverType     { MANAGER DEPARTMENT_HEAD ROLE SPECIFIC_USER }
enum ApprovalDecision { APPROVED RETURNED }
enum LeaveStatus      { PENDING APPROVED REJECTED CANCELLED RETURNED }  // + RETURNED
```

> `REJECTED` giữ lại cho dữ liệu cũ/tương thích; luồng mới dùng `RETURNED`.

## API (bổ sung dưới `/api/v1/leave`)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/flows` | `leave:configure` | list flow theo tenant (kèm steps) |
| POST | `/flows` | `leave:configure` | tạo flow (gắn departmentId hoặc mặc định) |
| PATCH | `/flows/:id` | `leave:configure` | sửa tên/active |
| DELETE | `/flows/:id` | `leave:configure` | xóa flow |
| PUT | `/flows/:id/steps` | `leave:configure` | thay toàn bộ danh sách step (reorder) |
| GET | `/requests/:id` | `leave:view` | + trả timeline `approvals` |
| POST | `/requests/:id/approve` | `leave:approve` | tác động **bước hiện tại** |
| POST | `/requests/:id/reject` | `leave:reject` | → `RETURNED`, note bắt buộc |
| PATCH | `/requests/:id/resubmit` | (ownership) | sửa & gửi lại đơn `RETURNED` |

- `GET /requests?scope=review` đổi nghĩa: chỉ trả đơn mà người gọi là **người duyệt
  của bước hiện tại** (cộng dồn capability).
- `GET /requests?scope=all` (CHỐT): HR/Admin (có `leave:approve|reject|configure`) xem
  **toàn bộ** đơn trong tenant để giám sát; role khác gọi `scope=all` → 403.
- Employee form / Department form nhận thêm `managerId` (qua API employee/department sẵn có).

## Logic định tuyến (tóm tắt)

```
resolveFlow(employee):
  flow = activeFlow(tenant, employee.departmentId)
       ?? defaultFlow(tenant)            // departmentId null, isDefault
       ?? null                           // → legacy single-step
resolveApprover(step, request):
  MANAGER          → employee.managerId
  DEPARTMENT_HEAD  → department.managerId
  ROLE             → bất kỳ user có roleKey (capability-based, không cố định 1 người)
  SPECIFIC_USER    → step.approverId
advance(): bỏ qua step không có người duyệt hoặc trùng người nộp; hết step → APPROVED + trừ used
```

## Permissions

Tái dùng `leave:configure` cho cấu hình flow (không thêm permission mới).
Hành động duyệt vẫn gate `leave:approve` / `leave:reject`, **cộng** kiểm tra
"đúng người duyệt của bước hiện tại" ở service.

## Out of scope (iteration sau)

- Bước **song song** (cần cả 2 người duyệt cùng lúc); hiện chỉ tuần tự
- Ủy quyền duyệt khi vắng mặt (delegation), nhắc hạn (SLA/escalation)
- Thông báo email/in-app khi chuyển cấp (chỉ để hook sẵn)
- Điều kiện rẽ nhánh theo số ngày (vd >5 ngày mới cần HR) — iteration sau
- Cấu hình flow theo **loại nghỉ phép** (đã chốt: theo phòng ban trong iteration này)

## Non-functional

- Tenant-scoped tuyệt đối; RBAC server-side; mọi thay đổi trạng thái + balance trong **transaction**
- Migration không phá dữ liệu SPEC-004: đơn cũ `currentStep=0`, flow null → vẫn xem được
- TDD cho service định tuyến/advance/return; integration test cho RBAC theo cấp
- WCAG AA, dark mode, i18n vi+en, design token (không hardcode hex)

## Boundaries

### Always Do
- Enforce "đúng người duyệt của bước hiện tại" ở **server**, không chỉ ẩn UI
- Snapshot bước duyệt vào `LeaveApproval` để sửa flow sau không làm sai đơn đang chạy
- Giữ tương thích ngược: thiếu flow → single-step như cũ
- **Auto-skip** (CHỐT) bước không giải được người duyệt (vd MANAGER nhưng NV chưa có manager) hoặc trùng chính người nộp → bỏ qua tự động + ghi note hệ thống "auto-skipped"
- **`scope=all`** (CHỐT) cho HR/Admin (`leave:approve|reject|configure`) xem toàn bộ đơn trong tenant; role khác gọi `scope=all` → **403**

### Never Do
- Không trừ `used` trước cấp cuối
- Không cho tự duyệt đơn của chính mình (kể cả khi là manager/trưởng phòng)
- Không xóa/đổi nghĩa `REJECTED` của dữ liệu cũ
```
