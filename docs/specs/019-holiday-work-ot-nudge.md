# Feature: Holiday-Work OT Nudge — Nhắc tạo đơn tăng ca khi chấm công ngày lễ

## Objective
Khi nhân viên chấm công (check-in) vào một ngày là ngày nghỉ lễ/Tết, hệ thống **nhắc** họ tạo đơn tăng
ca ngày lễ để được hưởng phụ cấp 300% theo Điều 98 BLLĐ. Đơn đi qua **đúng luồng duyệt OT
(maker-checker) đã có** — manager duyệt → category `OT_HOLIDAY`, multiplier 3.0x snapshot vào lương.
Mục tiêu là **đóng đúng lỗ hổng "làm ngày lễ nhưng quên nộp OT nên mất 300%"** mà không thêm máy móc
ghi-tự-động và không đụng hợp đồng lương đang STABLE.

## Target Users
- **EMPLOYEE / MANAGER / HR_MANAGER / SUPER_ADMIN** (`timesheet:create`): người chấm công và tự tạo
  đơn OT — đây là người thấy nudge.
- Người **duyệt** đơn OT (manager/HR) **không đổi gì** — dùng lại luồng duyệt hiện hữu.

## Bối cảnh — những gì ĐÃ có (không build lại)
- **Tính lương ngày lễ đúng**: nhân viên hưởng đủ lương ngày lễ dù không chấm công (qua `holidayCount`
  → `summary.helper` loại ngày lễ khỏi `workingDaysInPeriod`, `payslip.engine` prorate). Check-in hay
  không **không** làm đổi lương cơ bản.
- **Luồng OT maker-checker đầy đủ**: `OvertimeSheet.tsx` + `useSubmitOvertime()` →
  `POST /timesheet/overtime` `{ workDate, hours, night?, reason? }`. Server tự suy `OT_HOLIDAY` khi
  `workDate` trùng ngày lễ và snapshot multiplier `otHoliday` (mặc định 3.0). Manager duyệt mới vào lương.
- **FE đã biết ngày lễ**: `useHolidays(year)` → `GET /timesheet/holidays?year=` trả `HolidayDto[]`
  (`{ date, name, recurring, ... }`). `TimesheetPage.tsx` đã fetch sẵn `holidays` cho năm hiện tại.
- **Check-in UI**: `CheckInCard.tsx` gọi `useCheckIn()` → `POST /timesheet/attendance/check-in`, có
  callback `onSuccess`. Render trong `TimesheetPage.tsx` (đã có cả `todayRecord` lẫn `holidays`).
- **i18n**: namespace `timesheet` tại `apps/web/src/i18n/locales/{vi,en}/timesheet.json` (đã có nhóm
  `overtime.*`, `overtime.category.OT_HOLIDAY`).

## Core Features

### 1. Phát hiện "hôm nay là ngày lễ" sau khi check-in
- Sau khi `useCheckIn()` thành công, FE so `todayRecord.workDate` (ISO `YYYY-MM-DD`) với mảng
  `holidays` đang có sẵn trong `TimesheetPage`. Khớp recurring = so `MM-DD`; không recurring = so ngày
  chính xác (đồng nhất logic `isHolidayDate` ở backend).
- **Acceptance**: chấm công ngày 02-09 (Quốc khánh) → state "hôm nay là lễ" = true; ngày thường = false.

### 2. Nudge nhắc tạo đơn OT ngày lễ
- Hiển thị một dải nhắc (banner/inline, **không** modal chặn) ngay trong khu check-in: nêu tên ngày
  lễ + giải thích ngắn "làm hôm nay có thể được tính tăng ca ngày lễ (300%) nếu được duyệt", kèm CTA
  **"Tạo đơn tăng ca ngày lễ"**.
- Bấm CTA → mở `OvertimeSheet` với `workDate` **điền sẵn = ngày hôm nay** (mở rộng props
  `initialDate?: string`). Phần còn lại (nhập giờ, lý do, duyệt) đi nguyên luồng cũ.
- Nudge có thể đóng (dismiss) và **không** chặn thao tác khác. Không tái hiện ép buộc trong cùng phiên
  sau khi đã dismiss hoặc đã có đơn OT cho ngày đó.
- **Acceptance**:
  - Check-in vào ngày lễ → nudge hiện, đúng tên lễ (i18n vi/en).
  - Bấm CTA → `OvertimeSheet` mở, `workDate` = hôm nay (không phải gõ tay).
  - Check-in ngày thường → **không** có nudge.
  - Đã có OT request cho ngày đó (pending/approved) → **không** nudge (tránh tạo trùng).
  - Bấm dismiss → nudge biến mất, không hiện lại trong phiên.

### 3. i18n
- Thêm keys nudge vào `timesheet.json` (vi + en): tiêu đề, mô tả (chèn tên lễ qua interpolation), nhãn
  CTA, nhãn dismiss.
- **Acceptance**: bật en → toàn bộ chữ nudge tiếng Anh; vi → tiếng Việt; không có key thô lọt ra UI.

## Out of Scope
- **Không** tự động tạo `OvertimeRequest` (Option C đã loại — over-engineering cho việc "Hiếm khi").
- **Không** tự suy phụ cấp 300% từ attendance; 300% **bắt buộc** qua duyệt OT (giữ maker-checker).
- **Không** đổi backend OT/summary/payslip/`TimesheetSummaryDto` (STABLE).
- **Không** nhắc qua email/notification (chỉ in-app tại trang chấm công đợt này).
- **Không** xử lý nghỉ bù ngày lễ rơi cuối tuần.
- **Không** chặn/không-cho check-out nếu chưa tạo OT — nudge là gợi ý, không phải rào.

## Technical Approach
- **Chỉ frontend** — backend không đổi (tái dùng `POST /timesheet/overtime`, `GET /timesheet/holidays`,
  `GET /timesheet/overtime` để biết đã có đơn cho ngày đó chưa).
- **Helper thuần** `isHolidayMatch(dateISO, holidays): HolidayDto | undefined` (testable, đồng nhất rule
  recurring với backend `overtime.helper.isHolidayDate`). Đặt cạnh feature timesheet.
- **`HolidayWorkNudge.tsx`** (component mới): nhận `holiday`, `onCreateOt`, `onDismiss`; render theo
  design system (alert/banner, token màu info, có `aria-live`, dismiss có `aria-label`).
- **`TimesheetPage.tsx`**: sau check-in success + có `todayRecord` + `isHolidayMatch` + chưa có OT cho
  ngày đó + chưa dismiss → render `HolidayWorkNudge`. Giữ state dismiss trong page (phiên).
- **`OvertimeSheet.tsx`**: mở rộng props `initialDate?: string`; nếu có thì set `workDate` khi mở thay
  vì mặc định `todayKey()`.
- **Lấy danh sách OT ngày đó**: dùng hook OT hiện có (list trong tháng) để kiểm tra trùng; không thêm
  endpoint mới.
- **i18n**: thêm keys nhóm `overtime.holidayNudge.*` (hoặc `holidayNudge.*`) ở cả vi/en.

## Code Style
- Tuân thủ `.claude/rules/` (testing, error-handling, api-conventions) + CLAUDE.md design system + ui-modern.
- Không hardcode màu/spacing; dùng token; nudge dùng motion token chuẩn (`animate-in fade-in-0 slide-in-from-top-1 duration-150`).
- A11y: `aria-live="polite"` cho nudge, nút icon-only có `aria-label`, tôn trọng `prefers-reduced-motion`.
- TypeScript strict; không `any`; gọi API qua TanStack Query, không `fetch` trực tiếp.

## Testing Strategy
- **FE unit (helper)** — `isHolidayMatch`: khớp recurring theo `MM-DD`; khớp non-recurring theo ngày
  chính xác; ngày thường trả `undefined`; biên cuối tháng/đầu năm.
- **FE unit (component)** — critical path khẳng định kết quả nghiệp vụ:
  - Check-in ngày lễ → `HolidayWorkNudge` hiện đúng tên lễ.
  - Bấm CTA → gọi `onCreateOt`/mở `OvertimeSheet` với `workDate` = ngày lễ (khẳng định prop truyền đúng ngày).
  - Ngày thường → nudge **không** render.
  - Đã có OT cho ngày đó → nudge **không** render.
  - Dismiss → nudge biến mất.
- **Live verify (screenshot)**: đăng nhập, chấm công vào một ngày lễ (seed/giả lập), thấy nudge →
  mở OT sheet thấy ngày điền sẵn — chụp **light + dark**. (Theo memory: test UI bằng screenshot trước khi báo xong.)

## Boundaries
### Always Do
- Giữ 300% **chỉ** qua luồng duyệt OT (maker-checker). Nudge tuyệt đối không tự ghi premium.
- Rule nhận diện ngày lễ ở FE phải **đồng nhất** với backend (`recurring` so `MM-DD`).
- i18n đầy đủ vi/en, không chữ cứng.

### Ask First
- Nếu muốn nâng cấp thành notification/email nhắc (ngoài in-app).
- Nếu muốn auto-tạo OvertimeRequest (Option C) — đổi hướng so với spec này.
- Nếu muốn chặn check-out tới khi xử lý OT.

### Never Do
- Không đổi `TimesheetSummaryDto` hay engine lương/summary/OT ở backend.
- Không tự seed/ghi OT ngầm; không tính 300% nếu chưa được duyệt.
- Không commit khi chưa được yêu cầu rõ ràng.
