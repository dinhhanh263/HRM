# Plan 020 — Leave Balance Roster (Tổng quan số dư phép toàn công ty)

> Spec: [docs/specs/leave-balance-roster.md](../docs/specs/leave-balance-roster.md)
> Approach: vertical slices, risk-first (N+1 + RBAC scope ở Slice 1).

## Integration points (đã khảo sát code thật)

| Layer | File | Ghi chú |
|-------|------|---------|
| Shared DTO | `packages/shared/src/types/leave.ts` | Thêm `LeaveBalanceRosterRowDto`, `LeaveBalanceRosterResponse` cạnh `LeaveBalanceDto` (dòng 128). |
| Repo (balance) | `apps/api/src/domain/repositories/leave-balance.repository.ts` | Thêm `findManyForEmployeesYear(ids, year)`. |
| Repo (request) | `apps/api/src/domain/repositories/leave-request.repository.ts` | Thêm `aggregateDaysByStatusForEmployees(ids, year)` (groupBy thêm `employeeId`). |
| Service | `apps/api/src/domain/services/leave-balance.service.ts` | Thêm `getRosterBalances(tenantId, employeeIds, year)`. |
| Employee scope | `apps/api/src/domain/services/employee.service.ts` | **Tái dùng** `getAll(...)` — đã scope HR=all / MANAGER=team / ACTIVE filter. KHÔNG viết lại. |
| Controller | `apps/api/src/app/controllers/leave.controller.ts` | Thêm `getRoster`, `exportRoster`; dùng `requireReviewCapability` (đã có, dòng 59). |
| Route | `apps/api/src/app/routes/v1/leave.routes.ts` | `GET /balances/roster`, `GET /balances/roster/export` — `requirePermission('leave:view')`. |
| Excel | dùng `exceljs` (đã là dep, xem `employee-import.template.ts`). |
| Web route | `apps/web/src/router.tsx` | Thêm `path: 'leave/balances'` bọc `RequirePermission permission="leave:approve"` (proxy review-capability). |
| Web nav | `apps/web/src/components/layout/Sidebar.tsx` | Thêm item nhóm `operations`, `permission: 'leave:approve'` → ẩn với EMPLOYEE, hiện với HR+MANAGER. |
| Web hooks | `apps/web/src/features/leave/hooks/useLeave.ts` | Thêm `useLeaveBalanceRoster`, `useExportLeaveRoster`. |
| Web page | `apps/web/src/features/leave/pages/LeaveBalanceRosterPage.tsx` (mới). |
| i18n | `apps/web/src/i18n/locales/{vi,en}/leave.json`, `nav.json` | Key bảng + nav item. |
| Tests | `apps/api/tests/unit/leave-balance.service.test.ts`, `apps/api/tests/integration/leave.test.ts`, `apps/web/e2e/leave-balance-roster.spec.ts` (mới). |

### Quyết định RBAC
- Nav + route guard dùng **`leave:approve`** làm proxy cho "review capability" (HR_MANAGER, SUPER_ADMIN, MANAGER có; EMPLOYEE không). Nguồn sự thật vẫn là backend `requireReviewCapability`.
- Backend là security boundary; ẩn UI chỉ là UX.

---

## Slice 1 — Backend: roster JSON cho nhân viên trong scope (RISK-FIRST)

**Objective**: HR/MANAGER gọi API nhận số dư phép của các nhân viên ACTIVE trong phạm vi mình, không N+1.

**Files**: shared DTO, 2 repo methods, `getRosterBalances`, controller `getRoster`, route `GET /balances/roster`.

**Acceptance Criteria**:
- [ ] `GET /leave/balances/roster?year=&departmentId=&search=&page=&limit=` trả `{ data, leaveTypes, pagination }`.
- [ ] Danh sách nhân viên lấy qua `employeeService.getAll` (scope theo role + chỉ ACTIVE).
- [ ] Mỗi ô: `allocated/used/pending/remaining` khớp `leave-balance.service` (override > defaultDays).
- [ ] Đúng 3 query roster (types + overrides + groupBy) bất kể N nhân viên.
- [ ] EMPLOYEE / không review-capability → 403.

**Verification**: unit `getRosterBalances` + integration (HR all, MANAGER team, EMPLOYEE 403).
**Dependencies**: none.

---

## Checkpoint A — Read path backend xong
- [ ] Integration: HR thấy toàn bộ ACTIVE; MANAGER chỉ team; EMPLOYEE 403.
- [ ] Unit phép tính số dư pass. Không N+1 (review query count).

---

## Slice 2 — Frontend: trang roster hiển thị dữ liệu Slice 1

**Objective**: HR vào `/leave/balances` thấy bảng nhân viên × loại phép.

**Files**: hook `useLeaveBalanceRoster`, `LeaveBalanceRosterPage.tsx`, `router.tsx`, `Sidebar.tsx`, i18n.

**Acceptance Criteria**:
- [ ] Route + nav item gated `leave:approve`; ẩn với EMPLOYEE.
- [ ] Bảng: dòng = nhân viên (avatar/tên/mã/phòng ban), cột = loại phép; ô hiện **Còn lại / Đã dùng / Chờ duyệt** (`tabular-nums`, căn phải).
- [ ] Chọn năm ◀ ▶ refetch đúng năm.
- [ ] Skeleton khi load; empty state khi rỗng; sticky header; freeze cột tên.

**Verification**: E2E happy-path render; preview screenshot light + dark.
**Dependencies**: Slice 1.

---

## Slice 3 — Lọc phòng ban + tìm kiếm + phân trang

**Objective**: thu hẹp roster theo phòng ban / tìm kiếm, phân trang server-side.

**Files**: page toolbar (department filter dùng `useDepartments`, search debounce 300ms), hook params, pagination control.

**Acceptance Criteria**:
- [ ] Chọn phòng ban → chỉ nhân viên phòng đó.
- [ ] Search tên/mã (debounce 300ms) → đúng tập.
- [ ] Phân trang đúng `pagination.total/totalPages`.

**Verification**: integration filter narrows set; E2E lọc phòng ban.
**Dependencies**: Slice 2.

---

## Slice 4 — Xuất Excel

**Objective**: tải `.xlsx` roster theo filter hiện tại.

**Files**: controller `exportRoster`, route `GET /balances/roster/export`, hook `useExportLeaveRoster`, nút Export ở toolbar.

**Acceptance Criteria**:
- [ ] Endpoint trả content-type xlsx + `Content-Disposition`; cùng guard + scope như JSON.
- [ ] File: header = loại phép; mỗi NV 1 dòng; số trùng bảng; tôn trọng year/dept/search/scope.
- [ ] Nút Export tải file ở FE.

**Verification**: integration export content-type; E2E click Export → file tải về.
**Dependencies**: Slice 1 (scope), Slice 3 (filters).

---

## Checkpoint B — Tính năng đầy đủ
- [ ] HR/MANAGER xem + lọc + xuất đúng phạm vi.
- [ ] EMPLOYEE không thấy nav/route, API 403.

---

## Slice 5 — Polish, a11y, test sweep (PROOF)

**Objective**: hoàn thiện chất lượng + khẳng định nghiệp vụ.

**Acceptance Criteria**:
- [ ] i18n vi+en đầy đủ, không hardcode text; dark mode OK; a11y (aria-label icon button, header `scope`, focus-visible).
- [ ] **E2E critical-path khẳng định nghiệp vụ**: seed 2 NV + 1 loại phép có allocation + 1 đơn APPROVED + 1 PENDING → đăng nhập HR → `/leave/balances` → **assert ô số dư = còn lại/đã dùng/chờ duyệt đúng theo seed** (không chỉ check render).
- [ ] `pnpm typecheck` + toàn bộ test pass.

**Verification**: full test run + preview screenshots.
**Dependencies**: Slice 1–4.

---

## Risks & Mitigations
- **N+1**: gom batch 3 query; assert query count trong integration nếu khả thi.
- **Scope rò rỉ**: dùng đúng `employeeService.getAll`; integration test MANAGER không thấy ngoài team.
- **Bảng quá rộng khi nhiều loại phép**: freeze cột tên + horizontal scroll; ô 3 số gọn.
- **Export lệch filter**: export tái dùng đúng path resolve scope/filter của JSON endpoint.
