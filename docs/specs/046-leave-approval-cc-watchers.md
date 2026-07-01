# SPEC-046: Leave Approval CC / Watchers (Người theo dõi — chỉ xem)

**Status:** Approved (discovery resolved 2026-07-01)
**Created:** 2026-07-01
**Author:** Claude + Hạnh
**Depends on:** SPEC-003 (Authorization/RBAC), SPEC-005 (Leave Approval Flow — routing engine), Notification infrastructure (in-app notifications)

---

## Objective

Cho phép HR (theo **vai trò** như HR Manager / HR Staff, hoặc một **người cụ thể**) được
**CC / theo dõi** các đơn nghỉ phép đi qua một Approval Flow. Người được CC **xem được**
đơn tại **mọi thời điểm** (từ khi nộp đến khi kết thúc) nhưng **không có quyền
approve/reject** — chỉ quan sát để nắm tình hình. Tận dụng tối đa kiến trúc
`ApprovalFlow`/`ApprovalStep` hiện có, không đụng logic duyệt.

## Vấn đề cần giải

- Hiện tại chỉ ai có `leave:approve`/`leave:reject` mới xem được đơn của người khác
  (`requireReviewCapability`). HR staff chỉ có `leave:view` **không** theo dõi được đơn
  không phải của mình.
- HR cần "đứng ngoài quan sát" luồng duyệt của từng phòng ban mà **không** trở thành một
  cấp duyệt (không làm chậm/không chặn flow), và **không** được vô tình bấm duyệt.

## Quyết định discovery (đã chốt 2026-07-01)

1. **CC là thuộc tính của Flow, KHÔNG phải một bước duyệt.** Thêm bảng mới
   `approval_watchers` gắn vào `ApprovalFlow`. Watcher **không** nằm trong
   `ApprovalStep`/`LeaveApproval` → `matchesApprover()` không bao giờ khớp → **về bản
   chất không thể approve/reject** (không cần rào chắn thủ công ở endpoint).
2. **Hai kiểu CC:** `ROLE` (chọn một custom Role, vd HR Manager / HR Staff — dùng chung
   nguồn role với ROLE-step hiện có) và `SPECIFIC_USER` (chọn một nhân viên cố định).
   *(Không hỗ trợ MANAGER/DEPARTMENT_HEAD làm watcher trong iteration này — không phù hợp
   ngữ nghĩa "CC cho HR".)*
3. **Resolve động, KHÔNG snapshot per-request.** Watcher được resolve từ `flowId` gắn với
   đơn tại thời điểm xem → đảm bảo "thấy đơn ở **mọi thời điểm**" và luôn phản ánh cấu
   hình flow mới nhất. Đơn legacy (`flowId = null`) không có watcher.
4. **Quyền xem (row-level):** actor xem được đơn khi là watcher của flow gắn đơn đó:
   - `ROLE`: `actor.roleKey === watcher.roleKey`, **hoặc**
   - `SPECIFIC_USER`: `actor.employeeId === watcher.watcherId`.
   Không mở toàn bộ đơn công ty cho HR staff — chỉ đơn họ được CC.
5. **RBAC:** watcher chỉ cần `leave:view` để vào module + thấy danh sách "Đang theo dõi".
   **Không** cấp `leave:approve`. CRUD watcher nằm dưới `leave:configure` (như phần Flow).
6. **Notification:** báo in-app cho watcher **khi đơn được nộp** và **khi có quyết định
   cuối cùng** (APPROVED / REJECTED). Không báo ở từng bước trung gian. Nối leave vào
   notification service sẵn có (leave hiện chưa phát notification).
6b. **Email (bổ sung):** khi đơn được **nộp/nộp lại**, gửi email cho **approver ở bước
   đang chờ hiện tại** (audience `approver`) và cho **tất cả watcher** (audience
   `watcher`) — người nộp không nhận; ai vừa approver vừa watcher chỉ nhận 1 email
   (ưu tiên approver). Best-effort qua `emailProvider.sendLeaveRequestNotification`
   (no-op khi thiếu `RESEND_API_KEY`), không làm hỏng việc tạo đơn.
7. **Không tự-CC người nộp/người duyệt gây trùng:** nếu watcher trùng owner hoặc approver,
   họ vẫn xem được theo quyền vốn có — không tạo bản ghi/notification trùng lặp.

## Target Users

| User | Actions |
|------|---------|
| **HR Staff / HR Manager (được CC theo role)** | Xem read-only mọi đơn qua flow mình được CC, ở mọi trạng thái; nhận notification nộp/kết thúc. **Không** duyệt/từ chối. |
| **Người cụ thể được CC** | Như trên, theo `SPECIFIC_USER`. |
| **HR Manager / Admin (cấu hình flow)** | Thêm/sửa/xoá danh sách CC trong form Add/Edit Approval Flow (`leave:configure`). |

## Core Features

1. **Cấu hình CC trong form Flow** — Section "CC / Người theo dõi (chỉ xem)" dưới phần
   Steps; mỗi dòng chọn kiểu (Theo vai trò / Người cụ thể) + role/nhân viên; thêm/xoá;
   **cho phép để trống** (0 watcher).
   *AC:* Lưu flow với danh sách watcher; reload thấy đúng; sửa/xoá watcher persist đúng.
2. **Quyền xem read-only** — Watcher gọi được `GET /leave/requests?scope=watching` và
   `GET /leave/requests/:id` cho đơn mình được CC, kể cả khi chỉ có `leave:view`.
   *AC:* HR staff (chỉ `leave:view`) là watcher ROLE → thấy đơn trong list & detail; HR
   staff **không** là watcher → 403/không thấy đơn của người khác.
3. **Chặn duyệt (bất biến)** — Watcher gọi approve/reject → 403 `LEAVE_NOT_CURRENT_APPROVER`.
   *AC:* watcher không phải approver → không duyệt được ở bất kỳ bước nào.
4. **Notification** — Watcher nhận notification khi đơn nộp và khi APPROVED/REJECTED, link
   tới đơn (`entityType=LeaveRequest`).
   *AC:* nộp đơn qua flow có watcher → mỗi watcher (role holders + specific user) nhận 1
   notification; đơn được duyệt xong → nhận notification kết quả.
5. **UI theo dõi** — Tab/scope "Đang theo dõi" trong màn Leave; hàng CC ẩn nút
   Duyệt/Từ chối, hiện badge "CC · chỉ xem"; chi tiết hiện banner "Bạn đang theo dõi đơn
   này (không có quyền duyệt)".
   *AC:* watcher không thấy nút duyệt; owner/approver không bị ảnh hưởng.

## Out of Scope

- CC cho các flow khác (`OVERTIME`, `PAYMENT`, `PURCHASE`, `KPI`) — chỉ làm `LEAVE` lần này
  (model dùng chung nên mở rộng sau dễ).
- CC kiểu MANAGER / DEPARTMENT_HEAD.
- Email/push notification (chỉ in-app).
- Snapshot watcher theo lịch sử (audit "ai từng được CC lúc nào").

## Technical Approach

### Data model (Prisma — additive, non-destructive)

```prisma
model ApprovalWatcher {
  id          String       @id @default(cuid())
  flowId      String       @map("flow_id")
  watcherType ApproverType @map("watcher_type")  // dùng lại enum: ROLE | SPECIFIC_USER
  roleKey     String?      @map("role_key")       // khi ROLE (Role.key của custom role)
  watcherId   String?      @map("watcher_id")     // khi SPECIFIC_USER (Employee.id)
  createdAt   DateTime     @default(now()) @map("created_at")

  flow    ApprovalFlow @relation(fields: [flowId], references: [id], onDelete: Cascade)
  watcher Employee?    @relation("WatcherEmployee", fields: [watcherId], references: [id])

  @@index([flowId])
  @@map("approval_watchers")
}
```
- `ApprovalFlow` thêm quan hệ `watchers ApprovalWatcher[]`.
- `Employee` thêm quan hệ ngược `watchingFlows ApprovalWatcher[] @relation("WatcherEmployee")`.
- Migration mới (additive). Không sửa cột hiện có.

### API contracts

- `GET /leave/flows`, `GET /leave/flows/:id` → include `watchers`.
- `POST /leave/flows`, `PATCH /leave/flows/:id` → body thêm `watchers?: WatcherInput[]`.
- `PUT /leave/flows/:id/watchers` (tuỳ chọn, đối xứng với `.../steps`) — replace watcher list.
- `GET /leave/requests?scope=watching` — trả đơn actor đang CC, flag read-only.
- `GET /leave/requests/:id` — cho phép nếu owner **||** review capability **||** watcher.
- Approve/reject: **không đổi**.

Validator (Zod) `watcherSchema`: `watcherType ∈ {ROLE, SPECIFIC_USER}`; `ROLE ⇒ roleKey`,
`SPECIFIC_USER ⇒ watcherId (cuid)`.

### Backend logic

- `approval-flow.service`/`repository`: CRUD watcher trong transaction cùng flow (giống steps).
- Visibility helper `isWatcher(flowWatchers, actor)`: khớp roleKey hoặc employeeId.
- `leave-request.repository.findWatchedCandidates(actor)`: đơn có `flow.watchers` khớp actor.
- `leave-request.service`: sau khi tạo đơn (nếu có flowId) và sau khi finalize
  (APPROVED/REJECTED) → resolve watcher list → phát notification (dedupe owner/approver).
- `leave.controller.getRequest`: thêm nhánh watcher vào điều kiện cho phép xem.

### Frontend

- `ApprovalFlowSettings.tsx`: thêm state `watchers`, section UI, gửi kèm khi tạo/sửa.
- Reuse role dropdown (nguồn custom roles) + employee picker sẵn có trong form.
- Màn Leave list: scope "watching" + badge + ẩn action; chi tiết: banner read-only.

## Code Style
- Follow `.claude/rules/` (TS strict, no `any`, 2 spaces, single quotes, i18n bắt buộc).
- Không hardcode màu/text; thêm keys ở cả `vi` và `en`.
- Optimistic/skeleton theo `ui-modern.md`.

## Testing Strategy
- **Unit:** `watcherSchema` validator; `isWatcher()` matching (role / specific / none);
  dedupe notification khi watcher trùng owner/approver.
- **Integration (Supertest):**
  - HR staff (`leave:view` only) là watcher ROLE → `GET /requests?scope=watching` & detail 200.
  - Non-watcher với chỉ `leave:view` → detail 403.
  - Watcher gọi approve → 403 (bất biến "không duyệt được").
  - CRUD watcher qua `POST/PATCH /flows`.
- **E2E (critical path):** cấu hình flow có CC = HR role → nhân viên nộp đơn → HR staff
  thấy đơn trong "Đang theo dõi" + nhận notification, **không** thấy nút Duyệt; đơn được
  duyệt → HR staff nhận notification kết quả. (Seed đủ state để quan sát được outcome.)

## Boundaries
### Always Do
- Giữ nguyên bất biến: watcher **không thể** approve/reject (endpoint không đổi logic khớp approver).
- RBAC wired end-to-end: row-level visibility qua watcher-match; `leave:configure` cho CRUD.
- i18n vi/en đầy đủ; test critical path xác nhận outcome nghiệp vụ.

### Ask First
- Thay đổi permission keys hoặc mở rộng CC sang flow khác (OT/Payment…).
- Thêm email/push notification.

### Never Do
- Cho watcher xem toàn bộ đơn công ty ngoài phạm vi flow họ được CC.
- Snapshot watcher thành `LeaveApproval` với `decision=null` (gây nhầm "đang chờ duyệt").
- Sửa migration cũ / cột hiện có theo kiểu phá huỷ.

## Next Step
Chạy `/plan` để phân rã thành các slice dọc có thứ tự phụ thuộc.
