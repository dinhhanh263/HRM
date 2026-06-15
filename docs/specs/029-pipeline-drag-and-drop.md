# Feature: Pipeline board drag-and-drop (recruitment)

> Spec: SPEC-029 · Phụ thuộc: SPEC-024 (ATS board), SPEC-028 (stage-transition policy)

## Objective

Cho phép kéo-thả (drag-and-drop) card ứng viên giữa các cột stage trên tab Pipeline
của màn hình Recruitment, thay vì chỉ chuyển bước qua menu "...". Kéo-thả phải tôn
trọng đầy đủ policy SPEC-028 (gate OFFER + chặn/định tuyến terminal) và giữ menu "..."
làm đường thay thế cho bàn phím / mobile.

## Target Users

- HR_MANAGER, SUPER_ADMIN, và mọi role có `recruitment:application_move`: thao tác
  chuyển bước nhanh, trực quan kiểu Trello/Linear.
- Người có thêm `recruitment:application_force_move`: kéo vào OFFER chưa đủ gate sẽ
  được định tuyến qua dialog nhập lý do.

## Core Features

1. **Kéo card giữa các stage thường** — Thả card sang một cột stage khác gọi `move()`
   với optimistic update (đã có sẵn trong `useMoveApplication`). Rollback + toast lỗi
   nếu backend từ chối.
   - AC: kéo card từ "Phỏng vấn" → "Sàng lọc CV" làm card đổi cột ngay; nếu API lỗi,
     card quay lại cột cũ và hiện toast.

2. **Thả vào OFFER tôn trọng gate** — Khi `offerGateMet === false`:
   - Actor KHÔNG có `canForce`: cột OFFER không phải drop-zone hợp lệ (hiển thị trạng
     thái cấm; không gọi API). AC: thả bị từ chối ở client, card giữ nguyên cột.
   - Actor CÓ `canForce`: thả được nhưng mở `ForceMoveDialog`; chỉ commit `move` với
     `force: true` + `note` sau khi xác nhận. Huỷ dialog → card giữ nguyên cột.
   - Khi `offerGateMet === true`: thả vào OFFER là move thường.

3. **Thả vào HIRED/REJECTED mở dialog disposition** — Kéo card vào cột terminal mở
   `AlertDialog` Tuyển (HIRED) hoặc `RejectApplicationDialog` (REJECTED) tương ứng;
   chỉ thực thi sau xác nhận, qua `hire()`/`reject()` (KHÔNG qua `move`).
   - Chỉ là drop-zone khi actor có quyền tương ứng (`canHire` / `canReject`).
   - AC: kéo vào "Đã tuyển" mở dialog "Tuyển ứng viên này?"; xác nhận → card rời board.

4. **Fallback + A11y** — Menu "..." giữ nguyên toàn bộ chức năng hiện có. Kéo-thả hỗ
   trợ bàn phím (dnd-kit KeyboardSensor). Card chỉ kéo được khi `canMove`; card đang
   có mutation pending thì không kéo. Tôn trọng `prefers-reduced-motion`.

5. **Phản hồi trực quan** — Cột đích hợp lệ được highlight khi hover-drag; cột không
   hợp lệ hiển thị trạng thái cấm; card đang kéo có drag-overlay (ghost).

## Out of Scope

- Sắp xếp lại thứ tự card *trong cùng* một cột (board không có khái niệm ưu tiên thủ công).
- Kéo-thả đa lựa chọn (bulk drag).
- Thay đổi backend: API `move`/`hire`/`reject` + policy SPEC-028 đã đủ.
- Kéo-thả để sắp xếp lại thứ tự *stage* (đã có StageEditor riêng).

## Technical Approach

- **Thư viện**: `@dnd-kit/core` + `@dnd-kit/sortable` (chỉ cần core + utilities thực ra
  đủ; không cần sortable nếu không reorder trong cột → chỉ dùng `@dnd-kit/core`).
  - Lý do chọn: accessible (KeyboardSensor sẵn) đáp ứng WCAG 2.2 AA trong rules; nhẹ;
    React 18; thay cho `react-beautiful-dnd` đã deprecated.
- **Kiến trúc component** (chỉ sửa `JobPipelineBoard.tsx`):
  - Bọc board trong `<DndContext>` với PointerSensor (activation distance ~6px để không
    nuốt click mở card) + KeyboardSensor + TouchSensor (delay ~200ms tránh xung đột scroll).
  - Mỗi cột stage là `useDroppable({ id: stage.id, disabled: !isValidDropTarget(stage) })`.
  - Mỗi card là `useDraggable({ id: app.id, disabled: !canMove || isBusy })`.
  - `onDragEnd`: phân loại stage đích → gọi `handleMove` / mở `forceTarget` /
    `hireTarget` / `rejectTarget`. Tái dùng toàn bộ handler đã có.
  - `isValidDropTarget(stage)`: dựa trên `canMove/canForce/canHire/canReject` +
    `offerGateMet` + loại stage; cùng quy tắc với menu để 2 đường nhất quán.
- **Optimistic**: dùng nguyên `useMoveApplication` (đã `onMutate`/rollback). Disposition
  vẫn qua dialog nên không cần optimistic riêng cho drag.

## Code Style

- Follow `.claude/rules/` + `CLAUDE.md` design system + `ui-modern.md`.
- Token màu/spacing/motion; không hex; `transition`/transform cho drag; reduced-motion.

## Testing Strategy

- **Unit (thuần)**: trích logic quyết định `resolveDropAction(stage, caps, offerGateMet)`
  ra hàm pure → test ma trận: stage thường→move; OFFER gate-met→move; OFFER gate-unmet
  + canForce→force-dialog; OFFER gate-unmet + !canForce→blocked; HIRED→hire-dialog;
  REJECTED→reject-dialog; thiếu quyền→blocked; về chính stage→noop.
- **E2E (Playwright)**: kéo card qua một stage thường → card đổi cột; kéo card chưa đủ
  gate vào OFFER (admin có force) → mở ForceMoveDialog. Dùng `dragTo`/manual mouse moves.
- Giữ E2E SPEC-028 hiện có xanh (không regression).

## Boundaries

### Always Do
- Drop-action dùng *chung* bộ quy tắc với menu "..." (một nguồn sự thật → `resolveDropAction`).
- Tôn trọng policy SPEC-028: terminal không bao giờ qua `move`; OFFER gate enforce.
- Giữ menu "..." làm fallback bàn phím/mobile.

### Ask First
- Thêm reorder trong cột (ngoài scope hiện tại).

### Never Do
- Không tự ý commit (theo memory người dùng).
- Không bypass gate ở client để "đỡ phiền" — backend vẫn là nguồn sự thật.
