# TODO 036 — Tenant Settings Center

## Task 1 (P1): Foundation + Hub + Company
- [x] RED: API unit + integration (GET/PATCH company, RBAC, validate)
- [x] GREEN: shared types + settings service/controller/routes + FE hub + CompanySection + route + i18n
- [x] Tests pass + tsc sạch (unit 13 + page 6)

## Task 2 (P2): Notification leads + consumers
- [x] RED: deriveUpcomingEvents lead tuỳ chỉnh; selectDueReminders per-tenant; integration scan lead=14
- [x] GREEN: PATCH /notifications + dashboard đọc settings + reminder scan max-lead + per-tenant map + FE section
- [x] Tests pass (89 across 4 files)

## Task 3 (P2): Regional + consumers
- [x] RED: EventCalendar weekStart=sun
- [x] GREEN: PATCH /regional + GET /public + EventCalendar weekStart + theme.store languageExplicit + AppLayout apply
- [x] Tests pass (calendar 7)

## Task 4 (P3): Security enforce
- [x] RED: login forceSso chặn (trừ SUPER_ADMIN, chống enumeration); set-password < minLength → 422
- [x] GREEN: auth.service checks (login + setPasswordFromToken)
- [x] Tests pass (settings 11 + auth suite nguyên vẹn)

## Task 5 (P3): Plan & seats + Audit log
- [x] Prisma model SettingsAuditLog + migrate (dev + test DB)
- [x] Audit ghi mỗi PATCH (chỉ field đổi, bỏ qua no-op) + GET /settings/audit + PlanSection + AuditSection
- [x] Tests pass

## Checkpoint: E2E verify (đã chạy trên app thật, HR Nguyễn Thị Mai)
- [x] Sidebar Cài đặt → /settings render hub (gate quyền: HR không thấy card Roles) + 6 section
- [x] Company lưu → toast + audit row "name: → CodeCrush Asia JSC"
- [x] probationLeadDays=3 → dashboard MẤT event Cao Đức Anh (+5d); restore 7 → event quay lại (verify qua API)
- [x] weekStart=sun → /calendar cột đầu CN (screenshot); restore mon
- [x] forceSso bật → login HR 403 SSO_REQUIRED, SUPER_ADMIN 200; tắt → login 200 (curl, đã tắt lại)
- [x] Full suites: API 1230, Web 454, tsc sạch cả 2 app
