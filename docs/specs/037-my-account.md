# SPEC-037: My Account — Tài khoản của tôi

## Objective

Làm sống hai menu item đang chết trong user menu ("Hồ sơ cá nhân", "Cài đặt tài khoản") bằng
trang self-service `/account`: đổi mật khẩu, sửa thông tin cá nhân, quản lý phiên đăng nhập,
trạng thái Google SSO và tuỳ chọn email thông báo. Đây là mảnh thứ ba của bộ ba cấu hình:
PreferencesMenu (cá nhân, client) · `/settings` (tenant, SPEC-036) · **`/account` (tài khoản
cá nhân, server)**.

## Target Users

Mọi user đã đăng nhập (mọi role) — toàn bộ endpoint là self-service: chỉ `authenticate`,
**không** permission key; server thao tác duy nhất trên dữ liệu của `req.user.sub`.

## Core Features

### Phase 1

#### 1. Trang `/account` — 3 tab: Hồ sơ · Bảo mật · Thông báo
- Menu "Hồ sơ cá nhân" → `/account` (tab Hồ sơ); "Cài đặt tài khoản" → `/account?tab=security`.
- `GET /api/v1/account` trả: user (fullName, email, role, lastLoginAt), employee self nếu có
  (employeeCode, departmentName, positionName, phone, avatar, joinDate), `googleLinkedAt`.
- Tab Hồ sơ: thông tin chỉ-đọc (tên, email, mã NV, phòng ban, chức vụ, ngày vào làm — HR
  quản lý các field này) + **2 field tự sửa được: số điện thoại, avatar URL**.
- **Acceptance**: click 2 menu item điều hướng đúng tab; user không có employee record (vd
  admin thuần) vẫn xem được tab Hồ sơ (phần employee ẩn).

#### 2. Đổi mật khẩu — `POST /api/v1/auth/change-password`
- Body `{ currentPassword, newPassword }`. Flow:
  1. Verify `currentPassword` đúng (sai → 401, message không tiết lộ gì thêm).
  2. **Enforce `passwordMinLength`** của tenant (SPEC-036) — như invite/reset.
  3. Nếu tenant `forceSso` bật và user không phải SUPER_ADMIN → 403 `SSO_REQUIRED`
     (mật khẩu vô dụng khi forceSso; không cho đổi).
  4. Đổi hash + **revoke toàn bộ refresh token khác** của user (giữ phiên hiện tại —
     so theo cookie refresh token của request).
- UI tab Bảo mật: form 3 field (hiện tại, mới, nhập lại — khớp nhau check client), ẩn form
  khi `forceSso` bật (đọc từ `/settings/public`, cần expose thêm `security.forceSso`).
- **Acceptance**: đổi đúng → toast + login lại được bằng mật khẩu mới + refresh token cũ ở
  thiết bị khác bị revoke; sai mật khẩu hiện tại → lỗi rõ; ngắn hơn minLength tenant → 422.

#### 3. Sửa hồ sơ cá nhân — `PATCH /api/v1/account/profile`
- Body whitelist chặt: `{ phone?, avatar? }` (avatar = URL, cho phép rỗng; Zod max length).
  Áp vào employee record của chính mình; user không có employee record → 404 rõ ràng.
- **Acceptance**: sửa phone → hiện lại sau reload; thử gửi `fullName`/`salary` → 422 (strict).

### Phase 2

#### 4. Phiên đăng nhập — tab Bảo mật
- Migration: `refresh_tokens` thêm `user_agent String?`, `last_used_at DateTime?`;
  capture ở login (User-Agent header) và cập nhật `last_used_at` ở `/auth/refresh`.
- `GET /api/v1/account/sessions`: phiên **active** của mình (chưa revoke, chưa hết hạn) —
  thiết bị (parse user-agent đơn giản: browser + OS), createdAt, lastUsedAt, persistent,
  cờ `current` (so hash với cookie request).
- `POST /api/v1/account/sessions/revoke-others`: revoke tất cả trừ phiên hiện tại.
- **Acceptance**: login 2 phiên → list hiện 2, đúng cờ current; revoke-others → phiên kia
  refresh bị 401; phiên hiện tại vẫn sống.

#### 5. Trạng thái Google SSO
- Migration: `users.google_linked_at DateTime?` — set lần đầu `loginWithGoogle` thành công.
- Tab Bảo mật hiện: "Đã liên kết Google (từ <ngày>)" hoặc "Chưa liên kết — đăng nhập bằng
  Google một lần để liên kết". Không có nút link/unlink (SPEC-007 là invite-only theo email,
  không có OAuth account binding riêng).
- **Acceptance**: sau khi login Google, `/account` hiện đã liên kết.

### Phase 3

#### 6. Tuỳ chọn email thông báo — tab Thông báo
- Migration: `users.notification_prefs Json?` — `{ [kind]: boolean }`, thiếu key = bật.
  Kinds đợt này: `probation_ending`, `contract_expiring` (reminder engine SPEC-017).
- `PATCH /api/v1/account/notifications` body `{ probation_ending?, contract_expiring? }`.
- **Consumer thật**: reminder scan bỏ qua **email job** cho recipient đã tắt kind đó —
  in-app notification VẪN tạo (prefs chỉ áp cho email; UI ghi rõ).
- **Acceptance**: tắt `probation_ending` → scan tạo notification nhưng không tạo email job
  cho user đó; user khác vẫn nhận email.

## Out of Scope

- Upload file avatar (chỉ URL — chưa có storage; cùng quyết định với logo SPEC-036).
- Đổi email/tên (việc của HR); unlink Google; 2FA; password expiry.
- Prefs cho các email khác (invite, reset, payroll approval — là email giao dịch, không tắt).
- Trang EmployeeDetailPage riêng cho /profile/me (gộp vào tab Hồ sơ của /account).

## Technical Approach

- **Migrations** (3 cột, additive): `users.google_linked_at`, `users.notification_prefs`,
  `refresh_tokens.user_agent` + `refresh_tokens.last_used_at`. Apply cả hrm_dev lẫn hrm_test.
- **API**: routes mới `account.routes.ts` (`/account`, `/account/profile`, `/account/sessions`,
  `/account/sessions/revoke-others`, `/account/notifications`) — chỉ `authenticate`;
  `change-password` đặt trong `auth.routes.ts` cạnh set-password. Service mới
  `account.service.ts`; đổi mật khẩu nằm trong `auth.service.ts` (dùng chung security check).
- **Public settings**: expose thêm `security: { forceSso }` trong `GET /settings/public`
  (cần cho cả màn Login sau này; không nhạy cảm — user nào cũng cảm nhận được khi bị chặn).
- **Reminder scan**: khi build email jobs, load `notification_prefs` của recipients (đã fetch
  recipients per tenant — thêm field vào query, không thêm round-trip).
- **FE**: `features/account/` — AccountPage (Tabs shadcn sẵn có), hooks TanStack Query,
  section components. User menu items trong AppLayout gắn navigate.

## Testing Strategy

- **Unit (API)**: change-password (sai current → 401, minLength → 422, forceSso → 403 trừ SA,
  revoke others); account.service profile whitelist; prefs filter trong scan (pure phần chọn
  email jobs nếu tách được).
- **Integration (API)**: GET /account (có/không employee record); PATCH profile (200/422/404);
  change-password flow đầy đủ + login lại; sessions list/revoke-others + refresh 401;
  googleLinkedAt; PATCH notifications + scan không tạo email job cho user đã tắt.
- **Unit (Web)**: AccountPage — tab điều hướng theo query param; form đổi mật khẩu validate
  khớp/ẩn khi forceSso; profile chỉ sửa được phone/avatar; sessions render + nút revoke;
  prefs toggle gọi đúng PATCH.
- **E2E verify**: user thật đổi phone → reload còn; đổi mật khẩu → login lại bằng mật khẩu
  mới; revoke-others với 2 phiên; screenshot light+dark.

## Boundaries

### Always Do
- Mọi endpoint self-service lấy danh tính từ `req.user.sub` — KHÔNG nhận userId/employeeId
  từ client. Whitelist field strict.
- Không log mật khẩu (cũ/mới) ở bất kỳ tầng nào; không đưa password vào audit.
- Migration qua `prisma migrate dev`; apply cả DB test. i18n vi+en đầy đủ.

### Ask First
- Mở rộng prefs sang kinds khác; thêm field tự sửa ngoài phone/avatar.

### Never Do
- Không expose token hash/giá trị refresh token trong sessions list.
- Không cho đổi role/email/tên qua các endpoint này. Không commit.
