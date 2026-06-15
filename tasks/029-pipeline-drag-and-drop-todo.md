# TODO: SPEC-029 — Pipeline drag-and-drop (recruitment)

> Spec: `docs/specs/029-pipeline-drag-and-drop.md`
> Tái dùng API `move/hire/reject` + policy SPEC-028. Chỉ sửa FE board. Giữ menu "..." làm fallback.

## Phase 1: Dependency + nền tảng
- [x] 1.1 Thêm `@dnd-kit/core` (+ `@dnd-kit/utilities`) vào apps/web; install
- [x] 1.2 typecheck web pass với dep mới

## Phase 2: Pure decision fn + unit test (RED→GREEN)
- [x] 2.1 RED: `features/recruitment/lib/pipeline-drop.test.ts` (co-located theo vitest config) — ma trận resolveDropAction
- [x] 2.2 GREEN: `features/recruitment/lib/pipeline-drop.ts` — `resolveDropAction(ctx)` trả 'move'|'force'|'hire'|'reject'|'blocked'|'noop'
- [x] 2.3 unit test pass (16/16)

### ✅ Checkpoint A — quy tắc drop phủ mọi nhánh, không phụ thuộc UI

## Phase 3: Wiring DnD vào JobPipelineBoard
- [x] 3.1 Bọc `<DndContext>` (Pointer+Keyboard+Touch sensor); state activeApp + DragOverlay ghost
- [x] 3.2 Cột = `StageColumn` useDroppable; highlight valid (primary) / invalid (danger) khi over
- [x] 3.3 Card = `useDraggable` (disabled !canMove||isBusy); drag-handle riêng, giữ nút mở detail + menu "..."
- [x] 3.4 `onDragEnd` → resolveDropAction → handleMove / setForceTarget / setHireTarget / setRejectTarget; blocked → toast
- [x] 3.5 Menu "..." vẫn hoạt động (fallback) — không sửa, không hồi quy

### ✅ Checkpoint B — kéo-thả chạy, một nguồn quy tắc (resolveDropAction) với menu

## Phase 4: i18n + a11y polish
- [x] 4.1 i18n vi+en: `board.dragHandle`, `board.dropBlocked`
- [x] 4.2 reduced-motion (DragOverlay dropAnimation null); aria-label drag handle; focus-visible ring
- [x] 4.3 typecheck web + api pass

## Phase 5: E2E + review
- [x] 5.1 E2E: kéo qua stage thường → đổi cột; kéo vào OFFER chưa đủ gate (admin) → mở ForceMoveDialog
- [x] 5.2 Giữ E2E SPEC-028 xanh; verify UI bằng screenshot
- [x] 5.3 `/review` five-axis
