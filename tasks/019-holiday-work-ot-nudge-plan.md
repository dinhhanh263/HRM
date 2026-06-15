# Plan: Holiday-Work OT Nudge (019)

> Spec: `docs/specs/019-holiday-work-ot-nudge.md`
> Loại: **Frontend-only**. Backend (OT submit, holidays, OT list) tái dùng nguyên trạng.

## Context — integration points đã xác minh

- **`TimesheetPage.tsx`** (`apps/web/src/features/timesheet/pages/`) đã có sẵn:
  - `holidays` qua `useHolidays(year)` (line 32), shape `HolidayDto { date, name, recurring, ... }`.
  - `todayKey` = ngày hôm nay nếu đang xem tháng hiện tại (line 36); `todayRecord` = attendance hôm nay (line 37).
  - `CheckInCard today={todayRecord}` (line 87) — **CheckInCard tự toast, không expose onSuccess**.
  → Vì vậy nudge dùng **điều kiện bền** (đã có `todayRecord` + hôm nay là lễ), không bắt sự kiện thoáng qua.
- **`OvertimeSheet.tsx`** mặc định `workDate = todayKey()` trong `useEffect([open])` (line 42-49); props
  hiện chỉ `{ open, onOpenChange }`. Cần thêm `initialDate?: string` để CTA mở sheet với ngày lễ điền sẵn.
- **`useMyOvertime({ month })`** (`hooks/useOvertime.ts:29`) → `GET /timesheet/overtime/me` trả
  `PaginatedResponse<OvertimeRequestDto>`. Dùng để biết đã có đơn OT cho `todayKey` chưa (tránh nudge trùng).
- **i18n**: namespace `timesheet` tại `apps/web/src/i18n/locales/{vi,en}/timesheet.json`. Đã có nhóm `overtime.*`.
- **Rule ngày lễ** (đồng nhất backend `overtime.helper.isHolidayDate`): `recurring` → so `MM-DD`;
  không recurring → so ngày chính xác `YYYY-MM-DD`.

## Dependency graph
```
Slice 1 (helper + OvertimeSheet.initialDate)  ─┐
                                               ├─→ Slice 2 (HolidayWorkNudge + wire TimesheetPage + i18n + live)
                          (foundation)         ─┘
```

## Risks / quyết định
- **Không** wire callback vào CheckInCard (giữ component đơn giản); dùng điều kiện dẫn xuất ở page.
- Nudge **dismissible theo phiên** (state trong page); không persist localStorage (giữ nhẹ, "Hiếm khi").
- CTA mở **một** `OvertimeSheet` riêng do TimesheetPage sở hữu (độc lập với sheet trong `MyOvertimePanel`),
  truyền `initialDate={todayKey}`. Tránh đụng `MyOvertimePanel`.
- Backend bất biến → không có rủi ro phá `TimesheetSummaryDto`/engine lương.

## Slices

### Slice 1 — Foundation: holiday-match helper + OvertimeSheet nhận initialDate
**Objective**: có hàm thuần nhận diện ngày lễ (testable) và OvertimeSheet mở được với ngày điền sẵn.
**Files**:
- `apps/web/src/features/timesheet/utils.ts` (hoặc helper mới cùng thư mục) — thêm `isHolidayMatch`.
- `apps/web/src/features/timesheet/components/OvertimeSheet.tsx` — thêm prop `initialDate?`.
- test: `apps/web/src/features/timesheet/utils.test.ts` (hoặc file test helper).
**Acceptance**:
- `isHolidayMatch('2026-09-02', holidays)` trả holiday Quốc khánh; ngày thường trả `undefined`;
  recurring khớp theo `MM-DD` kể cả khác năm; non-recurring chỉ khớp đúng ngày.
- `OvertimeSheet` khi `open` và có `initialDate` → `workDate = initialDate` (không phải hôm nay);
  không có `initialDate` → giữ hành vi cũ (hôm nay).
**Verification**: unit test helper xanh; web typecheck sạch.

### Slice 2 — Nudge wired end-to-end
**Objective**: chấm công ngày lễ → thấy nudge → bấm CTA mở OT sheet với ngày điền sẵn.
**Files**:
- `apps/web/src/features/timesheet/components/HolidayWorkNudge.tsx` (mới).
- `apps/web/src/features/timesheet/pages/TimesheetPage.tsx` — điều kiện hiển thị + sở hữu OT sheet + dismiss state.
- `apps/web/src/i18n/locales/vi/timesheet.json` + `.../en/timesheet.json` — keys `overtime.holidayNudge.*`.
- test: `apps/web/src/features/timesheet/components/HolidayWorkNudge.test.tsx`.
**Acceptance** (khẳng định nghiệp vụ):
- Đã chấm công hôm nay + hôm nay là lễ + chưa có OT cho ngày đó + chưa dismiss → nudge hiện đúng tên lễ.
- Bấm CTA → OvertimeSheet mở với `workDate` = ngày lễ (khẳng định prop truyền đúng ngày).
- Ngày thường → không render nudge.
- Đã có OT (bất kỳ status) cho ngày đó → không render nudge.
- Dismiss → nudge biến mất, không hiện lại trong phiên.
- i18n: en hiển thị tiếng Anh, vi tiếng Việt, không lộ key thô.
**Verification**: unit component xanh; web typecheck + toàn bộ web test xanh; live screenshot (light + dark)
chấm công ngày lễ thấy nudge và OT sheet điền sẵn ngày.

## Checkpoints
- **CP1 (sau Slice 1)**: helper test xanh, typecheck sạch.
- **CP2 (Feature complete)**: web typecheck + web tests xanh; live screenshot light+dark; `/review` five-axis APPROVE.
