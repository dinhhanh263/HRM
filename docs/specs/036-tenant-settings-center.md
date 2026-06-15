# SPEC-036: Tenant Settings Center

## Objective

Biến mục "Cài đặt" trên sidebar (hiện là dead link `/settings`) thành Trung tâm cài đặt tenant:
hub điều hướng + hồ sơ công ty (P1), cấu hình nhắc việc & mặc định khu vực có consumer thật (P2),
chính sách bảo mật + gói/seats + nhật ký thay đổi (P3).

## Target Users

- **HR_MANAGER / SUPER_ADMIN** (đã có `settings:view` + `settings:update` trong catalog).
- Các role khác: không thấy mục Cài đặt (sidebar đã gate sẵn `settings:view`).

## Phân biệt rõ

`/settings` = **cấu hình tenant** (server, RBAC). Theme/dark/ngôn ngữ cá nhân vẫn ở
PreferencesMenu (localStorage) — KHÔNG trộn vào đây.

## Core Features

### Phase 1

#### 1. Settings Hub — `/settings`
- Card grid điều hướng tới các khu cài đặt domain hiện có, **mỗi card gate theo quyền**:
  Vai trò & quyền (`roles:view` → `/settings/roles`), Chấm công (`timesheet:view` →
  `/settings/timesheet`), Loại tài sản (`assets:view` → `/settings/assets`), Thử việc
  (`probation:configure` → `/probation`).
- Bên dưới là các section cấu hình tenant (mục 2, 4, 5, 6, 7, 8) — đều cần `settings:view`,
  nút Lưu cần `settings:update`.
- **Acceptance**: route `/settings` hết dead-link; card chỉ hiện theo quyền; HR thấy đủ.

#### 2. Hồ sơ công ty (section Company)
- Fields: tên công ty, địa chỉ, mã số thuế, email liên hệ, số điện thoại (text; KHÔNG upload
  logo trong spec này — cần storage infra).
- Lưu `Tenant.settings.company` qua `tenantSettingsRepository.mergeSettings` (shallow-merge
  theo feature key, không đụng key của payroll/leave).
- API: `GET /api/v1/settings` (`settings:view`) trả toàn bộ cấu hình đã merge default;
  `PATCH /api/v1/settings/company` (`settings:update`), Zod validate.
- **Acceptance**: HR sửa tên công ty → lưu → reload còn nguyên; EMPLOYEE gọi API → 403.

### Phase 2

#### 3. Nhắc việc & thông báo (section Notifications)
- `probationLeadDays` (1–30, default 7), `contractLeadDays` (1–90, default 30).
- **Consumer thật** (điểm quan trọng — không phải config chết):
  - Dashboard widget: `deriveUpcomingEvents` nhận lead từ settings thay vì hằng số 7/30.
  - Reminder engine (SPEC-017): `selectDueReminders` nhận lead per-tenant (map theo tenantId,
    default hằng số cũ).
  - (Calendar SPEC-035 không đổi — hiển thị theo tháng, không dùng lead.)
- API: `PATCH /api/v1/settings/notifications`.
- **Acceptance**: đặt probationLeadDays=14 → nhân viên hết thử việc trong 14 ngày xuất hiện
  trên dashboard widget (trước đó 7 ngày mới hiện); reminder scan dùng lead mới (unit test).

#### 4. Mặc định khu vực (section Regional)
- `defaultLanguage` (vi|en): ngôn ngữ mặc định cho user **chưa có** preference cá nhân
  (theme store chỉ apply settings này khi localStorage chưa có lựa chọn).
- `weekStart` (mon|sun): consumer thật = EventCalendar (SPEC-035) đổi cột đầu tuần.
- API: `PATCH /api/v1/settings/regional`.
- **Acceptance**: đặt weekStart=sun → `/calendar` render Chủ nhật cột đầu; user mới (chưa có
  localStorage) thấy ngôn ngữ theo defaultLanguage.

### Phase 3

#### 5. Chính sách bảo mật (section Security)
- `passwordMinLength` (8–32, default 8): **enforce server-side** ở register/set-password/
  reset-password (validator hiện min 8 tĩnh → check thêm theo tenant trong service).
- `forceSso` (bool, default false): khi bật, `POST /auth/login` bằng mật khẩu bị từ chối
  (error code `SSO_REQUIRED`) **trừ SUPER_ADMIN** (chống tự khoá cửa).
- API: `PATCH /api/v1/settings/security`.
- **Acceptance**: minLength=12 → set-password 8 ký tự bị 422; forceSso=true → login password
  của HR bị chặn kèm message rõ, SUPER_ADMIN vẫn vào được; tắt lại thì login bình thường.

#### 6. Gói & seats (section Plan — read-only)
- Hiển thị: tên gói (`Tenant.settings.plan.name`, default "Internal"), seat limit (default
  không giới hạn), **seats đang dùng** = count users ACTIVE của tenant.
- Không billing/payment (chưa có hạ tầng) — chỉ thông tin, đặt nền cho SaaS.
- **Acceptance**: hiện đúng số user active.

#### 7. Nhật ký thay đổi (section Audit log)
- Model mới `SettingsAuditLog` (Prisma + migration): id, tenantId, userId, section,
  changes (JSON: trước/sau), createdAt. Ghi mỗi lần PATCH thành công.
- `GET /api/v1/settings/audit` (`settings:view`) — 50 bản ghi mới nhất, kèm tên người đổi.
- UI: bảng trong trang Settings (thời gian, người đổi, section, tóm tắt).
- **Acceptance**: sửa company → audit có dòng mới đúng user/section; không log giá trị
  nhạy cảm (không có trong scope các section này).

## Out of Scope

- Upload logo / file storage; billing & payment thật; SSO config UI (Google SSO đã có
  SPEC-007); audit log cho các domain khác ngoài settings; đổi date-format toàn app;
  password expiry / session policy.

## Technical Approach

- **Defaults một chỗ**: `settings.service.ts` (API) định nghĩa default + Zod schema từng
  section; GET trả merged(default, stored). Shared types `TenantSettings*` trong
  packages/shared.
- **Per-tenant lead vào engine thuần**: `selectDueReminders(probation, contracts, now,
  leadsByTenant?)` — pure, default = hằng số cũ; scan fetch settings các tenant liên quan.
- `deriveUpcomingEvents`: lead vào `LifecycleEventOptions` (`probationLeadDays`,
  `contractLeadDays`, default 7/30) — chữ ký giữ tương thích.
- **Login forceSso**: check sau khi tìm thấy user (theo tenant của user), trước khi verify
  password.
- FE: `features/settings/` — SettingsPage (hub cards + sections), hooks TanStack Query,
  mutation per section + toast + optimistic-ish (invalidate).

## Testing Strategy

- **Unit API**: settings.service merge/defaults/validate; selectDueReminders với leads
  per-tenant; deriveUpcomingEvents với lead tuỳ chỉnh; login forceSso (chặn/loại trừ
  SUPER_ADMIN); password minLength động.
- **Integration API**: GET/PATCH các section (200/403/422); audit ghi + đọc; dashboard
  đổi theo probationLeadDays.
- **Unit Web**: hub card gating; form company submit; EventCalendar weekStart=sun;
  audit table render.
- **E2E verify**: HR vào /settings, sửa company + leadDays → dashboard phản ánh; screenshot.

## Boundaries

### Always Do
- RBAC server-side mọi endpoint; merge không clobber settings key của feature khác.
- Migration qua `prisma migrate dev` (không sửa schema DB tay).
- i18n vi+en đầy đủ; mỗi section một primary action (Lưu).

### Ask First
- Mở rộng audit log sang domain khác; thêm field company mới.

### Never Do
- Không log password/token vào audit; không cho client tự gửi tenantId; không commit.
