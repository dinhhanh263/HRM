# Plan 036 — Tenant Settings Center

> Spec: `docs/specs/036-tenant-settings-center.md`

## Survey — điểm tích hợp

| Concern | Hiện trạng |
|---|---|
| Sidebar "Cài đặt" | trỏ `/settings`, gate `settings:view` — route chưa tồn tại |
| Quyền | `settings:view/update` ∈ HR_MANAGER, SUPER_ADMIN (`*`) |
| Kho settings | `Tenant.settings` JSON + `tenantSettingsRepository.getSettings/mergeSettings` (shallow per-key) |
| Lead hằng số | `reminders.service.ts` `PROBATION_LEAD_DAYS=7`, `CONTRACT_LEAD_DAYS=30`; `dashboard.service.ts` const 7/30 |
| Reminder scan | `runReminderScan` fetch candidates theo lead hằng → cần fetch theo **max lead** (30/90) rồi lọc per-tenant trong `selectDueReminders` |
| Auth | `auth.service.login` (verifyPassword line ~145), `register`, `setPasswordFromToken`, `resetPassword`; validator min 8 tĩnh |
| Ngôn ngữ cá nhân | `theme.store` (zustand persist `hrm-theme`) — cần flag `languageExplicit` để biết "chưa từng chọn" |
| weekStart consumer | `EventCalendar.buildMonthGrid` Monday-first hardcode |
| Audit | chưa có model — cần Prisma migration `settings_audit_logs` |

**Quyết định thiết kế**: thêm `GET /api/v1/settings/public` (chỉ cần authenticate) trả
`{ regional }` — vì weekStart/defaultLanguage cần cho MỌI user (calendar, i18n), còn
`GET /settings` đầy đủ + PATCH thì giữ `settings:view`/`settings:update`.

## Vertical slices

### Task 1 (P1) — Foundation + Hub + Company
- Shared: `packages/shared/src/types/settings.ts` — `TenantSettingsDto` (company,
  notifications, regional, security, plan + seatsUsed), defaults docs.
- API: `settings.service.ts` (DEFAULTS, `getSettings` merged, `getPublicSettings`,
  `patchSection(section, payload, actor)` Zod-validated), `settings.controller.ts`,
  `settings.routes.ts` (GET `/`, GET `/public`, PATCH `/company`), mount vào v1 index.
- FE: `features/settings/` — `SettingsPage` (hub cards gate quyền + CompanySection form
  RHF+Zod), hooks `useTenantSettings`/`useUpdateSettings`, route `/settings`, i18n namespace
  `settings` (vi+en).
- RED: API unit (defaults/merge/validate) + integration (GET 200/403, PATCH company 200/403/422);
  web (hub card gating, company form submit gọi PATCH).

### Task 2 (P2) — Notification leads + consumers thật
- API: PATCH `/notifications` (probationLeadDays 1–30, contractLeadDays 1–90).
- `dashboard.service`: `LifecycleEventOptions` + `probationLeadDays?/contractLeadDays?`
  (default 7/30); `getDashboard` đọc settings tenant → truyền lead.
- `reminders.service`: `selectDueReminders(..., leadsByTenant?: Map)` (pure, default cũ);
  `reminders.scan`: fetch candidates với MAX lead (30/90) + fetch settings các tenant
  liên quan → truyền map.
- FE: NotificationsSection.
- RED: unit deriveUpcomingEvents lead=14; selectDueReminders per-tenant map; integration
  dashboard hiện probation +10 ngày khi lead=14 (mặc định 7 thì không).

### Task 3 (P2) — Regional + consumers thật
- API: PATCH `/regional` (defaultLanguage vi|en, weekStart mon|sun); GET `/public`.
- FE: EventCalendar nhận `weekStart` prop (grid + nhãn thứ); CalendarPage đọc từ
  `usePublicSettings`. theme.store thêm `languageExplicit` (setLanguage → true);
  AppLayout apply defaultLanguage khi `!languageExplicit`.
- RED: web EventCalendar sunday-first đặt event đúng ô; API validation.

### Task 4 (P3) — Security policy enforce
- API: PATCH `/security` (passwordMinLength 8–32, forceSso bool).
- `auth.service.login`: nếu forceSso && role !== SUPER_ADMIN → AppError 403 `SSO_REQUIRED`
  (trước verifyPassword). `register/setPasswordFromToken/resetPassword`: check
  `password.length >= passwordMinLength` của tenant (sau Zod min 8) → 422.
- FE: SecuritySection (cảnh báo rõ khi bật forceSso).
- RED: integration login bị chặn + SUPER_ADMIN không bị; set-password ngắn hơn minLength → 422.

### Task 5 (P3) — Plan & seats + Audit log
- Prisma: model `SettingsAuditLog` (tenantId, userId, section, changes Json, createdAt,
  index tenantId+createdAt) + `prisma migrate dev`.
- `patchSection` ghi audit (diff trước/sau của section); `GET /settings/audit` (50 mới nhất,
  join tên user). Plan: seatsUsed = count user ACTIVE.
- FE: PlanSection (read-only) + AuditSection (bảng).
- RED: integration PATCH → audit row; GET audit 200/403; seats đúng.

### Checkpoint — E2E verify
- HR: `/settings` từ sidebar → sửa company → toast + audit có dòng; đặt probationLeadDays=14
  → dashboard hiện event xa hơn 7 ngày; weekStart=sun → calendar đổi cột; forceSso bật →
  login HR bằng password bị chặn (rồi TẮT lại để không khoá dev); screenshot.

## Risks
- Shallow merge: PATCH section phải merge **nguyên section object** (key cấp 1) — không đè
  key payroll/leave đang dùng chung `Tenant.settings`.
- forceSso tự khoá: loại trừ SUPER_ADMIN + E2E phải tắt lại sau verify.
- Reminder scan fetch max-lead làm tăng candidates — chỉ lọc thêm trong pure fn, không đổi dedupe.
- Migration trên DB dev đang chạy — `prisma migrate dev` an toàn (additive).
