# Implementation Plan: Leave Approval Flow (Line Approval)

**Spec:** [docs/specs/005-leave-approval-flow.md](../docs/specs/005-leave-approval-flow.md)
**Created:** 2026-05-31
**Estimated:** ~24 tasks across 6 phases

---

## Overview — vertical slices (DB → API → UI), TDD on the routing/advance engine.

```
Phase 1: Reporting line   → Employee.managerId + Department.managerId (tiền đề)
Phase 2: Flow schema      → ApprovalFlow/Step/LeaveApproval, enums, migration, shared types
Phase 3: Flow config CRUD → repository + service + controller (leave:configure)
Phase 4: Routing engine   → resolveFlow/resolveApprover/advance, snapshot, auto-skip (TDD core)
Phase 5: Per-step actions → approve(current step), reject→RETURNED, resubmit, scope review/all
Phase 6: Frontend + Verify → flow config UI, review tab, request timeline, return&resubmit, tests
```

> Nguyên tắc: mỗi phase chạy được & test được trước khi sang phase sau. Giữ
> **tương thích ngược** với luồng single-step của SPEC-004 ở mọi bước (đơn cũ
> `currentStep=0`, `flowId=null` vẫn xem/duyệt được).

---

## Phase 1 — Reporting line (tiền đề)
- 1.1 Prisma: `Employee.managerId` self-relation (`EmployeeManager`); `Department.managerId` (`DepartmentHead` → Employee). Migrate (nullable, không phá dữ liệu).
- 1.2 Shared types: thêm `managerId` vào Employee/Department DTO + create/update inputs.
- 1.3 Service: validate cùng tenant + **chặn vòng lặp quản lý** (A→B→A) khi gán `managerId`. Unit test cho cycle-detection.
- 1.4 UI: thêm field "Quản lý trực tiếp" (form Nhân viên) + "Trưởng phòng" (form Phòng ban) — Select nhân viên cùng tenant. i18n vi+en.

## Phase 2 — Flow schema + types
- 2.1 Prisma: `ApprovalFlow`, `ApprovalStep`, `LeaveApproval`; enums `ApproverType`, `ApprovalDecision`; `LeaveStatus += RETURNED`; `LeaveRequest += flowId?, currentStep`. Unique `[tenantId, departmentId]`, `[flowId, stepOrder]`. Migrate.
- 2.2 Shared types: `ApprovalFlowDto`, `ApprovalStepDto`, `LeaveApprovalDto` (timeline), enums + error codes (`LEAVE_NOT_CURRENT_APPROVER`, `LEAVE_FLOW_DUPLICATE`, `LEAVE_INVALID_STEP`, …).
- 2.3 Permissions: tái dùng `leave:configure` (không thêm mới); confirm grant cho HR/Admin.

## Phase 3 — Flow config CRUD
- 3.1 `approval-flow.repository.ts` (tenant-scoped; flow kèm steps).
- 3.2 `approval-flow.service.ts` (+ unit tests): 1 flow active/phòng ban, đúng 1 default (departmentId null)/tenant; validate step ROLE→roleKey hợp lệ, SPECIFIC_USER→approverId cùng tenant; `PUT steps` thay toàn bộ + reorder.
- 3.3 `leave.validator.ts`: schema flow + steps.
- 3.4 controller + routes: GET/POST/PATCH/DELETE `/flows`, PUT `/flows/:id/steps` — tất cả `leave:configure`.

## Phase 4 — Routing engine (TDD core)
- 4.1 `approval-routing.helper.ts`: `resolveFlow(employee)` (phòng ban → default → null/legacy); `resolveApprover(step, request)` cho 4 type; pure functions. **Unit tests đầy đủ** cho từng nhánh.
- 4.2 `advance()` logic: snapshot steps vào `LeaveApproval` (round 1) khi tạo đơn; đặt `currentStep=1`; **auto-skip** bước không giải được người duyệt / trùng người nộp + ghi note "auto-skipped"; hết step → `APPROVED` + `used += totalDays` (transaction). Unit test: skip-đầu, skip-giữa, skip-all→approve-luôn, no-self-approve.
- 4.3 Tích hợp vào `leave-request.service.create()`: gọi resolveFlow + snapshot. Đơn không có flow → giữ legacy single-step.

## Phase 5 — Per-step actions + scope
- 5.1 `approve(id, actor)`: chỉ bước hiện tại; actor phải đúng người duyệt mong đợi **và** có `leave:approve` (SUPER_ADMIN implicit-all); k<N → ghi LeaveApproval + `currentStep++` + advance/auto-skip; bước cuối → APPROVED + trừ used (transaction). Unit + integration tests.
- 5.2 `reject(id, actor, note)`: bất kỳ cấp → `RETURNED`, note **bắt buộc**, dừng luồng, không trừ phép.
- 5.3 `resubmit(id, owner, patch)`: chỉ chủ đơn, chỉ đơn `RETURNED`; re-validate trùng lịch/quota; reset `currentStep=1`, status `PENDING`, mở **round +1** (giữ lịch sử round cũ).
- 5.4 `list` scope: `review` = đơn mà actor là người duyệt **bước hiện tại**; `all` = HR/Admin xem toàn tenant, role khác → **403**. `GET /requests/:id` trả timeline `approvals`.
- 5.5 Balance: `pending` chỉ tính đơn `PENDING` (RETURNED không tính); integration test create→approve qua N cấp→used cập nhật đúng.

## Phase 6 — Frontend + Verify
- 6.1 `hooks/useApprovalFlows.ts` + mở rộng `useLeave.ts` (request detail/timeline, resubmit, scope all).
- 6.2 `components/ApprovalFlowSettings.tsx`: chọn phòng ban → list bước, thêm/sửa/xóa/đổi thứ tự, chọn approverType (+ roleKey/approverId). Trong tab Cài đặt.
- 6.3 `components/LeaveTimeline.tsx`: timeline bước (✓ duyệt · ⏳ hiện tại · ↩ trả về) trong chi tiết đơn.
- 6.4 Tab Duyệt đơn: chỉ đơn chờ chính người đăng nhập ở bước hiện tại; thêm filter/scope=all cho HR/Admin.
- 6.5 Màn NV: badge `RETURNED` + note người duyệt; nút "Sửa & gửi lại" (mở lại form prefilled → resubmit).
- 6.6 i18n vi+en (status RETURNED, approverType, flow config, timeline, lỗi mới); status badge màu+chữ; dark mode.
- 6.7 Verify: `pnpm --filter @hrm/api typecheck && test`; `--filter web typecheck && test`; browser smoke (employee gửi → 2 cấp duyệt → approved; reject→return→resubmit) **light + dark, screenshots**; self-review 5 trục.

## Risks / decisions
- **Auto-skip** (chốt): bước không giải được người duyệt hoặc trùng người nộp → bỏ qua + note hệ thống; nếu skip hết → APPROVED ngay (cần test kỹ để không "duyệt rỗng" ngoài ý muốn — note rõ ràng).
- **Tương thích ngược**: không sửa nghĩa `REJECTED` cũ; luồng mới dùng `RETURNED`. Đơn pre-005 `flowId=null`/`currentStep=0` đi nhánh legacy.
- **Snapshot** steps vào LeaveApproval khi tạo/gửi lại → sửa flow về sau không làm sai đơn đang chạy.
- ROLE approver = capability-based (bất kỳ ai có roleKey ở bước đó duyệt được), không cố định 1 người → `scope=review` cộng dồn theo capability.
- Migration nhiều enum/relation: chạy `migrate dev` ở local trước, kiểm tra đơn cũ vẫn hiển thị trước khi tiếp.
- Out of scope: bước song song, delegation, SLA/escalation, notify email, rẽ nhánh theo số ngày, flow theo loại nghỉ (iteration sau).
