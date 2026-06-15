# SPEC-023: Overtime (OT) Multi-Step Approval Flow

**Status:** Approved (discovery resolved 2026-06-06)
**Created:** 2026-06-06
**Author:** Claude + Hạnh
**Depends on:** SPEC-003 (Authorization/RBAC), SPEC-005 (Leave Approval Flow), SPEC-010 (Timesheet), SPEC-019 (Holiday/Work OT Nudge)

---

## Objective

Nâng cấp đơn tăng ca (Overtime) từ **duyệt một-bước** hiện tại lên **luồng duyệt
nhiều cấp cấu hình được** giống Leave (Nhân viên → Quản lý → HR): mỗi đơn OT đi
qua một chuỗi bước có thứ tự, có **timeline lịch sử duyệt**, một cấp từ chối sẽ
**trả đơn về** (`RETURNED`) để nhân viên sửa và gửi lại (vòng mới). Tái dùng tối đa
hạ tầng `ApprovalFlow`/`ApprovalStep` và **routing engine generic** đã có của Leave,
nhưng cho phép cấu hình **luồng riêng cho OT** tách biệt với luồng nghỉ phép.

## Vấn đề với hiện trạng (SPEC-010)

- `OvertimeRequest` chỉ có 1 `reviewedById/reviewedAt/reviewNote` → một người duyệt
  là xong, không có chuỗi cấp duyệt, không có timeline.
- `OvertimeStatus` có `REJECTED` **terminal** → bị từ chối là hết, không sửa-gửi-lại
  được; lệch hẳn với mô hình Leave (RETURNED, resubmit).
- Ai có `timesheet:approve` đều duyệt **mọi** đơn OT trong tenant — không theo phòng
  ban, không theo cấp báo cáo.
- Người dùng không tìm thấy "workflow" vì duyệt OT bị ẩn trong tab Team của trang
  Chấm công, không minh bạch như Leave.

## Quyết định discovery (đã chốt 2026-06-06)

1. **Flow riêng cho OT** — thêm discriminator `flowType` (LEAVE | OVERTIME) vào
   `ApprovalFlow`, admin cấu hình luồng OT độc lập với Leave.
2. **Tái dùng permission** `timesheet:approve` (hành động duyệt/trả về) và
   `timesheet:configure` (cấu hình flow OT) — **không** thêm key `overtime:*`.
3. **Mô hình RETURNED** — bỏ `REJECTED` terminal khỏi luồng mới; từ chối = `RETURNED`,
   resubmit tăng `round`. Giữ `REJECTED` enum cho dữ liệu cũ/tương thích.
4. **Fallback single-step** — không resolve được flow (flowId null) → dùng luồng
   duyệt 1 bước cũ; giữ tương thích ngược, không vỡ đơn đang mở.
5. **UI nhân bản OT-variant** — tạo bản OT riêng của `ApprovalFlowSettings` +
   `LeaveTimeline`, **không** refactor/đụng code Leave đang chạy (tránh regression).

## Target Users

| User | Actions mới |
|------|-------------|
| **Super Admin** | Cấu hình luồng duyệt OT cho mọi phòng ban + luồng mặc định |
| **HR Manager** | Cấu hình luồng OT (`timesheet:configure`); thường là cấp cuối; xem mọi đơn |
| **Manager / Trưởng phòng** | Duyệt/trả về ở **cấp của mình**; chỉ thấy đơn OT đang chờ mình |
| **Employee** | Gửi đơn OT; khi bị trả về thì **sửa & gửi lại**; xem timeline duyệt |

---

## Core Features

### 1. Flow OT cấu hình được (per-department + fallback), tách biệt Leave
**Acceptance Criteria:**
- [ ] `ApprovalFlow.flowType` (`LEAVE` | `OVERTIME`, default `LEAVE`) phân biệt loại luồng
- [ ] `@@unique([tenantId, departmentId, flowType])` — mỗi (phòng ban, loại) tối đa 1 flow
- [ ] OT chọn flow theo `flowType = OVERTIME`; cấu hình OT không ảnh hưởng Leave và ngược lại
- [ ] Tái dùng nguyên `ApprovalStep` (approverType: MANAGER · DEPARTMENT_HEAD · ROLE · SPECIFIC_USER)
- [ ] CRUD flow + reorder step, gate `timesheet:configure`

### 2. Định tuyến khi gửi đơn OT
**Acceptance Criteria:**
- [ ] Khi tạo đơn OT: resolve flow `OVERTIME` theo `employee.departmentId` → flow mặc định tenant (departmentId null) → **null (legacy single-step)**
- [ ] **Snapshot** các bước vào `OvertimeApproval` (lịch sử bất biến khi sau này sửa flow)
- [ ] Đặt `currentStep = 1`, tính người duyệt mong đợi của bước 1
- [ ] **Auto-skip** bước không giải được người duyệt (vd MANAGER nhưng NV chưa có manager) hoặc trùng chính người nộp → ghi note hệ thống "auto-skipped" (ROLE không bao giờ auto-skip)

### 3. Hành động duyệt theo cấp
**Acceptance Criteria:**
- [ ] `approve` chỉ áp dụng **bước hiện tại**; người gọi phải đúng người duyệt mong đợi **và** có `timesheet:approve` (SUPER_ADMIN implicit-all)
- [ ] Duyệt bước k < N → ghi `OvertimeApproval`, `currentStep++`, đơn vẫn `PENDING`
- [ ] Duyệt **bước cuối** → `APPROVED`, **snapshot `multiplier`** theo category tại thời điểm duyệt cuối (giữ logic cảnh báo cap 40h/tháng·200h/năm — advisory, không chặn)
- [ ] `reject`/return (bất kỳ cấp) → **`RETURNED`** + note bắt buộc; dừng luồng
- [ ] Không hành động trên đơn không ở `PENDING`; không tự duyệt đơn của mình

### 4. Trả về & gửi lại
**Acceptance Criteria:**
- [ ] Đơn `RETURNED`: chủ đơn xem được note người duyệt
- [ ] Chủ đơn **sửa** (ngày/giờ/lý do) và **gửi lại** → reset `currentStep = 1`, `PENDING`, mở **vòng mới** (`OvertimeApproval.round + 1`, giữ lịch sử vòng cũ)
- [ ] Re-validate khi gửi lại (trùng đơn, ≤ MAX_OT_HOURS_PER_REQUEST = 12h, category server-derived)
- [ ] Chủ đơn có thể **hủy** đơn `RETURNED` (owner + non-terminal)

### 5. UI
**Acceptance Criteria:**
- [ ] **Cấu hình luồng OT** (tab Cài đặt chấm công): chọn phòng ban → danh sách bước, thêm/sửa/xóa/đổi thứ tự, chọn loại người duyệt — tái dùng pattern `ApprovalFlowSettings`
- [ ] **Tab Duyệt OT**: chỉ hiện đơn đang chờ **chính người đăng nhập** ở bước hiện tại (thay cho "toàn tenant")
- [ ] **Chi tiết đơn OT**: timeline các bước (✓ ai duyệt/lúc nào · ⏳ bước hiện tại · ↩ bị trả về · ⤼ auto-skip) — tái dùng pattern `LeaveTimeline`
- [ ] **Màn của NV**: badge `RETURNED` + note; nút "Sửa & gửi lại"
- [ ] Skeleton/empty/error đầy đủ; status badge màu + chữ; dark mode; i18n vi+en; token (no hex)

---

## Data Model (bổ sung / sửa)

```prisma
model ApprovalFlow {
  // + thêm
  flowType  ApprovalFlowType @default(LEAVE) @map("flow_type")
  otRequests OvertimeRequest[]   // back-relation cho OT
  // đổi: @@unique([tenantId, departmentId]) → @@unique([tenantId, departmentId, flowType])
}

model OvertimeRequest {
  // + thêm
  flowId      String?  @map("flow_id")
  flow        ApprovalFlow? @relation(fields: [flowId], references: [id])
  currentStep Int      @default(0) @map("current_step")  // 0 = legacy/chưa vào flow/xong
  approvals   OvertimeApproval[]
  // giữ reviewedById/reviewedAt/reviewNote cho legacy single-step + tương thích
}

model OvertimeApproval {        // audit trail theo bước, theo vòng
  id                 String    @id @default(cuid())
  overtimeRequestId  String    @map("overtime_request_id")
  request            OvertimeRequest @relation(fields: [overtimeRequestId], references: [id], onDelete: Cascade)
  round              Int       @default(1)
  stepOrder          Int       @map("step_order")
  approverType       ApproverType
  expectedApproverId String?   @map("expected_approver_id")
  decision           ApprovalDecision?            // null = đang chờ
  decidedById        String?   @map("decided_by_id")
  decidedAt          DateTime? @map("decided_at")
  note               String?
  @@unique([overtimeRequestId, round, stepOrder])
  @@map("overtime_approvals")
}

enum ApprovalFlowType { LEAVE OVERTIME }
// Tái dùng: ApproverType, ApprovalDecision (APPROVED RETURNED AUTO_SKIPPED)
// OvertimeStatus { PENDING APPROVED REJECTED CANCELLED } — thêm RETURNED
enum OvertimeStatus { PENDING APPROVED REJECTED CANCELLED RETURNED }
```

> `REJECTED` giữ cho dữ liệu cũ; luồng mới dùng `RETURNED`.

## API (dưới `/api/v1/timesheet`)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/overtime/flows` | `timesheet:configure` | list flow OT (kèm steps) |
| POST | `/overtime/flows` | `timesheet:configure` | tạo flow OT (departmentId hoặc mặc định) |
| PATCH | `/overtime/flows/:id` | `timesheet:configure` | sửa tên/active |
| DELETE | `/overtime/flows/:id` | `timesheet:configure` | xóa flow |
| PUT | `/overtime/flows/:id/steps` | `timesheet:configure` | thay toàn bộ step (reorder) |
| GET | `/overtime/:id` | `timesheet:view` | + timeline `approvals` |
| POST | `/overtime/:id/approve` | `timesheet:approve` | tác động **bước hiện tại** |
| POST | `/overtime/:id/reject` | `timesheet:approve` | → `RETURNED`, note bắt buộc |
| PATCH | `/overtime/:id/resubmit` | (ownership) | sửa & gửi lại đơn `RETURNED` |

- `GET /overtime` (review list, `timesheet:update`) đổi nghĩa: chỉ trả đơn mà người
  gọi là **người duyệt bước hiện tại**; HR/Admin (`timesheet:approve|configure`) có
  thể xem toàn bộ qua `scope=all`; role khác gọi `scope=all` → 403.
- Giữ POST `/overtime` (tạo, `timesheet:create`), GET `/overtime/me`, POST `/overtime/:id/cancel`.

## Logic định tuyến (tái dùng `approval-routing.helper.ts` — generic, 0 thay đổi)

```
resolveFlow(employee, flowType=OVERTIME):
  flow = activeFlow(tenant, employee.departmentId, OVERTIME)
       ?? defaultFlow(tenant, OVERTIME)        // departmentId null
       ?? null                                 // → legacy single-step
buildApprovalSnapshot(): auto-skip NO_APPROVER / SELF_APPROVAL / DUPLICATE_APPROVER (ROLE không skip)
advance(): hết step → APPROVED + snapshot multiplier; reject → RETURNED
```

## Tái sử dụng hạ tầng Leave

| Thành phần | Chiến lược |
|-----------|-----------|
| `approval-routing.helper.ts` | **Dùng nguyên** (đã generic: resolveFlow/resolveApprover/buildApprovalSnapshot/findNextActiveStep) |
| `approval-flow.service.ts` + `repository` | **Dùng nguyên**, thêm tham số `flowType` để lọc |
| Decision engine (approve/return/resubmit) | **Trích xuất** phần chung leave-coupled hiện tại thành helper tái dùng cho OT |
| `OvertimeApproval` (FK overtimeRequestId) | **Tạo mới** song song `LeaveApproval` |
| `ApprovalFlowSettings.tsx`, `LeaveTimeline.tsx` | **Nhân bản OT-variant** (đã chốt: không refactor Leave, tránh regression) |
| RBAC | **Tái dùng** `timesheet:approve` / `timesheet:configure` |

## Permissions

Không thêm permission mới. Cấu hình flow OT gate `timesheet:configure`; duyệt/trả về
gate `timesheet:approve`, **cộng** kiểm tra "đúng người duyệt bước hiện tại" ở service.
HR_MANAGER đã có `timesheet:configure/approve`; MANAGER có `timesheet:approve` (không
có configure — đúng thiết kế).

## Out of scope (iteration sau)

- Bước **song song** (cần nhiều người duyệt cùng lúc); hiện chỉ tuần tự
- Ủy quyền khi vắng mặt (delegation), nhắc hạn (SLA/escalation)
- Thông báo email/in-app khi chuyển cấp (chỉ hook sẵn)
- Điều kiện rẽ nhánh theo số giờ OT (vd >8h mới cần HR)
- Bảng `ApprovalSnapshot(entityType, entityId)` generic hoàn toàn — chỉ làm khi có entity thứ 3

## Non-functional

- Tenant-scoped tuyệt đối; RBAC server-side; mọi đổi trạng thái trong **transaction**
- Migration không phá dữ liệu SPEC-010: đơn OT cũ `currentStep=0`, flow null → xem được
- TDD cho routing/advance/return; integration test RBAC theo cấp
- WCAG AA, dark mode, i18n vi+en, design token (no hex)

## Boundaries

### Always Do
- Enforce "đúng người duyệt bước hiện tại" ở **server**, không chỉ ẩn UI
- Snapshot bước duyệt vào `OvertimeApproval` để sửa flow sau không làm sai đơn đang chạy
- Giữ tương thích ngược: thiếu flow OT → single-step như cũ
- Snapshot `multiplier` đúng tại **bước duyệt cuối** (không phải khi tạo)
- Auto-skip bước không giải được người duyệt / trùng người nộp + ghi note

### Never Do
- Không thêm key `overtime:*` (đã chốt tái dùng `timesheet:*`)
- Không cho tự duyệt đơn của chính mình (kể cả khi là manager/trưởng phòng)
- Không xóa/đổi nghĩa `REJECTED` của dữ liệu cũ
- Không chặn đơn vì cap OT (cap chỉ advisory như SPEC-010)
