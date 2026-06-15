# TODO: Holiday-Work OT Nudge (019)

## Slice 1: Foundation — helper + OvertimeSheet.initialDate (testable)
- [x] 1.1 `isHolidayMatch(dateISO, holidays): HolidayDto | undefined` (recurring→MM-DD, else exact) trong feature timesheet
- [x] 1.2 Unit test `isHolidayMatch`: Quốc khánh khớp; recurring khác năm khớp; non-recurring chỉ đúng ngày; ngày thường → undefined; biên cuối tháng/đầu năm
- [x] 1.3 `OvertimeSheet` thêm prop `initialDate?: string`; khi open dùng `initialDate ?? todayKey()` cho `workDate`
- [x] 1.4 (test) OvertimeSheet mở với `initialDate` → `workDate` = initialDate; không có → hôm nay (giữ hành vi cũ)

## Checkpoint: Foundation
- [x] web typecheck sạch; unit test Slice 1 xanh

## Slice 2: Nudge wired end-to-end (feature hiện diện)
- [x] 2.1 `HolidayWorkNudge.tsx`: banner inline (token info), tên lễ qua interpolation, CTA "Tạo đơn tăng ca ngày lễ", nút dismiss (`aria-label`), `aria-live="polite"`, motion token
- [x] 2.2 Wire `TimesheetPage`: điều kiện hiện = có `todayRecord` + `isHolidayMatch(todayKey, holidays)` + chưa có OT cho `todayKey` (qua `useMyOvertime`) + chưa dismiss; sở hữu `OvertimeSheet` mở bởi CTA với `initialDate={todayKey}`; state dismiss theo phiên
- [x] 2.3 i18n `overtime.holidayNudge.*` (vi/en): title, desc (interpolate `{{name}}`), cta, dismiss
- [x] 2.4 Unit test `HolidayWorkNudge` + tích hợp điều kiện: hiện khi đủ điều kiện & đúng tên lễ; CTA truyền đúng ngày; ngày thường ẩn; đã có OT ẩn; dismiss ẩn

## Checkpoint: Feature complete
- [x] web typecheck; web tests xanh
- [x] Live: chấm công vào ngày lễ → nudge hiện → CTA mở OT sheet điền sẵn ngày (screenshot light + dark)
- [x] /review five-axis trước khi ship — APPROVE (1 Warning: lệch múi giờ UTC/GMT+7 trong OvertimeSheet — nợ có sẵn, tách task riêng)
