# TODO 035 — Event Calendar

## Task 1: Backend — GET /api/v1/dashboard/events
- [x] RED: unit `deriveMonthEvents` + integration endpoint per role + 422
- [x] GREEN: CalendarMonthData + deriveMonthEvents + getCalendarEvents + controller + route
- [x] Tests pass (unit 49, integration 18; full API 1204) + tsc sạch

## Task 2: Frontend — /calendar + nút Xem lịch
- [x] Extract event-style.ts + useEventNavigation.ts (44 dashboard tests vẫn xanh)
- [x] RED: CalendarPage tests (ô ngày, đổi tháng, click chip, holiday, gating)
- [x] GREEN: hook + EventCalendar + CalendarPage + route + i18n + nút Xem lịch
- [x] Tests pass (full web 446) + tsc sạch

## Checkpoint: E2E verify
- [x] Manager (tung.ngo): Dashboard → Xem lịch → grid tháng 6 đúng (probation 16/06, không contract) → click chip → scorecard Cao Đức Anh
- [x] HR (NTMai): thấy thêm contract_expiring 24/06 — scope đúng
- [x] Đổi tháng 6→7 refetch đúng; hôm nay (11) highlight; screenshot light + dark
