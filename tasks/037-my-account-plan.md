# Plan 037 — My Account

> Spec: `docs/specs/037-my-account.md`

## Survey — điểm tích hợp

| Concern | Hiện trạng |
|---|---|
| User menu | `AppLayout.tsx` ~181-188 — 2 DropdownMenuItem không onClick |
| RefreshToken repo | có `create/findByTokenHash/revoke/revokeAllForUser` — cần thêm `listActiveForUser`, `revokeOthersForUser`, `touchLastUsed` |
| createTokens | `auth.service.ts:77` — nơi gắn userAgent khi tạo refresh token (truyền từ controller, header `user-agent`) |
| /auth/refresh | controller đọc cookie `REFRESH_TOKEN_COOKIE` → service `refresh()` — chỗ update `last_used_at` |
| Employee self | `employeeRepository.findByUserId(sub, tenantId)` sẵn có; `employee.phone`, `employee.avatar` sẵn cột |
| forceSso/minLength | `settingsService.getSecuritySettings` (SPEC-036) tái dùng cho change-password |
| Public settings | `getPublicSettings` hiện chỉ `regional` → thêm `security: { forceSso }` (sửa shared type + tests liên quan) |
| Reminder recipients | `findHrRecipients` select id/email/fullName → thêm `notificationPrefs`; lọc email job trong scan |
| Tabs UI | `components/ui/tabs.tsx` sẵn có |
| Google link | `loginWithGoogle` (auth.service ~192) — set `googleLinkedAt` lần đầu |

## Migrations (1 lần, additive — Task 1)
- `users`: `google_linked_at DateTime?`, `notification_prefs Json?`
- `refresh_tokens`: `user_agent String?`, `last_used_at DateTime?`
- Apply hrm_dev (`migrate dev`) + hrm_test (`migrate deploy` với DATABASE_URL test).

## Vertical slices

### Task 1 (P1) — Migration + GET /account + trang 3 tab + wire menu
- Prisma migration (4 cột trên).
- Shared types: `MyAccountDto` (`user`, `employee | null`, `googleLinkedAt`),
  `PublicTenantSettings` thêm `security: { forceSso: boolean }`.
- API: `account.service.getAccount(actor)` (user + employee self), `account.controller`,
  `account.routes` (authenticate only), mount `/account`. Public settings thêm forceSso
  (sửa unit/integration test settings tương ứng).
- FE: `features/account/` — AccountPage (Tabs: profile/security/notifications, đọc `?tab=`),
  hook `useMyAccount`; tab Hồ sơ read-only; route `/account`; AppLayout menu items navigate
  (`/account`, `/account?tab=security`); i18n namespace `account` vi+en.
- RED: integration GET /account (có/không employee; 401 anon); web AccountPage tab theo
  query param + render info + menu items navigate.

### Task 2 (P1) — Đổi mật khẩu + sửa phone/avatar
- API: `POST /auth/change-password` (validator Zod min 8 + service: verify current → 401,
  minLength tenant → 422, forceSso non-SA → 403 SSO_REQUIRED, update hash, revoke others
  trừ cookie hiện tại); `PATCH /account/profile` (Zod strict `{phone?, avatar?}`, employee
  self, 404 nếu không có record).
- FE: tab Bảo mật form đổi mật khẩu (ẩn khi forceSso từ public settings); tab Hồ sơ form
  phone/avatar + Lưu.
- RED: integration đầy đủ các nhánh + login lại bằng mật khẩu mới + refresh cũ 401;
  web form validate khớp mật khẩu + ẩn theo forceSso + PATCH đúng payload.

### Task 3 (P2) — Sessions + Google linked
- API: capture userAgent ở login/loginWithGoogle (controller truyền header vào service);
  refresh() cập nhật lastUsedAt; `GET /account/sessions` (active, cờ current theo cookie,
  parse UA đơn giản browser/OS — pure helper + unit test); `POST /account/sessions/revoke-others`.
- `loginWithGoogle` set `googleLinkedAt` lần đầu; GET /account đã trả field này (Task 1).
- FE: tab Bảo mật — bảng sessions (thiết bị, tạo lúc, dùng lần cuối, badge "Phiên này") +
  nút "Đăng xuất các thiết bị khác" (AlertDialog confirm); khối trạng thái Google.
- RED: integration 2 phiên → list 2 + current đúng → revoke-others → refresh phiên kia 401,
  phiên hiện tại sống; unit parse UA.

### Task 4 (P3) — Email notification prefs
- API: `PATCH /account/notifications` (Zod strict bool per kind); scan: recipients query
  select thêm `notificationPrefs`, bỏ qua email job khi prefs[kind] === false (in-app vẫn tạo).
- FE: tab Thông báo — 2 toggle kèm mô tả "chỉ email, thông báo trong app vẫn hiện".
- RED: integration scan — user tắt probation_ending: notification vẫn tạo, emailJobs không
  chứa user đó, user khác vẫn có; PATCH validate.

### Checkpoint — E2E verify
- Login user thật → menu Hồ sơ cá nhân/Cài đặt tài khoản điều hướng đúng tab; sửa phone →
  reload còn; đổi mật khẩu rồi login lại; 2 phiên + revoke-others; toggle prefs lưu được;
  screenshot light + dark. forceSso bật thử → form đổi mật khẩu ẩn (rồi tắt lại).

## Risks
- Revoke-others cần phân biệt phiên hiện tại bằng cookie — khi client không gửi cookie
  (access token only) → revoke ALL là an toàn hơn? Quyết: yêu cầu cookie; thiếu cookie → 400.
- `getPublicSettings` đổi shape → sửa test SPEC-036 (unit + integration) — chủ đích, không phá.
- prefs JSON null = tất cả bật — mọi chỗ đọc qua helper `emailEnabled(prefs, kind)`.
