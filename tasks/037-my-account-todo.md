# TODO 037 — My Account

## Task 1 (P1): Migration + GET /account + trang 3 tab + wire menu
- [x] Prisma migration 4 cột (dev + test DB)
- [x] RED→GREEN: shared types (MyAccountDto, MySessionDto) + account service/controller/routes + public settings expose forceSso + AccountPage 3 tab + i18n vi/en + route + AppLayout menu navigate
- [x] Tests pass + tsc sạch

## Task 2 (P1): Đổi mật khẩu + sửa phone/avatar
- [x] RED→GREEN: POST /auth/change-password (sai current 401, minLength tenant 422, forceSso 403 SSO_REQUIRED, revoke others giữ phiên hiện tại theo cookie) + PATCH /account/profile (strict whitelist, 404 không có hồ sơ) + FE forms
- [x] Tests pass (integration 10)

## Task 3 (P2): Sessions + Google linked
- [x] RED→GREEN: capture user-agent ở login/google, rotation kế thừa UA + lastUsedAt; GET /account/sessions (current theo cookie, parse UA); revoke-others (400 thiếu cookie); googleLinkedAt stamp lần đầu; FE bảng sessions + AlertDialog + khối Google
- [x] Tests pass (integration 16 + unit UA 4)

## Task 4 (P3): Email notification prefs
- [x] RED→GREEN: users.notification_prefs + PATCH /account/notifications (strict, merge) + reminder scan bỏ email job cho recipient đã tắt (in-app vẫn tạo) + FE toggles
- [x] Tests pass

## Checkpoint: E2E verify (employee@codecrush.asia trên app thật)
- [x] Menu "Cài đặt tài khoản" → /account?tab=security; "Hồ sơ cá nhân" → /account
- [x] Sửa phone 0912345678 → lưu DB thật; tắt email probation_ending → DB {probation_ending:false}
- [x] Đổi mật khẩu qua API: cũ 401, mới 200, phiên B revoked, phiên A sống; đã trả lại mật khẩu gốc
- [x] Sessions UI: 2 phiên → "Đăng xuất các thiết bị khác" → còn đúng 1 "Phiên này"
- [x] Screenshot light + dark
- [x] Full suites: API 1251, Web 461, tsc sạch
