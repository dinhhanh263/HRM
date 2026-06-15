# TODO 020 — Leave Balance Roster

> Plan: [020-leave-balance-roster-plan.md](020-leave-balance-roster-plan.md)

## Slice 1 — Backend roster JSON (risk-first) ✅
- [x] 1.1 Shared DTO `LeaveBalanceRosterRowDto` + `LeaveBalanceRosterResponse` (`packages/shared/src/types/leave.ts`)
- [x] 1.2 Repo: `leaveBalanceRepository.findManyForEmployeesYear(ids, year)`
- [x] 1.3 Repo: `leaveRequestRepository.aggregateDaysByStatusForEmployees(ids, year)`
- [x] 1.4 Service: `leaveBalanceService.getRosterBalances(tenantId, employeeIds, year)`
- [x] 1.5 Controller `getRoster` (resolve scope qua `employeeService.getAll` + `requireReviewCapability`)
- [x] 1.6 Route `GET /leave/balances/roster`
- [x] 1.7 Unit test `getRosterBalances` (override>default, remaining math, pending tách) — 6/6 pass
- [x] 1.8 Integration test (HR roster + search + pagination + EMPLOYEE 403) — 39/39 pass

## Checkpoint A — read path backend xong

## Slice 2 — Frontend trang roster ✅
- [x] 2.1 Hook `useLeaveBalanceRoster({ year, departmentId, search, page })`
- [x] 2.2 Page `LeaveBalanceRosterPage.tsx` (bảng, ô còn lại/đã dùng/chờ duyệt, year ◀▶, skeleton, empty, sticky header, freeze cột tên)
- [x] 2.3 Route `leave/balances` trong `router.tsx` (RequirePermission anyOf `leave:approve`/`leave:reject`)
- [x] 2.4 Nav item Sidebar (nhóm operations, `leave:approve`)
- [x] 2.5 i18n keys (leave.json + nav.json, vi+en)
- [x] 2.6 Preview screenshot light/dark ✅ (34 NV render đúng, pending warning, không lỗi console). E2E dời sang Slice 5 (sau khi toolbar/filter ổn định, gộp với assert nghiệp vụ 5.2)

## Slice 3 — Lọc + tìm kiếm + phân trang ✅
- [x] 3.1 Toolbar: department filter (`useDepartments`) + search (debounce 300ms) + nút Xóa lọc
- [x] 3.2 Pagination server-side (PAGE_SIZE 20, footer Hiển thị X–Y trong Z)
- [x] 3.3 Integration: filter departmentId (deptA chứa NV / deptB rỗng → 0) + search narrows set (40/40 pass). E2E lọc phòng ban dời sang Slice 5

## Slice 4 — Xuất Excel ✅
- [x] 4.1 Controller `exportRoster` + route `GET /leave/balances/roster/export` (exceljs, page qua 200/lần, frozen panes, header 2 hàng VI)
- [x] 4.2 Hook `useExportLeaveRoster` (blob + saveBlob/filenameFromDisposition) + nút Xuất Excel (pending state, toast lỗi). Typecheck web sạch
- [x] 4.3 Integration: content-type xlsx + disposition attachment + scope rỗng + EMPLOYEE 403 (43/43 pass). Browser-verify: click → 200 OK → leave-balances-2026.xlsx (9534 bytes, PK) tải về Downloads

## Checkpoint B — tính năng đầy đủ

## Slice 5 — Polish + proof ✅
- [x] 5.1 Dark mode + a11y — screenshot light + dark sạch (token tuân thủ, cảnh báo "Chờ duyệt" rõ ở dark); cell `aria-label`, header `scope=col`, year ◀▶ có `aria-label`
- [x] 5.2 Assert nghiệp vụ critical-path: test "roster cell reflects approved + pending days together" — seed APPROVED 3 + PENDING 2, override 18 → ô ANNUAL = used 3 / pending 2 / remaining 13 (qua chính endpoint roster). Browser-verify thêm: NV "Nguyễn Minh Đức" hiển thị "Đã dùng 1 · Chờ duyệt 1"
- [x] 5.3 `pnpm --filter @hrm/web typecheck` ✓ · `@hrm/api typecheck` ✓ · full API suite 700/700 pass (57 files) · screenshots light+dark
