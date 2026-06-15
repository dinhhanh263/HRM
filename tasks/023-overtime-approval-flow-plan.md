# Plan: SPEC-023 — Overtime Multi-step Approval Flow

> Nguồn: `docs/specs/023-overtime-approval-flow.md` (Approved 2026-06-06)
> Nâng cấp OT request từ duyệt single-step → multi-step flow giống Leave (NV → Quản lý → HR),
> có timeline lịch sử duyệt, RETURNED/resubmit, fallback single-step khi chưa cấu hình flow.

## 1. Bối cảnh & Chiến lược tái dùng

Hệ thống đã có **routing engine generic** (`approval-routing.helper.ts`) và pattern multi-step
hoàn chỉnh ở Leave. OT sẽ tái dùng tối đa, **không refactor code Leave** (tránh regression).

| Hạ tầng | Quyết định cho OT |
|---------|-------------------|
| `approval-routing.helper.ts` (resolveFlow, resolveApprover, buildApprovalSnapshot, findNextActiveStep, matchesApprover) | **Tái dùng nguyên, 0 thay đổi** — đã generic |
| `ApprovalFlow` + `ApprovalStep` | **Tái dùng model**, thêm discriminator `flowType` (LEAVE\|OVERTIME); unique đổi thành `[tenantId, departmentId, flowType]` |
| `LeaveApproval` (timeline rows) | **Nhân bản** thành model mới `OvertimeApproval` (cùng shape) — OT cần bảng timeline riêng |
| Permission | **Tái dùng** `timesheet:approve` (approve/return) + `timesheet:configure` (cấu hình flow). KHÔNG thêm `overtime:*` |
| Service decision engine (`leave-request.service.ts`) | **Nhân bản logic** sang `overtime.service.ts` (decide/approveStep/returnStep/legacyReview) — KHÔNG sửa file Leave |
| UI `ApprovalFlowSettings` + `LeaveTimeline` | **Nhân bản OT-variant** (namespace `timesheet`), KHÔNG sửa file Leave |

## 2. Mô hình quyết định (chốt từ spec)

- Bỏ REJECTED terminal khỏi flow mới. **Reject = RETURNED** (resubmit được, round+1).
- Giữ enum `REJECTED` trong `OvertimeStatus` cho dữ liệu legacy (đơn cũ đã reject).
- `flowId = null` → đi nhánh **legacy single-step** (1 người duyệt, backward-compat).
- Multiplier vẫn snapshot **tại bước duyệt CUỐI CÙNG** (khi đơn chuyển APPROVED), không đổi.
- Cap warnings OT (tháng/năm) vẫn advisory, không block — giữ nguyên ở bước cuối.

## 3. Trạng thái schema hiện tại (đã verify)

- `ApprovalFlow` (schema.prisma:472): có `@@unique([tenantId, departmentId])` → đổi.
- `ApprovalStep` (schema.prisma:493): generic, **0 thay đổi**.
- `LeaveApproval` (schema.prisma:511): mẫu để clone `OvertimeApproval`.
- `OvertimeRequest` (schema.prisma:611): thiếu `flowId`, `currentStep`, relation `approvals`.
- `OvertimeStatus` (schema.prisma:78): PENDING/APPROVED/REJECTED/CANCELLED → thêm `RETURNED`.
- `enum ApprovalDecision` (66): APPROVED/RETURNED/AUTO_SKIPPED — tái dùng cho OT.
- Migration mới nhất: `20260605075520_asset_handover_ack`.

## 4. Vertical slices (foundation-first, risk-first)

### Slice 1 — Schema + shared types (Foundation)
**Mục tiêu:** DB & type nền sẵn sàng; build pass; chưa đổi hành vi runtime.

Files:
- `apps/api/prisma/schema.prisma`:
  - `enum ApprovalFlowType { LEAVE OVERTIME }`
  - `ApprovalFlow`: thêm `flowType ApprovalFlowType @default(LEAVE) @map("flow_type")`,
    relation `otRequests OvertimeRequest[]`, đổi unique → `@@unique([tenantId, departmentId, flowType])`.
  - `OvertimeRequest`: thêm `flowId String? @map("flow_id")`, `currentStep Int @default(0) @map("current_step")`,
    relation `flow ApprovalFlow?`, `approvals OvertimeApproval[]`, index `[flowId]`.
  - `OvertimeStatus`: thêm `RETURNED`.
  - Model mới `OvertimeApproval` (clone LeaveApproval): tenantId, overtimeRequestId, round, stepOrder,
    approverType, roleKey, approverId, decision, decidedById, decidedAt, note, createdAt;
    `@@unique([overtimeRequestId, round, stepOrder])`, `@@map("overtime_approvals")`.
- Migration: `pnpm --filter @hrm/api prisma migrate dev --name overtime_approval_flow`.
- `packages/shared/src/types/leave.ts`: `ApprovalFlowDto` + `CreateApprovalFlowRequest` thêm optional `flowType?: ApprovalFlowType`.
- `packages/shared/src/types/timesheet.ts`: `OvertimeStatus` thêm `'RETURNED'`; `OvertimeRequestDto` thêm
  `flowId/currentStep/approvals?`; thêm `OvertimeApprovalDto` (cùng shape `LeaveApprovalDto`); export `ApprovalFlowType`.

**AC:** `pnpm build` + `tsc` pass; migration chạy sạch; seed RBAC không đổi.

---

### Slice 2 — Cấu hình OT flow (backend CRUD) [RBAC]
**Mục tiêu:** HR cấu hình flow OT độc lập với Leave qua `/overtime/flows`.

Files:
- `approval-flow.repository.ts`: thêm tham số `flowType` cho findAll/findByDepartment/create (mặc định LEAVE để Leave không đổi).
- `approval-flow.service.ts`: nhận `flowType`, single-default check theo `[tenantId, departmentId, flowType]`.
- `timesheet.controller.ts`: thêm controllers flow CRUD (list/get/create/update/replaceSteps/remove) gắn `flowType=OVERTIME`.
- `timesheet.routes.ts`: `GET/POST /overtime/flows`, `GET/PATCH/DELETE /overtime/flows/:id`, `PUT /overtime/flows/:id/steps`
  — tất cả `requirePermission('timesheet:configure')`.
- Validator tái dùng `validateAndNormalizeSteps`.

**AC:** HR_MANAGER tạo/sửa/xoá OT flow OK; MANAGER/EMPLOYEE → 403; Leave flow không bị ảnh hưởng.

---

### Slice 3 — Routing khi submit/resubmit (RISK: cốt lõi)
**Mục tiêu:** Nộp OT sinh snapshot OvertimeApproval theo flow; fallback single-step khi flowId null.

Files:
- `overtime.repository.ts`: thêm `createWithApprovals` (transaction), `requestDetailInclude` (kèm approvals), `findById` trả timeline.
- `overtime.service.ts`: `submit()` → resolveFlow(flowType=OVERTIME) → nếu null giữ legacy create (status PENDING, currentStep 0);
  nếu có flow → buildApprovalSnapshot → snapshotToApprovals → createWithApprovals (currentStep = step active đầu; nếu mọi step auto-skip → APPROVED ngay + snapshot multiplier).
- `overtime.service.ts`: `resubmit()` (RETURNED → round+1, re-validate, re-resolve flow, currentStep reset).
- Repo `resubmit` (transaction, giữ round cũ).

**AC:** Submit có flow 2 bước → tạo 2 approval rows, status PENDING, currentStep=1. Submit không flow → legacy. Resubmit từ RETURNED → round 2.

---

### Slice 4 — Decision engine per-step (RISK) [RBAC]
**Mục tiêu:** approve/return từng bước; tới bước cuối → APPROVED + snapshot multiplier.

Files:
- `overtime.service.ts`: `decide()` phân nhánh legacyReview (flowId null) vs approveStep/returnStep.
  - `approveStep`: matchesApprover, ghi decision APPROVED, findNextActiveStep → advance currentStep hoặc finalize (computeMultiplier + cap warnings + status APPROVED + reviewedBy).
  - `returnStep`: decision RETURNED + note bắt buộc → status RETURNED.
  - `legacyReview`: giữ logic approve/reject cũ (flowId null).
- `overtime.repository.ts`: `recordDecision` (transaction), `findReviewCandidates` (coarse filter: actor ở bất kỳ step chưa quyết định + flowId null cho legacy).
- `timesheet.controller.ts`: `buildApprovalActor()` ({employeeId, roleKey, isSuperAdmin}); approve/reject controllers dùng actor; `requirePermission('timesheet:approve')`.

**AC:** Manager duyệt bước 1 → currentStep=2; HR duyệt bước cuối → APPROVED + multiplier set. Return ở bất kỳ bước → RETURNED + note. Sai người duyệt → 403/422.

---

### Slice 5 — Review queue theo bước + chi tiết timeline [RBAC]
**Mục tiêu:** Hàng đợi duyệt lọc đúng người ở bước hiện tại; GET chi tiết kèm timeline.

Files:
- `overtime.repository.ts` / `overtime.service.ts`: `listForReview(actor)` lọc theo current-step approver (fine filter trên kết quả coarse).
- `timesheet.controller.ts`: `getOvertime(:id)` trả detail + approvals; `listTeamOvertime` dùng listForReview cho người có timesheet:approve.
- `timesheet.routes.ts`: `GET /overtime/:id` (`timesheet:view`); resubmit `PATCH /overtime/:id/resubmit` (ownership).
- `mappers.ts`: `toOvertimeRequestDto` thêm flowId/currentStep/approvals.

**AC:** Chỉ approver của bước hiện tại thấy đơn trong queue; GET /overtime/:id trả timeline đủ round.

---

### Slice 6 — Frontend (UI nhân bản OT-variant)
**Mục tiêu:** Cấu hình flow OT, timeline OT, RETURNED badge + resubmit, queue theo bước.

Files:
- `apps/web/src/features/timesheet/hooks/useOvertime.ts`: thêm `useResubmitOvertime`, `useOvertimeRequest(id)`, OT flow hooks (list/create/update/replaceSteps/remove).
- `apps/web/src/features/timesheet/components/OvertimeTimeline.tsx`: nhân bản `LeaveTimeline` (i18n namespace `timesheet`).
- `apps/web/src/features/timesheet/components/OvertimeFlowSettings.tsx`: nhân bản `ApprovalFlowSettings` (gọi /overtime/flows).
- Gắn OvertimeFlowSettings vào TimesheetSettingsPage (gate `timesheet:configure`).
- MyOvertime panel: badge RETURNED + nút "Nộp lại" (resubmit) + mở timeline.
- TeamOvertime: queue theo current-step; nút Duyệt/Trả về (note).
- i18n: bổ sung key vào `locales/vi|en/timesheet.json`.

**AC:** Test trên trình duyệt (screenshot) golden path: cấu hình flow 2 bước → NV nộp → Manager duyệt → HR duyệt → APPROVED; Return → NV thấy RETURNED + nộp lại. Dark mode + 403 cho thiếu quyền.

---

### Slice 7 — Tests (TDD + critical-path E2E)
- Unit: routing snapshot (auto-skip), advance/finalize, return round+1, legacy fallback, multiplier snapshot tại bước cuối.
- Integration (Supertest): RBAC `/overtime/flows` (HR vs MANAGER vs EMPLOYEE); approve/return bằng đúng/sai actor.
- E2E critical-path: seed flow 2 bước + 3 user → nộp → duyệt 2 bước → assert status APPROVED **và multiplier set** (business outcome, không quote coverage%).

## 5. Checkpoints

- **CP-A (sau Slice 1):** migration sạch, build/tsc pass, Leave flow chạy như cũ (regression check).
- **CP-B (sau Slice 4):** vòng đời OT đầy đủ qua API (submit→approve×N→APPROVED, return→resubmit) verify bằng test.
- **CP-C (sau Slice 6):** UI golden path verify bằng screenshot; RBAC ẩn/hiện + 403 đúng.
- **CP-D (sau Slice 7):** critical-path E2E xanh; không regression Leave.

## 6. Rủi ro & giảm thiểu

- **Đổi unique ApprovalFlow** có thể đụng dữ liệu Leave hiện có → migration thêm cột `flow_type` default LEAVE trước, rồi đổi unique; dữ liệu Leave cũ tự nhận LEAVE.
- **Không refactor Leave** → chấp nhận trùng lặp code OT (đúng chủ trương spec, ưu tiên zero-regression).
- **Multiplier snapshot** phải đúng tại bước cuối (không phải bước đầu) → test riêng cho mốc này.
