# Plan — SPEC-046: Leave Approval CC / Watchers

> Spec: `docs/specs/046-leave-approval-cc-watchers.md`
> Nguyên tắc: vertical slices, mỗi slice test được độc lập; foundation + risk trước.

## Bối cảnh kiến trúc (đã khảo sát)

- Flow engine: `ApprovalFlow` + `ApprovalStep` (`ApproverType`: MANAGER/DEPARTMENT_HEAD/ROLE/SPECIFIC_USER).
- Duyệt: `matchesApprover(current, actor)` ở `approval-routing.helper.ts`; actor.roleKey = custom `Role.key`.
- Xem đơn người khác: `requireReviewCapability` (cần `leave:approve`/`leave:reject`).
- Notification: `notificationRepository.create({tenantId, userId, kind, title, body, entityType, entityId, dedupeKey})`; userId = **User.id**. SPECIFIC_USER watcher lưu Employee.id → map `Employee.userId`. ROLE watcher → tất cả user có role.key == roleKey.

## Slices

### Slice 1 — Cấu hình CC trong Flow (DB + API + UI form)  ⟵ foundation
**Objective:** Admin thêm/sửa/xoá watcher khi tạo/sửa flow; reload thấy đúng.

**Files:**
- `apps/api/prisma/schema.prisma` — model `ApprovalWatcher`; `ApprovalFlow.watchers`; `Employee.watchingFlows @relation("WatcherEmployee")`.
- `apps/api/prisma/migrations/<ts>_add_approval_watchers/migration.sql` — additive (`npx prisma migrate dev`).
- `packages/shared/src/types/leave.ts` — `ApprovalWatcherDto`, `WatcherInput`, thêm `watchers` vào Flow DTO.
- `apps/api/src/app/validators/leave.validator.ts` — `watcherSchema` (ROLE⇒roleKey, SPECIFIC_USER⇒watcherId cuid); thêm `watchers?` vào `createApprovalFlowSchema`/`updateApprovalFlowSchema`; `replaceWatchersSchema`.
- `apps/api/src/domain/repositories/approval-flow.repository.ts` — include `watchers`; create/replace watchers trong cùng transaction.
- `apps/api/src/domain/services/approval-flow.service.ts` — nhận & lưu watchers.
- `apps/api/src/app/controllers/leave.controller.ts` — flow CRUD truyền watchers.
- `apps/api/src/app/routes/v1/leave.routes.ts` — (tuỳ chọn) `PUT /flows/:id/watchers` (`leave:configure`).
- `apps/web/src/features/leave/**` — form: state `watchers`, section "CC / Người theo dõi", reuse role dropdown + employee picker; api hooks + types.
- i18n `vi/en/leave.json` — keys `flows.form.watchers.*`.

**AC:** create/edit flow kèm watchers persist; GET flow trả watchers; validator chặn ROLE thiếu roleKey / SPECIFIC_USER thiếu watcherId.
**Verify:** unit validator; integration `POST`/`PATCH`/`GET /flows`; UI reload thấy đúng.
**Deps:** —

---
### Checkpoint 1: Watcher config end-to-end (DB↔API↔UI) OK, migrate chạy sạch.
---

### Slice 2 — Quyền xem read-only cho watcher (API + UI list/detail)
**Objective:** Watcher (kể cả chỉ `leave:view`) xem đơn mình được CC; non-watcher bị chặn; **không** duyệt được.

**Files:**
- `apps/api/src/domain/leave/approval-routing.helper.ts` (hoặc `watcher.helper.ts` mới) — `isWatcher(watchers, actor)`: `ROLE⇒actor.roleKey===roleKey` || `SPECIFIC_USER⇒actor.employeeId===watcherId`.
- `apps/api/src/domain/repositories/leave-request.repository.ts` — `findWatchedCandidates(tenantId, actor, filters)`: đơn có `flow.watchers` khớp actor.
- `apps/api/src/domain/services/leave-request.service.ts` — scope `watching`; đánh dấu read-only (không trả quyền action).
- `apps/api/src/app/controllers/leave.controller.ts` — `getRequest`: cho phép nếu owner || review capability || watcher; `listRequests`: scope `watching`.
- `apps/web/src/features/leave/**` — tab/scope "Đang theo dõi"; badge "CC · chỉ xem"; ẩn nút Duyệt/Từ chối ở hàng CC; banner read-only ở chi tiết; api hook + types (`scope`, `readOnly`).
- i18n — `scope.watching`, `badge.cc`, `detail.watcherBanner`.

**AC:** HR staff (`leave:view` only) là watcher ROLE → list+detail 200; non-watcher `leave:view` → detail 403; watcher gọi approve/reject → 403 (bất biến); owner/approver không đổi hành vi.
**Verify:** integration 4 case trên; UI: watcher không thấy nút duyệt.
**Deps:** Slice 1.

---
### Checkpoint 2: Read-only visibility + bất biến "không duyệt được" đã có test.
---

### Slice 3 — Notification cho watcher
**Objective:** Watcher nhận in-app notification khi đơn nộp và khi APPROVED/REJECTED.

**Files:**
- `apps/api/src/domain/services/leave-request.service.ts` — sau `create` (nếu có flowId) và sau finalize (APPROVED/REJECTED) → resolve danh sách User của watchers → `notificationRepository.create` (best-effort try/catch, không làm hỏng nghiệp vụ).
- Resolve users: SPECIFIC_USER → `Employee.userId`; ROLE → users có `role.key == roleKey` (repo method `userRepository.findByRoleKey(tenantId, roleKey)` hoặc tương đương — thêm nếu chưa có).
- Dedupe: `dedupeKey = leave_watch_<event>:<requestId>:<userId>`; **bỏ qua** userId trùng owner hoặc người vừa quyết định.
- `kind`: `leave_watch_submitted`, `leave_watch_decided`; `entityType='leave_request'`, `entityId=requestId`.
- (web) render kind mới trong notification list nếu cần mapping icon/label — kiểm tra `notifications.json`.

**AC:** nộp đơn qua flow có watcher → mỗi watcher-user nhận đúng 1 notification (không trùng, không tự-báo owner); duyệt xong → nhận notification kết quả.
**Verify:** unit dedupe/resolve; integration: tạo flow có watcher → nộp → assert notification tồn tại cho watcher, không có cho owner-trùng; approve → assert notification kết quả.
**Deps:** Slice 1 (+ helper Slice 2).

---
### Checkpoint 3: Notification submit + final decision hoạt động, best-effort không vỡ flow.
---

### Slice 4 — E2E + review polish
- E2E critical path (SPEC "Testing Strategy").
- `/review` five-axis; i18n vi/en đủ; a11y (aria-label badge/banner); dark mode.
- Commit + PR khi được yêu cầu.

## Thứ tự & rủi ro
1. Slice 1 (foundation, migration — rủi ro schema/transaction) → 2 (visibility — rủi ro RBAC leak) → 3 (notification — best-effort) → 4.
2. Bất biến quan trọng nhất kiểm sớm ở Slice 2: **watcher không duyệt được**.
